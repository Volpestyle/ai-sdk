/**
 * planning-control — reference implementation
 *
 * Implements the core "plan -> validate -> clamp -> executable plan" loop described in:
 * `packages/planning-control/product_spec.md`
 * `packages/planning-control/tech_spec.md`
 *
 * No external dependencies; deterministic helpers intended for integration and testing.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const CAMERA_MODES = Object.freeze(["A_SELFIE", "B_MIRROR", "C_CUTAWAY"]);

export const DEFAULT_BUDGET = Object.freeze({
  hardcap_sec: 10,
  min_target_sec: 4,
  default_target_range_sec: [5, 10],
  tail_buffer_sec: 0.6,
});

/**
 * @typedef {Object} SpeechSegment
 * @property {number} priority
 * @property {string} text
 * @property {Record<string, any>=} optional_tts_tags
 * @property {number=} est_sec
 */

/**
 * @typedef {Object} ActorTimelineEvent
 * @property {number=} t0
 * @property {number=} t1
 * @property {string=} emotion
 * @property {number=} intensity
 * @property {string=} gaze_mode
 * @property {number=} blink_rate
 * @property {Record<string, any>=} head_motion
 * @property {"listening"|"speaking"=} state
 */

/**
 * @typedef {Object} TurnPlan
 * @property {number} speech_budget_sec_target
 * @property {number} speech_budget_sec_hardcap
 * @property {SpeechSegment[]} speech_segments
 * @property {ActorTimelineEvent[]} actor_timeline
 * @property {string=} camera_mode_suggestion
 * @property {string[]=} safety_self_tags
 */

/**
 * @typedef {Object} TurnPlanValidation
 * @property {boolean} ok
 * @property {string[]} errors
 */

/**
 * @typedef {Object} PersonaClampPolicy
 * @property {string[]=} allowed_emotions
 * @property {[number, number]=} intensity_range
 * @property {{ min?: number, max?: number }=} blink_rate_range
 */

/**
 * @typedef {Object} SafetyClampPolicy
 * @property {string[]=} banned_phrases
 * @property {"drop_segment"|"replace_with_fallback"=} on_violation
 * @property {string=} fallback_text
 */

/**
 * @typedef {Object} ClampOptions
 * @property {Partial<typeof DEFAULT_BUDGET>=} budget
 * @property {PersonaClampPolicy=} persona
 * @property {SafetyClampPolicy=} safety
 * @property {string=} default_camera_mode
 */

const TURN_PLAN_SCHEMA_URL = new URL("../schemas/turn_plan.schema.json", import.meta.url);

/**
 * @returns {string}
 */
export function readTurnPlanSchemaText() {
  return readFileSync(fileURLToPath(TURN_PLAN_SCHEMA_URL), "utf8");
}

/**
 * @returns {any}
 */
export function readTurnPlanSchemaJson() {
  return JSON.parse(readTurnPlanSchemaText());
}

/**
 * @param {any} schema
 * @param {Partial<typeof DEFAULT_BUDGET>} budget
 * @returns {any}
 */
export function applyBudgetToTurnPlanSchema(schema, budget) {
  if (!schema || typeof schema !== "object") return schema;
  const hardcap = budget?.hardcap_sec ?? DEFAULT_BUDGET.hardcap_sec;
  const props = schema.properties ?? {};
  const target = props.speech_budget_sec_target ?? {};
  const hardcapProp = props.speech_budget_sec_hardcap ?? {};
  target.maximum = hardcap;
  hardcapProp.const = hardcap;
  props.speech_budget_sec_target = target;
  props.speech_budget_sec_hardcap = hardcapProp;
  schema.properties = props;
  return schema;
}

/**
 * Estimate spoken duration for a given text using a deterministic heuristic.
 *
 * @param {string} text
 * @param {{
 *   language?: string,
 *   words_per_minute?: number,
 *   pause_per_comma_sec?: number,
 *   pause_per_sentence_sec?: number,
 *   pause_per_newline_sec?: number
 * }=} opts
 * @returns {number}
 */
export function estimateSpeechSeconds(text, opts) {
  const s = String(text ?? "").trim();
  if (!s) return 0;

  const language = opts?.language ?? "en";
  // Conservative defaults tuned for English; callers can override.
  const wordsPerMinute = opts?.words_per_minute ?? (language === "en" ? 150 : 140);
  const pauseComma = opts?.pause_per_comma_sec ?? 0.18;
  const pauseSentence = opts?.pause_per_sentence_sec ?? 0.38;
  const pauseNewline = opts?.pause_per_newline_sec ?? 0.5;

  const words = s.split(/\s+/u).filter(Boolean).length;
  const speechCore = words / Math.max(1e-6, wordsPerMinute / 60);

  const commaCount = (s.match(/,/gu) ?? []).length;
  const sentenceCount = (s.match(/[.!?](?=\s|$)/gu) ?? []).length;
  const newlineCount = (s.match(/\n+/gu) ?? []).length;

  const pauses = commaCount * pauseComma + sentenceCount * pauseSentence + newlineCount * pauseNewline;
  return Math.max(0, speechCore + pauses);
}

/**
 * Choose a default target duration based on estimated content length.
 *
 * @param {number} estimatedTotalSec
 * @param {Partial<typeof DEFAULT_BUDGET>=} budget
 * @returns {number}
 */
export function chooseSpeechTargetSeconds(estimatedTotalSec, budget) {
  const b = { ...DEFAULT_BUDGET, ...(budget ?? {}) };
  const [minDefault, maxDefault] = b.default_target_range_sec;

  if (!Number.isFinite(estimatedTotalSec) || estimatedTotalSec <= 0) return b.min_target_sec;

  // Ultra-short replies can be shorter than the default minimum.
  if (estimatedTotalSec < b.min_target_sec) return Math.max(1, estimatedTotalSec);

  // Default experience: clamp to 6–10s when content is longer.
  return Math.min(maxDefault, Math.max(minDefault, estimatedTotalSec));
}

/**
 * Naive sentence split that preserves punctuation; used for heuristic fallback plans.
 * @param {string} text
 * @returns {string[]}
 */
export function splitIntoSentences(text) {
  const s = String(text ?? "").trim();
  if (!s) return [];
  const out = [];
  let buf = "";
  for (const ch of s) {
    buf += ch;
    if (/[.!?]/u.test(ch)) {
      out.push(buf.trim());
      buf = "";
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

/**
 * Group sentences into segments with a soft word limit.
 * @param {string} text
 * @param {{ max_words_per_segment?: number, max_segments?: number }=} opts
 * @returns {string[]}
 */
export function splitTextIntoSegments(text, opts) {
  const sentences = splitIntoSentences(text);
  const maxWords = opts?.max_words_per_segment ?? 28;
  const maxSegments = opts?.max_segments ?? 8;

  /** @type {string[]} */
  const segments = [];
  let current = "";
  let currentWords = 0;

  const pushCurrent = () => {
    const trimmed = current.trim();
    if (trimmed) segments.push(trimmed);
    current = "";
    currentWords = 0;
  };

  for (const sentence of sentences) {
    const w = sentence.split(/\s+/u).filter(Boolean).length;
    if (segments.length >= maxSegments) break;
    if (!current) {
      current = sentence;
      currentWords = w;
      continue;
    }
    if (currentWords + w <= maxWords) {
      current += " " + sentence;
      currentWords += w;
    } else {
      pushCurrent();
      current = sentence;
      currentWords = w;
    }
  }
  if (segments.length < maxSegments) pushCurrent();
  return segments;
}

/**
 * Create a deterministic TurnPlan without an LLM (fallback / testing).
 *
 * @param {{
 *   response_text: string,
 *   language?: string,
 *   camera_mode_suggestion?: string,
 *   budget?: Partial<typeof DEFAULT_BUDGET>
 * }} args
 * @returns {TurnPlan}
 */
export function createHeuristicTurnPlan(args) {
  const budget = { ...DEFAULT_BUDGET, ...(args.budget ?? {}) };
  const hardcap = budget.hardcap_sec;
  const language = args.language ?? "en";

  const segmentsText = splitTextIntoSegments(args.response_text);
  const segments = segmentsText.map((t, idx) => ({
    priority: idx,
    text: t,
    est_sec: estimateSpeechSeconds(t, { language }),
  }));

  const totalEst = segments.reduce((sum, seg) => sum + (seg.est_sec ?? 0), 0);
  const target = chooseSpeechTargetSeconds(totalEst, budget);

  /** @type {ActorTimelineEvent[]} */
  const actorTimeline = [
    { t0: 0, t1: 0.35, state: "listening", emotion: "neutral", intensity: 0.2, gaze_mode: "to_camera", blink_rate: 0.3 },
    { t0: 0.35, t1: Math.min(target, hardcap), state: "speaking", emotion: "friendly", intensity: 0.55, gaze_mode: "to_camera", blink_rate: 0.25 },
  ];

  /** @type {TurnPlan} */
  const plan = {
    speech_budget_sec_target: target,
    speech_budget_sec_hardcap: hardcap,
    speech_segments: segments,
    actor_timeline: actorTimeline,
  };

  if (args.camera_mode_suggestion) plan.camera_mode_suggestion = String(args.camera_mode_suggestion);
  return plan;
}

/**
 * Validate a TurnPlan's shape (lightweight; not a full JSON-schema validator).
 *
 * @param {any} plan
 * @returns {TurnPlanValidation}
 */
export function validateTurnPlan(plan, opts) {
  const budget = { ...DEFAULT_BUDGET, ...(opts?.budget ?? {}) };
  /** @type {string[]} */
  const errors = [];
  if (plan === null || typeof plan !== "object") errors.push("plan must be an object");

  const target = plan?.speech_budget_sec_target;
  const hardcap = plan?.speech_budget_sec_hardcap;
  if (typeof target !== "number" || !Number.isFinite(target) || target <= 0) errors.push("speech_budget_sec_target must be a positive number");
  if (hardcap !== budget.hardcap_sec) errors.push(`speech_budget_sec_hardcap must be ${budget.hardcap_sec}`);
  if (typeof target === "number" && Number.isFinite(target) && typeof hardcap === "number" && target > hardcap) {
    errors.push("speech_budget_sec_target must be <= speech_budget_sec_hardcap");
  }

  if (!Array.isArray(plan?.speech_segments) || plan.speech_segments.length === 0) errors.push("speech_segments must be a non-empty array");
  if (Array.isArray(plan?.speech_segments)) {
    for (let i = 0; i < plan.speech_segments.length; i++) {
      const seg = plan.speech_segments[i];
      if (seg === null || typeof seg !== "object") errors.push(`speech_segments[${i}] must be an object`);
      if (typeof seg?.priority !== "number" || !Number.isInteger(seg.priority) || seg.priority < 0) errors.push(`speech_segments[${i}].priority must be an integer >= 0`);
      if (typeof seg?.text !== "string" || !seg.text.trim()) errors.push(`speech_segments[${i}].text must be a non-empty string`);
      if (seg?.est_sec !== undefined && (typeof seg.est_sec !== "number" || !Number.isFinite(seg.est_sec) || seg.est_sec < 0)) {
        errors.push(`speech_segments[${i}].est_sec must be a non-negative number when present`);
      }
    }
  }

  if (!Array.isArray(plan?.actor_timeline)) errors.push("actor_timeline must be an array");
  if (Array.isArray(plan?.actor_timeline)) {
    for (let i = 0; i < plan.actor_timeline.length; i++) {
      const ev = plan.actor_timeline[i];
      if (ev === null || typeof ev !== "object") errors.push(`actor_timeline[${i}] must be an object`);
      if (ev?.state !== undefined && ev.state !== "listening" && ev.state !== "speaking") {
        errors.push(`actor_timeline[${i}].state must be 'listening' or 'speaking' when present`);
      }
      if (ev?.intensity !== undefined && (typeof ev.intensity !== "number" || !Number.isFinite(ev.intensity))) {
        errors.push(`actor_timeline[${i}].intensity must be a number when present`);
      }
    }
  }

  if (plan?.camera_mode_suggestion !== undefined && typeof plan.camera_mode_suggestion !== "string") {
    errors.push("camera_mode_suggestion must be a string when present");
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Clamp a TurnPlan into an executable plan:
 * - enforce hardcap=10 and clamp target
 * - sort segments by priority and recompute/repair est_sec
 * - drop segments to fit within hardcap - tail_buffer (never cut mid-segment)
 * - clamp actor timeline fields to persona policy (optional)
 * - apply basic safety phrase-based clamping (optional)
 *
 * @param {TurnPlan} plan
 * @param {ClampOptions=} opts
 * @returns {{ plan: TurnPlan, warnings: string[] }}
 */
export function clampTurnPlan(plan, opts) {
  const budget = { ...DEFAULT_BUDGET, ...(opts?.budget ?? {}) };
  const hardcap = budget.hardcap_sec;
  const maxExecutable = Math.max(0, hardcap - budget.tail_buffer_sec);

  /** @type {string[]} */
  const warnings = [];

  /** @type {TurnPlan} */
  const out = {
    ...plan,
    speech_budget_sec_hardcap: hardcap,
    speech_budget_sec_target: plan.speech_budget_sec_target,
    speech_segments: Array.isArray(plan.speech_segments) ? [...plan.speech_segments] : [],
    actor_timeline: Array.isArray(plan.actor_timeline) ? [...plan.actor_timeline] : [],
  };

  if (!Number.isFinite(out.speech_budget_sec_target) || out.speech_budget_sec_target <= 0) {
    out.speech_budget_sec_target = budget.min_target_sec;
    warnings.push("speech_budget_sec_target was invalid; reset to min_target_sec");
  }

  // Clamp target: allow ultra-short replies < min_target_sec if plan is small.
  out.speech_budget_sec_target = Math.min(maxExecutable, Math.max(1, out.speech_budget_sec_target));

  // Camera mode clamp.
  const defaultCameraMode = opts?.default_camera_mode ?? "A_SELFIE";
  if (out.camera_mode_suggestion && !CAMERA_MODES.includes(out.camera_mode_suggestion)) {
    warnings.push(`camera_mode_suggestion '${out.camera_mode_suggestion}' invalid; replaced with '${defaultCameraMode}'`);
    out.camera_mode_suggestion = defaultCameraMode;
  }

  // Segment normalization.
  out.speech_segments.sort((a, b) => a.priority - b.priority);

  const safety = opts?.safety;
  for (const seg of out.speech_segments) {
    if (typeof seg.text !== "string") seg.text = String(seg.text ?? "");
    seg.text = seg.text.trim();
    if (!seg.text) seg.text = "...";

    if (!Number.isFinite(seg.est_sec) || seg.est_sec < 0) {
      seg.est_sec = estimateSpeechSeconds(seg.text);
      warnings.push("segment est_sec missing/invalid; recomputed");
    }

    if (safety?.banned_phrases?.length) {
      const lower = seg.text.toLowerCase();
      const hit = safety.banned_phrases.find((p) => lower.includes(String(p).toLowerCase()));
      if (hit) {
        const mode = safety.on_violation ?? "replace_with_fallback";
        if (mode === "drop_segment") {
          seg.text = "";
          seg.est_sec = 0;
          warnings.push(`segment dropped due to banned phrase: ${hit}`);
        } else {
          seg.text = safety.fallback_text ?? "I can't help with that.";
          seg.est_sec = estimateSpeechSeconds(seg.text);
          warnings.push(`segment replaced due to banned phrase: ${hit}`);
        }
      }
    }
  }

  out.speech_segments = out.speech_segments.filter((s) => s.text.trim());

  // Apply budgeting: include segments until target met or hardcap reached.
  /** @type {SpeechSegment[]} */
  const included = [];
  let cumSec = 0;
  for (const seg of out.speech_segments) {
    const segSec = seg.est_sec ?? estimateSpeechSeconds(seg.text);
    if (included.length === 0 && segSec > maxExecutable) {
      // If a single segment would exceed hardcap, keep it but warn (caller must replan).
      included.push(seg);
      cumSec = segSec;
      warnings.push("single segment exceeds hardcap; plan should be regenerated with smaller segments");
      break;
    }
    if (cumSec + segSec > maxExecutable) break;

    included.push(seg);
    cumSec += segSec;

    if (cumSec >= out.speech_budget_sec_target) break;
  }
  out.speech_segments = included;

  const estimatedPlanSec = out.speech_segments.reduce((sum, seg) => sum + (seg.est_sec ?? estimateSpeechSeconds(seg.text)), 0);
  const effectiveDurationSec = Math.min(maxExecutable, estimatedPlanSec);

  // If the target was higher than what we can execute, reduce it to the included estimate.
  if (effectiveDurationSec > 0 && out.speech_budget_sec_target > effectiveDurationSec) out.speech_budget_sec_target = effectiveDurationSec;

  // Actor timeline clamping.
  const persona = opts?.persona;
  const allowedEmotions = persona?.allowed_emotions?.map((e) => String(e)) ?? null;
  const intensityRange = persona?.intensity_range ?? [0, 1];
  const blinkMin = persona?.blink_rate_range?.min ?? 0;
  const blinkMax = persona?.blink_rate_range?.max ?? 1;

  out.actor_timeline = out.actor_timeline.map((ev) => {
    /** @type {ActorTimelineEvent} */
    const next = { ...ev };
    if (allowedEmotions && next.emotion && !allowedEmotions.includes(next.emotion)) next.emotion = allowedEmotions[0] ?? "neutral";
    if (typeof next.intensity === "number") next.intensity = Math.max(intensityRange[0], Math.min(intensityRange[1], next.intensity));
    if (typeof next.blink_rate === "number") next.blink_rate = Math.max(blinkMin, Math.min(blinkMax, next.blink_rate));

    if (typeof next.t0 === "number" && Number.isFinite(next.t0)) next.t0 = Math.max(0, Math.min(effectiveDurationSec, next.t0));
    if (typeof next.t1 === "number" && Number.isFinite(next.t1)) next.t1 = Math.max(0, Math.min(effectiveDurationSec, next.t1));
    if (typeof next.t0 === "number" && typeof next.t1 === "number" && next.t1 < next.t0) next.t1 = next.t0;
    return next;
  });

  // Ensure we always have at least a simple timeline.
  if (out.actor_timeline.length === 0) {
    out.actor_timeline = [{ t0: 0, t1: effectiveDurationSec || out.speech_budget_sec_target, state: "speaking", emotion: "neutral", intensity: 0.3 }];
    warnings.push("actor_timeline was empty; inserted a default speaking event");
  }

  return { plan: out, warnings };
}

/**
 * Provider-agnostic prompt template for generating a TurnPlan with JSON-only output.
 *
 * @param {{
 *   user_message: string,
 *   persona?: { name?: string, style?: string },
 *   camera_mode?: string,
 *   language?: string,
 *   budget?: Partial<typeof DEFAULT_BUDGET>
 * }} args
 * @returns {{ system: string, user: string }}
 */
export function buildTurnPlanPrompt(args) {
  const budget = { ...DEFAULT_BUDGET, ...(args.budget ?? {}) };
  const personaName = args.persona?.name ? `Persona: ${args.persona.name}` : "Persona: (unspecified)";
  const personaStyle = args.persona?.style ? `Style: ${args.persona.style}` : "Style: (unspecified)";
  const cam = args.camera_mode ?? "A_SELFIE";
  const language = args.language ?? "en";

  const schemaText = JSON.stringify(applyBudgetToTurnPlanSchema(readTurnPlanSchemaJson(), budget), null, 2);

  const system = [
    "You are a planning engine that outputs STRICT JSON only.",
    "Produce a TurnPlan that matches the provided JSON schema exactly.",
    `Constraints: hardcap=${budget.hardcap_sec}s, default ~${budget.default_target_range_sec[0]}s, allow up to ${budget.default_target_range_sec[1]}s, minimum ${budget.min_target_sec}s unless ultra-short.`,
    `Camera modes: ${CAMERA_MODES.join(", ")}.`,
    "Speech segments must be ordered by priority (0 is highest priority).",
    "Never cut mid-segment; segments should be safe boundaries.",
    "Actor timeline should include listening->speaking transitions and reasonable emotion/gaze hints.",
    "",
    "TURN PLAN JSON SCHEMA:",
    schemaText,
  ].join("\n");

  const user = [
    personaName,
    personaStyle,
    `Language: ${language}`,
    `Camera mode suggestion: ${cam}`,
    "",
    "User message:",
    String(args.user_message ?? ""),
  ].join("\n");

  return { system, user };
}

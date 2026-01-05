/**
 * persona-core -- reference implementation
 *
 * Implements PersonaPack helpers and in-memory registry primitives described in:
 * `packages/persona-core/product_spec.md`
 * `packages/persona-core/tech_spec.md`
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PERSONA_PACK_SCHEMA_URL = new URL("../schemas/persona_pack.schema.json", import.meta.url);

export const CAMERA_MODES = Object.freeze(["A_SELFIE", "B_MIRROR", "C_CUTAWAY"]);

export const DEFAULT_ANCHOR_REFRESH_POLICY = Object.freeze({
  refresh_every_turns: 8,
  drift_fail_threshold: 0.74,
  drift_warn_threshold: 0.84,
  flicker_fail_threshold: 0.6,
});

/**
 * @typedef {Object} PersonaPack
 * @property {string} persona_id
 * @property {string} version
 * @property {Record<string, AnchorEntry[]>} anchor_sets
 * @property {Object} identity
 * @property {string[]=} identity.face_embedding_refs
 * @property {Object} style
 * @property {Object=} voice_profile
 * @property {Object} behavior_policy
 */

/**
 * @typedef {Object} AnchorEntry
 * @property {string} image_ref
 * @property {string=} mask_ref
 * @property {Object} metadata
 * @property {string=} metadata.expression_tag
 * @property {Object=} metadata.head_pose
 * @property {string=} metadata.lighting_tag
 * @property {number[]=} metadata.crop_box
 * @property {string[]=} metadata.best_for
 */

/**
 * @typedef {Object} DriftSignal
 * @property {number=} identity_similarity
 * @property {number=} bg_similarity
 * @property {number=} flicker_score
 */

/**
 * @typedef {Object} ActorTimelineEvent
 * @property {number=} t0
 * @property {number=} t1
 * @property {string=} emotion
 * @property {number=} intensity
 * @property {string=} gaze_mode
 * @property {number=} blink_rate
 * @property {Object=} head_motion
 * @property {"listening"|"speaking"=} state
 */

/**
 * @returns {string}
 */
export function readPersonaPackSchemaText() {
  return readFileSync(fileURLToPath(PERSONA_PACK_SCHEMA_URL), "utf8");
}

/**
 * @returns {any}
 */
export function readPersonaPackSchemaJson() {
  return JSON.parse(readPersonaPackSchemaText());
}

/**
 * Lightweight PersonaPack validation (shape-level).
 * @param {any} pack
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validatePersonaPack(pack) {
  /** @type {string[]} */
  const errors = [];
  if (pack === null || typeof pack !== "object") errors.push("pack must be an object");
  if (!pack?.persona_id || typeof pack.persona_id !== "string") errors.push("persona_id must be a string");
  if (!pack?.version || typeof pack.version !== "string") errors.push("version must be a string");
  if (!pack?.anchor_sets || typeof pack.anchor_sets !== "object") errors.push("anchor_sets must be an object");
  if (!pack?.identity || typeof pack.identity !== "object") errors.push("identity must be an object");
  if (!pack?.style || typeof pack.style !== "object") errors.push("style must be an object");
  if (!pack?.behavior_policy || typeof pack.behavior_policy !== "object") errors.push("behavior_policy must be an object");

  if (pack?.anchor_sets && typeof pack.anchor_sets === "object") {
    for (const [mode, anchors] of Object.entries(pack.anchor_sets)) {
      if (!Array.isArray(anchors) || anchors.length === 0) errors.push(`anchor_sets.${mode} must be a non-empty array`);
      for (let i = 0; i < (anchors ?? []).length; i++) {
        const anchor = anchors[i];
        if (!anchor?.image_ref) errors.push(`anchor_sets.${mode}[${i}].image_ref is required`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * @param {PersonaPack} pack
 * @param {string} mode
 * @returns {AnchorEntry[]}
 */
export function getAnchorSet(pack, mode) {
  if (pack?.anchor_sets?.[mode]) return pack.anchor_sets[mode];
  const first = Object.values(pack?.anchor_sets ?? {})[0];
  return Array.isArray(first) ? first : [];
}

/**
 * @param {AnchorEntry[]} anchors
 * @returns {AnchorEntry | null}
 */
export function selectCanonicalAnchor(anchors) {
  if (!Array.isArray(anchors) || anchors.length === 0) return null;
  const canonical = anchors.find((a) => a.metadata?.best_for?.includes("canonical"));
  if (canonical) return canonical;
  const fallback = anchors.find((a) => a.metadata?.best_for?.includes("default"));
  return fallback ?? anchors[0];
}

/**
 * @param {AnchorEntry} anchor
 * @param {string=} desiredEmotion
 * @returns {number}
 */
export function scoreAnchor(anchor, desiredEmotion) {
  let score = 0;
  if (desiredEmotion && anchor.metadata?.expression_tag) {
    if (anchor.metadata.expression_tag.toLowerCase() === desiredEmotion.toLowerCase()) score += 2;
  }
  if (desiredEmotion && anchor.metadata?.best_for?.some((tag) => tag.toLowerCase() === desiredEmotion.toLowerCase())) {
    score += 1;
  }
  if (anchor.metadata?.best_for?.includes("canonical")) score += 0.25;
  return score;
}

/**
 * @param {{
 *  drift?: DriftSignal,
 *  turn_index?: number,
 *  policy?: Partial<typeof DEFAULT_ANCHOR_REFRESH_POLICY>
 * }} args
 * @returns {{ refresh: boolean, reason: string }}
 */
export function shouldRefreshAnchor(args) {
  const policy = { ...DEFAULT_ANCHOR_REFRESH_POLICY, ...(args.policy ?? {}) };
  const drift = args.drift ?? {};

  if (typeof drift.identity_similarity === "number" && drift.identity_similarity < policy.drift_fail_threshold) {
    return { refresh: true, reason: "identity_fail" };
  }
  if (typeof drift.bg_similarity === "number" && drift.bg_similarity < policy.drift_fail_threshold) {
    return { refresh: true, reason: "background_fail" };
  }
  if (typeof drift.flicker_score === "number" && drift.flicker_score > policy.flicker_fail_threshold) {
    return { refresh: true, reason: "flicker_fail" };
  }
  const turnIndex = args.turn_index ?? 0;
  if (policy.refresh_every_turns > 0 && turnIndex > 0 && turnIndex % policy.refresh_every_turns === 0) {
    return { refresh: true, reason: "periodic_refresh" };
  }
  return { refresh: false, reason: "stable" };
}

/**
 * Select an anchor image for the given mode with continuity + drift refresh support.
 *
 * @param {{
 *  persona_pack: PersonaPack,
 *  mode: string,
 *  desired_emotion?: string,
 *  last_anchor_ref?: string,
 *  drift?: DriftSignal,
 *  turn_index?: number,
 *  policy?: Partial<typeof DEFAULT_ANCHOR_REFRESH_POLICY>
 * }} args
 * @returns {{ anchor: AnchorEntry | null, mode: string, reason: string }}
 */
export function selectAnchor(args) {
  const anchors = getAnchorSet(args.persona_pack, args.mode);
  if (!anchors.length) return { anchor: null, mode: args.mode, reason: "no_anchors" };

  const refresh = shouldRefreshAnchor({ drift: args.drift, turn_index: args.turn_index, policy: args.policy });
  if (!refresh.refresh && args.last_anchor_ref) {
    const last = anchors.find((a) => a.image_ref === args.last_anchor_ref);
    if (last) return { anchor: last, mode: args.mode, reason: "reuse_last_anchor" };
  }

  if (refresh.refresh) {
    const canonical = selectCanonicalAnchor(anchors);
    return { anchor: canonical, mode: args.mode, reason: `refresh:${refresh.reason}` };
  }

  const sorted = [...anchors].sort((a, b) => {
    const scoreDiff = scoreAnchor(b, args.desired_emotion) - scoreAnchor(a, args.desired_emotion);
    if (scoreDiff !== 0) return scoreDiff;
    return String(a.image_ref).localeCompare(String(b.image_ref));
  });

  return { anchor: sorted[0], mode: args.mode, reason: "best_match" };
}

/**
 * Clamp actor timeline against persona behavior policy.
 * @param {ActorTimelineEvent[]} timeline
 * @param {{
 *  emotion_ranges?: Record<string, { min?: number, max?: number }>,
 *  allowed_emotions?: string[]
 * }} behaviorPolicy
 * @returns {ActorTimelineEvent[]}
 */
export function clampActorTimeline(timeline, behaviorPolicy) {
  const allowed = behaviorPolicy?.allowed_emotions?.map((e) => String(e)) ?? null;
  const ranges = behaviorPolicy?.emotion_ranges ?? {};

  return (timeline ?? []).map((event) => {
    const next = { ...event };
    if (allowed && next.emotion && !allowed.includes(next.emotion)) next.emotion = allowed[0] ?? "neutral";

    const range = next.emotion ? ranges[next.emotion] : null;
    if (range && typeof next.intensity === "number") {
      const min = range.min ?? 0;
      const max = range.max ?? 1;
      next.intensity = Math.max(min, Math.min(max, next.intensity));
    } else if (typeof next.intensity === "number") {
      next.intensity = Math.max(0, Math.min(1, next.intensity));
    }
    return next;
  });
}

/**
 * In-memory Persona registry for testing and local prototyping.
 */
export class PersonaRegistry {
  /** @param {{ asset_resolver?: (ref: string) => string }=} opts */
  constructor(opts) {
    this.asset_resolver = opts?.asset_resolver ?? null;
    /** @type {Map<string, { metadata?: any, versions: Map<string, PersonaPack> }>} */
    this.personas = new Map();
  }

  /** @param {{ persona_id: string, metadata?: any }} args */
  createPersona(args) {
    if (!args?.persona_id) throw new Error("persona_id is required");
    if (this.personas.has(args.persona_id)) throw new Error(`persona already exists: ${args.persona_id}`);
    this.personas.set(args.persona_id, { metadata: args.metadata ?? {}, versions: new Map() });
  }

  /** @param {{ persona_id: string, pack: PersonaPack }} args */
  createPersonaVersion(args) {
    if (!args?.persona_id) throw new Error("persona_id is required");
    const entry = this.personas.get(args.persona_id);
    if (!entry) throw new Error(`persona not found: ${args.persona_id}`);

    const validation = validatePersonaPack(args.pack);
    if (!validation.ok) throw new Error(`invalid PersonaPack: ${validation.errors.join("; ")}`);
    if (args.pack.persona_id !== args.persona_id) throw new Error("persona_id mismatch in PersonaPack");

    entry.versions.set(args.pack.version, args.pack);
    return args.pack.version;
  }

  /** @param {{ persona_id: string, version: string }} args */
  getPersonaPack(args) {
    const entry = this.personas.get(args.persona_id);
    if (!entry) return null;
    return entry.versions.get(args.version) ?? null;
  }

  /** @param {string} personaId */
  listPersonaVersions(personaId) {
    const entry = this.personas.get(personaId);
    if (!entry) return [];
    return Array.from(entry.versions.keys());
  }

  /** @param {string} ref */
  resolveAsset(ref) {
    if (!this.asset_resolver) return ref;
    return this.asset_resolver(ref);
  }
}

/**
 * viseme-aligner — reference implementation
 *
 * Implements the "normalized viseme inventory" + (phoneme -> viseme) mapping described in:
 * `packages/viseme-aligner/tech_spec.md`
 *
 * This module intentionally avoids g2p / forced alignment dependencies. It provides:
 * - a backend-agnostic viseme set
 * - phoneme->viseme mapping helpers
 * - simple, deterministic timeline construction + merging utilities
 */

export const NORMALIZED_VISEMES = Object.freeze([
  "SIL",
  "AA",
  "AE",
  "AH",
  "AO",
  "EH",
  "ER",
  "IH",
  "IY",
  "OW",
  "UH",
  "UW",
  "BMP",
  "FV",
  "L",
  "WQ",
  "CHJSH",
  "TH",
  "TDK",
  "S",
]);

/**
 * @typedef {Object} PhonemeSegment
 * @property {string} phoneme
 * @property {number=} start_ms
 * @property {number=} end_ms
 * @property {number=} confidence
 */

/**
 * @typedef {Object} VisemeEvent
 * @property {number} start_ms
 * @property {number} end_ms
 * @property {string} viseme_id
 * @property {number} confidence
 */

/**
 * @typedef {Object} VisemeTimeline
 * @property {string} utterance_id
 * @property {string} language
 * @property {"tts_alignment"|"forced_aligner"|"heuristic"|"asr_alignment"} source
 * @property {VisemeEvent[]} visemes
 */

/**
 * Strip stress markers and normalize casing.
 * @param {string} phoneme
 * @returns {string}
 */
export function normalizePhoneme(phoneme) {
  return String(phoneme).trim().toUpperCase().replace(/[0-2]$/u, "");
}

/**
 * Map an (ARPABET-ish) phoneme to the normalized viseme inventory.
 * @param {string} phoneme
 * @returns {string} viseme_id
 */
export function phonemeToVisemeId(phoneme) {
  const p = normalizePhoneme(phoneme);
  if (!p) return "SIL";

  // Silence / pauses.
  if (p === "SIL" || p === "SP" || p === "SPN") return "SIL";

  // Vowels.
  if (p === "AA") return "AA";
  if (p === "AE") return "AE";
  if (p === "AH") return "AH";
  if (p === "AO") return "AO";
  if (p === "EH") return "EH";
  if (p === "ER") return "ER";
  if (p === "IH") return "IH";
  if (p === "IY") return "IY";
  if (p === "OW" || p === "OY") return "OW";
  if (p === "UH") return "UH";
  if (p === "UW") return "UW";

  // Consonant groups.
  if (p === "B" || p === "M" || p === "P") return "BMP";
  if (p === "F" || p === "V") return "FV";
  if (p === "L") return "L";
  if (p === "W" || p === "Q") return "WQ";
  if (p === "CH" || p === "JH" || p === "SH" || p === "ZH") return "CHJSH";
  if (p === "TH" || p === "DH") return "TH";
  if (p === "T" || p === "D" || p === "K" || p === "G") return "TDK";
  if (p === "S" || p === "Z") return "S";

  // Common fallbacks.
  if (p === "R") return "ER";
  if (p === "Y") return "IY";

  // Unknown -> silence-like neutral.
  return "SIL";
}

/**
 * Merge adjacent segments with the same viseme_id.
 * @param {VisemeEvent[]} events
 * @returns {VisemeEvent[]}
 */
export function mergeAdjacentVisemes(events) {
  /** @type {VisemeEvent[]} */
  const out = [];
  for (const ev of events) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push({ ...ev });
      continue;
    }
    if (prev.viseme_id === ev.viseme_id && ev.start_ms <= prev.end_ms) {
      const totalDur = Math.max(1, (prev.end_ms - prev.start_ms) + (ev.end_ms - ev.start_ms));
      const prevWeight = (prev.end_ms - prev.start_ms) / totalDur;
      const evWeight = (ev.end_ms - ev.start_ms) / totalDur;
      prev.end_ms = Math.max(prev.end_ms, ev.end_ms);
      prev.confidence = prev.confidence * prevWeight + ev.confidence * evWeight;
      continue;
    }
    out.push({ ...ev });
  }
  return out;
}

/**
 * Build a timeline from phoneme segments that already have timestamps.
 *
 * @param {{
 *   utterance_id: string,
 *   language?: string,
 *   source?: VisemeTimeline["source"],
 *   phonemes: PhonemeSegment[]
 * }} args
 * @returns {VisemeTimeline}
 */
export function timelineFromTimedPhonemes(args) {
  const utteranceId = args.utterance_id;
  if (!utteranceId) throw new Error("utterance_id is required");

  const language = args.language ?? "en";
  const source = args.source ?? "tts_alignment";

  /** @type {VisemeEvent[]} */
  const visemes = args.phonemes.map((p) => {
    const startMs = p.start_ms ?? 0;
    const endMs = p.end_ms ?? startMs;
    return {
      start_ms: startMs,
      end_ms: endMs,
      viseme_id: phonemeToVisemeId(p.phoneme),
      confidence: typeof p.confidence === "number" ? p.confidence : 0.8,
    };
  });

  return { utterance_id: utteranceId, language, source, visemes: mergeAdjacentVisemes(visemes) };
}

/**
 * Deterministic heuristic timeline generator from a sequence of viseme IDs.
 *
 * @param {{
 *   utterance_id: string,
 *   language?: string,
 *   viseme_ids: string[],
 *   total_duration_ms: number,
 *   start_ms?: number,
 *   confidence?: number
 * }} args
 * @returns {VisemeTimeline}
 */
export function heuristicTimelineFromVisemes(args) {
  const utteranceId = args.utterance_id;
  if (!utteranceId) throw new Error("utterance_id is required");
  if (!Array.isArray(args.viseme_ids) || args.viseme_ids.length === 0) {
    throw new Error("viseme_ids must be a non-empty array");
  }
  if (!Number.isFinite(args.total_duration_ms) || args.total_duration_ms <= 0) {
    throw new Error("total_duration_ms must be a positive number");
  }

  const language = args.language ?? "en";
  const startMs = args.start_ms ?? 0;
  const conf = typeof args.confidence === "number" ? Math.max(0, Math.min(1, args.confidence)) : 0.3;

  const n = args.viseme_ids.length;
  const step = args.total_duration_ms / n;

  /** @type {VisemeEvent[]} */
  const events = args.viseme_ids.map((id, i) => {
    const s = Math.round(startMs + i * step);
    const e = Math.round(startMs + (i + 1) * step);
    return { start_ms: s, end_ms: Math.max(e, s), viseme_id: String(id), confidence: conf };
  });

  return {
    utterance_id: utteranceId,
    language,
    source: "heuristic",
    visemes: mergeAdjacentVisemes(events),
  };
}


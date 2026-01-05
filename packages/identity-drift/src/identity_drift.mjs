/**
 * identity-drift -- reference implementation
 *
 * Implements lightweight similarity and drift heuristics described in:
 * `packages/identity-drift/tech_spec.md`
 */

export const DEFAULT_DRIFT_THRESHOLDS = Object.freeze({
  identity_warn: 0.84,
  identity_fail: 0.74,
  bg_warn: 0.8,
  bg_fail: 0.7,
  flicker_warn: 0.4,
  flicker_fail: 0.6,
});

/**
 * @typedef {Object} DriftSignal
 * @property {number} identity_similarity
 * @property {number} bg_similarity
 * @property {number} flicker_score
 */

/**
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0) return 0;
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * @param {number[]} embedding
 * @param {number[][]} refs
 * @returns {number}
 */
export function maxSimilarity(embedding, refs) {
  if (!Array.isArray(refs) || refs.length === 0) return 0;
  let best = -Infinity;
  for (const ref of refs) {
    const sim = cosineSimilarity(embedding, ref);
    if (sim > best) best = sim;
  }
  return best === -Infinity ? 0 : best;
}

/**
 * @param {Float32Array|number[]} prev
 * @param {Float32Array|number[]} next
 * @returns {number}
 */
export function flickerScore(prev, next) {
  if (!prev || !next) return 0;
  const a = Array.from(prev);
  const b = Array.from(next);
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let diff = 0;
  for (let i = 0; i < n; i++) diff += Math.abs(a[i] - b[i]);
  return diff / n;
}

/**
 * Score a single frame against reference embeddings.
 *
 * @param {{
 *  face_embedding?: number[],
 *  bg_embedding?: number[],
 *  prev_frame_luma?: Float32Array|number[],
 *  frame_luma?: Float32Array|number[],
 *  refs?: { face_embeddings?: number[][], bg_embeddings?: number[][] }
 * }} args
 * @returns {DriftSignal}
 */
export function scoreFrame(args) {
  const identity = args.face_embedding && args.refs?.face_embeddings
    ? maxSimilarity(args.face_embedding, args.refs.face_embeddings)
    : 0;
  const bg = args.bg_embedding && args.refs?.bg_embeddings
    ? maxSimilarity(args.bg_embedding, args.refs.bg_embeddings)
    : 0;
  const flicker = args.prev_frame_luma && args.frame_luma ? flickerScore(args.prev_frame_luma, args.frame_luma) : 0;
  return { identity_similarity: identity, bg_similarity: bg, flicker_score: flicker };
}

/**
 * @param {DriftSignal} signal
 * @param {Partial<typeof DEFAULT_DRIFT_THRESHOLDS>=} thresholds
 * @returns {{ identity: "ok"|"warn"|"fail", background: "ok"|"warn"|"fail", flicker: "ok"|"warn"|"fail" }}
 */
export function classifyDrift(signal, thresholds) {
  const t = { ...DEFAULT_DRIFT_THRESHOLDS, ...(thresholds ?? {}) };
  const identity = signal.identity_similarity < t.identity_fail ? "fail"
    : signal.identity_similarity < t.identity_warn ? "warn" : "ok";
  const background = signal.bg_similarity < t.bg_fail ? "fail"
    : signal.bg_similarity < t.bg_warn ? "warn" : "ok";
  const flicker = signal.flicker_score > t.flicker_fail ? "fail"
    : signal.flicker_score > t.flicker_warn ? "warn" : "ok";
  return { identity, background, flicker };
}

/**
 * @param {{ identity_avg?: number, bg_avg?: number, flicker_avg?: number }} prev
 * @param {DriftSignal} signal
 * @param {number=} alpha
 */
export function updateDriftTrend(prev, signal, alpha = 0.8) {
  const a = Math.max(0, Math.min(1, alpha));
  const b = 1 - a;
  return {
    identity_avg: (prev?.identity_avg ?? signal.identity_similarity) * a + signal.identity_similarity * b,
    bg_avg: (prev?.bg_avg ?? signal.bg_similarity) * a + signal.bg_similarity * b,
    flicker_avg: (prev?.flicker_avg ?? signal.flicker_score) * a + signal.flicker_score * b,
  };
}

/**
 * Recommend a corrective action based on drift bands.
 * @param {{ identity: string, background: string, flicker: string }} bands
 * @returns {{ action: string, reason: string }}
 */
export function recommendAction(bands) {
  if (bands.identity === "fail" || bands.background === "fail") {
    return { action: "RERENDER_BLOCK", reason: "identity_or_background_fail" };
  }
  if (bands.flicker === "fail") {
    return { action: "FORCE_ANCHOR_RESET", reason: "flicker_fail" };
  }
  if (bands.identity === "warn" || bands.background === "warn" || bands.flicker === "warn") {
    return { action: "STRENGTHEN_ANCHOR", reason: "warn" };
  }
  return { action: "NONE", reason: "ok" };
}

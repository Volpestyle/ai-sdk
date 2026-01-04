/**
 * sync-scorer — heuristic fallback implementation
 *
 * Implements the "energy envelope ↔ mouth openness correlation" fallback described in:
 * `packages/sync-scorer/tech_spec.md`
 *
 * Intended for monitoring / provider-bridge sampling when ML scoring isn't available.
 */

/**
 * @typedef {Object} HeuristicScoreInput
 * @property {string} window_id
 * @property {number[]} audio_envelope 1D energy/envelope samples (uniform step)
 * @property {number[]} mouth_open 1D mouth openness samples (uniform step)
 * @property {number} step_ms sampling interval for both signals (e.g. 33.3ms @ 30fps)
 * @property {number=} max_offset_ms search range (±) in ms
 * @property {number=} offset_step_ms offset step in ms
 * @property {number=} silence_threshold mean audio_envelope below => silence
 * @property {number=} lip_warn label threshold (default matches quality-controller)
 * @property {number=} lip_fail label threshold (default matches quality-controller)
 */

/**
 * @typedef {Object} LipSyncScore
 * @property {string} window_id
 * @property {number|null} score
 * @property {number|null} offset_ms
 * @property {number} confidence
 * @property {"ok"|"warn"|"fail"|"silence"|"occluded"|"unknown"} label
 * @property {Record<string, any>=} debug
 */

/**
 * @param {number[]} xs
 * @returns {number}
 */
function mean(xs) {
  let sum = 0;
  for (const x of xs) sum += x;
  return xs.length ? sum / xs.length : 0;
}

/**
 * @param {number[]} xs
 * @param {number} mu
 * @returns {number}
 */
function variance(xs, mu) {
  let sumSq = 0;
  for (const x of xs) {
    const d = x - mu;
    sumSq += d * d;
  }
  return xs.length ? sumSq / xs.length : 0;
}

/**
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} pearson correlation in [-1, 1] (or 0 if degenerate)
 */
function pearsonCorrelation(a, b) {
  if (a.length !== b.length || a.length < 3) return 0;
  const muA = mean(a);
  const muB = mean(b);
  const varA = variance(a, muA);
  const varB = variance(b, muB);
  const denom = Math.sqrt(varA * varB);
  if (!Number.isFinite(denom) || denom === 0) return 0;
  let cov = 0;
  for (let i = 0; i < a.length; i++) cov += (a[i] - muA) * (b[i] - muB);
  cov /= a.length;
  const corr = cov / denom;
  if (!Number.isFinite(corr)) return 0;
  if (corr < -1) return -1;
  if (corr > 1) return 1;
  return corr;
}

/**
 * Align overlapping segments of a and b when b is shifted by `shiftSteps`.
 *
 * Convention:
 * - shiftSteps > 0 means `b` occurs later (we compare a[t] with b[t + shiftSteps])
 * - shiftSteps < 0 means `b` occurs earlier
 *
 * @param {number[]} a
 * @param {number[]} b
 * @param {number} shiftSteps
 * @returns {{ aAligned: number[], bAligned: number[] }}
 */
function alignedOverlap(a, b, shiftSteps) {
  const n = Math.min(a.length, b.length);
  if (n === 0) return { aAligned: [], bAligned: [] };

  let startA = 0;
  let startB = 0;
  let len = n;

  if (shiftSteps > 0) {
    startB = shiftSteps;
    len = n - shiftSteps;
  } else if (shiftSteps < 0) {
    startA = -shiftSteps;
    len = n + shiftSteps; // shiftSteps negative
  }

  if (len <= 2) return { aAligned: [], bAligned: [] };

  const aAligned = a.slice(startA, startA + len);
  const bAligned = b.slice(startB, startB + len);
  return { aAligned, bAligned };
}

/**
 * @param {number} x
 * @returns {number}
 */
function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

/**
 * @param {HeuristicScoreInput} input
 * @returns {LipSyncScore}
 */
export function scoreHeuristicWindow(input) {
  const {
    window_id,
    audio_envelope,
    mouth_open,
    step_ms,
    max_offset_ms = 200,
    offset_step_ms = 20,
    silence_threshold = 1e-3,
    lip_warn = 0.55,
    lip_fail = 0.45,
  } = input;

  if (!window_id) throw new Error("window_id is required");
  if (!Array.isArray(audio_envelope) || !Array.isArray(mouth_open)) {
    throw new Error("audio_envelope and mouth_open must be arrays");
  }
  if (audio_envelope.length !== mouth_open.length) {
    throw new Error(`audio_envelope and mouth_open must be same length; got ${audio_envelope.length} vs ${mouth_open.length}`);
  }
  if (!Number.isFinite(step_ms) || step_ms <= 0) throw new Error(`step_ms must be > 0; got ${step_ms}`);

  const avgEnergy = mean(audio_envelope);
  if (avgEnergy < silence_threshold) {
    return { window_id, score: null, offset_ms: null, confidence: 0, label: "silence", debug: { avg_energy: avgEnergy } };
  }

  const maxShiftSteps = Math.max(1, Math.round(max_offset_ms / step_ms));
  const shiftStep = Math.max(1, Math.round(offset_step_ms / step_ms));

  /** @type {Record<string, number>} */
  const corrByOffset = {};
  let best = { corr: -Infinity, shiftSteps: 0 };
  let second = { corr: -Infinity, shiftSteps: 0 };

  for (let shift = -maxShiftSteps; shift <= maxShiftSteps; shift += shiftStep) {
    const { aAligned, bAligned } = alignedOverlap(audio_envelope, mouth_open, shift);
    const corr = pearsonCorrelation(aAligned, bAligned);
    corrByOffset[String(Math.round(shift * step_ms))] = corr;
    if (corr > best.corr) {
      second = best;
      best = { corr, shiftSteps: shift };
    } else if (corr > second.corr) {
      second = { corr, shiftSteps: shift };
    }
  }

  const bestCorr = Number.isFinite(best.corr) ? best.corr : 0;
  const secondCorr = Number.isFinite(second.corr) ? second.corr : 0;
  const margin = bestCorr - secondCorr;

  const score = clamp01((bestCorr + 1) / 2);
  const offsetMs = best.shiftSteps * step_ms;
  const confidence = clamp01(margin / 0.25);

  /** @type {LipSyncScore["label"]} */
  let label = "unknown";
  if (confidence < 0.15) label = "unknown";
  else if (score >= lip_warn) label = "ok";
  else if (score >= lip_fail) label = "warn";
  else label = "fail";

  return {
    window_id,
    score,
    offset_ms: offsetMs,
    confidence,
    label,
    debug: {
      avg_energy: avgEnergy,
      best_corr: bestCorr,
      second_best_corr: secondCorr,
      margin,
      step_ms,
      corr_by_offset_ms: corrByOffset,
    },
  };
}


/**
 * eval-lipsync-benchmark -- reference implementation
 *
 * Provides scoring helpers for lip-sync evaluation suites described in:
 * `packages/eval-lipsync-benchmark/product_spec.md`
 * `packages/eval-lipsync-benchmark/tech_spec.md`
 */

export const DEFAULT_THRESHOLDS = Object.freeze({
  lip_warn: 0.55,
  lip_fail: 0.45,
  allowed_fail_rate: 0.02,
  offset_p95_abs_ms: 120,
});

/**
 * @typedef {Object} LipSyncScore
 * @property {string=} window_id
 * @property {number|null} score
 * @property {number|null} offset_ms
 * @property {number} confidence
 * @property {string} label
 */

/**
 * @param {number[]} values
 * @param {number} p
 */
export function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

/**
 * @param {LipSyncScore[]} scores
 */
export function summarizeScores(scores) {
  const valid = scores.filter((s) => typeof s.score === "number").map((s) => /** @type {number} */ (s.score));
  const offsets = scores
    .filter((s) => typeof s.offset_ms === "number")
    .map((s) => Math.abs(/** @type {number} */ (s.offset_ms)));

  const mean = valid.length ? valid.reduce((sum, v) => sum + v, 0) / valid.length : 0;
  const p50 = percentile(valid, 0.5);
  const p95Low = percentile(valid, 0.05);
  const offsetP95 = percentile(offsets, 0.95);

  return { score_mean: mean, score_p50: p50, score_p95_low: p95Low, offset_p95_abs: offsetP95 };
}

/**
 * @param {LipSyncScore[]} scores
 * @param {number} lipFail
 */
export function failWindowRate(scores, lipFail) {
  const valid = scores.filter((s) => typeof s.score === "number");
  if (!valid.length) return 0;
  const fails = valid.filter((s) => /** @type {number} */ (s.score) < lipFail).length;
  return fails / valid.length;
}

/**
 * @param {{ case_id: string, scores: LipSyncScore[], thresholds?: Partial<typeof DEFAULT_THRESHOLDS> }} args
 */
export function scoreCase(args) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(args.thresholds ?? {}) };
  const summary = summarizeScores(args.scores);
  const failRate = failWindowRate(args.scores, thresholds.lip_fail);
  return {
    case_id: args.case_id,
    ...summary,
    fail_window_rate: failRate,
  };
}

/**
 * @param {{ case_reports: ReturnType<typeof scoreCase>[] }} args
 */
export function aggregateSuite(args) {
  if (!args.case_reports.length) return { score_mean: 0, fail_window_rate: 0, offset_p95_abs: 0 };
  const meanScore = args.case_reports.reduce((sum, c) => sum + c.score_mean, 0) / args.case_reports.length;
  const meanFail = args.case_reports.reduce((sum, c) => sum + c.fail_window_rate, 0) / args.case_reports.length;
  const offsetP95 = percentile(args.case_reports.map((c) => c.offset_p95_abs), 0.95);
  return { score_mean: meanScore, fail_window_rate: meanFail, offset_p95_abs: offsetP95 };
}

/**
 * @param {{
 *  suite: { thresholds?: Partial<typeof DEFAULT_THRESHOLDS> },
 *  case_reports: ReturnType<typeof scoreCase>[]
 * }} args
 */
export function evaluateSuite(args) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(args.suite.thresholds ?? {}) };
  const summary = aggregateSuite({ case_reports: args.case_reports });
  const pass =
    summary.fail_window_rate <= thresholds.allowed_fail_rate &&
    summary.offset_p95_abs <= thresholds.offset_p95_abs_ms &&
    summary.score_mean >= thresholds.lip_warn;
  return { summary, pass, thresholds };
}

/**
 * Run a suite by delegating case execution to a caller-provided function.
 * @param {{
 *  suite: { cases: { case_id: string }[], thresholds?: Partial<typeof DEFAULT_THRESHOLDS> },
 *  run_case: (caseInput: any) => Promise<{ scores: LipSyncScore[] }>
 * }} args
 */
export async function runEvalSuite(args) {
  /** @type {ReturnType<typeof scoreCase>[]} */
  const reports = [];
  for (const evalCase of args.suite.cases) {
    const result = await args.run_case(evalCase);
    reports.push(scoreCase({ case_id: evalCase.case_id, scores: result.scores, thresholds: args.suite.thresholds }));
  }
  const evaluation = evaluateSuite({ suite: args.suite, case_reports: reports });
  return { case_reports: reports, ...evaluation };
}

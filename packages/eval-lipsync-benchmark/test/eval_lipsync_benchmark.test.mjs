import test from "node:test";
import assert from "node:assert/strict";

import { scoreCase, evaluateSuite } from "../src/eval_lipsync_benchmark.mjs";

test("scoreCase computes mean and fail rate", () => {
  const scores = [
    { score: 0.9, offset_ms: 10, confidence: 1, label: "ok" },
    { score: 0.4, offset_ms: 20, confidence: 1, label: "fail" },
  ];
  const report = scoreCase({ case_id: "case1", scores });
  assert.equal(report.case_id, "case1");
  assert.ok(report.score_mean > 0.6);
  assert.ok(report.fail_window_rate > 0);
});

test("evaluateSuite fails when thresholds violated", () => {
  const caseReports = [
    { case_id: "case1", score_mean: 0.4, score_p50: 0.4, score_p95_low: 0.2, fail_window_rate: 0.5, offset_p95_abs: 200 },
  ];
  const evaluation = evaluateSuite({ suite: { thresholds: { lip_warn: 0.55 } }, case_reports: caseReports });
  assert.equal(evaluation.pass, false);
});

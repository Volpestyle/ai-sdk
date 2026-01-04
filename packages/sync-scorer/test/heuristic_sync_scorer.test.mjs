import test from "node:test";
import assert from "node:assert/strict";

import { scoreHeuristicWindow } from "../src/heuristic_sync_scorer.mjs";

test("heuristic scorer finds a positive offset when mouth lags audio", () => {
  const stepMs = 20;
  const n = 60;
  const lagSteps = 3; // 60ms

  // Use a deterministic but non-periodic pattern so the best offset is unambiguous.
  let seed = 123456789;
  const audio = Array.from({ length: n }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  });
  const mouth = Array.from({ length: n }, (_, i) => (i - lagSteps >= 0 ? audio[i - lagSteps] : 0));

  const out = scoreHeuristicWindow({
    window_id: "w1",
    audio_envelope: audio,
    mouth_open: mouth,
    step_ms: stepMs,
    max_offset_ms: 200,
    offset_step_ms: 20,
    silence_threshold: 1e-6,
  });

  assert.equal(out.label, "ok");
  assert.ok(out.score !== null && out.score > 0.8);
  assert.equal(out.offset_ms, lagSteps * stepMs);
});

test("heuristic scorer emits silence when audio energy is low", () => {
  const out = scoreHeuristicWindow({
    window_id: "w_silence",
    audio_envelope: Array.from({ length: 50 }, () => 0),
    mouth_open: Array.from({ length: 50 }, () => 0.5),
    step_ms: 20,
    silence_threshold: 1e-3,
  });
  assert.equal(out.label, "silence");
  assert.equal(out.score, null);
  assert.equal(out.offset_ms, null);
  assert.equal(out.confidence, 0);
});

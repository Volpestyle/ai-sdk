import test from "node:test";
import assert from "node:assert/strict";

import { clampTurnPlan, createHeuristicTurnPlan, estimateSpeechSeconds, validateTurnPlan } from "../src/planning_control.mjs";

test("estimateSpeechSeconds respects words_per_minute overrides", () => {
  const sec = estimateSpeechSeconds("one two three four", {
    words_per_minute: 120, // 2 words/sec
    pause_per_comma_sec: 0,
    pause_per_sentence_sec: 0,
    pause_per_newline_sec: 0,
  });
  assert.equal(sec, 2);
});

test("createHeuristicTurnPlan produces a valid TurnPlan shape", () => {
  const plan = createHeuristicTurnPlan({ response_text: "Hello there. How are you today?" });
  const v = validateTurnPlan(plan);
  assert.equal(v.ok, true);
});

test("validateTurnPlan rejects missing segments", () => {
  const v = validateTurnPlan({
    speech_budget_sec_target: 5,
    speech_budget_sec_hardcap: 10,
    speech_segments: [],
    actor_timeline: [],
  });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes("speech_segments")));
});

test("clampTurnPlan sorts by priority, clamps camera mode, trims segments, and inserts default actor timeline", () => {
  const input = {
    speech_budget_sec_target: 10,
    speech_budget_sec_hardcap: 10,
    camera_mode_suggestion: "NOT_A_MODE",
    speech_segments: [
      { priority: 2, text: "c", est_sec: 4 },
      { priority: 0, text: "a", est_sec: 8 },
      { priority: 1, text: "b", est_sec: 4 },
    ],
    actor_timeline: [],
  };

  const { plan, warnings } = clampTurnPlan(input);
  assert.equal(plan.camera_mode_suggestion, "A_SELFIE");
  assert.ok(warnings.length > 0);
  assert.equal(plan.speech_segments[0].priority, 0);
  assert.equal(plan.speech_segments.length, 1);
  assert.equal(plan.actor_timeline.length, 1);
  assert.ok(plan.actor_timeline[0].t1 >= 8);
});

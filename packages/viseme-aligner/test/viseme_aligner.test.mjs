import test from "node:test";
import assert from "node:assert/strict";

import { heuristicTimelineFromVisemes, phonemeToVisemeId, timelineFromTimedPhonemes } from "../src/viseme_aligner.mjs";

test("phonemeToVisemeId maps common ARPABET phonemes into normalized visemes", () => {
  assert.equal(phonemeToVisemeId("AA1"), "AA");
  assert.equal(phonemeToVisemeId("B"), "BMP");
  assert.equal(phonemeToVisemeId("P"), "BMP");
  assert.equal(phonemeToVisemeId("TH"), "TH");
  assert.equal(phonemeToVisemeId("XYZ"), "SIL");
});

test("timelineFromTimedPhonemes merges adjacent visemes of the same class", () => {
  const tl = timelineFromTimedPhonemes({
    utterance_id: "u1",
    phonemes: [
      { phoneme: "B", start_ms: 0, end_ms: 50, confidence: 0.9 },
      { phoneme: "P", start_ms: 50, end_ms: 100, confidence: 0.9 },
    ],
  });
  assert.equal(tl.visemes.length, 1);
  assert.equal(tl.visemes[0].viseme_id, "BMP");
  assert.equal(tl.visemes[0].start_ms, 0);
  assert.equal(tl.visemes[0].end_ms, 100);
});

test("heuristicTimelineFromVisemes produces monotonic, merged events", () => {
  const tl = heuristicTimelineFromVisemes({
    utterance_id: "u2",
    viseme_ids: ["AA", "AA", "SIL", "S"],
    total_duration_ms: 400,
  });
  assert.deepEqual(
    tl.visemes.map((v) => v.viseme_id),
    ["AA", "SIL", "S"],
  );
  assert.equal(tl.visemes[0].start_ms, 0);
  assert.equal(tl.visemes.at(-1).end_ms, 400);
  for (let i = 1; i < tl.visemes.length; i++) {
    assert.ok(tl.visemes[i].start_ms >= tl.visemes[i - 1].end_ms);
  }
});


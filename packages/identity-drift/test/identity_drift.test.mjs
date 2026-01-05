import test from "node:test";
import assert from "node:assert/strict";

import { cosineSimilarity, scoreFrame, classifyDrift, recommendAction } from "../src/identity_drift.mjs";

test("cosineSimilarity returns 1 for identical vectors", () => {
  const sim = cosineSimilarity([1, 0, 0], [1, 0, 0]);
  assert.ok(sim > 0.99);
});

test("scoreFrame computes identity similarity", () => {
  const signal = scoreFrame({
    face_embedding: [1, 0],
    bg_embedding: [0, 1],
    refs: { face_embeddings: [[1, 0]], bg_embeddings: [[0, 1]] },
  });
  assert.ok(signal.identity_similarity > 0.99);
  assert.ok(signal.bg_similarity > 0.99);
});

test("classifyDrift triggers fail on low identity similarity", () => {
  const bands = classifyDrift({ identity_similarity: 0.6, bg_similarity: 0.9, flicker_score: 0.1 });
  assert.equal(bands.identity, "fail");
  const action = recommendAction(bands);
  assert.equal(action.action, "RERENDER_BLOCK");
});

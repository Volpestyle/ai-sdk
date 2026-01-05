import test from "node:test";
import assert from "node:assert/strict";

import {
  validatePersonaPack,
  selectAnchor,
  clampActorTimeline,
  PersonaRegistry,
} from "../src/persona_core.mjs";

const samplePack = {
  persona_id: "p1",
  version: "v1",
  anchor_sets: {
    A_SELFIE: [
      { image_ref: "img_happy", metadata: { expression_tag: "happy" } },
      { image_ref: "img_canonical", metadata: { expression_tag: "neutral", best_for: ["canonical"] } },
    ],
  },
  identity: { face_embedding_refs: ["emb1"] },
  style: {},
  behavior_policy: {
    allowed_emotions: ["happy", "neutral"],
    emotion_ranges: { happy: { min: 0.2, max: 0.8 } },
  },
};

test("validatePersonaPack checks required fields", () => {
  const out = validatePersonaPack(samplePack);
  assert.equal(out.ok, true);
});

test("selectAnchor reuses last anchor when no refresh is needed", () => {
  const out = selectAnchor({
    persona_pack: samplePack,
    mode: "A_SELFIE",
    desired_emotion: "happy",
    last_anchor_ref: "img_happy",
    drift: { identity_similarity: 0.9 },
    turn_index: 1,
  });
  assert.equal(out.anchor?.image_ref, "img_happy");
  assert.equal(out.reason, "reuse_last_anchor");
});

test("selectAnchor refreshes to canonical when drift fails", () => {
  const out = selectAnchor({
    persona_pack: samplePack,
    mode: "A_SELFIE",
    desired_emotion: "happy",
    last_anchor_ref: "img_happy",
    drift: { identity_similarity: 0.6 },
    turn_index: 3,
  });
  assert.equal(out.anchor?.image_ref, "img_canonical");
  assert.ok(out.reason.startsWith("refresh"));
});

test("clampActorTimeline respects behavior policy ranges", () => {
  const timeline = [{ emotion: "happy", intensity: 0.95 }];
  const clamped = clampActorTimeline(timeline, samplePack.behavior_policy);
  assert.equal(clamped[0].intensity, 0.8);
});

test("PersonaRegistry stores versions", () => {
  const registry = new PersonaRegistry();
  registry.createPersona({ persona_id: "p1" });
  registry.createPersonaVersion({ persona_id: "p1", pack: samplePack });
  assert.deepEqual(registry.listPersonaVersions("p1"), ["v1"]);
});

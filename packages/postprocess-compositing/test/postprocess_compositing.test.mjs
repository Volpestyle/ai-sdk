import test from "node:test";
import assert from "node:assert/strict";

import { buildCompositingPlan, composeMedia, selectExportProfile } from "../src/postprocess_compositing.mjs";

test("buildCompositingPlan includes optional steps", () => {
  const plan = buildCompositingPlan({
    subject_ref: "memory://subject",
    alpha_ref: "memory://alpha",
    background_ref: "memory://bg",
    options: { relight: true, upscale: true, restore_face: true, lipsync_correction: true },
  });
  const types = plan.steps.map((s) => s.type);
  assert.ok(types.includes("edge_refine"));
  assert.ok(types.includes("relight"));
  assert.ok(types.includes("upscale"));
  assert.ok(types.includes("restore_face"));
  assert.ok(types.includes("lip_sync_correction"));
});

test("selectExportProfile defaults to image png", () => {
  const profile = selectExportProfile({});
  assert.equal(profile.format, "png");
});

test("composeMedia returns a composite ref and plan", () => {
  const out = composeMedia({ subject_ref: "memory://subject" });
  assert.ok(out.composite_ref.startsWith("composite://"));
  assert.ok(out.plan.steps.length > 0);
});

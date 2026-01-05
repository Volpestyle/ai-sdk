import test from "node:test";
import assert from "node:assert/strict";

import { resolveScenePlan, validateScenePack } from "../src/scene_system.mjs";

const scenePack = {
  scene_pack_id: "scene_pack_1",
  version: "v1",
  presets: [
    {
      preset_id: "bedroom",
      title: "Cozy Bedroom",
      tags: ["cozy", "night"],
      prompt_recipe: { positive: "cozy bedroom", negative: "blurry" },
      defaults: { time_of_day: "night" },
      constraints: { fov: 50 },
    },
    {
      preset_id: "studio",
      title: "Studio",
      tags: ["studio"],
      prompt_recipe: { positive: "clean studio", negative: "lowres" },
    },
  ],
};

test("validateScenePack passes required fields", () => {
  const out = validateScenePack(scenePack);
  assert.equal(out.ok, true);
});

test("resolveScenePlan selects preset by id", () => {
  const plan = resolveScenePlan({
    scene_pack: scenePack,
    preset_id: "bedroom",
    overrides: { prompt: { positive_append: "warm lamp" } },
    seed: 42,
  });
  assert.equal(plan.preset_id, "bedroom");
  assert.ok(plan.prompt.positive.includes("warm lamp"));
});

test("resolveScenePlan falls back to tag match", () => {
  const plan = resolveScenePlan({
    scene_pack: scenePack,
    tags: ["studio"],
  });
  assert.equal(plan.preset_id, "studio");
});

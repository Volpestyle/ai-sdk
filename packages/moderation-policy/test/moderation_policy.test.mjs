import test from "node:test";
import assert from "node:assert/strict";

import {
  ILLEGAL_ONLY_POLICY,
  evaluateTextPolicy,
  mergePolicyPacks,
  enforcePolicyTiers,
} from "../src/moderation_policy.mjs";

test("evaluateTextPolicy blocks illegal keyword hits", () => {
  const res = evaluateTextPolicy("this includes csam content", ILLEGAL_ONLY_POLICY);
  assert.equal(res.action, "block");
  assert.ok(res.categories.includes("csam"));
});

test("mergePolicyPacks keeps strictest action", () => {
  const packA = { id: "a", categories: { test: { action: "allow", keywords: ["a"] } } };
  const packB = { id: "b", categories: { test: { action: "block", keywords: ["b"] } } };
  const merged = mergePolicyPacks([packA, packB]);
  assert.equal(merged.categories.test.action, "block");
  assert.ok(merged.categories.test.keywords.includes("a"));
});

test("enforcePolicyTiers selects strictest result", () => {
  const allow = { categories: [], action: "allow" };
  const block = { categories: ["csam"], action: "block" };
  const out = enforcePolicyTiers([allow, block]);
  assert.equal(out.action, "block");
  assert.ok(out.categories.includes("csam"));
});

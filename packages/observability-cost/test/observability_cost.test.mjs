import test from "node:test";
import assert from "node:assert/strict";

import { CostLedger, ErrorRateTracker, shouldTripCircuitBreaker } from "../src/observability_cost.mjs";

test("CostLedger totals per provider", () => {
  const ledger = new CostLedger();
  ledger.record({ provider: "openai", model: "gpt", kind: "llm", units: 1000, unit_cost: 0.000002 });
  ledger.record({ provider: "openai", model: "tts", kind: "audio", units: 10, unit_cost: 0.02 });
  const total = ledger.totalCost();
  assert.ok(total > 0);
  const byProvider = ledger.totalByProvider();
  assert.ok(byProvider.openai > 0);
});

test("ErrorRateTracker triggers circuit breaker", () => {
  const tracker = new ErrorRateTracker({ window_ms: 1000 });
  tracker.record(false);
  tracker.record(false);
  tracker.record(true);
  const rate = tracker.errorRate();
  assert.ok(rate > 0.5);
  assert.equal(shouldTripCircuitBreaker({ error_rate: rate, threshold: 0.5 }), true);
});

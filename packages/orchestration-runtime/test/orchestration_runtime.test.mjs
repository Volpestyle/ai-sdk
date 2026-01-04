import test from "node:test";
import assert from "node:assert/strict";

import { RetryableError, computeBackoffDelayMs, runDag } from "../src/orchestration_runtime.mjs";

test("computeBackoffDelayMs is deterministic and exponential", () => {
  assert.equal(computeBackoffDelayMs(1, { initial_delay_ms: 10, max_delay_ms: 1_000, backoff_factor: 2, jitter_ratio: 0 }), 0);
  assert.equal(computeBackoffDelayMs(2, { initial_delay_ms: 10, max_delay_ms: 1_000, backoff_factor: 2, jitter_ratio: 0 }), 10);
  assert.equal(computeBackoffDelayMs(3, { initial_delay_ms: 10, max_delay_ms: 1_000, backoff_factor: 2, jitter_ratio: 0 }), 20);
});

test("runDag respects dependencies and produces outputs", async () => {
  /** @type {any[]} */
  const events = [];

  const steps = [
    {
      id: "A",
      run: async () => ({ outputs: { value: 1 } }),
    },
    {
      id: "B",
      deps: ["A"],
      run: async (ctx) => ({ outputs: { value: ctx.inputs.A.value + 1 } }),
    },
    {
      id: "C",
      deps: ["A"],
      run: async (ctx) => ({ outputs: { value: ctx.inputs.A.value + 2 } }),
    },
  ];

  const result = await runDag(steps, {}, { concurrency: 2, mode: "batch", emit: (e) => events.push(e) });
  assert.equal(result.status, "succeeded");
  assert.equal(result.results_by_step.B.outputs.value, 2);
  assert.equal(result.results_by_step.C.outputs.value, 3);

  const idxAOk = events.findIndex((e) => e.type === "STEP_SUCCEEDED" && e.step_id === "A");
  const idxBStart = events.findIndex((e) => e.type === "STEP_STARTED" && e.step_id === "B");
  const idxCStart = events.findIndex((e) => e.type === "STEP_STARTED" && e.step_id === "C");
  assert.ok(idxAOk !== -1 && idxBStart !== -1 && idxCStart !== -1);
  assert.ok(idxAOk < idxBStart);
  assert.ok(idxAOk < idxCStart);
});

test("runDag retries retryable failures with backoff", async () => {
  /** @type {number[]} */
  const sleeps = [];
  const sleep = async (ms) => {
    sleeps.push(ms);
  };

  let calls = 0;
  const steps = [
    {
      id: "R",
      retry: { max_attempts: 3, initial_delay_ms: 10, max_delay_ms: 100, backoff_factor: 2, jitter_ratio: 0 },
      run: async () => {
        calls += 1;
        if (calls < 3) throw new RetryableError("transient");
        return { outputs: { ok: true } };
      },
    },
  ];

  const result = await runDag(steps, {}, { mode: "batch", sleep });
  assert.equal(result.status, "succeeded");
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [10, 20]);
});

test("runDag returns cancelled when AbortSignal is already aborted", async () => {
  const ac = new AbortController();
  ac.abort();

  const steps = [
    {
      id: "A",
      run: async () => ({ outputs: { value: 1 } }),
    },
  ];

  const result = await runDag(steps, {}, { mode: "batch", signal: ac.signal });
  assert.equal(result.status, "cancelled");
});


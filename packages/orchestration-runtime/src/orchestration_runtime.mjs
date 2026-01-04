/**
 * orchestration-runtime — reference implementation
 *
 * Implements a deterministic in-process DAG runner that supports:
 * - batch jobs (queued execution)
 * - streaming sessions (low-latency sequential execution; still a DAG conceptually)
 * - retries with exponential backoff
 * - cancellation via AbortSignal
 * - optional step-level caching keyed by inputs/params/snapshot
 *
 * This is a minimal "ship it" skeleton aligned with:
 * `packages/orchestration-runtime/product_spec.md`
 * `packages/orchestration-runtime/tech_spec.md`
 */

import crypto from "node:crypto";

export const JOB_MODES = Object.freeze(["streaming", "batch"]);

export const DEFAULT_RETRY_POLICY = Object.freeze({
  max_attempts: 3,
  initial_delay_ms: 200,
  max_delay_ms: 2_000,
  backoff_factor: 2,
  jitter_ratio: 0, // deterministic by default; set >0 to add jitter.
});

/**
 * @typedef {Object} RetryPolicy
 * @property {number=} max_attempts
 * @property {number=} initial_delay_ms
 * @property {number=} max_delay_ms
 * @property {number=} backoff_factor
 * @property {number=} jitter_ratio
 */

/**
 * @typedef {Object} StepCacheConfig
 * @property {boolean=} enabled
 * @property {string=} snapshot
 * @property {string=} key
 */

/**
 * @typedef {Object} StepDefinition
 * @property {string} id
 * @property {string[]=} deps
 * @property {any=} params
 * @property {RetryPolicy=} retry
 * @property {StepCacheConfig=} cache
 * @property {(ctx: StepRunContext) => Promise<StepRunResult>} run
 */

/**
 * @typedef {Object} StepRunContext
 * @property {string} job_id
 * @property {"streaming"|"batch"} mode
 * @property {string} step_id
 * @property {number} attempt
 * @property {Record<string, any>} inputs
 * @property {any} params
 * @property {AbortSignal=} signal
 * @property {(event: any) => void=} emit
 */

/**
 * @typedef {Object} StepRunResult
 * @property {Record<string, any>=} outputs
 * @property {Record<string, any>=} metrics
 */

/**
 * @typedef {Object} RunDagOptions
 * @property {string=} job_id
 * @property {"streaming"|"batch"=} mode
 * @property {number=} concurrency
 * @property {AbortSignal=} signal
 * @property {(event: any) => void=} emit
 * @property {(ms: number) => Promise<void>=} sleep
 * @property {Map<string, StepRunResult>=} cache_store
 */

/**
 * @typedef {Object} RunDagResult
 * @property {"succeeded"|"failed"|"cancelled"} status
 * @property {string} job_id
 * @property {"streaming"|"batch"} mode
 * @property {Record<string, StepRunResult>} results_by_step
 * @property {any=} error
 */

export class RetryableError extends Error {
  /**
   * @param {string} message
   * @param {{ cause?: any }=} opts
   */
  constructor(message, opts) {
    super(message);
    this.name = "RetryableError";
    /** @type {any} */
    this.cause = opts?.cause;
  }
}

export class AbortError extends Error {
  constructor(message = "Aborted") {
    super(message);
    this.name = "AbortError";
  }
}

/**
 * @param {any} err
 * @returns {boolean}
 */
export function isRetryableError(err) {
  if (!err) return false;
  if (err instanceof RetryableError) return true;
  if (typeof err === "object" && err.retryable === true) return true;
  return false;
}

/**
 * @param {AbortSignal=} signal
 */
function throwIfAborted(signal) {
  if (signal?.aborted) throw new AbortError();
}

/**
 * Deterministic stable stringify (sorts object keys recursively).
 * @param {any} value
 * @returns {string}
 */
export function stableStringify(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  const t = typeof value;
  if (t === "number" || t === "boolean") return String(value);
  if (t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map((v) => stableStringify(v)).join(",") + "]";
  if (t === "object") {
    const keys = Object.keys(value).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") + "}";
  }
  // functions/symbols/etc are stringified to type name (shouldn't be used in keys).
  return JSON.stringify(String(value));
}

/**
 * @param {any} value
 * @returns {string} sha256 hex
 */
export function sha256Hex(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

/**
 * @param {{
 *   step_id: string,
 *   deps_outputs: Record<string, any>,
 *   params: any,
 *   snapshot?: string,
 *   key_override?: string
 * }} args
 * @returns {string}
 */
export function computeStepCacheKey(args) {
  if (args.key_override) return String(args.key_override);
  return sha256Hex({
    step_id: args.step_id,
    deps_outputs: args.deps_outputs,
    params: args.params,
    snapshot: args.snapshot ?? null,
  });
}

/**
 * @param {RetryPolicy=} retry
 * @returns {Required<RetryPolicy>}
 */
export function normalizeRetryPolicy(retry) {
  const r = { ...DEFAULT_RETRY_POLICY, ...(retry ?? {}) };
  return /** @type {Required<RetryPolicy>} */ ({
    max_attempts: Math.max(1, Number(r.max_attempts ?? DEFAULT_RETRY_POLICY.max_attempts)),
    initial_delay_ms: Math.max(0, Number(r.initial_delay_ms ?? DEFAULT_RETRY_POLICY.initial_delay_ms)),
    max_delay_ms: Math.max(0, Number(r.max_delay_ms ?? DEFAULT_RETRY_POLICY.max_delay_ms)),
    backoff_factor: Math.max(1, Number(r.backoff_factor ?? DEFAULT_RETRY_POLICY.backoff_factor)),
    jitter_ratio: Math.max(0, Number(r.jitter_ratio ?? DEFAULT_RETRY_POLICY.jitter_ratio)),
  });
}

/**
 * @param {number} attempt attempt number starting at 1
 * @param {RetryPolicy=} retry
 * @returns {number} delay ms before next attempt (0 for attempt=1)
 */
export function computeBackoffDelayMs(attempt, retry) {
  const r = normalizeRetryPolicy(retry);
  if (attempt <= 1) return 0;
  const exp = attempt - 2; // attempt 2 => exp 0
  const base = r.initial_delay_ms * Math.pow(r.backoff_factor, exp);
  const clamped = Math.min(r.max_delay_ms, base);
  if (r.jitter_ratio <= 0) return Math.round(clamped);

  // Deterministic jitter based on attempt (no RNG).
  const jitter = Math.sin(attempt * 999) * 0.5 + 0.5; // 0..1
  const scaled = clamped * (1 - r.jitter_ratio + jitter * r.jitter_ratio);
  return Math.round(scaled);
}

/**
 * Validate a DAG definition.
 * Throws on unknown deps, duplicate ids, or cycles.
 *
 * @param {StepDefinition[]} steps
 */
export function validateDag(steps) {
  const ids = new Set();
  for (const s of steps) {
    if (!s?.id) throw new Error("step id is required");
    if (ids.has(s.id)) throw new Error(`duplicate step id: ${s.id}`);
    ids.add(s.id);
  }

  const stepById = new Map(steps.map((s) => [s.id, s]));
  for (const s of steps) {
    for (const dep of s.deps ?? []) {
      if (!stepById.has(dep)) throw new Error(`step ${s.id} depends on missing step: ${dep}`);
    }
  }

  // Cycle detection via DFS coloring.
  /** @type {Map<string, 0|1|2>} */
  const color = new Map(); // 0=unseen,1=visiting,2=done
  const visit = (id) => {
    const c = color.get(id) ?? 0;
    if (c === 1) throw new Error(`cycle detected at step: ${id}`);
    if (c === 2) return;
    color.set(id, 1);
    const s = stepById.get(id);
    for (const dep of s?.deps ?? []) visit(dep);
    color.set(id, 2);
  };
  for (const s of steps) visit(s.id);
}

/**
 * @returns {Map<string, StepRunResult>}
 */
export function createInMemoryStepCache() {
  return new Map();
}

/**
 * @param {StepDefinition} step
 * @param {StepRunContext} ctx
 * @param {RunDagOptions} opts
 * @returns {Promise<StepRunResult>}
 */
async function runStepWithRetry(step, ctx, opts) {
  const retry = normalizeRetryPolicy(step.retry);
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const cacheStore = opts.cache_store;

  // Cache lookup.
  if (step.cache?.enabled && cacheStore) {
    const key = computeStepCacheKey({
      step_id: step.id,
      deps_outputs: ctx.inputs,
      params: ctx.params,
      snapshot: step.cache.snapshot,
      key_override: step.cache.key,
    });
    const hit = cacheStore.get(key);
    if (hit) {
      ctx.emit?.({ type: "STEP_CACHED", job_id: ctx.job_id, step_id: step.id, cache_key: key });
      return hit;
    }
  }

  for (let attempt = 1; attempt <= retry.max_attempts; attempt++) {
    throwIfAborted(ctx.signal);
    const delay = computeBackoffDelayMs(attempt, retry);
    if (delay > 0) {
      ctx.emit?.({ type: "STEP_RETRY_DELAY", job_id: ctx.job_id, step_id: step.id, attempt, delay_ms: delay });
      await sleep(delay);
    }

    const started = Date.now();
    ctx.emit?.({ type: "STEP_STARTED", job_id: ctx.job_id, step_id: step.id, attempt, mode: ctx.mode });

    try {
      const res = await step.run({ ...ctx, attempt });
      const duration = Date.now() - started;
      ctx.emit?.({ type: "STEP_SUCCEEDED", job_id: ctx.job_id, step_id: step.id, attempt, duration_ms: duration });

      // Cache write.
      if (step.cache?.enabled && cacheStore) {
        const key = computeStepCacheKey({
          step_id: step.id,
          deps_outputs: ctx.inputs,
          params: ctx.params,
          snapshot: step.cache.snapshot,
          key_override: step.cache.key,
        });
        cacheStore.set(key, res);
      }
      return res;
    } catch (err) {
      const duration = Date.now() - started;

      if (ctx.signal?.aborted) {
        ctx.emit?.({ type: "STEP_CANCELLED", job_id: ctx.job_id, step_id: step.id, attempt, duration_ms: duration });
        throw new AbortError();
      }

      const retryable = isRetryableError(err);
      ctx.emit?.({
        type: "STEP_FAILED",
        job_id: ctx.job_id,
        step_id: step.id,
        attempt,
        duration_ms: duration,
        retryable,
        error: String(err?.message ?? err),
      });

      if (!retryable || attempt === retry.max_attempts) throw err;
      // otherwise loop and retry
    }
  }

  throw new Error(`unreachable: exceeded retry loop for step ${step.id}`);
}

/**
 * Execute a DAG of steps.
 *
 * @param {StepDefinition[]} steps
 * @param {{ inputs?: Record<string, any> }=} args
 * @param {RunDagOptions=} opts
 * @returns {Promise<RunDagResult>}
 */
export async function runDag(steps, args, opts) {
  validateDag(steps);
  const jobId = opts?.job_id ?? `job_${Date.now()}`;
  const mode = opts?.mode ?? "batch";
  if (!JOB_MODES.includes(mode)) throw new Error(`invalid mode: ${mode}`);

  const concurrency = Math.max(1, opts?.concurrency ?? (mode === "streaming" ? 1 : 4));
  const signal = opts?.signal;
  const emit = opts?.emit;

  emit?.({ type: "JOB_STARTED", job_id: jobId, mode, step_count: steps.length });

  /** @type {Map<string, StepDefinition>} */
  const stepById = new Map(steps.map((s) => [s.id, s]));
  /** @type {Map<string, string[]>} */
  const dependents = new Map();
  /** @type {Map<string, number>} */
  const indegree = new Map();

  for (const s of steps) {
    indegree.set(s.id, (s.deps ?? []).length);
    for (const dep of s.deps ?? []) {
      const list = dependents.get(dep) ?? [];
      list.push(s.id);
      dependents.set(dep, list);
    }
  }

  /** @type {string[]} */
  const ready = [];
  for (const [id, deg] of indegree.entries()) if (deg === 0) ready.push(id);

  /** @type {Record<string, StepRunResult>} */
  const resultsByStep = {};

  /** @type {Set<Promise<void>>} */
  const running = new Set();

  let failed = false;
  /** @type {any} */
  let failureError = null;
  let cancelled = false;

  const tryStartNext = () => {
    while (!failed && !cancelled && !signal?.aborted && running.size < concurrency && ready.length > 0) {
      const stepId = ready.shift();
      const step = stepById.get(stepId);
      if (!step) continue;

      /** @type {Record<string, any>} */
      const inputs = {};
      for (const dep of step.deps ?? []) inputs[dep] = resultsByStep[dep]?.outputs ?? {};
      for (const [k, v] of Object.entries(args?.inputs ?? {})) {
        if (inputs[k] === undefined) inputs[k] = v;
      }

      const p = (async () => {
        try {
          const result = await runStepWithRetry(
            step,
            { job_id: jobId, mode, step_id: stepId, attempt: 1, inputs, params: step.params, signal, emit },
            opts ?? {},
          );
          resultsByStep[stepId] = result ?? {};

          emit?.({
            type: "PROGRESS",
            job_id: jobId,
            completed_steps: Object.keys(resultsByStep).length,
            total_steps: steps.length,
          });

          for (const depId of dependents.get(stepId) ?? []) {
            const nextDeg = (indegree.get(depId) ?? 0) - 1;
            indegree.set(depId, nextDeg);
            if (nextDeg === 0) ready.push(depId);
          }
        } catch (err) {
          if (err instanceof AbortError || signal?.aborted) {
            cancelled = true;
            return;
          }
          failed = true;
          failureError = err;
        } finally {
          running.delete(p);
        }
      })();

      running.add(p);
    }
  };

  tryStartNext();

  while (!failed && !cancelled && (running.size > 0 || ready.length > 0)) {
    if (signal?.aborted) {
      cancelled = true;
      break;
    }
    await Promise.race(running);
    tryStartNext();
  }

  // If aborted while waiting, mark cancelled (and wait for in-flight steps to settle).
  if (signal?.aborted) cancelled = true;

  if (cancelled) {
    await Promise.allSettled([...running]);
    emit?.({ type: "JOB_CANCELLED", job_id: jobId, mode });
    return { status: "cancelled", job_id: jobId, mode, results_by_step: resultsByStep };
  }

  if (failed) {
    await Promise.allSettled([...running]);
    emit?.({ type: "JOB_FAILED", job_id: jobId, mode, error: String(failureError?.message ?? failureError) });
    return { status: "failed", job_id: jobId, mode, results_by_step: resultsByStep, error: failureError };
  }

  emit?.({ type: "JOB_SUCCEEDED", job_id: jobId, mode, results_by_step: Object.keys(resultsByStep).length });
  return { status: "succeeded", job_id: jobId, mode, results_by_step: resultsByStep };
}

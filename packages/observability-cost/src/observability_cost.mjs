/**
 * observability-cost -- reference implementation
 *
 * Provides minimal tracing, metrics, and cost ledger helpers described in:
 * `packages/observability-cost/product_spec.md`
 * `packages/observability-cost/tech_spec.md`
 */

/**
 * @typedef {Object} CostEntry
 * @property {string} provider
 * @property {string} model
 * @property {string} kind
 * @property {number} units
 * @property {number} unit_cost
 * @property {number} timestamp_ms
 */

export class TraceSpan {
  /** @param {{ name: string, tags?: Record<string, any> }} args */
  constructor(args) {
    this.name = args.name;
    this.tags = args.tags ?? {};
    this.start_ms = Date.now();
    this.end_ms = null;
  }

  end() {
    this.end_ms = Date.now();
  }

  durationMs() {
    if (this.end_ms === null) return 0;
    return this.end_ms - this.start_ms;
  }
}

export class Tracer {
  startSpan(name, tags) {
    return new TraceSpan({ name, tags });
  }
}

export class CostLedger {
  constructor() {
    /** @type {CostEntry[]} */
    this.entries = [];
  }

  /** @param {Omit<CostEntry, "timestamp_ms">} entry */
  record(entry) {
    this.entries.push({ ...entry, timestamp_ms: Date.now() });
  }

  totalCost() {
    return this.entries.reduce((sum, e) => sum + e.units * e.unit_cost, 0);
  }

  totalByProvider() {
    /** @type {Record<string, number>} */
    const out = {};
    for (const entry of this.entries) {
      out[entry.provider] = (out[entry.provider] ?? 0) + entry.units * entry.unit_cost;
    }
    return out;
  }
}

export class ErrorRateTracker {
  /** @param {{ window_ms?: number }=} opts */
  constructor(opts) {
    this.window_ms = opts?.window_ms ?? 60_000;
    /** @type {{ timestamp_ms: number, ok: boolean }[]} */
    this.events = [];
  }

  /** @param {boolean} ok */
  record(ok) {
    const now = Date.now();
    this.events.push({ timestamp_ms: now, ok });
    this.compact(now);
  }

  /** @param {number} now */
  compact(now) {
    const cutoff = now - this.window_ms;
    this.events = this.events.filter((e) => e.timestamp_ms >= cutoff);
  }

  errorRate() {
    if (this.events.length === 0) return 0;
    const errors = this.events.filter((e) => !e.ok).length;
    return errors / this.events.length;
  }
}

/**
 * @param {{ error_rate: number, threshold: number }} args
 */
export function shouldTripCircuitBreaker(args) {
  return args.error_rate >= args.threshold;
}

/**
 * storage-metadata -- reference implementation
 *
 * In-memory asset + job metadata store based on:
 * `packages/storage-metadata/product_spec.md`
 * `packages/storage-metadata/tech_spec.md`
 */

import { createHash, randomUUID } from "node:crypto";

/**
 * @typedef {Object} MediaAsset
 * @property {string} asset_id
 * @property {string} kind
 * @property {string} uri
 * @property {string} content_hash
 * @property {number=} size
 * @property {number[]=} dims
 * @property {number=} duration
 * @property {string=} created_by
 * @property {Object=} model_snapshot
 * @property {Object=} params
 */

/**
 * @typedef {Object} StepRun
 * @property {string} step_id
 * @property {number} started_ms
 * @property {number} ended_ms
 * @property {string=} status
 * @property {string[]=} logs
 */

/**
 * @typedef {Object} GenJob
 * @property {string} job_id
 * @property {string} type
 * @property {Object} inputs
 * @property {Object=} plan
 * @property {StepRun[]} step_runs
 * @property {string[]} outputs
 */

/**
 * @param {Buffer|string} data
 * @returns {string}
 */
export function computeContentHash(data) {
  const hash = createHash("sha256");
  hash.update(typeof data === "string" ? Buffer.from(data) : data);
  return hash.digest("hex");
}

/**
 * @param {{
 *  kind: string,
 *  uri: string,
 *  blob?: Buffer|string,
 *  size?: number,
 *  dims?: number[],
 *  duration?: number,
 *  created_by?: string,
 *  model_snapshot?: Object,
 *  params?: Object,
 *  asset_id?: string
 * }} args
 * @returns {MediaAsset}
 */
export function createAssetRecord(args) {
  const assetId = args.asset_id ?? `asset_${randomUUID()}`;
  const hash = args.blob ? computeContentHash(args.blob) : "unknown";
  return {
    asset_id: assetId,
    kind: args.kind,
    uri: args.uri,
    content_hash: hash,
    size: args.size,
    dims: args.dims,
    duration: args.duration,
    created_by: args.created_by,
    model_snapshot: args.model_snapshot,
    params: args.params,
  };
}

/**
 * @param {{ type: string, inputs: Object, plan?: Object, job_id?: string }} args
 * @returns {GenJob}
 */
export function createJobRecord(args) {
  return {
    job_id: args.job_id ?? `job_${randomUUID()}`,
    type: args.type,
    inputs: args.inputs,
    plan: args.plan ?? null,
    step_runs: [],
    outputs: [],
  };
}

/**
 * In-memory storage implementation for testing.
 */
export class InMemoryStorageMetadata {
  constructor() {
    /** @type {Map<string, MediaAsset>} */
    this.assets = new Map();
    /** @type {Map<string, GenJob>} */
    this.jobs = new Map();
  }

  /** @param {Parameters<typeof createAssetRecord>[0]} args */
  putAsset(args) {
    const record = createAssetRecord(args);
    this.assets.set(record.asset_id, record);
    return record.asset_id;
  }

  /** @param {string} assetId */
  getAsset(assetId) {
    return this.assets.get(assetId) ?? null;
  }

  /** @param {Parameters<typeof createJobRecord>[0]} args */
  createJob(args) {
    const job = createJobRecord(args);
    this.jobs.set(job.job_id, job);
    return job.job_id;
  }

  /** @param {string} jobId */
  getJob(jobId) {
    return this.jobs.get(jobId) ?? null;
  }

  /** @param {{ job_id: string, step: StepRun }} args */
  appendStepRun(args) {
    const job = this.jobs.get(args.job_id);
    if (!job) throw new Error(`job not found: ${args.job_id}`);
    job.step_runs.push(args.step);
  }

  /** @param {{ job_id: string, asset_id: string }} args */
  attachOutput(args) {
    const job = this.jobs.get(args.job_id);
    if (!job) throw new Error(`job not found: ${args.job_id}`);
    job.outputs.push(args.asset_id);
  }

  /** @param {string} assetId */
  replayAsset(assetId) {
    const asset = this.assets.get(assetId);
    if (!asset) throw new Error(`asset not found: ${assetId}`);
    const job = createJobRecord({ type: "replay", inputs: { asset_id: assetId } });
    this.jobs.set(job.job_id, job);
    return job.job_id;
  }
}

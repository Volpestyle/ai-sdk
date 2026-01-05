import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStorageMetadata } from "../src/storage_metadata.mjs";

test("InMemoryStorageMetadata stores assets and jobs", () => {
  const storage = new InMemoryStorageMetadata();
  const assetId = storage.putAsset({ kind: "image", uri: "s3://bucket/img.png", blob: "data" });
  const asset = storage.getAsset(assetId);
  assert.equal(asset?.asset_id, assetId);

  const jobId = storage.createJob({ type: "turn", inputs: { asset_id: assetId } });
  storage.appendStepRun({ job_id: jobId, step: { step_id: "tts", started_ms: 0, ended_ms: 10, status: "ok" } });
  storage.attachOutput({ job_id: jobId, asset_id: assetId });

  const job = storage.getJob(jobId);
  assert.equal(job?.outputs.length, 1);
});

test("replayAsset creates a replay job", () => {
  const storage = new InMemoryStorageMetadata();
  const assetId = storage.putAsset({ kind: "video", uri: "s3://bucket/video.mp4", blob: "video" });
  const replayJobId = storage.replayAsset(assetId);
  const job = storage.getJob(replayJobId);
  assert.equal(job?.type, "replay");
});

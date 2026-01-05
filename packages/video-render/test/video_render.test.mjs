import test from "node:test";
import assert from "node:assert/strict";

import { streamNoopFrames, NoopRenderBackend } from "../src/video_render.mjs";

test("streamNoopFrames yields expected frame count", async () => {
  const frames = [];
  for await (const frame of streamNoopFrames({ anchor_image_ref: "img", duration_ms: 1000, config: { fps: 20 } })) {
    frames.push(frame);
  }
  assert.equal(frames.length, 20);
  assert.equal(frames[0].frame_index, 0);
});

test("NoopRenderBackend collects audio features and streams frames", async () => {
  const backend = new NoopRenderBackend();
  const session = backend.startSession({ anchor_image_ref: "img" });
  await backend.streamAudioFeatures({
    session,
    audio_features: [
      { t0_ms: 0, t1_ms: 500, mel: [], pitch_hz: 0, energy: 0 },
      { t0_ms: 500, t1_ms: 1000, mel: [], pitch_hz: 0, energy: 0 },
    ],
  });

  let count = 0;
  for await (const _frame of backend.streamFrames({ session })) count += 1;
  assert.ok(count > 0);
  assert.equal(session.audio_features.length, 2);
});

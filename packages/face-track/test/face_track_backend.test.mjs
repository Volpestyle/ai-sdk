import test from "node:test";
import assert from "node:assert/strict";

import { HeuristicFaceTrackBackend } from "../src/face_track_backend.mjs";

test("HeuristicFaceTrackBackend emits ROI from landmarks", () => {
  const backend = new HeuristicFaceTrackBackend({ normalized_size: [100, 100], smooth_alpha: 0 });
  const state = backend.init({ frame: {} });
  const frame = {
    frame_id: "f1",
    timestamp_ms: 1000,
    dimensions: [200, 200],
    faces: [
      {
        bbox_xywh: [10, 20, 50, 60],
        confidence: 0.9,
        mouth_landmarks: [
          [20, 40],
          [30, 40],
          [25, 50],
        ],
      },
    ],
  };
  const out = backend.update({ frame, state });
  assert.equal(out.result.faces.length, 1);
  assert.ok(out.result.faces[0].mouth_roi);
});

test("HeuristicFaceTrackBackend falls back to bbox ROI", () => {
  const backend = new HeuristicFaceTrackBackend({ normalized_size: [96, 96], smooth_alpha: 0 });
  const state = backend.init({ frame: {} });
  const frame = {
    frame_id: "f2",
    timestamp_ms: 2000,
    faces: [{ bbox_xywh: [5, 5, 40, 40], confidence: 0.8 }],
  };
  const out = backend.update({ frame, state });
  assert.ok(out.result.faces[0].face_roi);
});

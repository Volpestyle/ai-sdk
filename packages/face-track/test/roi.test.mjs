import test from "node:test";
import assert from "node:assert/strict";

import { roiFromLandmarks, smoothRoi } from "../src/roi.mjs";

test("roiFromLandmarks computes crop + affine into normalized space", () => {
  const landmarks = [
    { x: 50, y: 50 },
    { x: 60, y: 50 },
    { x: 60, y: 60 },
    { x: 50, y: 60 },
  ];
  const roi = roiFromLandmarks({ landmarks, indices: [0, 1, 2, 3], padding_ratio: 0, normalized_size: [100, 100] });

  assert.deepEqual(roi.crop_xywh, [50, 50, 10, 10]);
  assert.deepEqual(roi.normalized_size, [100, 100]);
  assert.deepEqual(roi.affine_2x3, [10, 0, -500, 0, 10, -500]);
});

test("smoothRoi exponentially smooths crop parameters", () => {
  const prev = roiFromLandmarks({
    landmarks: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
    indices: [0, 1, 2, 3],
    padding_ratio: 0,
    normalized_size: [100, 100],
  });

  const next = roiFromLandmarks({
    landmarks: [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 200 },
      { x: 100, y: 200 },
    ],
    indices: [0, 1, 2, 3],
    padding_ratio: 0,
    normalized_size: [100, 100],
  });

  const smoothed = smoothRoi(prev, next, 0.5);
  assert.deepEqual(smoothed.crop_xywh, [50, 50, 100, 100]);
});


import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_QUALITY_RULES,
  evaluateQuality,
  normalizeDims,
  selectPrimaryFace,
  ingestAsset,
} from "../src/ingestion_normalization.mjs";

test("evaluateQuality flags low resolution assets", () => {
  const report = evaluateQuality({
    asset: { uri: "file://demo.png", width: 256, height: 256 },
    faces: [{ confidence: 0.9 }],
    rules: DEFAULT_QUALITY_RULES,
  });
  assert.equal(report.passed, false);
  assert.ok(report.failures.includes("resolution_low"));
});

test("selectPrimaryFace prefers higher confidence then area", () => {
  const faceA = { confidence: 0.5, bbox_xywh: [0, 0, 200, 200] };
  const faceB = { confidence: 0.9, bbox_xywh: [0, 0, 50, 50] };
  assert.equal(selectPrimaryFace([faceA, faceB]), faceB);

  const faceC = { confidence: 0.8, bbox_xywh: [0, 0, 10, 10] };
  const faceD = { confidence: 0.8, bbox_xywh: [0, 0, 20, 20] };
  assert.equal(selectPrimaryFace([faceC, faceD]), faceD);
});

test("normalizeDims scales by short side", () => {
  const dims = normalizeDims({ width: 2000, height: 1000, target_short_side: 500 });
  assert.deepEqual(dims, [1000, 500]);
});

test("ingestAsset sets normalized image ref by default", () => {
  const out = ingestAsset({
    asset: { uri: "file://portrait.png", width: 1024, height: 1024, mime_type: "image/png" },
    faces: [{ confidence: 0.9 }],
  });
  assert.ok(out.normalized_image_ref);
  assert.equal(out.normalized_video_ref, undefined);
});

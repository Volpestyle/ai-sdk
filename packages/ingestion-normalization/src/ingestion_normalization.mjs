/**
 * ingestion-normalization -- reference implementation
 *
 * Pipeline helpers based on:
 * `packages/ingestion-normalization/product_spec.md`
 * `packages/ingestion-normalization/tech_spec.md`
 */

import { randomUUID } from "node:crypto";

export const DEFAULT_QUALITY_RULES = Object.freeze({
  min_width: 512,
  min_height: 512,
  min_faces: 1,
  max_faces: 1,
  max_blur_score: 0.55,
  min_brightness: 0.15,
  max_brightness: 0.9,
  max_occlusion_score: 0.4,
});

/**
 * @typedef {Object} RawAsset
 * @property {string=} asset_id
 * @property {string} uri
 * @property {string=} kind "image" | "video"
 * @property {string=} mime_type
 * @property {number=} width
 * @property {number=} height
 * @property {number=} duration_ms
 * @property {number=} frame_count
 * @property {Record<string, any>=} metadata
 */

/**
 * @typedef {Object} FaceObservation
 * @property {string=} track_id
 * @property {[number, number, number, number]=} bbox_xywh
 * @property {number=} confidence
 * @property {any=} landmarks
 * @property {string[]=} occlusion_flags
 */

/**
 * @typedef {Object} QualitySignals
 * @property {number=} blur_score 0 (sharp) -> 1 (blur)
 * @property {number=} brightness 0 (dark) -> 1 (bright)
 * @property {number=} occlusion_score 0 (clear) -> 1 (occluded)
 */

/**
 * @typedef {Object} QualityReport
 * @property {boolean} passed
 * @property {string[]} failures
 * @property {string[]} warnings
 * @property {{
 *  width?: number,
 *  height?: number,
 *  face_count: number,
 *  blur_score?: number,
 *  brightness?: number,
 *  occlusion_score?: number
 * }} metrics
 */

/**
 * @typedef {Object} Provenance
 * @property {boolean} attested
 * @property {string=} attested_by
 * @property {number} attested_ms
 */

/**
 * @typedef {Object} IngestedAsset
 * @property {string} ingested_id
 * @property {string} raw_asset_ref
 * @property {string=} normalized_image_ref
 * @property {string=} normalized_video_ref
 * @property {[number, number]=} normalized_dims
 * @property {FaceObservation=} primary_face
 * @property {string=} alpha_ref
 * @property {string=} segmentation_ref
 * @property {Record<string, any>=} embeddings
 * @property {QualityReport} quality_report
 * @property {Provenance} provenance
 */

/**
 * @param {[number, number, number, number]} bbox
 * @returns {number}
 */
function bboxArea(bbox) {
  if (!bbox) return 0;
  return Math.max(0, bbox[2] ?? 0) * Math.max(0, bbox[3] ?? 0);
}

/**
 * @param {FaceObservation[]} faces
 * @returns {FaceObservation | null}
 */
export function selectPrimaryFace(faces) {
  if (!faces?.length) return null;
  const sorted = [...faces].sort((a, b) => {
    const confA = a.confidence ?? 0;
    const confB = b.confidence ?? 0;
    if (confA !== confB) return confB - confA;
    return bboxArea(b.bbox_xywh) - bboxArea(a.bbox_xywh);
  });
  return sorted[0] ?? null;
}

/**
 * @param {{ width?: number, height?: number, target_short_side?: number }} args
 * @returns {[number, number] | null}
 */
export function normalizeDims(args) {
  const width = args.width ?? null;
  const height = args.height ?? null;
  if (!width || !height) return null;
  const shortSide = Math.min(width, height);
  const targetShort = args.target_short_side ?? 1024;
  if (shortSide <= 0) return [width, height];
  const scale = targetShort / shortSide;
  return [Math.round(width * scale), Math.round(height * scale)];
}

/**
 * @param {{
 *  asset: RawAsset,
 *  faces?: FaceObservation[],
 *  signals?: QualitySignals,
 *  rules?: typeof DEFAULT_QUALITY_RULES
 * }} args
 * @returns {QualityReport}
 */
export function evaluateQuality(args) {
  const rules = { ...DEFAULT_QUALITY_RULES, ...(args.rules ?? {}) };
  const faces = args.faces ?? [];
  const width = args.asset.width;
  const height = args.asset.height;
  const signals = args.signals ?? {};

  /** @type {string[]} */
  const failures = [];
  /** @type {string[]} */
  const warnings = [];

  if (typeof width === "number" && typeof height === "number") {
    if (width < rules.min_width || height < rules.min_height) failures.push("resolution_low");
  } else {
    warnings.push("resolution_unknown");
  }

  const faceCount = faces.length;
  if (typeof rules.min_faces === "number" && faceCount < rules.min_faces) failures.push("face_count_low");
  if (typeof rules.max_faces === "number" && faceCount > rules.max_faces) failures.push("face_count_high");

  if (typeof signals.blur_score === "number" && signals.blur_score > rules.max_blur_score) failures.push("blur_high");
  if (typeof signals.brightness === "number") {
    if (signals.brightness < rules.min_brightness || signals.brightness > rules.max_brightness) {
      failures.push("brightness_out_of_range");
    }
  }
  if (typeof signals.occlusion_score === "number" && signals.occlusion_score > rules.max_occlusion_score) {
    failures.push("occlusion_high");
  }

  return {
    passed: failures.length === 0,
    failures,
    warnings,
    metrics: {
      width,
      height,
      face_count: faceCount,
      blur_score: signals.blur_score,
      brightness: signals.brightness,
      occlusion_score: signals.occlusion_score,
    },
  };
}

/**
 * @param {{ asset: RawAsset }} args
 * @returns {boolean}
 */
function isVideoAsset(args) {
  if (args.asset.kind) return args.asset.kind === "video";
  return Boolean(args.asset.mime_type?.startsWith("video/"));
}

/**
 * @param {{ asset: RawAsset, normalized_ref?: string }} args
 * @returns {{ key: "normalized_image_ref" | "normalized_video_ref", ref: string | null }}
 */
function resolveNormalizedRef(args) {
  const rawId = args.asset.asset_id ?? args.asset.uri ?? "asset";
  const ref = args.normalized_ref ?? `normalized://${rawId}`;
  return { key: isVideoAsset({ asset: args.asset }) ? "normalized_video_ref" : "normalized_image_ref", ref };
}

/**
 * @param {{
 *  asset: RawAsset,
 *  faces?: FaceObservation[],
 *  signals?: QualitySignals,
 *  rules?: typeof DEFAULT_QUALITY_RULES,
 *  normalized_ref?: string,
 *  alpha_ref?: string,
 *  segmentation_ref?: string,
 *  embeddings?: Record<string, any>,
 *  provenance?: Partial<Provenance>,
 *  now_ms?: number
 * }} args
 * @returns {IngestedAsset}
 */
export function ingestAsset(args) {
  const nowMs = args.now_ms ?? Date.now();
  const normalizedDims = normalizeDims({
    width: args.asset.width,
    height: args.asset.height,
    target_short_side: 1024,
  });
  const { key, ref } = resolveNormalizedRef({ asset: args.asset, normalized_ref: args.normalized_ref });
  const quality = evaluateQuality({
    asset: args.asset,
    faces: args.faces,
    signals: args.signals,
    rules: args.rules,
  });

  const provenance = {
    attested: Boolean(args.provenance?.attested),
    attested_by: args.provenance?.attested_by,
    attested_ms: args.provenance?.attested_ms ?? nowMs,
  };

  /** @type {IngestedAsset} */
  const out = {
    ingested_id: `ingest_${randomUUID()}`,
    raw_asset_ref: args.asset.uri,
    normalized_dims: normalizedDims ?? undefined,
    primary_face: selectPrimaryFace(args.faces ?? []) ?? undefined,
    alpha_ref: args.alpha_ref,
    segmentation_ref: args.segmentation_ref,
    embeddings: args.embeddings ?? undefined,
    quality_report: quality,
    provenance,
  };
  out[key] = ref ?? undefined;
  return out;
}

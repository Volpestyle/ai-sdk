/**
 * face-track — backend interface skeleton (reference)
 *
 * This is a minimal JS representation of the `FaceTrackBackend` interface described in:
 * `packages/face-track/tech_spec.md`
 */

import { roiFromLandmarks, smoothRoi } from "./roi.mjs";

/**
 * @typedef {Object} ROITransform
 * @property {[number, number, number, number]} crop_xywh pixels
 * @property {[number, number, number, number, number, number]=} affine_2x3 row-major 2x3
 * @property {[number, number]=} normalized_size
 */

/**
 * @typedef {Object} FaceObservation
 * @property {string} track_id
 * @property {[number, number, number, number]} bbox_xywh
 * @property {[number, number, number]=} pose_yaw_pitch_roll
 * @property {number} confidence
 * @property {ROITransform=} mouth_roi
 * @property {ROITransform=} face_roi
 * @property {string[]=} occlusion_flags
 */

/**
 * @typedef {Object} FaceTrackResult
 * @property {string} frame_id
 * @property {number} timestamp_ms
 * @property {FaceObservation[]} faces
 */

/**
 * @typedef {Object} FaceTrackHint
 * @property {string=} session_id
 * @property {string=} camera_mode
 * @property {[number, number, number, number]=} expected_face_bbox_xywh
 */

/**
 * @typedef {Object} FaceTrackBackend
 * @property {(args: { frame: any, hint?: FaceTrackHint }) => any} init
 * @property {(args: { frame: any, state: any, hint?: FaceTrackHint }) => ({ result: FaceTrackResult, state: any })} update
 */

const DEFAULT_MOUTH_INDICES = Object.freeze(Array.from({ length: 20 }, (_, i) => 48 + i));
const DEFAULT_FACE_INDICES = Object.freeze(Array.from({ length: 17 }, (_, i) => i));

/**
 * @param {[number, number, number, number]} bbox
 * @returns {number}
 */
function bboxArea(bbox) {
  if (!bbox) return 0;
  return Math.max(0, bbox[2] ?? 0) * Math.max(0, bbox[3] ?? 0);
}

/**
 * @param {any[]} faces
 * @returns {any | null}
 */
function pickPrimaryFace(faces) {
  if (!faces?.length) return null;
  const sorted = [...faces].sort((a, b) => {
    const confA = a.confidence ?? 0;
    const confB = b.confidence ?? 0;
    if (confA !== confB) return confB - confA;
    return bboxArea(b.bbox_xywh ?? b.bbox) - bboxArea(a.bbox_xywh ?? a.bbox);
  });
  return sorted[0] ?? null;
}

/**
 * @param {any} point
 * @returns {{ x: number, y: number }}
 */
function toPoint(point) {
  if (!point) return { x: 0, y: 0 };
  if (Array.isArray(point)) return { x: point[0], y: point[1] };
  return { x: point.x ?? 0, y: point.y ?? 0 };
}

/**
 * @param {any[]} points
 * @returns {{ x: number, y: number }[]}
 */
function normalizePoints(points) {
  return (points ?? []).map((p) => toPoint(p));
}

/**
 * @param {{ bbox: [number, number, number, number], normalized_size?: [number, number] }} args
 * @returns {ROITransform}
 */
function roiFromBbox(args) {
  const [x, y, w, h] = args.bbox;
  const normalizedSize = args.normalized_size ?? [96, 96];
  const [W, H] = normalizedSize;
  const scaleX = W / Math.max(1e-6, w);
  const scaleY = H / Math.max(1e-6, h);
  /** @type {[number, number, number, number, number, number]} */
  const affine = [scaleX, 0, -x * scaleX, 0, scaleY, -y * scaleY];
  return { crop_xywh: [x, y, w, h], affine_2x3: affine, normalized_size: normalizedSize };
}

/**
 * @param {{ landmarks?: any[], indices: number[], normalized_size?: [number, number], clamp_to?: { width: number, height: number } }} args
 * @returns {ROITransform | null}
 */
function roiFromPoints(args) {
  const points = normalizePoints(args.landmarks);
  if (!points.length) return null;
  return roiFromLandmarks({
    landmarks: points,
    indices: args.indices,
    normalized_size: args.normalized_size,
    clamp_to: args.clamp_to,
  });
}

/**
 * @param {any} face
 * @param {{ mouth_indices?: number[], face_indices?: number[] }} opts
 */
function extractLandmarks(face, opts) {
  if (!face) return { mouth: null, face: null };
  if (face.mouth_landmarks || face.face_landmarks) {
    return {
      mouth: face.mouth_landmarks ? normalizePoints(face.mouth_landmarks) : null,
      face: face.face_landmarks ? normalizePoints(face.face_landmarks) : null,
    };
  }
  if (face.landmarks?.mouth || face.landmarks?.face) {
    return {
      mouth: face.landmarks.mouth ? normalizePoints(face.landmarks.mouth) : null,
      face: face.landmarks.face ? normalizePoints(face.landmarks.face) : null,
    };
  }
  if (Array.isArray(face.landmarks)) {
    const points = normalizePoints(face.landmarks);
    const mouthIdx = opts.mouth_indices ?? DEFAULT_MOUTH_INDICES;
    const faceIdx = opts.face_indices ?? DEFAULT_FACE_INDICES;
    return {
      mouth: mouthIdx.map((i) => points[i]).filter(Boolean),
      face: faceIdx.map((i) => points[i]).filter(Boolean),
    };
  }
  return { mouth: null, face: null };
}

/**
 * A deterministic backend that never detects faces.
 * Useful for wiring and unit tests.
 *
 * @implements {FaceTrackBackend}
 */
export class NoopFaceTrackBackend {
  /** @param {{ frame: any, hint?: FaceTrackHint }} _args */
  init(_args) {
    return {};
  }

  /** @param {{ frame: any, state: any, hint?: FaceTrackHint }} args */
  update(args) {
    const nowMs = Date.now();
    /** @type {FaceTrackResult} */
    const result = { frame_id: String(nowMs), timestamp_ms: nowMs, faces: [] };
    return { result, state: args.state };
  }
}

/**
 * Heuristic backend that converts supplied detections into FaceTrackResult.
 * It expects `frame.faces` to include bbox + optional landmarks.
 */
export class HeuristicFaceTrackBackend {
  /**
   * @param {{
   *  mouth_indices?: number[],
   *  face_indices?: number[],
   *  normalized_size?: [number, number],
   *  smooth_alpha?: number
   * }=} opts
   */
  constructor(opts = {}) {
    this.mouth_indices = opts.mouth_indices ?? DEFAULT_MOUTH_INDICES;
    this.face_indices = opts.face_indices ?? DEFAULT_FACE_INDICES;
    this.normalized_size = opts.normalized_size ?? [96, 96];
    this.smooth_alpha = opts.smooth_alpha ?? 0.8;
  }

  /** @param {{ frame: any, hint?: FaceTrackHint }} _args */
  init(_args) {
    return { track_id: `track_${Date.now()}` };
  }

  /** @param {{ frame: any, state: any, hint?: FaceTrackHint }} args */
  update(args) {
    const frame = args.frame ?? {};
    const nowMs = frame.timestamp_ms ?? Date.now();
    const faces = Array.isArray(frame.faces) ? frame.faces : [];
    const primary = pickPrimaryFace(faces);
    if (!primary) {
      /** @type {FaceTrackResult} */
      const result = { frame_id: frame.frame_id ?? String(nowMs), timestamp_ms: nowMs, faces: [] };
      return { result, state: args.state };
    }

    const landmarks = extractLandmarks(primary, {
      mouth_indices: this.mouth_indices,
      face_indices: this.face_indices,
    });
    const clampTo = frame.dimensions ? { width: frame.dimensions[0], height: frame.dimensions[1] } : undefined;

    let mouthRoi = landmarks.mouth
      ? roiFromPoints({
          landmarks: landmarks.mouth,
          indices: landmarks.mouth.map((_, i) => i),
          normalized_size: this.normalized_size,
          clamp_to: clampTo,
        })
      : null;

    let faceRoi = landmarks.face
      ? roiFromPoints({
          landmarks: landmarks.face,
          indices: landmarks.face.map((_, i) => i),
          normalized_size: this.normalized_size,
          clamp_to: clampTo,
        })
      : null;

    if (!mouthRoi && primary.bbox_xywh) {
      mouthRoi = roiFromBbox({ bbox: primary.bbox_xywh, normalized_size: this.normalized_size });
    }
    if (!faceRoi && primary.bbox_xywh) {
      faceRoi = roiFromBbox({ bbox: primary.bbox_xywh, normalized_size: this.normalized_size });
    }

    if (args.state?.prev_mouth_roi && mouthRoi) {
      mouthRoi = smoothRoi(args.state.prev_mouth_roi, mouthRoi, this.smooth_alpha);
    }
    if (args.state?.prev_face_roi && faceRoi) {
      faceRoi = smoothRoi(args.state.prev_face_roi, faceRoi, this.smooth_alpha);
    }

    /** @type {FaceObservation} */
    const obs = {
      track_id: primary.track_id ?? args.state?.track_id ?? `track_${nowMs}`,
      bbox_xywh: primary.bbox_xywh ?? primary.bbox,
      pose_yaw_pitch_roll: primary.pose_yaw_pitch_roll ?? primary.pose,
      confidence: primary.confidence ?? 0.5,
      mouth_roi: mouthRoi ?? undefined,
      face_roi: faceRoi ?? undefined,
      occlusion_flags: primary.occlusion_flags ?? [],
    };

    /** @type {FaceTrackResult} */
    const result = {
      frame_id: frame.frame_id ?? String(nowMs),
      timestamp_ms: nowMs,
      faces: [obs],
    };

    const state = {
      track_id: obs.track_id,
      prev_mouth_roi: mouthRoi ?? args.state?.prev_mouth_roi,
      prev_face_roi: faceRoi ?? args.state?.prev_face_roi,
    };

    return { result, state };
  }
}

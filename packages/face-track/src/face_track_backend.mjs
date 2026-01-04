/**
 * face-track — backend interface skeleton (reference)
 *
 * This is a minimal JS representation of the `FaceTrackBackend` interface described in:
 * `packages/face-track/tech_spec.md`
 */

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

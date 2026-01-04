# face-track — Product Spec

## Summary
`face-track` provides stable face detection, tracking, landmarks, and **mouth ROI stabilization**
for downstream components:

- `sync-scorer` (lip-sync confidence)
- `mouth-corrector` (MuseTalk/Wav2Lip) if enabled
- `drift-monitor` (pose stability, head motion, face box jitter)
- optional: avatar "acting" controls that depend on head pose

It is required for robust lip sync correction because correction quality is extremely sensitive to ROI drift.

## Goals
- Realtime face tracking for streaming video (24–30fps) with low CPU/GPU overhead.
- Stable per-frame (or per-block) landmarks including mouth contour.
- Provide a canonical ROI transform for:
  - full face crop
  - mouth crop
- Handle partial occlusion (mirror selfie phone, hands) gracefully.

## Non-goals
- Identity verification or biometric auth.
- Multi-person tracking for complex scenes (but basic multi-face detection is supported for policy checks).

## Inputs
- Video frames (RGB or YUV)
- Optional: previous tracking state (for temporal smoothing)
- Optional: expected face region hint (from camera mode constraints)

## Outputs
- `FaceTrackResult` per frame/block:
  - face bbox (smoothed)
  - landmarks (smoothed)
  - head pose estimate (yaw/pitch/roll)
  - `MouthROI` transform (crop + stabilization)
  - confidence + occlusion flags

## Default model backends
Pick one CPU-friendly default and keep others as plugins:

- **Default (CPU, fast)**: MediaPipe face detection + face landmarks (FaceMesh/FaceLandmarker)
- **Alternate (GPU/CPU)**: InsightFace RetinaFace for detection + lightweight landmarks model
- **Fallback**: OpenCV DNN face detector (lowest quality)

> Licensing note: treat model weights as pluggable and store per-weight license metadata in the SDK registry.

## Success metrics
- mouth ROI jitter (pixel variance after stabilization) below threshold
- tracking continuity across blocks (few ID switches)
- robust under selfie framing changes within allowed mode constraints

## Failure modes
- rapid head turns causing landmark jumps
- occlusion by phone/hand in mirror mode
- low light causing false negatives

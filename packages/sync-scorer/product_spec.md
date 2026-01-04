# sync-scorer — Product Spec

## Summary
`sync-scorer` computes a **lip-sync confidence score** for a video/audio segment and estimates
the best audio-to-video offset.

It enables:
- objective monitoring across heterogeneous render backends
- automated triggers for mouth correction / rerender / degrade
- regression testing in CI

## Goals
- Provide a backend-agnostic score in [0,1] (or z-score) per block/window.
- Estimate A/V offset in milliseconds (positive means audio leads, configurable).
- Run in realtime for local pipelines (per block) and periodically for provider pipelines (sampled).

## Non-goals
- Not a human-perception perfect metric; it is a practical signal for control loops.
- Not a full quality model for video realism (handled elsewhere).

## Inputs
- `audio_pcm`: PCM at known sample rate (ideally 16k or 48k)
- `video_frames`: frames for same time span
- `mouth_roi` or `face_roi` (from `face-track`)
- optional: `viseme_timeline` (from `viseme-aligner`) for auxiliary checks

## Outputs
- `LipSyncScore`:
  - `score` (float)
  - `offset_ms` (estimated best alignment)
  - `confidence`
  - debug fields (correlation curve, window ids)

## Default model backends
- **Default**: SyncNet-style audio-video embedding similarity over sliding offsets.
- **Fallback (no ML)**: heuristic score from mouth openness vs audio energy correlation (lower quality).

## Success metrics
- score correlates with human judgment sufficiently to catch failures
- stable across lighting/camera modes within allowed constraints
- low false positives that cause unnecessary rerenders

## Failure modes
- extreme head rotation (mouth ROI unreliable)
- occlusion (hand/phone) reduces confidence (should downweight)
- silent segments (score becomes undefined; should treat as “not applicable”)

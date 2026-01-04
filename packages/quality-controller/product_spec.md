# quality-controller — Product Spec

## Summary
`quality-controller` is a deterministic policy engine that decides **what to do** when
quality or latency degrades during generation or playback.

It consumes signals from:
- `drift-monitor` (identity/style drift, flicker)
- `sync-scorer` (lip-sync score, offset)
- `av-sync` (playback A/V offset, late frames)
- system telemetry (GPU load, queue depth)

And produces actions tailored to the active backend's capabilities.

## Goals
- Provide a single policy layer for both:
  - local render pipelines (block rerendering, mouth correction, anchor resets)
  - provider avatar bridges (restart, param update, failover)
- Keep user experience smooth:
  - avoid repeated obvious resets
  - prefer small corrections before big resets
- Integrate with turn budget:
  - if you’re near the 30s cap, avoid expensive fixes; shorten instead.

## Non-goals
- Not an ML-based “quality judge”; it is a control policy.
- Not responsible for moderation decisions.

## Inputs (signals)
- `LipSyncSignal` (score, offset, confidence, occlusion)
- `DriftSignal` (identity_score, bg_score, flicker, pose_jitter)
- `PlaybackHealth` (av_offset_ms, late_frames, jitter_buffer_ms)
- `SystemHealth` (gpu_util, queue_depth, render_fps)
- `BackendCapabilities` (what actions are possible)
- `TurnContext` (remaining_seconds, mode, persona policy)

## Outputs (actions)
- local actions:
  - rerender last block with stronger anchoring
  - run mouth corrector on last block
  - force sink refresh / anchor reset
  - reduce motion / reduce fps / reduce res
  - shorten remaining segments
- provider actions:
  - restart stream
  - switch provider tier
  - failover to another provider
  - fall back to offline clip generation (if acceptable)

## Success metrics
- sustained lip-sync failures are corrected within <= 1–2 seconds
- avoid oscillation (fix -> break -> fix) via hysteresis
- minimal user-noticeable resets

# Merge Notes: where these components plug in

This assumes your existing SDK has:

- `tts` service
- `audio-features` service
- `video-render` service (local or provider adapter)
- `drift-monitor` (identity/style + flicker + optionally lip sync)
- `encoder + webrtc` (for local) or provider WebRTC bridge

## 1) Add a unified capability handshake

Add a `BackendCapabilities` object to your video-render interface.

- Local backends typically support:
  - `supports_rerender_block = true`
  - `supports_mouth_corrector = true`
  - `supports_anchor_reset = true`
- Provider avatar bridges typically support:
  - `supports_rerender_block = false`
  - `supports_mouth_corrector = false` (you may still correct frames if you relay/encode yourself)
  - `supports_restart_stream = true`
  - `supports_param_update = provider-dependent`

See `packages/contracts/types.ts` and `packages/quality-controller/tech_spec.md`.

## 2) Insert face tracking early

Face/mouth ROI must be consistent for scoring/correction.

- If you generate frames locally:
  - Run `face-track` in the render worker after each block (or every N frames).
- If you relay provider video:
  - Run `face-track` on sampled frames.

Outputs go to:
- `sync-scorer`
- `drift-monitor` (pose + face box stability metrics)
- optional `mouth-corrector`

## 3) Add sync scoring in the per-block loop

After generating/receiving a block of frames and corresponding audio:

- `sync-scorer.score_block(audio_chunk, frames, roi)` -> score + offset estimate

Persist scores to telemetry so you can debug regressions.

## 4) Route decisions through quality-controller

When either drift or lip-sync degrades:

- `quality-controller.decide(signals, caps)` -> list of actions

Actions can include:
- local: rerender block with stronger anchor / run mouth corrector / reduce motion / lower fps
- provider: restart stream / switch provider tier / shorten turn / fall back to offline clip generation

## 5) Add av-sync at the encoding boundary

When you encode and send via WebRTC, timestamps and buffering policy are essential.

- audio PTS and video PTS must be monotonic and aligned to the same clock
- define a policy for late frames: drop vs repeat vs degrade fps

If you are bridging a provider WebRTC stream:
- still run A/V sync monitor to detect playback offsets and report them
- optionally re-time when re-encoding

## 6) Add an evaluation harness

Before shipping:
- run `eval-lipsync-benchmark` on a standardized test set
- compare against baseline metrics (mean score, p95 offset, fail rate)

This is the cheapest way to avoid "it worked yesterday" lip sync regressions.

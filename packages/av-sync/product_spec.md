# av-sync — Product Spec

## Summary
`av-sync` is the SDK component that ensures **audio and video stay aligned** end-to-end during realtime playback.

It covers two cases:
1) **Local render → encode → WebRTC** (you own timestamps/packets)
2) **Provider avatar WebRTC → bridge/relay** (you still measure and optionally re-time)

Lip-sync quality is perceived at playback; even perfect model generation looks wrong if the media clock is wrong.

## Goals
- Provide a single place to define:
  - timestamping rules (PTS)
  - buffering/jitter policy
  - late-frame policy (drop/repeat/degrade)
  - monitoring and alerts for A/V offset
- Work for both FT-Gen streaming turns and Personastu short loops (if exported with audio)

## Non-goals
- Not a full WebRTC stack implementation.
- Not an encoder; it sits between frame/audio producers and the transport.

## Inputs
- Video frames (raw or pre-encoded) with capture order
- Audio chunks (PCM/Opus) with sample counts
- Optional: provider stream timing metadata (when bridging)

## Outputs
- Monotonic, aligned PTS for audio + video packets
- Playback jitter policy configuration
- Telemetry:
  - estimated A/V offset
  - jitter buffer delay
  - late packet counts
  - dropped/repeated frames

## Key invariants
- PTS are monotonic.
- Audio is the master timeline (default) unless configured otherwise.
- A/V offset is bounded by policy, and violations trigger corrective actions.

## Backends supported
- `local_encode`: you generate frames and audio and send via WebRTC
- `provider_bridge`: you receive provider WebRTC and relay or re-encode

## Public API surface
- `AvSyncClock`: produces timestamps for audio/video
- `AvSyncPolicy`: configuration of buffering and late-frame handling
- `AvSyncMonitor`: computes observed A/V offset and emits alerts

## Success metrics
- p95 absolute A/V offset at client < 60ms (configurable)
- dropped frames rate below threshold under normal load
- monotonic timestamp violations = 0

## Failure modes
- Video stalls while audio continues (leads to “audio talking over frozen face”)
- Audio stalls while video continues (silent moving mouth)
- Network jitter causes bursts (buffering policy should smooth)
- Clock drift between bridge and local WebRTC session

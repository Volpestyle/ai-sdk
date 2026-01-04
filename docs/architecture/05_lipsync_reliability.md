# Lip Sync Reliability: Architecture Additions

Your existing FT-Gen / Personastu component model already covers the "happy path" (TTS -> audio features -> video render).
For production lip sync you need two extra layers:

1) **Playback synchronization**  
Even perfect model lip sync can look wrong if the user's device plays audio and video with offset or jitter.

2) **Quality measurement + correction**  
You need a consistent way to *measure* lip sync across heterogeneous backends and trigger corrective actions
that match the backend capabilities.

This section introduces 6 components:

- **av-sync**: playback timestamps + buffering policy + A/V sync monitor.
- **face-track**: stable face + mouth ROI extraction.
- **sync-scorer**: per-block lip-sync score + estimated A/V offset.
- **viseme-aligner**: optional explicit viseme timeline (for stronger control and easier correction).
- **quality-controller**: policy-driven corrective router across backends.
- **eval-lipsync-benchmark**: regression harness.

## Key design principle

Every backend declares a **capability profile** so the quality-controller can make safe choices.

Example:
- Local renderer: supports rerendering a block and applying a mouth-corrector.
- Provider WebRTC avatar: cannot rerender a block; can only restart the stream, change rendering params, or failover.

The same scoring + policy stack still applies.

## Integration points

- Conversation Orchestrator calls:
  - `viseme-aligner` (optional) to get viseme timeline
  - `sync-scorer` to score blocks
  - `quality-controller` to decide what to do when metrics degrade
- Video render worker uses:
  - `face-track` for ROI and pose (also used by drift monitor)
- Encoder/WebRTC uses:
  - `av-sync` for timestamps and buffering policy

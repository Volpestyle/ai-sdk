# FT-Gen integration notes

## Minimal service set
- Session Gateway (auth, signaling, sticky routing)
- Moderation Gateway (illegal-only baseline)
- Conversation Orchestrator (streaming)
- LLM Planner (TurnPlan)
- Streaming TTS
- Audio Feature Service
- Video Render Service (I2V backend)
- Face Track (in-worker or sidecar)
- Sync Scorer (lip-sync score + A/V offset)
- Quality Controller (policy router)
- Encoder + WebRTC publish (or integrated into render worker)
- A/V Sync Monitor (av-sync; typically inside encoder/WebRTC boundary)
- Viseme Aligner (optional)
- Drift Monitor (in-process or sidecar)
- Storage/Metadata (for logging, replay, analytics)

## Reusable SDK components involved
- persona-core, planning-control, orchestration-runtime, audio-speech, video-render,
  identity-drift, face-track, viseme-aligner, sync-scorer, quality-controller, av-sync,
  moderation-policy, storage-metadata, delivery-playback, observability-cost, eval-lipsync-benchmark.

## Turn loop
See `diagrams/ftgen_end_to_end.mmd`.

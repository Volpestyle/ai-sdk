# FT-Gen

## Summary
Turn-based streaming video chat with a persona. Uses shared persona creation tools; outputs short video replies via WebRTC.

## Core flow
user message -> moderation-policy -> planning-control (TurnPlan) -> orchestration-runtime -> audio-speech (TTS) -> video-render (streaming I2V) -> delivery-playback (WebRTC) -> storage-metadata.

## Shared SDK components used
persona-core, scene-system (fixed stage), planning-control, orchestration-runtime, audio-speech, video-render, identity-drift, moderation-policy, storage-metadata, delivery-playback, observability-cost.

## App-specific layers
Session gateway/WebRTC signaling, conversation memory, turn-length policy, timeline scrub UI.

## Links
- [sdk](../../docs/sdk.md)
- [components](../../docs/components.md)
- [FT-Gen integration notes](integration/integration_notes.md)
- [FT-Gen end-to-end diagram](integration/diagrams/ftgen_end_to_end.png)
- [FT-Gen Product Spec](https://github.com/Volpestyle/ft-gen/blob/main/docs/product_spec.md)
- [FT-Gen Tech Spec](https://github.com/Volpestyle/ft-gen/blob/main/docs/tech_spec.md)
- [FT-Gen Generation Pipeline](https://github.com/Volpestyle/ft-gen/blob/main/docs/gen_pipeline_spec.md)

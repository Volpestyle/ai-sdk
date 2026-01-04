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
- [[sdk]]
- [[components]]
- [[ai-sdk/apps/ft-gen/integration/integration_notes|FT-Gen integration notes]]
- [[ai-sdk/apps/ft-gen/integration/diagrams/ftgen_end_to_end|FT-Gen end-to-end diagram]]
- [[ft-gen/docs/product_spec|FT-Gen Product Spec]]
- [[ft-gen/docs/tech_spec|FT-Gen Tech Spec]]
- [[ft-gen/docs/gen_pipeline_spec|FT-Gen Generation Pipeline]]

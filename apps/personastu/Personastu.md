# Personastu

## Summary
Maps a created persona onto real images of you, with optional background replacement using described or parameterized scenes.

## Core flow
capture/upload -> moderation-policy + ingestion-normalization -> planning-control (ScenePlan/ShotPlan) -> orchestration-runtime -> generation/compositing -> postprocess-compositing -> storage-metadata -> delivery-playback.

## Shared SDK components used
persona-core, scene-system, ingestion-normalization, planning-control, orchestration-runtime, postprocess-compositing, moderation-policy, storage-metadata, delivery-playback, observability-cost.

## App-specific layers
Capture/editor UI, batch shots, scheduling/publishing.

## Links
- [sdk](../../docs/sdk.md)
- [components](../../docs/components.md)
- [Personastu integration notes](integration/integration_notes.md)
- [Personastu end-to-end diagram](integration/diagrams/personastu_end_to_end.png)

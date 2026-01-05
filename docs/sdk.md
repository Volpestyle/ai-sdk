# SDK

## Docs Index
- [SDK Index](sdk.md)
- [Components Overview](components.md)
- [Component Specs README](../README.md)
- [Component Specs Overview](architecture/00_overview.md)
- [Component Index](architecture/01_component_index.md)
- [Model / Provider Matrix](architecture/02_model_matrix.md)
- [Reference Architecture](architecture/03_reference_architecture.md)
- [Security and Policy Notes](architecture/04_security_and_policy.md)
- [Lip-sync reliability additions](architecture/05_lipsync_reliability.md)
- [Lip-sync merge notes](architecture/06_lipsync_merge_notes.md)
- [Backend capability profiles](architecture/07_backend_capabilities.md)
- [FT-Gen](../apps/ft-gen/FT-Gen.md)
- [Personastu](../apps/personastu/Personastu.md)

## Purpose
A family of persona-based apps that share the same persona creation tools and core platform services. The canonical component specs live under `ai-sdk/packages`, and apps are primarily configuration + UI layers over those shared primitives.

## Apps
- [FT-Gen](../apps/ft-gen/FT-Gen.md): turn-based streaming video chat with a persona.
- [Personastu](../apps/personastu/Personastu.md): persona-to-photo mapping workflow with batch outputs and publishing.

## Shared toolkit (canonical)
- Contracts: PersonaPack, ScenePack, TurnPlan/ScenePlan, GenJob, MediaAsset (see component specs docs and schemas).
- Core components: persona-core, scene-system, ingestion-normalization, planning-control, orchestration-runtime, audio-speech, video-render, face-track, viseme-aligner, sync-scorer, quality-controller, av-sync, identity-drift, postprocess-compositing, moderation-policy, storage-metadata, delivery-playback, observability-cost, eval-lipsync-benchmark.
- Routing: `ai-kit` for provider-agnostic LLM/image calls; video adapters live in the `video-render` layer.

## References
- [FT-Gen Product Spec](https://github.com/Volpestyle/ft-gen/blob/main/docs/product_spec.md)
- [FT-Gen Tech Spec](https://github.com/Volpestyle/ft-gen/blob/main/docs/tech_spec.md)
- [FT-Gen Generation Pipeline](https://github.com/Volpestyle/ft-gen/blob/main/docs/gen_pipeline_spec.md)
- [FT-Gen SDK Components (project docs)](https://github.com/Volpestyle/ft-gen/blob/main/docs/sdk_components.md)

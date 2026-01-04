# SDK

## Docs Index
- [[sdk|SDK Index]]
- [[components|Components Overview]]
- [[README|Component Specs README]]
- [[ai-sdk/docs/architecture/00_overview|Component Specs Overview]]
- [[ai-sdk/docs/architecture/01_component_index|Component Index]]
- [[ai-sdk/docs/architecture/02_model_matrix|Model / Provider Matrix]]
- [[ai-sdk/docs/architecture/03_reference_architecture|Reference Architecture]]
- [[ai-sdk/docs/architecture/04_security_and_policy|Security and Policy Notes]]
- [[ai-sdk/docs/architecture/05_lipsync_reliability|Lip-sync reliability additions]]
- [[ai-sdk/docs/architecture/06_lipsync_merge_notes|Lip-sync merge notes]]
- [[ai-sdk/docs/architecture/07_backend_capabilities|Backend capability profiles]]
- [[FT-Gen|FT-Gen]]
- [[Personastu|Personastu]]

## Purpose
A family of persona-based apps that share the same persona creation tools and core platform services. The canonical component specs live under `ai-sdk/packages`, and apps are primarily configuration + UI layers over those shared primitives.

## Apps
- [[FT-Gen]]: turn-based streaming video chat with a persona.
- [[Personastu]]: persona-to-photo mapping workflow with batch outputs and publishing.

## Shared toolkit (canonical)
- Contracts: PersonaPack, ScenePack, TurnPlan/ScenePlan, GenJob, MediaAsset (see component specs docs and schemas).
- Core components: persona-core, scene-system, ingestion-normalization, planning-control, orchestration-runtime, audio-speech, video-render, face-track, viseme-aligner, sync-scorer, quality-controller, av-sync, identity-drift, postprocess-compositing, moderation-policy, storage-metadata, delivery-playback, observability-cost, eval-lipsync-benchmark.
- Routing: `ai-kit` for provider-agnostic LLM/image calls; video adapters live in the `video-render` layer.

## References
- [[ft-gen/docs/product_spec|FT-Gen Product Spec]]
- [[ft-gen/docs/tech_spec|FT-Gen Tech Spec]]
- [[ft-gen/docs/gen_pipeline_spec|FT-Gen Generation Pipeline]]
- [[ft-gen/docs/sdk_components|FT-Gen SDK Components (project docs)]]

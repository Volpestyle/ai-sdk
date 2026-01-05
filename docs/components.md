# Components

## Docs Index
- [SDK Index](sdk.md)
- [Component Specs Overview](architecture/00_overview.md)
- [Component Index](architecture/01_component_index.md)
- [Model / Provider Matrix](architecture/02_model_matrix.md)
- [Reference Architecture](architecture/03_reference_architecture.md)
- [Security and Policy Notes](architecture/04_security_and_policy.md)
- [Lip-sync reliability additions](architecture/05_lipsync_reliability.md)
- [Lip-sync merge notes](architecture/06_lipsync_merge_notes.md)
- [Backend capability profiles](architecture/07_backend_capabilities.md)

## Canonical packages (grouped)
Each component ships as a library package and/or service. Detailed specs live under `ai-sdk/packages`.

### Foundation
- contracts: [service contracts](../packages/contracts/service_contracts.md)
- persona-core: [product spec](../packages/persona-core/product_spec.md) / [tech spec](../packages/persona-core/tech_spec.md)
- scene-system: [product spec](../packages/scene-system/product_spec.md) / [tech spec](../packages/scene-system/tech_spec.md)

### Ingest + Perception
- ingestion-normalization: [product spec](../packages/ingestion-normalization/product_spec.md) / [tech spec](../packages/ingestion-normalization/tech_spec.md)
- face-track: [product spec](../packages/face-track/product_spec.md) / [tech spec](../packages/face-track/tech_spec.md)

### Planning + Runtime
- planning-control: [product spec](../packages/planning-control/product_spec.md) / [tech spec](../packages/planning-control/tech_spec.md)
- orchestration-runtime: [product spec](../packages/orchestration-runtime/product_spec.md) / [tech spec](../packages/orchestration-runtime/tech_spec.md)

### Media Generation + Delivery
- audio-speech: [product spec](../packages/audio-speech/product_spec.md) / [tech spec](../packages/audio-speech/tech_spec.md)
- video-render: [product spec](../packages/video-render/product_spec.md) / [tech spec](../packages/video-render/tech_spec.md)
- postprocess-compositing: [product spec](../packages/postprocess-compositing/product_spec.md) / [tech spec](../packages/postprocess-compositing/tech_spec.md)
- delivery-playback: [product spec](../packages/delivery-playback/product_spec.md) / [tech spec](../packages/delivery-playback/tech_spec.md)
- av-sync: [product spec](../packages/av-sync/product_spec.md) / [tech spec](../packages/av-sync/tech_spec.md)

### Quality + Evaluation
- viseme-aligner: [product spec](../packages/viseme-aligner/product_spec.md) / [tech spec](../packages/viseme-aligner/tech_spec.md)
- sync-scorer: [product spec](../packages/sync-scorer/product_spec.md) / [tech spec](../packages/sync-scorer/tech_spec.md)
- quality-controller: [product spec](../packages/quality-controller/product_spec.md) / [tech spec](../packages/quality-controller/tech_spec.md)
- identity-drift: [product spec](../packages/identity-drift/product_spec.md) / [tech spec](../packages/identity-drift/tech_spec.md)
- eval-lipsync-benchmark: [product spec](../packages/eval-lipsync-benchmark/product_spec.md) / [tech spec](../packages/eval-lipsync-benchmark/tech_spec.md)

### Platform
- storage-metadata: [product spec](../packages/storage-metadata/product_spec.md) / [tech spec](../packages/storage-metadata/tech_spec.md)
- observability-cost: [product spec](../packages/observability-cost/product_spec.md) / [tech spec](../packages/observability-cost/tech_spec.md)

### Policy
- moderation-policy: [product spec](../packages/moderation-policy/product_spec.md) / [tech spec](../packages/moderation-policy/tech_spec.md)

## Suggested service boundaries
This is a deployment-oriented view (not strict architecture). Most packages can run as an in-process library, but some are typically isolated as services for GPU/latency/throughput reasons.

### In-process (library-first)
- `contracts` (shared types + gRPC proto)
- `persona-core`, `scene-system`, `planning-control`, `moderation-policy`

### Service recommended (GPU/streaming isolation)
- `video-render`, `postprocess-compositing`
- `ingestion-normalization`, `face-track`
- `audio-speech`, `delivery-playback`, `av-sync`
- `viseme-aligner`, `sync-scorer`

### Hybrid (library + service backends)
- `orchestration-runtime` (control plane + worker services)
- `quality-controller` (policy engine can be centralized or embedded)
- `identity-drift` (monitors + corrective jobs)
- `storage-metadata` (SDK client + asset store)
- `observability-cost` (SDK instrumentation + telemetry backend)

### Tooling
- `eval-lipsync-benchmark` (offline evaluation harness)

## Shared artifacts
- [Data models diagram](architecture/diagrams/data_models.png)
- Contracts (shared types + gRPC proto) live under `ai-sdk/packages/contracts/`.
- Schemas live under `ai-sdk/packages/<name>/schemas/`.
- Diagrams live under `ai-sdk/packages/<name>/diagrams/`.

## Example integrations
- [FT-Gen integration notes](../apps/ft-gen/integration/integration_notes.md)
- [Personastu integration notes](../apps/personastu/integration/integration_notes.md)

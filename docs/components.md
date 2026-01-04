# Components

## Docs Index
- [[sdk|SDK Index]]
- [[ai-sdk/docs/architecture/00_overview|Component Specs Overview]]
- [[ai-sdk/docs/architecture/01_component_index|Component Index]]
- [[ai-sdk/docs/architecture/02_model_matrix|Model / Provider Matrix]]
- [[ai-sdk/docs/architecture/03_reference_architecture|Reference Architecture]]
- [[ai-sdk/docs/architecture/04_security_and_policy|Security and Policy Notes]]
- [[ai-sdk/docs/architecture/05_lipsync_reliability|Lip-sync reliability additions]]
- [[ai-sdk/docs/architecture/06_lipsync_merge_notes|Lip-sync merge notes]]
- [[ai-sdk/docs/architecture/07_backend_capabilities|Backend capability profiles]]

## Canonical packages (grouped)
Each component ships as a library package and/or service. Detailed specs live under `ai-sdk/packages`.

### Foundation
- contracts: [[ai-sdk/packages/contracts/service_contracts|service contracts]]
- persona-core: [[ai-sdk/packages/persona-core/product_spec|product spec]] / [[ai-sdk/packages/persona-core/tech_spec|tech spec]]
- scene-system: [[ai-sdk/packages/scene-system/product_spec|product spec]] / [[ai-sdk/packages/scene-system/tech_spec|tech spec]]

### Ingest + Perception
- ingestion-normalization: [[ai-sdk/packages/ingestion-normalization/product_spec|product spec]] / [[ai-sdk/packages/ingestion-normalization/tech_spec|tech spec]]
- face-track: [[ai-sdk/packages/face-track/product_spec|product spec]] / [[ai-sdk/packages/face-track/tech_spec|tech spec]]

### Planning + Runtime
- planning-control: [[ai-sdk/packages/planning-control/product_spec|product spec]] / [[ai-sdk/packages/planning-control/tech_spec|tech spec]]
- orchestration-runtime: [[ai-sdk/packages/orchestration-runtime/product_spec|product spec]] / [[ai-sdk/packages/orchestration-runtime/tech_spec|tech spec]]

### Media Generation + Delivery
- audio-speech: [[ai-sdk/packages/audio-speech/product_spec|product spec]] / [[ai-sdk/packages/audio-speech/tech_spec|tech spec]]
- video-render: [[ai-sdk/packages/video-render/product_spec|product spec]] / [[ai-sdk/packages/video-render/tech_spec|tech spec]]
- postprocess-compositing: [[ai-sdk/packages/postprocess-compositing/product_spec|product spec]] / [[ai-sdk/packages/postprocess-compositing/tech_spec|tech spec]]
- delivery-playback: [[ai-sdk/packages/delivery-playback/product_spec|product spec]] / [[ai-sdk/packages/delivery-playback/tech_spec|tech spec]]
- av-sync: [[ai-sdk/packages/av-sync/product_spec|product spec]] / [[ai-sdk/packages/av-sync/tech_spec|tech spec]]

### Quality + Evaluation
- viseme-aligner: [[ai-sdk/packages/viseme-aligner/product_spec|product spec]] / [[ai-sdk/packages/viseme-aligner/tech_spec|tech spec]]
- sync-scorer: [[ai-sdk/packages/sync-scorer/product_spec|product spec]] / [[ai-sdk/packages/sync-scorer/tech_spec|tech spec]]
- quality-controller: [[ai-sdk/packages/quality-controller/product_spec|product spec]] / [[ai-sdk/packages/quality-controller/tech_spec|tech spec]]
- identity-drift: [[ai-sdk/packages/identity-drift/product_spec|product spec]] / [[ai-sdk/packages/identity-drift/tech_spec|tech spec]]
- eval-lipsync-benchmark: [[ai-sdk/packages/eval-lipsync-benchmark/product_spec|product spec]] / [[ai-sdk/packages/eval-lipsync-benchmark/tech_spec|tech spec]]

### Platform
- storage-metadata: [[ai-sdk/packages/storage-metadata/product_spec|product spec]] / [[ai-sdk/packages/storage-metadata/tech_spec|tech spec]]
- observability-cost: [[ai-sdk/packages/observability-cost/product_spec|product spec]] / [[ai-sdk/packages/observability-cost/tech_spec|tech spec]]

### Policy
- moderation-policy: [[ai-sdk/packages/moderation-policy/product_spec|product spec]] / [[ai-sdk/packages/moderation-policy/tech_spec|tech spec]]

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
- [[ai-sdk/docs/architecture/diagrams/data_models|Data models diagram]]
- Contracts (shared types + gRPC proto) live under `ai-sdk/packages/contracts/`.
- Schemas live under `ai-sdk/packages/<name>/schemas/`.
- Diagrams live under `ai-sdk/packages/<name>/diagrams/`.

## Example integrations
- [[ai-sdk/apps/ft-gen/integration/integration_notes|FT-Gen integration notes]]
- [[ai-sdk/apps/personastu/integration/integration_notes|Personastu integration notes]]

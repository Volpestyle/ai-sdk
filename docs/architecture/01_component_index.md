# Component Index

This SDK is organized as **reusable components**. Each component ships as:
- a library package (types + helpers) **and/or**
- a service (gRPC/HTTP) when GPU/latency isolation is needed.

## Components (grouped)

### Foundation
- `persona-core` — PersonaPack creation, versioning, identity/style/voice anchors
- `scene-system` — ScenePack presets, scene planning, background generation recipes

### Ingest + Perception
- `ingestion-normalization` — capture/upload, QC, detection, alignment, matting outputs
- `face-track` — face detection + tracking + landmarks + mouth ROI stabilization

### Planning + Runtime
- `planning-control` — LLM planning contracts (TurnPlan, ScenePlan/ShotPlan) + prompt templating
- `orchestration-runtime` — streaming + batch DAG execution, retries, backpressure, sticky routing

### Media Generation + Delivery
- `audio-speech` — streaming TTS/ASR, audio features, VAD, prosody tags
- `video-render` — pluggable I2V/talking-head backend interface + streaming block loop
- `postprocess-compositing` — background replacement, relighting, upscaling, compression
- `delivery-playback` — WebRTC + CDN delivery, signed URLs, caching
- `av-sync` — media clocking + buffering policy + A/V sync monitoring

### Quality + Evaluation
- `viseme-aligner` — optional phoneme/viseme timeline generator
- `sync-scorer` — per-block lip-sync scoring + A/V offset estimation
- `quality-controller` — policy engine that routes corrective actions
- `identity-drift` — identity/style drift monitoring + corrective control loops
- `eval-lipsync-benchmark` — repeatable evaluation harness to prevent regressions

### Platform
- `storage-metadata` — asset store, metadata, seeds, model snapshots, replay
- `observability-cost` — metrics/traces/logs, per-step cost attribution, quality dashboards
- `ai-kit-runtime` — shared ai-kit client bootstrap + caching for provider-agnostic inference

### Policy
- `moderation-policy` — illegal-only gating baseline + configurable product policies

See `packages/<name>/product_spec.md` and `packages/<name>/tech_spec.md`.

Python reference modules (when available) live under `packages/<name>/python/` and are documented in the package tech specs.

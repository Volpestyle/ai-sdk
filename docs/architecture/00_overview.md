# Overview

## Design goal
Build a **suite of composable packages** (SDK + services) for AI-powered apps, where each app is primarily a **configuration + UI** layer over shared primitives.

Core principles:
- **Contracts first**: stable JSON schemas for plans/artifacts (PersonaPack, ScenePack, TurnPlan, ScenePlan, GenJob, MediaAsset).
- **Provider-pluggable**: every model-facing capability has a provider adapter and a local fallback where possible.
- **Reproducibility**: every output is replayable from stored prompts/params/seeds/model versions.
- **Streaming vs batch**: the orchestrator supports both low-latency turn loops (FT-Gen) and queued jobs (Personastu).

## Two app profiles
### FT-Gen (realtime-ish)
- latency-sensitive, stateful sessions, sticky workers
- streaming TTS + streaming/near-streaming video render
- hard turn budgets (4–30s) and barge-in cancelation

### Personastu (offline/batch)
- higher quality, more steps, longer runtimes
- matting/segmentation + compositing + upscaling
- job queue, progress updates, export/publishing

## Component map (SDK beyond ai-kit)
See `docs/architecture/01_component_index.md`.

## Lip-sync reliability (FT-Gen)
For production lip sync across local and provider backends, see:
- `docs/architecture/05_lipsync_reliability.md`
- `docs/architecture/06_lipsync_merge_notes.md`

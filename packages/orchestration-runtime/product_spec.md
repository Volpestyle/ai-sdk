# orchestration-runtime — Product Spec

## What it is
A unified runtime for executing **generation DAGs** across two modes:
- **Streaming sessions** (FT-Gen): low-latency, sticky workers, cancelation/barge-in.
- **Batch jobs** (Personastu): queued tasks, progress, retries, resumability.

## User stories
1. Execute a TurnPlan as a real-time pipeline with streaming partial outputs.
2. Execute a ShotPlan as a batch job with step-by-step progress and retries.
3. Route work to the right workers based on GPU type, model availability, and cache locality.

## Deliverables
- `GenJob` state machine + step runner abstraction
- Sticky routing for streaming sessions
- Backpressure + cancellation primitives
- Retry policies + dead-letter handling
- Unified telemetry hooks (logs/metrics/traces)

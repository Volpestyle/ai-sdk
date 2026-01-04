# observability-cost — Product Spec

## What it is
A shared observability layer that makes the SDK operable:
- per-step latency and error tracking
- per-turn / per-asset **cost attribution**
- quality metrics (drift, lip-sync confidence, background match)
- provider health dashboards and fallback triggers

## Deliverables
- OpenTelemetry tracing conventions + context propagation
- Metrics schemas and dashboards
- Cost ledger schema (by provider/model/step)

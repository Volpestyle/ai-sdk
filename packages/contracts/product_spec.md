# contracts — Product Spec

## Summary
`contracts` is the **contracts-first** foundation for this SDK: stable, backend-agnostic
data models and service interfaces that let you mix-and-match local pipelines and provider
bridges without rewriting every component.

It is the shared “language” for:
- plans/artifacts (`PersonaPack`, `ScenePack`, `TurnPlan`, etc.)
- quality signals (`LipSyncSignal`, `PlaybackHealth`, etc.)
- service boundaries (gRPC proto for scorer/aligner/monitor components)
- large-payload passing (`BlobRef` / `InlineBytes`)

## Goals
- **Stability**: contracts change slowly; compatibility is prioritized over convenience.
- **Interoperability**: TypeScript + Python reference types for the same shapes.
- **Backend-agnostic**: contracts describe *what* is exchanged, not *how* it’s computed.
- **Large payload friendliness**: prefer references (`shm://`, `s3://`) over inline bytes.

## Non-goals
- Not an implementation of render/scoring/aligning logic.
- Not a full IDL/codegen system for every language and transport.

## What ships here
- gRPC protos under `proto/` (realtime-ish service boundaries)
- reference types:
  - `types.ts`
  - `types.py`
- additional contract notes: `service_contracts.md`

## Success criteria
- Components can be composed across:
  - local vs provider backends
  - in-process vs cross-process vs cross-host deployments
- Changes to any one component don’t force rework across the system.


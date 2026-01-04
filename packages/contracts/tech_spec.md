# contracts — Tech Spec

## Directory structure
- `proto/` — gRPC service definitions for lipsync reliability components.
- `types.ts` — TypeScript reference interfaces (backend-agnostic).
- `types.py` — Python reference dataclasses/protocols (backend-agnostic).
- `service_contracts.md` — transport notes + security considerations.

## Compatibility rules (recommended)
These are the rules of engagement for evolving contracts safely.

### JSON / object shapes
- Prefer **additive** changes (new optional fields).
- Avoid renaming or removing fields; deprecate instead.
- Use `null` explicitly when meaningfully different from “missing”.
- Store **model/provider versions** alongside artifacts so outputs are replayable.

### Proto evolution
- Never reuse field numbers.
- New fields should be optional by nature (proto3 defaulting rules).
- Prefer new RPCs over changing semantics of existing RPCs.

## Large payload transport
Most services exchange frames/audio; payloads can be too large to serialize directly.

Recommended pattern:
- In-process: pass shared buffers/memory views directly.
- Cross-process (same host): pass `shm://` references.
- Cross-host: pass `s3://` (or compatible object store) references.

Use:
- `BlobRef` for production payloads
- `InlineBytes` only for small, sampled monitoring

## Versioning
Suggested versioning strategy:
- Contract package is versioned independently from implementations.
- Use semantic versioning:
  - MINOR: additive fields/RPCs
  - MAJOR: breaking changes (avoid unless unavoidable)

## Scope of current protos
Current proto set focuses on lip-sync reliability:
- face tracking (`face_track.proto`)
- viseme alignment (`viseme_aligner.proto`)
- sync scoring (`sync_scorer.proto`)
- A/V sync monitoring (`av_sync.proto`)
- policy decisions (`quality_controller.proto`)

Additional component contracts (plans/artifacts like PersonaPack/ScenePack/TurnPlan)
currently live as JSON schemas in their respective packages and can be promoted into
`contracts` once stabilization needs increase.


# persona-core — Product Spec

## What it is
`persona-core` is the **source of truth** for persona identity across apps. It produces **versioned, immutable PersonaPack** artifacts that downstream generation pipelines consume.

A PersonaPack encapsulates:
- Canonical **anchor images** per camera mode (selfie / mirror / cutaway)
- Identity anchors (face embeddings)
- Style anchors (room/background style embeddings + lighting tags)
- Optional model adapters (LoRA/ID-cache refs) for stronger consistency
- Voice profile (provider voice id or local speaker embedding + constraints)
- Behavior policy (tone, boundaries, emotion ranges, gesture allowances)

## Who uses it
- FT-Gen runtime (anchor selection, drift resets, acting policy bounds)
- Personastu jobs (identity-preserving stills/short loops, consistent style)

## Primary user stories
1. **Persona creator** imports or generates a persona, then “publishes” PersonaPack v1.
2. **Developer** upgrades PersonaPack to v2 (new anchors / new voice), while keeping v1 reproducible.
3. **Runtime** loads PersonaPack fast and deterministically by `(persona_id, version)`.

## Invariants
- PersonaPack versions are **immutable**; edits produce a new version.
- Every FT-Gen turn can always resolve an **explicit Anchor Image** for the selected camera mode.
- PersonaPack records enough metadata to reproduce outputs (or explain why not).

## Non-goals
- Implementing the UI for persona creation (belongs in app layer).
- Training large custom avatar models end-to-end (supported via adapter hooks, not owned here).

## Deliverables
- PersonaPack schema + validation
- Persona registry (CRUD + versioning) API
- Anchor set tooling (selection, tagging, QA)
- Embedding extraction and storage (face/style/voice)

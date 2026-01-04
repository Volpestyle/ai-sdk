# ai-sdk — Progress Tracking

Last updated: 2026-01-04

This file tracks implementation progress for the component specs under `web/ai-sdk/`.

## Legend
- [ ] todo
- [x] done

## Milestones

### M0 — Repo hygiene
- [x] Add progress tracker (`PROGRESS.md`)
- [x] Add top-level `README.md` (pointer to `packages/README.md` + how to navigate specs)

### M1 — Contracts-first foundations
- [x] Spec: `packages/contracts/product_spec.md`
- [x] Spec: `packages/contracts/tech_spec.md`
- [ ] Code: consolidated runtime types/helpers (JS) for shared contracts
- [ ] Tests: basic schema/examples smoke tests

### M2 — Lip-sync reliability (reference implementations)

#### `packages/av-sync`
- [x] Code: audio-master timestamping helpers
- [x] Code: late-frame policy decision helper
- [x] Code: A/V offset + resync decision helper
- [x] Tests: deterministic unit coverage

#### `packages/quality-controller`
- [x] Code: policy + hysteresis state machine
- [x] Code: capability-aware action selection
- [x] Tests: oscillation/hysteresis + action ordering

#### `packages/sync-scorer`
- [x] Code: heuristic scorer (energy ↔ mouth-openness correlation fallback)
- [x] Tests: synthetic aligned vs misaligned windows

#### `packages/viseme-aligner`
- [x] Code: phoneme→viseme mapping (backend-agnostic inventory)
- [x] Code: heuristic timeline generator (duration allocation)
- [x] Tests: basic mapping + monotonic timeline

#### `packages/face-track`
- [x] Code: `FaceTrackBackend` interface skeleton
- [x] Code: ROI stabilization helpers (landmarks→mouth ROI)
- [x] Tests: ROI stability invariants (scale/center)

### M3 — Core planning + runtime
- [ ] `packages/planning-control`: prompt templates + TurnPlan helpers
- [ ] `packages/orchestration-runtime`: DAG runner skeleton (streaming + batch)

### M4 — Media generation + delivery (stubs + adapters)
- [ ] `packages/audio-speech`: adapter interfaces + streaming chunk contracts
- [ ] `packages/video-render`: backend adapter interface + “block loop” skeleton
- [ ] `packages/postprocess-compositing`: compositing pipeline stubs
- [ ] `packages/delivery-playback`: delivery abstractions (WebRTC/CDN) stubs

### M5 — Platform + policy
- [ ] `packages/storage-metadata`: asset + replay metadata helpers
- [ ] `packages/observability-cost`: tracing/cost attribution helpers
- [ ] `packages/moderation-policy`: policy profile + gate helpers

## Package status snapshot (docs already exist unless noted)

- `packages/contracts`: specs ✅, proto ✅, code ⚠️ (types only)
- `packages/av-sync`: schema ✅, proto ✅ (in `packages/contracts/proto/av_sync.proto`), code ✅
- `packages/quality-controller`: schema ✅, proto ✅, code ✅
- `packages/sync-scorer`: schema ✅, proto ✅, code ✅ (heuristic fallback)
- `packages/viseme-aligner`: schema ✅, proto ✅, code ✅ (mapping + heuristic)
- `packages/face-track`: schema ✅, proto ✅, code ⚠️ (ROI helpers only)

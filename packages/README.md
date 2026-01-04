# AI SDK Component Specs (ft-gen + personastu)

This repo contains **product specs**, **tech specs**, **schemas**, and **Mermaid diagrams (.mmd)** for a reusable AI SDK that powers:

- **FT-Gen**: turn-based conversational video agent (WebRTC playback; short generated clips)
- **Personastu**: persona-to-photo mapping workflow (batch/offline, export + publishing)

## How to use
1. Read `docs/architecture/00_overview.md`, `docs/architecture/02_model_matrix.md`, and `docs/architecture/05_lipsync_reliability.md` for recommended defaults + lip-sync reliability additions.
2. Each component lives under `packages/<name>/`; shared contracts live under `packages/contracts/`.
3. Render Mermaid diagrams (`.mmd`) to PNG using your docs toolchain.

## Contents
- `docs/architecture/` shared architecture + model matrix
- `packages/` reusable SDK building blocks (each has `product_spec.md` + `tech_spec.md`)
- `packages/contracts/` shared types + gRPC proto contracts
- `apps/` app-specific integration notes and end-to-end diagrams

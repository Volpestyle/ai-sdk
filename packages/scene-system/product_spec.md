# scene-system — Product Spec

## What it is
`scene-system` defines reusable **ScenePacks** and **ScenePlans** to control backgrounds/environments across apps.

- FT-Gen: typically uses a **fixed stage** per persona (room/backdrop), with constrained camera modes.
- Personastu: uses **scene presets** (time of day, location, aesthetic, props) and optional background replacement.

## User stories
1. Create a library of “scenes” that a persona can appear in (consistent look across a series).
2. Generate a new background from a prompt, then reuse it across multiple shots.
3. For FT-Gen, enforce a tight “stage lock” so the background doesn’t drift.

## Invariants
- ScenePack versions are immutable; new presets => new version.
- Every generated media asset records the ScenePack + preset id + parameters used.

## Deliverables
- ScenePack schema (presets + prompt recipes + negative prompts + optional refs)
- ScenePlan contract (per-output resolved scene parameters)
- Background generation + caching tools
- Optional background reference banking (stable “reference images” per preset)

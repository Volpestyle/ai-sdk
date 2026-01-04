# planning-control — Product Spec

## What it is
A shared “control plane” for **structured planning outputs** that downstream pipelines can execute deterministically.

Key artifacts:
- **TurnPlan** (FT-Gen): speech segments + actor timeline + camera mode suggestion + time budget.
- **ScenePlan / ShotPlan** (Personastu): shot list, prompts, composition constraints, background plan.

## Why it matters
- Plans make the system **reconfigurable**: you can swap LLM providers without changing the rest of the pipeline.
- Segmenting speech enables “prefer short” while supporting longer responses without janky cutoffs.

## User stories
1. Generate a TurnPlan that fits a 4–30s spoken-audio policy.
2. Generate a ShotPlan for a batch of influencer-style images with consistent scene/style.
3. Validate and clamp plans against persona policies and app constraints.

## Deliverables
- JSON Schemas for TurnPlan + ScenePlan + ShotPlan
- Prompt template library (provider-agnostic)
- Validation + clamping utilities

# ingestion-normalization — Product Spec

## What it is
A reusable pipeline for **capture/upload → quality checks → normalized media artifacts**.

Outputs are standardized so downstream steps (planning, generation, compositing, drift monitoring) don’t have to re-implement:
- resizing/cropping
- face/pose detection
- masks/alpha mattes
- embeddings
- metadata + provenance

## Where it’s used
- PersonaPack builder (extract anchors, embeddings, masks)
- Personastu (subject isolation + scene replacement)
- FT-Gen (optional: ingest user images for onboarding / personalization, if allowed)

## User stories
1. Reject low-quality uploads (too blurry, wrong aspect, multiple faces).
2. Produce a “normalized subject pack” (aligned crop + alpha + keypoints).
3. Persist provenance + user attestation for rights/consent.

## Invariants
- All outputs are traceable back to raw assets + step metadata.
- Quality gates are deterministic and configurable per app/policy.

## Deliverables
- QC ruleset + scoring
- Detection/alignment outputs
- Matting/segmentation outputs
- Normalized media bundle format (`IngestedAsset`)

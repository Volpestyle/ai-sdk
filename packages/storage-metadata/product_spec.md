# storage-metadata — Product Spec

## What it is
A shared persistence layer for:
- raw and generated **media assets**
- intermediate artifacts (masks, embeddings, caches)
- full **repro metadata** (prompts, params, seeds, model snapshots, moderation decisions)
- retention + signed URL delivery

## Used by
All apps and components.

## Deliverables
- Object storage layout + lifecycle policies
- Postgres schemas for metadata
- “Replay” API to reproduce an asset from a stored job

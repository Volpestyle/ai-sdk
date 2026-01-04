# moderation-policy — Product Spec

## What it is
A shared safety gateway that enforces:
- a **baseline illegal-only** blocklist (CSAM/minors sexual content, trafficking facilitation, etc.)
- optional product-specific policies (NSFW, self-harm, harassment, etc.)
- defense-in-depth checks across text, images, and sampled video frames

## Used by
- FT-Gen: pre-check user input, post-check model text, optional frame sampling
- Personastu: pre-check uploads, prompt/output checks, export checks

## Deliverables
- Policy configuration format (policy packs)
- Moderation adapters (provider + local)
- Decision logging (auditable)

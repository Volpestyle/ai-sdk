# Security & Policy Notes (pragmatic defaults)

## Baseline: illegal-only moderation
Even if you only block illegal content, implement:
- pre-check user text
- post-check assistant text
- image moderation at upload time
- sampled-frame moderation for generated video (defense-in-depth)

## “No real people” vs “self-only real person”
Your specs contain a tension:
- FT-Gen: typically wants “no real people” to avoid impersonation.
- Personastu: “map persona onto real images of you” implies allowing real-person images.

Recommended resolution: support **policy modes**:
1. `no_real_people` (default for FT-Gen)
2. `self_only_real_person` (Personastu variant)
   - requires consent + account linking
   - best-effort “same-person” checks (face match to enrollment selfie)
   - explicit watermarking/disclosure (product decision)

## Injection and abuse
- treat all user text as untrusted
- keep system constraints in non-user-controllable fields
- clamp plans against policies

## Data retention
- short retention for raw inputs (configurable)
- longer retention for derived low-risk artifacts (masks, embeddings) if policy allows
- access logging for all asset reads

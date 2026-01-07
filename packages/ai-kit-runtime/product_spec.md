# ai-kit-runtime — Product Spec

## Purpose
Provide a shared, provider-agnostic ai-kit bootstrap that standardizes how apps and SDK components
create and cache `ai-kit` clients. This keeps provider configuration consistent across projects and
centralizes local dev path injection for sibling `ai-kit` repos.

## Users
- SDK components that need ai-kit inference (TTS, I2V, image, LLM, voice agent).
- App backends (ex: FT-Gen) that want a single, consistent ai-kit setup pattern.

## Non-goals
- Replacing ai-kit adapters or model routing.
- Implementing provider-specific logic outside ai-kit.

# ai-kit-runtime — Tech Spec

## Reference implementation (Python)
The reference implementation lives under `packages/ai-kit-runtime/python/` and exposes:

- `AiKitClient` dataclass with `kit`, `provider`, `model`, and `image_model` metadata.
- `create_ai_kit_client(...)` for provider-aware initialization (OpenAI, Anthropic, Gemini,
  xAI, Bedrock, Ollama, Replicate, Fal).
- `get_ai_kit_client(...)` for cached client instances keyed by provider/model/base URL.

## Environment configuration
`ai-kit-runtime` uses the same env conventions as ai-kit and FT-Gen:

- `AI_KIT_PROVIDER`, `AI_KIT_MODEL`, `AI_KIT_IMAGE_MODEL`
- Provider keys (ex: `AI_KIT_OPENAI_API_KEY`, `OPENAI_API_KEY`, `AI_KIT_API_KEY`)
- Provider base URLs (ex: `OPENAI_BASE_URL`, `AI_KIT_BASE_URL`)
- `AI_KIT_PATH` to point at a sibling ai-kit repo for local dev

The helper injects `ai-kit/packages/python/src` and `ai-kit/packages/python-inference/src`
into `sys.path` when present so editable installs are not required during local development.

from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Dict, Optional


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def ai_kit_path() -> Path:
    candidate = os.environ.get("AI_KIT_PATH")
    if candidate:
        return Path(candidate).expanduser().resolve()
    return (_repo_root().parent / "ai-kit").resolve()


def _inject_ai_kit_paths() -> None:
    root = ai_kit_path()
    python_core = root / "packages" / "python" / "src"
    python_inference = root / "packages" / "python-inference" / "src"
    for path in (python_core, python_inference):
        if path.exists() and str(path) not in sys.path:
            sys.path.insert(0, str(path))


def _env(*keys: str) -> Optional[str]:
    for key in keys:
        value = os.environ.get(key)
        if value:
            return value
    return None


@dataclass
class AiKitClient:
    enabled: bool
    kit: object | None = None
    provider: str | None = None
    model: str | None = None
    image_model: str | None = None
    reason: str | None = None


def create_ai_kit_client(
    provider_override: Optional[str] = None,
    model_override: Optional[str] = None,
    image_model_override: Optional[str] = None,
    base_url_override: Optional[str] = None,
) -> AiKitClient:
    try:
        _inject_ai_kit_paths()
        from ai_kit import Kit, KitConfig
        from ai_kit.providers import (
            OpenAIConfig,
            AnthropicConfig,
            GeminiConfig,
            XAIConfig,
            BedrockConfig,
            OllamaConfig,
            ReplicateConfig,
            FalConfig,
        )
    except Exception:
        return AiKitClient(enabled=False, reason="ai_kit_import_failed")

    provider = (provider_override or os.environ.get("AI_KIT_PROVIDER") or "openai").lower()
    model = model_override or os.environ.get("AI_KIT_MODEL") or "gpt-4o-mini"
    image_model = image_model_override or os.environ.get("AI_KIT_IMAGE_MODEL") or "gpt-image-1"

    providers: dict[str, object] = {}

    if provider == "openai":
        api_key = _env("AI_KIT_OPENAI_API_KEY", "OPENAI_API_KEY", "AI_KIT_API_KEY") or ""
        base_url = base_url_override or _env("OPENAI_BASE_URL", "AI_KIT_BASE_URL")
        if not api_key:
            return AiKitClient(enabled=False, reason="missing_api_key")
        providers["openai"] = OpenAIConfig(api_key=api_key, base_url=base_url or "https://api.openai.com")
    elif provider == "anthropic":
        api_key = _env("AI_KIT_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY", "AI_KIT_API_KEY") or ""
        if not api_key:
            return AiKitClient(enabled=False, reason="missing_api_key")
        base_url = base_url_override or _env("ANTHROPIC_BASE_URL", "AI_KIT_BASE_URL")
        providers["anthropic"] = AnthropicConfig(api_key=api_key, base_url=base_url)
    elif provider == "gemini":
        api_key = _env("AI_KIT_GOOGLE_API_KEY", "GOOGLE_API_KEY", "AI_KIT_API_KEY") or ""
        if not api_key:
            return AiKitClient(enabled=False, reason="missing_api_key")
        base_url = base_url_override or _env("GOOGLE_BASE_URL", "AI_KIT_BASE_URL")
        providers["google"] = GeminiConfig(api_key=api_key, base_url=base_url)
        provider = "google"
    elif provider == "xai":
        api_key = _env("AI_KIT_XAI_API_KEY", "XAI_API_KEY", "AI_KIT_API_KEY") or ""
        if not api_key:
            return AiKitClient(enabled=False, reason="missing_api_key")
        base_url = base_url_override or _env("XAI_BASE_URL", "AI_KIT_BASE_URL")
        speech_mode = _env("AI_KIT_XAI_SPEECH_MODE", "XAI_SPEECH_MODE")
        providers["xai"] = XAIConfig(api_key=api_key, base_url=base_url, speech_mode=speech_mode or "realtime")
    elif provider == "bedrock":
        access_key_id = _env("AWS_ACCESS_KEY_ID", "BEDROCK_ACCESS_KEY_ID") or ""
        secret_access_key = _env("AWS_SECRET_ACCESS_KEY", "BEDROCK_SECRET_ACCESS_KEY") or ""
        if not access_key_id or not secret_access_key:
            return AiKitClient(enabled=False, reason="missing_bedrock_credentials")
        providers["bedrock"] = BedrockConfig(
            region=_env("AWS_REGION", "BEDROCK_REGION") or "",
            access_key_id=access_key_id,
            secret_access_key=secret_access_key,
            session_token=_env("AWS_SESSION_TOKEN", "BEDROCK_SESSION_TOKEN"),
            endpoint=_env("BEDROCK_ENDPOINT"),
            runtime_endpoint=_env("BEDROCK_RUNTIME_ENDPOINT"),
        )
    elif provider == "ollama":
        providers["ollama"] = OllamaConfig(
            base_url=base_url_override or _env("OLLAMA_BASE_URL", "AI_KIT_BASE_URL") or "http://localhost:11434"
        )
    elif provider == "replicate":
        api_key = _env("REPLICATE_API_TOKEN", "AI_KIT_REPLICATE_API_TOKEN", "AI_KIT_API_KEY") or ""
        if not api_key:
            return AiKitClient(enabled=False, reason="missing_api_key")
        providers["replicate"] = ReplicateConfig(api_key=api_key)
    elif provider == "fal":
        api_key = _env("AI_KIT_FAL_API_KEY", "FAL_API_KEY", "FAL_KEY", "AI_KIT_API_KEY") or ""
        if not api_key:
            return AiKitClient(enabled=False, reason="missing_api_key")
        providers["fal"] = FalConfig(api_key=api_key)
    else:
        return AiKitClient(enabled=False, reason="unsupported_provider")

    if not providers:
        return AiKitClient(enabled=False, reason="missing_provider")

    kit = Kit(KitConfig(providers=providers))
    return AiKitClient(enabled=True, kit=kit, provider=provider, model=model, image_model=image_model)


_cache: Dict[str, AiKitClient] = {}
_lock = Lock()


def get_ai_kit_client(
    *,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    image_model: Optional[str] = None,
    base_url: Optional[str] = None,
) -> AiKitClient:
    key = ":".join([provider or "default", model or "", image_model or "", base_url or ""])
    with _lock:
        client = _cache.get(key)
        if client:
            return client
        client = create_ai_kit_client(
            provider_override=provider,
            model_override=model,
            image_model_override=image_model,
            base_url_override=base_url,
        )
        _cache[key] = client
        return client

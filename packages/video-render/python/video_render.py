from __future__ import annotations

import base64
import mimetypes
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ai_kit_runtime import AiKitClient


@dataclass
class VideoBytes:
    content: bytes
    provider: str
    model: str


class ProviderError(RuntimeError):
    pass


def _encode_image_data_url(image_path: Path) -> str:
    media_type, _ = mimetypes.guess_type(str(image_path))
    if not media_type:
        media_type = "image/png"
    data = base64.b64encode(image_path.read_bytes()).decode("ascii")
    return f"data:{media_type};base64,{data}"


def _encode_audio_data_url(audio_path: Path) -> str:
    media_type, _ = mimetypes.guess_type(str(audio_path))
    if not media_type:
        media_type = "audio/wav"
    data = base64.b64encode(audio_path.read_bytes()).decode("ascii")
    return f"data:{media_type};base64,{data}"


def generate_i2v_video_bytes(
    *,
    ai_kit_client: AiKitClient,
    prompt: str,
    anchor_path: Path,
    audio_path: Optional[Path] = None,
    duration_sec: int,
    aspect_ratio: str,
    negative_prompt: str = "",
    extra_params: Optional[Dict[str, Any]] = None,
) -> VideoBytes:
    if not ai_kit_client.enabled or not ai_kit_client.kit:
        raise ProviderError("ai_kit_unavailable")
    provider = ai_kit_client.provider or ""
    model = ai_kit_client.model or ""
    if not provider or not model:
        raise ProviderError("ai_kit_unavailable")
    try:
        from ai_kit import VideoGenerateInput
    except Exception as exc:
        raise ProviderError("ai_kit_unavailable") from exc

    parameters = dict(extra_params or {})
    audio_base64 = _encode_audio_data_url(audio_path) if audio_path else None
    input_data = VideoGenerateInput(
        provider=provider,
        model=model,
        prompt=prompt,
        startImage=_encode_image_data_url(anchor_path),
        audioBase64=audio_base64,
        duration=float(duration_sec),
        aspectRatio=aspect_ratio,
        negativePrompt=negative_prompt or None,
        parameters=parameters or None,
    )
    output = ai_kit_client.kit.generate_video(input_data)
    if not output or not getattr(output, "data", None):
        raise ProviderError("i2v_empty_output")
    return VideoBytes(
        content=base64.b64decode(output.data),
        provider=provider,
        model=model,
    )

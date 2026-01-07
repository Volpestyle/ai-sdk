from __future__ import annotations

import base64
import mimetypes
import shutil
import subprocess
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Optional, TYPE_CHECKING

from audio_speech import PcmChunk, write_wav_file

if TYPE_CHECKING:
    from ai_kit_runtime import AiKitClient


@dataclass
class RenderCapabilities:
    backend_id: str
    supports_rerender_block: bool = False
    supports_anchor_reset: bool = False
    supports_mouth_corrector: bool = False
    supports_viseme_conditioning: bool = False
    supports_restart_stream: bool = False
    supports_param_update: bool = False
    supports_failover: bool = False
    provides_webrtc_stream: bool = False


@dataclass
class RenderResult:
    frame_count: int
    capabilities: RenderCapabilities
    video_path: Optional[Path] = None
    audio_path: Optional[Path] = None
    thumbnail_path: Optional[Path] = None
    render_error: Optional[str] = None


@dataclass
class VideoBytes:
    content: bytes
    provider: str
    model: str


class ProviderError(RuntimeError):
    pass


@lru_cache(maxsize=1)
def ffmpeg_status() -> dict:
    path = shutil.which("ffmpeg")
    if not path:
        return {"available": False, "path": None, "version": None}
    version = None
    try:
        result = subprocess.run(
            [path, "-version"],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        if result.stdout:
            version = result.stdout.splitlines()[0].strip()
    except Exception:
        version = None
    return {"available": True, "path": path, "version": version}


def render_noop(duration_ms: float, fps: int = 30) -> RenderResult:
    frame_count = int((duration_ms / 1000.0) * fps)
    caps = RenderCapabilities(backend_id="noop")
    return RenderResult(frame_count=frame_count, capabilities=caps)


def render_static_video(
    *,
    turn_id: str,
    pcm_chunks: list[PcmChunk],
    duration_ms: float,
    image_path: Optional[Path],
    output_root: Path,
    fps: int = 30,
    width: int = 720,
    height: int = 1280,
    audio_subdir: str = "audio",
    video_subdir: str = "turns",
    thumb_subdir: str = "thumbs",
) -> RenderResult:
    if not image_path or not image_path.exists():
        return render_noop(duration_ms, fps)

    output_root.mkdir(parents=True, exist_ok=True)

    audio_path = output_root / audio_subdir / f"{turn_id}.wav"
    if not write_wav_file(pcm_chunks, audio_path):
        return RenderResult(
            frame_count=int((duration_ms / 1000.0) * fps),
            capabilities=RenderCapabilities(backend_id="static-image"),
            video_path=None,
            audio_path=None,
            thumbnail_path=None,
            render_error="audio_write_failed",
        )

    thumb_path = output_root / thumb_subdir / f"{turn_id}.png"
    thumb_path.parent.mkdir(parents=True, exist_ok=True)
    if not thumb_path.exists():
        shutil.copyfile(image_path, thumb_path)

    video_path = output_root / video_subdir / f"{turn_id}.mp4"
    video_path.parent.mkdir(parents=True, exist_ok=True)
    status = ffmpeg_status()
    ffmpeg = status.get("path")
    if not status.get("available") or not ffmpeg:
        return RenderResult(
            frame_count=int((duration_ms / 1000.0) * fps),
            capabilities=RenderCapabilities(backend_id="static-image"),
            video_path=None,
            audio_path=audio_path,
            thumbnail_path=thumb_path,
            render_error="ffmpeg_not_found",
        )

    command = [
        ffmpeg,
        "-y",
        "-loop",
        "1",
        "-i",
        str(image_path),
        "-i",
        str(audio_path),
        "-shortest",
        "-r",
        str(fps),
        "-vf",
        f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},format=yuv420p",
        "-c:v",
        "libx264",
        "-tune",
        "stillimage",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        str(video_path),
    ]
    subprocess.run(command, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    resolved_video = video_path if video_path.exists() else None
    render_error = None if resolved_video else "ffmpeg_failed"

    return RenderResult(
        frame_count=int((duration_ms / 1000.0) * fps),
        capabilities=RenderCapabilities(backend_id="static-image"),
        video_path=resolved_video,
        audio_path=audio_path,
        thumbnail_path=thumb_path,
        render_error=render_error,
    )


def _encode_image_data_url(image_path: Path) -> str:
    media_type, _ = mimetypes.guess_type(str(image_path))
    if not media_type:
        media_type = "image/png"
    data = base64.b64encode(image_path.read_bytes()).decode("ascii")
    return f"data:{media_type};base64,{data}"


def generate_i2v_video_bytes(
    *,
    ai_kit_client: "AiKitClient",
    prompt: str,
    anchor_path: Path,
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
    input_data = VideoGenerateInput(
        provider=provider,
        model=model,
        prompt=prompt,
        startImage=_encode_image_data_url(anchor_path),
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

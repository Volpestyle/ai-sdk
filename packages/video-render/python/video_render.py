from __future__ import annotations

import os
import shutil
import subprocess
import urllib.request
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Optional

from audio_speech import PcmChunk, write_wav_file
from lipsync_generation import apply_lipsync as apply_lipsync_bytes
from lipsync_generation import ProviderError as LipSyncProviderError


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


def _download_url(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=120) as resp:
        return resp.read()


def _coerce_output_to_bytes(output: Any) -> bytes:
    if output is None:
        raise ProviderError("provider returned no output")
    if isinstance(output, bytes):
        return output
    if isinstance(output, str) and output.startswith("http"):
        return _download_url(output)
    if isinstance(output, dict) and isinstance(output.get("url"), str):
        return _download_url(output["url"])
    if isinstance(output, (list, tuple)) and output:
        return _coerce_output_to_bytes(output[0])
    raise ProviderError(f"unsupported output type: {type(output)}")


def _replicate_client():
    try:
        from ai_kit.clients import ReplicateClient
    except Exception as exc:
        raise ProviderError("replicate_client_unavailable") from exc
    return ReplicateClient()


def _fal_client():
    try:
        from ai_kit.clients import FalClient
    except Exception as exc:
        raise ProviderError("fal_client_unavailable") from exc
    return FalClient()


def generate_i2v_video_bytes(
    *,
    provider: str,
    model: str,
    prompt: str,
    anchor_path: Path,
    duration_sec: int,
    aspect_ratio: str,
    negative_prompt: str = "",
    extra_params: Optional[Dict[str, Any]] = None,
    on_log=None,
) -> VideoBytes:
    if provider == "fal":
        client = _fal_client()
        image_url = client.upload_file(anchor_path)
        payload: Dict[str, Any] = {
            "prompt": prompt,
            "image_url": image_url,
        }
        duration_value = "5" if duration_sec <= 5 else "10"
        payload["duration"] = duration_value
        if negative_prompt:
            payload["negative_prompt"] = negative_prompt
        if extra_params:
            payload.update(extra_params)
        payload.setdefault("generate_audio", False)

        def _on_queue_update(update: Any) -> None:
            logs = getattr(update, "logs", None)
            if not logs or not on_log:
                return
            for entry in logs:
                message = entry.get("message") if isinstance(entry, dict) else None
                if message:
                    on_log(str(message))

        result = client._client.subscribe(  # type: ignore[attr-defined]
            model,
            arguments=payload,
            with_logs=bool(on_log),
            on_queue_update=_on_queue_update if on_log else None,
        )
        video = result.get("video") if isinstance(result, dict) else None
        out_url = video.get("url") if isinstance(video, dict) else None
        if not out_url:
            raise ProviderError("fal_i2v_missing_url")
        return VideoBytes(content=client.download_url(out_url), provider="fal", model=model)

    if provider == "replicate":
        client = _replicate_client()
        params: Dict[str, Any] = {
            "prompt": prompt,
            "duration": duration_sec,
            "aspect_ratio": aspect_ratio,
        }
        if negative_prompt:
            params["negative_prompt"] = negative_prompt
        if extra_params:
            params.update(extra_params)

        with anchor_path.open("rb") as image_file:
            params["start_image"] = image_file
            output = client.run(model, inputs=params)

        return VideoBytes(content=_coerce_output_to_bytes(output), provider="replicate", model=model)

    raise ProviderError(f"unsupported_i2v_provider:{provider}")


def apply_lipsync(
    *,
    provider: str,
    model: Optional[str],
    video_path: Path,
    audio_path: Path,
    sync_mode: str,
    extra_params: Optional[Dict[str, Any]] = None,
    on_log=None,
) -> VideoBytes:
    if provider == "none" or not model:
        raise ProviderError("lipsync_provider_disabled")
    try:
        data = apply_lipsync_bytes(
            provider=provider,
            model=model,
            video_path=video_path,
            audio_path=audio_path,
            sync_mode=sync_mode,
            extra_params=extra_params,
            on_log=on_log,
        )
    except LipSyncProviderError as exc:
        raise ProviderError(str(exc)) from exc
    return VideoBytes(content=data, provider=provider, model=model)

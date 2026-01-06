from __future__ import annotations

import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional


class ProviderError(RuntimeError):
    pass


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


def apply_lipsync_fal(
    *,
    model: str,
    video_path: Path,
    audio_path: Path,
    sync_mode: str,
    extra_params: Optional[Dict[str, Any]] = None,
    on_log=None,
) -> bytes:
    client = _fal_client()
    video_url = client.upload_file(video_path)
    audio_url = client.upload_file(audio_path)
    payload: Dict[str, Any] = {"video_url": video_url, "audio_url": audio_url, "sync_mode": sync_mode}
    if extra_params:
        payload.update(extra_params)

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
        raise ProviderError("fal_lipsync_missing_url")
    return client.download_url(out_url)


def apply_lipsync_replicate(
    *,
    model: str,
    video_path: Path,
    audio_path: Path,
    extra_params: Optional[Dict[str, Any]] = None,
) -> bytes:
    client = _replicate_client()
    params: Dict[str, Any] = dict(extra_params or {})
    if "latentsync" in model:
        video_key = "video"
        audio_key = "audio"
    else:
        video_key = "video_url"
        audio_key = "audio_file"
    with video_path.open("rb") as video_file, audio_path.open("rb") as audio_file:
        params[video_key] = video_file
        params[audio_key] = audio_file
        output = client.run(model, inputs=params)
    return _coerce_output_to_bytes(output)


def apply_lipsync(
    *,
    provider: str,
    model: str,
    video_path: Path,
    audio_path: Path,
    sync_mode: str,
    extra_params: Optional[Dict[str, Any]] = None,
    on_log=None,
) -> bytes:
    if provider == "fal":
        return apply_lipsync_fal(
            model=model,
            video_path=video_path,
            audio_path=audio_path,
            sync_mode=sync_mode,
            extra_params=extra_params,
            on_log=on_log,
        )
    if provider == "replicate":
        return apply_lipsync_replicate(
            model=model,
            video_path=video_path,
            audio_path=audio_path,
            extra_params=extra_params,
        )
    raise ProviderError(f"unsupported_lipsync_provider:{provider}")

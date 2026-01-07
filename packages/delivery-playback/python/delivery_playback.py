from __future__ import annotations

import array
import asyncio
import math
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
import time
from typing import Callable, Iterable, Optional, Tuple

from audio_speech import AudioFeatureChunk, PcmChunk, extract_audio_features

try:  # optional dependency
    from aiortc import MediaStreamTrack
    from av import AudioFrame, VideoFrame

    AIORTC_MEDIA_AVAILABLE = True
except Exception:
    MediaStreamTrack = object  # type: ignore[assignment]
    AudioFrame = None  # type: ignore[assignment]
    VideoFrame = None  # type: ignore[assignment]
    AIORTC_MEDIA_AVAILABLE = False


def pcm_floats_to_s16_bytes(samples: list[float]) -> bytes:
    pcm = array.array("h", [int(max(-1.0, min(1.0, s)) * 32767) for s in samples])
    return pcm.tobytes()


def _silence_bytes(sample_count: int) -> bytes:
    return b"\x00\x00" * sample_count


def build_solid_frame(width: int, height: int, luma: int = 16, chroma: int = 128) -> "VideoFrame":
    if not AIORTC_MEDIA_AVAILABLE or VideoFrame is None:
        raise RuntimeError("VideoFrame not available")
    frame = VideoFrame(width=width, height=height, format="yuv420p")
    planes = frame.planes
    planes[0].update(bytes([luma]) * planes[0].buffer_size)
    planes[1].update(bytes([chroma]) * planes[1].buffer_size)
    planes[2].update(bytes([chroma]) * planes[2].buffer_size)
    return frame


def _update_plane(plane, data: bytes) -> None:
    size = plane.buffer_size
    if len(data) < size:
        data = data + (b"\x00" * (size - len(data)))
    plane.update(data[:size])


def build_image_frame(width: int, height: int, planes: Tuple[bytes, bytes, bytes]) -> "VideoFrame":
    if not AIORTC_MEDIA_AVAILABLE or VideoFrame is None:
        raise RuntimeError("VideoFrame not available")
    frame = VideoFrame(width=width, height=height, format="yuv420p")
    _update_plane(frame.planes[0], planes[0])
    _update_plane(frame.planes[1], planes[1])
    _update_plane(frame.planes[2], planes[2])
    return frame


def load_image_planes(image_path: Path, width: int, height: int) -> Optional[Tuple[bytes, bytes, bytes]]:
    if not AIORTC_MEDIA_AVAILABLE or VideoFrame is None:
        return None
    if not image_path or not image_path.exists():
        return None
    try:
        import av  # type: ignore[import-not-found]
    except Exception:
        return None
    container = None
    try:
        container = av.open(str(image_path))
        stream = next((s for s in container.streams if s.type == "video"), None)
        if not stream:
            return None
        frame = next(container.decode(stream))
        frame = frame.reformat(width=width, height=height, format="yuv420p")
        return (
            bytes(frame.planes[0]),
            bytes(frame.planes[1]),
            bytes(frame.planes[2]),
        )
    except Exception:
        return None
    finally:
        if container is not None:
            try:
                container.close()
            except Exception:
                pass


async def stream_pcm_chunks(
    media: "MediaStreamController",
    chunks: list["PcmChunk"],
    *,
    pacing: bool = True,
) -> None:
    if not media or not media.available:
        return
    start = time.monotonic()
    for chunk in chunks:
        media.enqueue_audio_samples(chunk.samples, chunk.sample_rate_hz)
        if not pacing:
            continue
        target = chunk.t1_ms / 1000.0
        elapsed = time.monotonic() - start
        sleep_for = max(0.0, target - elapsed)
        if sleep_for > 0:
            await asyncio.sleep(min(sleep_for, 0.2))


async def stream_video_file(
    media: "MediaStreamController",
    video_path: Path,
    *,
    pacing: bool = True,
) -> int:
    if not media or not media.available:
        return 0
    if not video_path.exists():
        return 0
    try:
        import av  # type: ignore[import-not-found]
    except Exception:
        return 0

    container = av.open(str(video_path))
    try:
        stream = next((s for s in container.streams if s.type == "video"), None)
        if not stream:
            return 0
        start = time.monotonic()
        first_ts: Optional[float] = None
        frame_count = 0
        for frame in container.decode(stream):
            if not media.available:
                break
            if pacing:
                if frame.pts is not None and frame.time_base is not None:
                    ts = float(frame.pts * frame.time_base)
                elif frame.time is not None:
                    ts = float(frame.time)
                else:
                    ts = frame_count / max(1.0, float(stream.average_rate or 30))
                if first_ts is None:
                    first_ts = ts
                target = (ts - (first_ts or 0.0))
                elapsed = time.monotonic() - start
                sleep_for = max(0.0, target - elapsed)
                if sleep_for > 0:
                    await asyncio.sleep(min(sleep_for, 0.2))
            media.enqueue_video_frame(frame)
            frame_count += 1
        return frame_count
    finally:
        container.close()


class QueueAudioTrack(MediaStreamTrack):
    kind = "audio"

    def __init__(
        self,
        sample_rate_hz: int = 16000,
        frame_samples: int = 640,
        queue_max: int = 120,
        idle_timeout_s: float = 0.5,
    ) -> None:
        super().__init__()
        self.sample_rate_hz = sample_rate_hz
        self.frame_samples = frame_samples
        self.idle_timeout_s = idle_timeout_s
        self._queue: asyncio.Queue[Optional[bytes]] = asyncio.Queue(maxsize=queue_max)
        self._pts = 0

    def enqueue(self, pcm_bytes: bytes, sample_rate_hz: Optional[int] = None) -> None:
        if sample_rate_hz and self._pts == 0 and sample_rate_hz != self.sample_rate_hz:
            self.sample_rate_hz = sample_rate_hz
        try:
            self._queue.put_nowait(pcm_bytes)
        except asyncio.QueueFull:
            return

    async def recv(self) -> "AudioFrame":
        if not AIORTC_MEDIA_AVAILABLE or AudioFrame is None:
            raise RuntimeError("AudioFrame not available")
        try:
            pcm_bytes = await asyncio.wait_for(self._queue.get(), timeout=self.idle_timeout_s)
        except asyncio.TimeoutError:
            pcm_bytes = None

        if pcm_bytes is None or len(pcm_bytes) < 2:
            pcm_bytes = _silence_bytes(self.frame_samples)

        sample_count = max(1, len(pcm_bytes) // 2)
        frame = AudioFrame(format="s16", layout="mono", samples=sample_count)
        frame.sample_rate = self.sample_rate_hz
        frame.pts = self._pts
        frame.time_base = Fraction(1, self.sample_rate_hz)
        frame.planes[0].update(pcm_bytes)
        self._pts += sample_count
        return frame


class QueueVideoTrack(MediaStreamTrack):
    kind = "video"

    def __init__(
        self,
        fps: int = 15,
        width: int = 720,
        height: int = 1280,
        queue_max: int = 120,
        idle_timeout_s: float = 0.2,
    ) -> None:
        super().__init__()
        self.fps = fps
        self.width = width
        self.height = height
        self.idle_timeout_s = idle_timeout_s
        self._queue: asyncio.Queue[Optional["VideoFrame"]] = asyncio.Queue(maxsize=queue_max)
        self._pts = 0

    def enqueue(self, frame: "VideoFrame") -> None:
        try:
            self._queue.put_nowait(frame)
        except asyncio.QueueFull:
            return

    async def recv(self) -> "VideoFrame":
        if not AIORTC_MEDIA_AVAILABLE or VideoFrame is None:
            raise RuntimeError("VideoFrame not available")
        try:
            frame = await asyncio.wait_for(self._queue.get(), timeout=self.idle_timeout_s)
        except asyncio.TimeoutError:
            frame = None

        if frame is None:
            frame = build_solid_frame(self.width, self.height)
        if frame.pts is None:
            frame.pts = self._pts
        frame.time_base = Fraction(1, max(1, self.fps))
        self._pts += 1
        return frame


@dataclass
class MediaStreamController:
    audio_track: Optional[QueueAudioTrack]
    video_track: Optional[QueueVideoTrack]
    available: bool
    fps: int = 15
    width: int = 720
    height: int = 1280

    @classmethod
    def create(cls, fps: int = 15, width: int = 720, height: int = 1280) -> "MediaStreamController":
        if not AIORTC_MEDIA_AVAILABLE:
            return cls(audio_track=None, video_track=None, available=False, fps=fps, width=width, height=height)
        audio = QueueAudioTrack()
        video = QueueVideoTrack(fps=fps, width=width, height=height)
        return cls(audio_track=audio, video_track=video, available=True, fps=fps, width=width, height=height)

    def enqueue_audio_samples(self, samples: list[float], sample_rate_hz: int) -> None:
        if not self.available or not self.audio_track:
            return
        pcm_bytes = pcm_floats_to_s16_bytes(samples)
        self.audio_track.enqueue(pcm_bytes, sample_rate_hz=sample_rate_hz)

    def enqueue_video_frame(self, frame: "VideoFrame") -> None:
        if not self.available or not self.video_track:
            return
        self.video_track.enqueue(frame)


def _luma_from_energy(energy: float) -> int:
    scaled = int(16 + min(1.0, max(0.0, energy)) * 180)
    return max(16, min(235, scaled))


async def stream_audio_video(
    pcm_chunks: Iterable[PcmChunk],
    media: Optional[MediaStreamController],
    fps: int = 15,
    width: int = 720,
    height: int = 1280,
    image_path: Optional[str] = None,
    progress_cb: Optional[Callable[[str, float, Optional[int]], None]] = None,
    pacing: bool = True,
) -> tuple[list[AudioFeatureChunk], int]:
    chunks = list(pcm_chunks)
    if not chunks:
        return [], 0

    total_ms = chunks[-1].t1_ms
    frame_interval_ms = 1000.0 / max(1, fps)
    frame_count = 0
    features: list[AudioFeatureChunk] = []
    start = time.monotonic()

    anchor_planes = None
    if image_path:
        anchor_planes = load_image_planes(Path(image_path), width, height)

    for chunk in chunks:
        feature_chunk = extract_audio_features([chunk])
        if feature_chunk:
            features.extend(feature_chunk)

        if media and media.available:
            media.enqueue_audio_samples(chunk.samples, chunk.sample_rate_hz)

        elapsed_ms = chunk.t1_ms
        target_frame_count = int(math.floor(elapsed_ms / frame_interval_ms))
        new_frames = max(0, target_frame_count - frame_count)
        energy = feature_chunk[0].energy if feature_chunk else 0.0
        for _ in range(new_frames):
            if media and media.available:
                if anchor_planes:
                    frame = build_image_frame(width, height, anchor_planes)
                else:
                    luma = _luma_from_energy(energy)
                    frame = build_solid_frame(width, height, luma=luma)
                media.enqueue_video_frame(frame)
            frame_count += 1

        if progress_cb and total_ms > 0:
            progress = 15.0 + (elapsed_ms / total_ms) * 70.0
            remaining_ms = max(0, int(total_ms - elapsed_ms))
            progress_cb("streaming", min(95.0, progress), remaining_ms)

        if pacing:
            chunk_duration = max(0.0, (chunk.t1_ms - chunk.t0_ms) / 1000.0)
            elapsed = time.monotonic() - start
            target = elapsed_ms / 1000.0
            sleep_for = max(0.0, target - elapsed)
            if sleep_for > 0:
                await asyncio.sleep(min(sleep_for, chunk_duration))

    return features, frame_count

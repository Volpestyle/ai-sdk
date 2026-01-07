from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Optional, TYPE_CHECKING

import base64
import array
import io
import os
from pathlib import Path
import wave

if TYPE_CHECKING:
    from ai_kit_runtime import AiKitClient


@dataclass
class PcmChunk:
    samples: List[float]
    sample_rate_hz: int
    seq: int
    t0_ms: float
    t1_ms: float


@dataclass
class AudioFeatureChunk:
    t0_ms: float
    t1_ms: float
    mel: List[float]
    pitch_hz: float
    energy: float


def estimate_speech_seconds(text: str, words_per_minute: int = 150) -> float:
    words = len([w for w in (text or "").split() if w])
    if words == 0:
        return 0.0
    return words / max(1e-6, words_per_minute / 60)


def generate_silence_chunks(duration_sec: float, sample_rate_hz: int = 16000, chunk_ms: int = 40) -> List[PcmChunk]:
    total_samples = int(duration_sec * sample_rate_hz)
    chunk_samples = max(1, int(sample_rate_hz * chunk_ms / 1000))
    chunks: List[PcmChunk] = []
    seq = 0
    for start in range(0, total_samples, chunk_samples):
        end = min(total_samples, start + chunk_samples)
        samples = [0.0] * (end - start)
        t0 = start / sample_rate_hz * 1000
        t1 = end / sample_rate_hz * 1000
        chunks.append(PcmChunk(samples=samples, sample_rate_hz=sample_rate_hz, seq=seq, t0_ms=t0, t1_ms=t1))
        seq += 1
    return chunks


def extract_audio_features(chunks: Iterable[PcmChunk], mel_bins: int = 80) -> List[AudioFeatureChunk]:
    features: List[AudioFeatureChunk] = []
    for chunk in chunks:
        energy = 0.0 if not chunk.samples else sum(s * s for s in chunk.samples) / len(chunk.samples)
        mel = [min(1.0, energy)] * mel_bins
        features.append(AudioFeatureChunk(t0_ms=chunk.t0_ms, t1_ms=chunk.t1_ms, mel=mel, pitch_hz=0.0, energy=energy))
    return features


def _chunks_from_samples(samples: List[float], sample_rate_hz: int, chunk_ms: int) -> List[PcmChunk]:
    chunk_samples = max(1, int(sample_rate_hz * chunk_ms / 1000))
    chunks: List[PcmChunk] = []
    seq = 0
    for start in range(0, len(samples), chunk_samples):
        end = min(len(samples), start + chunk_samples)
        t0 = start / sample_rate_hz * 1000
        t1 = end / sample_rate_hz * 1000
        chunks.append(PcmChunk(samples=samples[start:end], sample_rate_hz=sample_rate_hz, seq=seq, t0_ms=t0, t1_ms=t1))
        seq += 1
    return chunks


def trim_pcm_chunks(chunks: List[PcmChunk], max_duration_ms: float) -> List[PcmChunk]:
    if max_duration_ms <= 0:
        return list(chunks)
    trimmed: List[PcmChunk] = []
    for chunk in chunks:
        if chunk.t0_ms >= max_duration_ms:
            break
        if chunk.t1_ms <= max_duration_ms:
            trimmed.append(chunk)
            continue
        remaining_ms = max_duration_ms - chunk.t0_ms
        if remaining_ms <= 0:
            break
        keep_samples = int(remaining_ms / 1000.0 * chunk.sample_rate_hz)
        if keep_samples <= 0:
            break
        trimmed.append(
            PcmChunk(
                samples=chunk.samples[:keep_samples],
                sample_rate_hz=chunk.sample_rate_hz,
                seq=chunk.seq,
                t0_ms=chunk.t0_ms,
                t1_ms=chunk.t0_ms + (keep_samples / chunk.sample_rate_hz * 1000.0),
            )
        )
        break
    return trimmed


def _wav_bytes_to_chunks(wav_bytes: bytes, chunk_ms: int) -> List[PcmChunk]:
    with wave.open(io.BytesIO(wav_bytes), "rb") as wav:
        sample_rate = wav.getframerate()
        channels = wav.getnchannels()
        width = wav.getsampwidth()
        frames = wav.readframes(wav.getnframes())

    if width == 2:
        data = array.array("h")
        data.frombytes(frames)
        samples = [x / 32768.0 for x in data]
    elif width == 4:
        data = array.array("i")
        data.frombytes(frames)
        samples = [x / 2147483648.0 for x in data]
    else:
        return []

    if channels > 1:
        samples = [samples[i] for i in range(0, len(samples), channels)]

    return _chunks_from_samples(samples, sample_rate, chunk_ms)


def _pcm_bytes_to_chunks(pcm_bytes: bytes, sample_rate_hz: int, chunk_ms: int) -> List[PcmChunk]:
    if not pcm_bytes:
        return []
    if len(pcm_bytes) % 2:
        pcm_bytes = pcm_bytes[:-1]
    data = array.array("h")
    data.frombytes(pcm_bytes)
    samples = [x / 32768.0 for x in data]
    return _chunks_from_samples(samples, sample_rate_hz, chunk_ms)


def write_wav_file(chunks: Iterable[PcmChunk], dest: Path, sample_rate_hz: int = 16000) -> bool:
    chunk_list = list(chunks)
    if not chunk_list:
        return False
    sample_rate = chunk_list[0].sample_rate_hz or sample_rate_hz
    dest.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(dest), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        for chunk in chunk_list:
            pcm = array.array("h", [int(max(-1.0, min(1.0, s)) * 32767) for s in chunk.samples])
            wav_file.writeframes(pcm.tobytes())
    return True


def _ai_kit_tts_chunks(
    *,
    text: str,
    voice: Optional[str],
    response_format: str,
    speed: Optional[float],
    parameters: Optional[dict[str, object]],
    chunk_ms: int,
    ai_kit_client: AiKitClient,
) -> List[PcmChunk]:
    try:
        from ai_kit import SpeechGenerateInput
    except Exception:
        return []

    if not ai_kit_client.enabled or not ai_kit_client.kit:
        return []
    provider = ai_kit_client.provider or ""
    model = ai_kit_client.model or ""
    if not provider or not model:
        return []

    payload = SpeechGenerateInput(
        provider=provider,
        model=model,
        text=text,
        voice=voice,
        responseFormat=response_format,
        speed=speed,
        parameters=parameters,
    )
    try:
        output = ai_kit_client.kit.generate_speech(payload)
    except Exception:
        return []

    try:
        audio_bytes = base64.b64decode(output.data)
    except Exception:
        return []

    mime = (output.mime or "").lower()
    if "wav" in mime or "wave" in mime:
        return _wav_bytes_to_chunks(audio_bytes, chunk_ms)
    if "pcm" in mime:
        sample_rate = 24000
        if parameters:
            raw_rate = parameters.get("sampleRate")
            if isinstance(raw_rate, (int, float)) and raw_rate > 0:
                sample_rate = int(raw_rate)
        return _pcm_bytes_to_chunks(audio_bytes, sample_rate, chunk_ms)
    return []


def generate_tts_chunks(
    text: str,
    duration_hint_sec: float,
    voice: Optional[str] = None,
    sample_rate_hz: int = 16000,
    chunk_ms: int = 40,
    speed: Optional[float] = None,
    instructions: Optional[str] = None,
    ai_kit_client: AiKitClient | None = None,
) -> List[PcmChunk]:
    response_format = os.environ.get("TTS_RESPONSE_FORMAT", "").strip().lower() or "wav"
    parameters: dict[str, object] = {}
    sample_rate_override = os.environ.get("TTS_SAMPLE_RATE", "").strip()
    if sample_rate_override:
        try:
            parameters["sampleRate"] = int(sample_rate_override)
        except ValueError:
            pass
    if instructions:
        parameters["instructions"] = instructions

    if voice is None:
        voice = os.environ.get("TTS_VOICE")
    if ai_kit_client is None:
        return []

    chunks = _ai_kit_tts_chunks(
        text=text,
        voice=voice,
        response_format=response_format,
        speed=speed,
        parameters=parameters or None,
        chunk_ms=chunk_ms,
        ai_kit_client=ai_kit_client,
    )
    return chunks

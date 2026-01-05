from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional, TypedDict


AvSyncMode = Literal["local_encode", "provider_bridge"]
LateFramePolicy = Literal["DROP", "REPEAT_LAST", "DEGRADE_FPS", "TIME_STRETCH_AUDIO"]


class AvSyncPolicy(TypedDict, total=False):
    mode: AvSyncMode
    audio_sample_rate_hz: int
    video_rtp_clock_hz: int
    target_jitter_buffer_ms: int
    max_jitter_buffer_ms: int
    late_frame_policy: LateFramePolicy
    resync_threshold_ms: int


DEFAULT_AVSYNC_POLICY: AvSyncPolicy = {
    "mode": "local_encode",
    "audio_sample_rate_hz": 48_000,
    "video_rtp_clock_hz": 90_000,
    "target_jitter_buffer_ms": 90,
    "max_jitter_buffer_ms": 250,
    "late_frame_policy": "DROP",
    "resync_threshold_ms": 120,
}


def normalize_av_sync_policy(policy: Optional[AvSyncPolicy]) -> AvSyncPolicy:
    merged = dict(DEFAULT_AVSYNC_POLICY)
    if policy:
        merged.update(policy)
    return merged


@dataclass
class AudioMasterClock:
    policy: AvSyncPolicy
    audio_samples_sent: int = 0

    def __init__(self, policy: Optional[AvSyncPolicy] = None) -> None:
        self.policy = normalize_av_sync_policy(policy)
        self.audio_samples_sent = 0

    def get_audio_samples_sent(self) -> int:
        return self.audio_samples_sent

    def push_audio_samples(self, sample_count: int) -> dict:
        if not isinstance(sample_count, (int, float)) or sample_count < 0:
            raise ValueError(f"sample_count must be non-negative; got {sample_count}")
        self.audio_samples_sent += int(sample_count)
        elapsed_audio_sec = self.audio_samples_sent / float(self.policy["audio_sample_rate_hz"])
        video_rtp_ts = round(elapsed_audio_sec * float(self.policy["video_rtp_clock_hz"]))
        return {
            "audio_rtp_ts": self.audio_samples_sent,
            "video_rtp_ts": video_rtp_ts,
            "elapsed_audio_sec": elapsed_audio_sec,
        }

    def compute_video_rtp_timestamp(self) -> int:
        elapsed_audio_sec = self.audio_samples_sent / float(self.policy["audio_sample_rate_hz"])
        return round(elapsed_audio_sec * float(self.policy["video_rtp_clock_hz"]))


def estimate_av_offset_ms(audio_pts_time_ms: float, video_pts_time_ms: float) -> float:
    return float(video_pts_time_ms) - float(audio_pts_time_ms)


def should_resync(av_offset_ms: float, policy: Optional[AvSyncPolicy] = None) -> bool:
    policy_norm = normalize_av_sync_policy(policy)
    return abs(av_offset_ms) >= float(policy_norm["resync_threshold_ms"])


def decide_late_frame(
    now_ms: float,
    expected_send_time_ms: float,
    policy: Optional[AvSyncPolicy] = None,
    late_threshold_ms: Optional[float] = None,
) -> dict:
    policy_norm = normalize_av_sync_policy(policy)
    late_by_ms = now_ms - expected_send_time_ms
    threshold = late_threshold_ms if late_threshold_ms is not None else policy_norm["target_jitter_buffer_ms"]

    if late_by_ms <= threshold:
        return {"late_by_ms": late_by_ms, "decision": "SEND"}

    decision: str = "DROP"
    policy_choice = policy_norm.get("late_frame_policy", "DROP")
    if policy_choice in {"DROP", "REPEAT_LAST", "DEGRADE_FPS", "TIME_STRETCH_AUDIO"}:
        decision = policy_choice

    return {"late_by_ms": late_by_ms, "decision": decision}

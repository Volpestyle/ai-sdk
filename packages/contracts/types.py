"""Shared SDK interfaces for lip-sync reliability components (Python).

These are reference dataclasses / protocols; the actual transport may be gRPC/HTTP.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional, Tuple, Union

CameraMode = Literal["A_SELFIE", "B_MIRROR", "C_CUTAWAY"]

@dataclass
class BackendCapabilities:
    backend_id: str
    supports_rerender_block: bool
    supports_anchor_reset: bool
    supports_mouth_corrector: bool
    supports_viseme_conditioning: bool
    supports_restart_stream: bool
    supports_param_update: bool
    supports_failover: bool
    provides_webRTC_stream: bool

@dataclass
class ROITransform:
    crop_xywh: Tuple[float, float, float, float]
    affine_2x3: Optional[Tuple[float, float, float, float, float, float]] = None
    normalized_size: Optional[Tuple[int, int]] = None

@dataclass
class FaceObservation:
    track_id: str
    bbox_xywh: Tuple[float, float, float, float]
    confidence: float
    pose_yaw_pitch_roll: Optional[Tuple[float, float, float]] = None
    mouth_roi: Optional[ROITransform] = None
    face_roi: Optional[ROITransform] = None
    occlusion_flags: List[str] = field(default_factory=list)

@dataclass
class FaceTrackResult:
    frame_id: str
    timestamp_ms: int
    faces: List[FaceObservation]

@dataclass
class LipSyncScore:
    window_id: str
    score: Optional[float]  # None => silence/unknown
    offset_ms: Optional[float]
    confidence: float
    label: Literal["ok", "warn", "fail", "silence", "occluded", "unknown"]
    debug: Dict[str, Any] = field(default_factory=dict)

LipSyncSignal = LipSyncScore

@dataclass
class DriftSignal:
    identity_similarity: float
    bg_similarity: float
    flicker_score: float
    pose_jitter_deg_per_s: Optional[float] = None

@dataclass
class PlaybackHealth:
    av_offset_ms: float
    late_video_frames_per_s: float
    jitter_buffer_ms: Optional[float] = None

@dataclass
class SystemHealth:
    render_fps: float
    gpu_util: Optional[float] = None
    queue_depth: Optional[int] = None
    p99_block_latency_ms: Optional[float] = None

@dataclass
class TurnContext:
    session_id: str
    persona_id: str
    mode: CameraMode
    remaining_turn_sec: float
    hardcap_turn_sec: float = 30.0

QualityAction = Union[
    Dict[str, Any],  # keep flexible; use TypedDict/attrs in real implementation
]

@dataclass
class QualityDecision:
    actions: List[QualityAction]
    debug: Dict[str, Any] = field(default_factory=dict)

@dataclass
class VisemeEvent:
    start_ms: int
    end_ms: int
    viseme_id: str
    confidence: float

@dataclass
class VisemeTimeline:
    utterance_id: str
    language: str
    source: Literal["tts_alignment", "forced_aligner", "heuristic", "asr_alignment"]
    visemes: List[VisemeEvent]

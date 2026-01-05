from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class ROITransform:
    crop_xywh: Tuple[float, float, float, float]
    affine_2x3: Optional[Tuple[float, float, float, float, float, float]] = None
    normalized_size: Optional[Tuple[int, int]] = None


def _to_xy(point: Any) -> Tuple[float, float]:
    if isinstance(point, (list, tuple)) and len(point) >= 2:
        return float(point[0]), float(point[1])
    if isinstance(point, dict):
        return float(point.get("x", 0)), float(point.get("y", 0))
    return 0.0, 0.0


def _bounds(points: List[Any]) -> Tuple[float, float, float, float]:
    xs: List[float] = []
    ys: List[float] = []
    for p in points:
        x, y = _to_xy(p)
        xs.append(x)
        ys.append(y)
    if not xs or not ys:
        return 0.0, 0.0, 0.0, 0.0
    return min(xs), min(ys), max(xs), max(ys)


def roi_from_landmarks(
    landmarks: List[Any],
    indices: List[int],
    padding_ratio: float = 0.25,
    normalized_size: Tuple[int, int] = (96, 96),
    clamp_to: Optional[Dict[str, int]] = None,
) -> ROITransform:
    selected = [landmarks[i] for i in indices if i < len(landmarks)]
    min_x, min_y, max_x, max_y = _bounds(selected)
    w0 = max(1.0, max_x - min_x)
    h0 = max(1.0, max_y - min_y)
    pad_x = w0 * padding_ratio
    pad_y = h0 * padding_ratio
    x = min_x - pad_x
    y = min_y - pad_y
    w = w0 + 2 * pad_x
    h = h0 + 2 * pad_y

    if clamp_to:
        x = max(0.0, min(x, clamp_to["width"] - 1))
        y = max(0.0, min(y, clamp_to["height"] - 1))
        w = max(1.0, min(w, clamp_to["width"] - x))
        h = max(1.0, min(h, clamp_to["height"] - y))

    W, H = normalized_size
    scale_x = W / w
    scale_y = H / h
    affine = (scale_x, 0.0, -x * scale_x, 0.0, scale_y, -y * scale_y)
    return ROITransform(crop_xywh=(x, y, w, h), affine_2x3=affine, normalized_size=normalized_size)


def smooth_roi(prev: ROITransform, nxt: ROITransform, alpha: float = 0.8) -> ROITransform:
    a = max(0.0, min(1.0, alpha))
    b = 1.0 - a
    x0, y0, w0, h0 = prev.crop_xywh
    x1, y1, w1, h1 = nxt.crop_xywh
    x = x0 * a + x1 * b
    y = y0 * a + y1 * b
    w = w0 * a + w1 * b
    h = h0 * a + h1 * b
    normalized_size = nxt.normalized_size or prev.normalized_size or (96, 96)
    W, H = normalized_size
    scale_x = W / max(1e-6, w)
    scale_y = H / max(1e-6, h)
    affine = (scale_x, 0.0, -x * scale_x, 0.0, scale_y, -y * scale_y)
    return ROITransform(crop_xywh=(x, y, w, h), affine_2x3=affine, normalized_size=normalized_size)


@dataclass
class FaceObservation:
    track_id: str
    bbox_xywh: Tuple[float, float, float, float]
    confidence: float
    pose_yaw_pitch_roll: Optional[Tuple[float, float, float]] = None
    mouth_roi: Optional[ROITransform] = None
    face_roi: Optional[ROITransform] = None
    occlusion_flags: List[str] = None


@dataclass
class FaceTrackResult:
    frame_id: str
    timestamp_ms: int
    faces: List[FaceObservation]


class NoopFaceTrackBackend:
    def init(self, frame: Any, hint: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return {}

    def update(self, frame: Any, state: Dict[str, Any], hint: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        now_ms = int(__import__("time").time() * 1000)
        result = FaceTrackResult(frame_id=str(now_ms), timestamp_ms=now_ms, faces=[])
        return {"result": result, "state": state}


class HeuristicFaceTrackBackend:
    def __init__(
        self,
        mouth_indices: Optional[List[int]] = None,
        face_indices: Optional[List[int]] = None,
        normalized_size: Tuple[int, int] = (96, 96),
        smooth_alpha: float = 0.8,
    ) -> None:
        self.mouth_indices = mouth_indices or list(range(48, 68))
        self.face_indices = face_indices or list(range(17))
        self.normalized_size = normalized_size
        self.smooth_alpha = smooth_alpha

    def init(self, frame: Any, hint: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return {"track_id": f"track_{int(__import__('time').time() * 1000)}"}

    def update(self, frame: Any, state: Dict[str, Any], hint: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        now_ms = int(getattr(frame, "timestamp_ms", None) or __import__("time").time() * 1000)
        faces = getattr(frame, "faces", None) or frame.get("faces", []) if isinstance(frame, dict) else []
        if not faces:
            return {"result": FaceTrackResult(frame_id=str(now_ms), timestamp_ms=now_ms, faces=[]), "state": state}
        primary = max(faces, key=lambda f: f.get("confidence", 0.0))
        bbox = primary.get("bbox_xywh") or primary.get("bbox")
        clamp_to = None
        dims = frame.get("dimensions") if isinstance(frame, dict) else None
        if dims and len(dims) == 2:
            clamp_to = {"width": dims[0], "height": dims[1]}

        mouth_roi = None
        if primary.get("mouth_landmarks"):
            mouth_roi = roi_from_landmarks(
                primary["mouth_landmarks"],
                list(range(len(primary["mouth_landmarks"]))),
                normalized_size=self.normalized_size,
                clamp_to=clamp_to,
            )
        elif primary.get("landmarks"):
            mouth_roi = roi_from_landmarks(
                primary["landmarks"],
                self.mouth_indices,
                normalized_size=self.normalized_size,
                clamp_to=clamp_to,
            )

        face_roi = None
        if primary.get("face_landmarks"):
            face_roi = roi_from_landmarks(
                primary["face_landmarks"],
                list(range(len(primary["face_landmarks"]))),
                normalized_size=self.normalized_size,
                clamp_to=clamp_to,
            )
        elif primary.get("landmarks"):
            face_roi = roi_from_landmarks(
                primary["landmarks"],
                self.face_indices,
                normalized_size=self.normalized_size,
                clamp_to=clamp_to,
            )

        if bbox and not mouth_roi:
            mouth_roi = roi_from_landmarks(
                [(bbox[0], bbox[1]), (bbox[0] + bbox[2], bbox[1] + bbox[3])],
                [0, 1],
                normalized_size=self.normalized_size,
            )
        if bbox and not face_roi:
            face_roi = roi_from_landmarks(
                [(bbox[0], bbox[1]), (bbox[0] + bbox[2], bbox[1] + bbox[3])],
                [0, 1],
                normalized_size=self.normalized_size,
            )

        if state.get("prev_mouth_roi") and mouth_roi:
            mouth_roi = smooth_roi(state["prev_mouth_roi"], mouth_roi, self.smooth_alpha)
        if state.get("prev_face_roi") and face_roi:
            face_roi = smooth_roi(state["prev_face_roi"], face_roi, self.smooth_alpha)

        obs = FaceObservation(
            track_id=primary.get("track_id") or state.get("track_id") or f"track_{now_ms}",
            bbox_xywh=tuple(bbox) if bbox else (0.0, 0.0, 0.0, 0.0),
            confidence=float(primary.get("confidence", 0.5)),
            pose_yaw_pitch_roll=tuple(primary.get("pose_yaw_pitch_roll")) if primary.get("pose_yaw_pitch_roll") else None,
            mouth_roi=mouth_roi,
            face_roi=face_roi,
            occlusion_flags=primary.get("occlusion_flags") or [],
        )
        result = FaceTrackResult(frame_id=str(now_ms), timestamp_ms=now_ms, faces=[obs])
        return {
            "result": result,
            "state": {"track_id": obs.track_id, "prev_mouth_roi": mouth_roi, "prev_face_roi": face_roi},
        }

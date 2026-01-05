from __future__ import annotations

from typing import Dict, List, Optional


DEFAULT_DRIFT_THRESHOLDS = {
    "identity_warn": 0.84,
    "identity_fail": 0.74,
    "bg_warn": 0.8,
    "bg_fail": 0.7,
    "flicker_warn": 0.4,
    "flicker_fail": 0.6,
}


def cosine_similarity(a: List[float], b: List[float]) -> float:
    if not a or not b:
        return 0.0
    n = min(len(a), len(b))
    dot = 0.0
    norm_a = 0.0
    norm_b = 0.0
    for i in range(n):
        dot += a[i] * b[i]
        norm_a += a[i] * a[i]
        norm_b += b[i] * b[i]
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / ((norm_a ** 0.5) * (norm_b ** 0.5))


def max_similarity(embedding: List[float], refs: List[List[float]]) -> float:
    if not refs:
        return 0.0
    best = float("-inf")
    for ref in refs:
        sim = cosine_similarity(embedding, ref)
        if sim > best:
            best = sim
    return 0.0 if best == float("-inf") else best


def flicker_score(prev: List[float], nxt: List[float]) -> float:
    if not prev or not nxt:
        return 0.0
    n = min(len(prev), len(nxt))
    if n == 0:
        return 0.0
    diff = sum(abs(prev[i] - nxt[i]) for i in range(n))
    return diff / n


def score_frame(
    face_embedding: Optional[List[float]] = None,
    bg_embedding: Optional[List[float]] = None,
    prev_frame_luma: Optional[List[float]] = None,
    frame_luma: Optional[List[float]] = None,
    refs: Optional[Dict[str, List[List[float]]]] = None,
) -> Dict[str, float]:
    refs = refs or {}
    identity = max_similarity(face_embedding, refs.get("face_embeddings", [])) if face_embedding else 0.0
    bg = max_similarity(bg_embedding, refs.get("bg_embeddings", [])) if bg_embedding else 0.0
    flicker = flicker_score(prev_frame_luma, frame_luma) if prev_frame_luma and frame_luma else 0.0
    return {"identity_similarity": identity, "bg_similarity": bg, "flicker_score": flicker}


def classify_drift(signal: Dict[str, float], thresholds: Optional[Dict[str, float]] = None) -> Dict[str, str]:
    t = dict(DEFAULT_DRIFT_THRESHOLDS)
    if thresholds:
        t.update(thresholds)
    identity = "fail" if signal["identity_similarity"] < t["identity_fail"] else (
        "warn" if signal["identity_similarity"] < t["identity_warn"] else "ok"
    )
    background = "fail" if signal["bg_similarity"] < t["bg_fail"] else (
        "warn" if signal["bg_similarity"] < t["bg_warn"] else "ok"
    )
    flicker = "fail" if signal["flicker_score"] > t["flicker_fail"] else (
        "warn" if signal["flicker_score"] > t["flicker_warn"] else "ok"
    )
    return {"identity": identity, "background": background, "flicker": flicker}


def update_drift_trend(prev: Optional[Dict[str, float]], signal: Dict[str, float], alpha: float = 0.8) -> Dict[str, float]:
    a = max(0.0, min(1.0, alpha))
    b = 1.0 - a
    return {
        "identity_avg": (prev.get("identity_avg", signal["identity_similarity"]) if prev else signal["identity_similarity"]) * a
        + signal["identity_similarity"] * b,
        "bg_avg": (prev.get("bg_avg", signal["bg_similarity"]) if prev else signal["bg_similarity"]) * a
        + signal["bg_similarity"] * b,
        "flicker_avg": (prev.get("flicker_avg", signal["flicker_score"]) if prev else signal["flicker_score"]) * a
        + signal["flicker_score"] * b,
    }


def recommend_action(bands: Dict[str, str]) -> Dict[str, str]:
    if bands["identity"] == "fail" or bands["background"] == "fail":
        return {"action": "RERENDER_BLOCK", "reason": "identity_or_background_fail"}
    if bands["flicker"] == "fail":
        return {"action": "FORCE_ANCHOR_RESET", "reason": "flicker_fail"}
    if bands["identity"] == "warn" or bands["background"] == "warn" or bands["flicker"] == "warn":
        return {"action": "STRENGTHEN_ANCHOR", "reason": "warn"}
    return {"action": "NONE", "reason": "ok"}

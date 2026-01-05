from __future__ import annotations

from typing import Dict, List, Optional


def _mean(xs: List[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def _variance(xs: List[float], mu: float) -> float:
    if not xs:
        return 0.0
    return sum((x - mu) ** 2 for x in xs) / len(xs)


def _pearson_correlation(a: List[float], b: List[float]) -> float:
    if len(a) != len(b) or len(a) < 3:
        return 0.0
    mu_a = _mean(a)
    mu_b = _mean(b)
    var_a = _variance(a, mu_a)
    var_b = _variance(b, mu_b)
    denom = (var_a * var_b) ** 0.5
    if denom == 0:
        return 0.0
    cov = sum((a[i] - mu_a) * (b[i] - mu_b) for i in range(len(a))) / len(a)
    corr = cov / denom
    if not isinstance(corr, (int, float)):
        return 0.0
    return max(-1.0, min(1.0, corr))


def _aligned_overlap(a: List[float], b: List[float], shift_steps: int) -> tuple[List[float], List[float]]:
    n = min(len(a), len(b))
    if n == 0:
        return [], []
    start_a = 0
    start_b = 0
    length = n
    if shift_steps > 0:
        start_b = shift_steps
        length = n - shift_steps
    elif shift_steps < 0:
        start_a = -shift_steps
        length = n + shift_steps
    if length <= 2:
        return [], []
    return a[start_a : start_a + length], b[start_b : start_b + length]


def _clamp01(value: float) -> float:
    if not isinstance(value, (int, float)):
        return 0.0
    return max(0.0, min(1.0, value))


def score_heuristic_window(
    window_id: str,
    audio_envelope: List[float],
    mouth_open: List[float],
    step_ms: float,
    max_offset_ms: float = 200,
    offset_step_ms: float = 20,
    silence_threshold: float = 1e-3,
    lip_warn: float = 0.55,
    lip_fail: float = 0.45,
) -> Dict[str, object]:
    if not window_id:
        raise ValueError("window_id is required")
    if len(audio_envelope) != len(mouth_open):
        raise ValueError("audio_envelope and mouth_open must be same length")
    if not isinstance(step_ms, (int, float)) or step_ms <= 0:
        raise ValueError("step_ms must be > 0")

    avg_energy = _mean(audio_envelope)
    if avg_energy < silence_threshold:
        return {
            "window_id": window_id,
            "score": None,
            "offset_ms": None,
            "confidence": 0.0,
            "label": "silence",
            "debug": {"avg_energy": avg_energy},
        }

    max_shift_steps = max(1, round(max_offset_ms / step_ms))
    shift_step = max(1, round(offset_step_ms / step_ms))
    corr_by_offset: Dict[str, float] = {}
    best = {"corr": float("-inf"), "shift": 0}
    second = {"corr": float("-inf"), "shift": 0}

    for shift in range(-max_shift_steps, max_shift_steps + 1, shift_step):
        a_aligned, b_aligned = _aligned_overlap(audio_envelope, mouth_open, shift)
        corr = _pearson_correlation(a_aligned, b_aligned)
        corr_by_offset[str(round(shift * step_ms))] = corr
        if corr > best["corr"]:
            second = best
            best = {"corr": corr, "shift": shift}
        elif corr > second["corr"]:
            second = {"corr": corr, "shift": shift}

    best_corr = best["corr"] if isinstance(best["corr"], (int, float)) else 0.0
    second_corr = second["corr"] if isinstance(second["corr"], (int, float)) else 0.0
    margin = best_corr - second_corr

    score = _clamp01((best_corr + 1.0) / 2.0)
    offset_ms = best["shift"] * step_ms
    confidence = _clamp01(margin / 0.25)

    if confidence < 0.15:
        label = "unknown"
    elif score >= lip_warn:
        label = "ok"
    elif score >= lip_fail:
        label = "warn"
    else:
        label = "fail"

    return {
        "window_id": window_id,
        "score": score,
        "offset_ms": offset_ms,
        "confidence": confidence,
        "label": label,
        "debug": {
            "avg_energy": avg_energy,
            "best_corr": best_corr,
            "second_best_corr": second_corr,
            "margin": margin,
            "step_ms": step_ms,
            "corr_by_offset_ms": corr_by_offset,
        },
    }

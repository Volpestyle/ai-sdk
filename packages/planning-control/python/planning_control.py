from __future__ import annotations

import json
import math
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional


DEFAULT_BUDGET = {
    "hardcap_sec": 10,
    "min_target_sec": 4,
    "default_target_range_sec": (5, 10),
    "tail_buffer_sec": 0.6,
}

CAMERA_MODES = ["A_SELFIE", "B_MIRROR", "C_CUTAWAY"]


@dataclass
class TurnPlanResult:
    response_text: str
    plan: Dict[str, Any]
    warnings: List[str]


def _schema_path() -> Path:
    return Path(__file__).resolve().parents[1] / "schemas" / "turn_plan.schema.json"


def load_turn_plan_schema() -> Dict[str, Any]:
    schema = json.loads(_schema_path().read_text("utf-8"))
    return _apply_budget_to_schema(schema, turn_budget())


def _env_float(key: str, default: float) -> float:
    raw = (os.environ.get(key) or "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def turn_budget() -> Dict[str, Any]:
    base = dict(DEFAULT_BUDGET)
    hardcap = _env_float("FT_GEN_MAX_VIDEO_SEC", float(base["hardcap_sec"]))
    min_target = _env_float("FT_GEN_MIN_VIDEO_SEC", float(base["min_target_sec"]))
    default_min = _env_float("FT_GEN_DEFAULT_VIDEO_SEC", float(base["default_target_range_sec"][0]))
    default_max = _env_float("FT_GEN_DEFAULT_MAX_VIDEO_SEC", float(base["default_target_range_sec"][1]))

    hardcap = max(1.0, hardcap)
    default_max = min(default_max, hardcap)
    default_min = min(default_min, default_max)
    min_target = min(min_target, hardcap)

    base["hardcap_sec"] = hardcap
    base["min_target_sec"] = min_target
    base["default_target_range_sec"] = (default_min, default_max)
    return base


def _apply_budget_to_schema(schema: Dict[str, Any], budget: Dict[str, Any]) -> Dict[str, Any]:
    hardcap = float(budget["hardcap_sec"])
    properties = schema.get("properties") or {}
    target = properties.get("speech_budget_sec_target") or {}
    hardcap_prop = properties.get("speech_budget_sec_hardcap") or {}
    target["maximum"] = hardcap
    hardcap_prop["const"] = hardcap
    properties["speech_budget_sec_target"] = target
    properties["speech_budget_sec_hardcap"] = hardcap_prop
    schema["properties"] = properties
    return schema


def estimate_speech_seconds(
    text: str,
    words_per_minute: float = 150,
    language: str = "en",
    pause_per_comma_sec: float = 0.18,
    pause_per_sentence_sec: float = 0.38,
    pause_per_newline_sec: float = 0.5,
) -> float:
    cleaned = (text or "").strip()
    if not cleaned:
        return 0.0
    wpm = words_per_minute
    if language != "en" and words_per_minute == 150:
        wpm = 140
    words = len([w for w in re.split(r"\s+", cleaned) if w])
    speech_core = words / max(1e-6, wpm / 60)
    comma_count = cleaned.count(",")
    sentence_count = len(re.findall(r"[.!?](?=\s|$)", cleaned))
    newline_count = len(re.findall(r"\n+", cleaned))
    pauses = comma_count * pause_per_comma_sec + sentence_count * pause_per_sentence_sec + newline_count * pause_per_newline_sec
    return max(0.0, speech_core + pauses)


def split_sentences(text: str) -> List[str]:
    cleaned = (text or "").strip()
    if not cleaned:
        return []
    out: List[str] = []
    buf = ""
    for ch in cleaned:
        buf += ch
        if ch in ".!?":
            out.append(buf.strip())
            buf = ""
    if buf.strip():
        out.append(buf.strip())
    return [s for s in out if s]


def split_into_segments(text: str, max_words: int = 28, max_segments: int = 8) -> List[str]:
    segments: List[str] = []
    current = ""
    current_words = 0
    for sentence in split_sentences(text):
        if len(segments) >= max_segments:
            break
        count = len(sentence.split())
        if not current:
            current = sentence
            current_words = count
            continue
        if current_words + count <= max_words:
            current = f"{current} {sentence}"
            current_words += count
        else:
            segments.append(current.strip())
            current = sentence
            current_words = count
    if current.strip() and len(segments) < max_segments:
        segments.append(current.strip())
    return segments


def choose_target_seconds(estimated: float, budget: Dict[str, Any]) -> float:
    min_default, max_default = budget["default_target_range_sec"]
    if estimated <= 0:
        return budget["min_target_sec"]
    if estimated < budget["min_target_sec"]:
        return max(1, estimated)
    return min(max_default, max(min_default, estimated))


def create_heuristic_turn_plan(response_text: str, camera_mode: str = "A_SELFIE") -> Dict[str, Any]:
    budget = turn_budget()
    segments = split_into_segments(response_text)
    speech_segments = []
    for idx, text in enumerate(segments):
        speech_segments.append({
            "priority": idx,
            "text": text,
            "est_sec": estimate_speech_seconds(text),
        })
    total_est = sum(seg.get("est_sec", 0) for seg in speech_segments)
    target = choose_target_seconds(total_est, budget)

    actor_timeline = [
        {
            "t0": 0,
            "t1": 0.35,
            "state": "listening",
            "emotion": "neutral",
            "intensity": 0.2,
            "gaze_mode": "to_camera",
            "blink_rate": 0.3,
        },
        {
            "t0": 0.35,
            "t1": min(target, budget["hardcap_sec"]),
            "state": "speaking",
            "emotion": "friendly",
            "intensity": 0.55,
            "gaze_mode": "to_camera",
            "blink_rate": 0.25,
        },
    ]

    return {
        "speech_budget_sec_target": target,
        "speech_budget_sec_hardcap": budget["hardcap_sec"],
        "speech_segments": speech_segments,
        "actor_timeline": actor_timeline,
        "camera_mode_suggestion": camera_mode,
    }


def validate_turn_plan(plan: Dict[str, Any]) -> List[str]:
    errors: List[str] = []
    if not isinstance(plan, dict):
        return ["plan must be an object"]

    target = plan.get("speech_budget_sec_target")
    hardcap = plan.get("speech_budget_sec_hardcap")
    expected_hardcap = turn_budget()["hardcap_sec"]
    if not isinstance(target, (int, float)) or not math.isfinite(target) or target <= 0:
        errors.append("speech_budget_sec_target must be a positive number")
    if hardcap != expected_hardcap:
        errors.append(f"speech_budget_sec_hardcap must be {expected_hardcap:g}")
    if isinstance(target, (int, float)) and isinstance(hardcap, (int, float)) and target > hardcap:
        errors.append("speech_budget_sec_target must be <= speech_budget_sec_hardcap")

    segments = plan.get("speech_segments")
    if not isinstance(segments, list) or not segments:
        errors.append("speech_segments must be a non-empty array")
    if isinstance(segments, list):
        for idx, seg in enumerate(segments):
            if not isinstance(seg, dict):
                errors.append(f"speech_segments[{idx}] must be an object")
                continue
            priority = seg.get("priority")
            if not isinstance(priority, int) or priority < 0:
                errors.append(f"speech_segments[{idx}].priority must be an integer >= 0")
            text = seg.get("text")
            if not isinstance(text, str) or not text.strip():
                errors.append(f"speech_segments[{idx}].text must be a non-empty string")
            est_sec = seg.get("est_sec")
            if est_sec is not None and (
                not isinstance(est_sec, (int, float)) or not math.isfinite(est_sec) or est_sec < 0
            ):
                errors.append(f"speech_segments[{idx}].est_sec must be a non-negative number when present")

    timeline = plan.get("actor_timeline")
    if not isinstance(timeline, list):
        errors.append("actor_timeline must be an array")
    if isinstance(timeline, list):
        for idx, ev in enumerate(timeline):
            if not isinstance(ev, dict):
                errors.append(f"actor_timeline[{idx}] must be an object")
                continue
            state = ev.get("state")
            if state is not None and state not in ("listening", "speaking"):
                errors.append(f"actor_timeline[{idx}].state must be 'listening' or 'speaking' when present")
            intensity = ev.get("intensity")
            if intensity is not None and (not isinstance(intensity, (int, float)) or not math.isfinite(intensity)):
                errors.append(f"actor_timeline[{idx}].intensity must be a number when present")

    camera_mode = plan.get("camera_mode_suggestion")
    if camera_mode is not None and not isinstance(camera_mode, str):
        errors.append("camera_mode_suggestion must be a string when present")
    return errors


def clamp_turn_plan(plan: Dict[str, Any]) -> TurnPlanResult:
    warnings: List[str] = []
    budget = turn_budget()
    hardcap = budget["hardcap_sec"]
    max_exec = hardcap - budget["tail_buffer_sec"]

    target = plan.get("speech_budget_sec_target", budget["min_target_sec"])
    if not isinstance(target, (int, float)) or target <= 0:
        target = budget["min_target_sec"]
        warnings.append("invalid target reset")
    target = min(max_exec, max(1, float(target)))

    segments = plan.get("speech_segments") or []
    segments = sorted(segments, key=lambda s: s.get("priority", 0))

    normalized = []
    for seg in segments:
        text = str(seg.get("text", "")).strip() or "..."
        est_sec = seg.get("est_sec")
        if not isinstance(est_sec, (int, float)) or est_sec < 0:
            est_sec = estimate_speech_seconds(text)
            warnings.append("segment est_sec recomputed")
        normalized.append({"priority": seg.get("priority", 0), "text": text, "est_sec": est_sec})

    included = []
    cum = 0.0
    for seg in normalized:
        seg_sec = float(seg.get("est_sec", 0))
        if included and cum + seg_sec > max_exec:
            break
        included.append(seg)
        cum += seg_sec
        if cum >= target:
            break

    actor_timeline = plan.get("actor_timeline") or []
    if not actor_timeline:
        actor_timeline = [{"t0": 0, "t1": cum or target, "state": "speaking", "emotion": "neutral", "intensity": 0.3}]
        warnings.append("actor_timeline defaulted")

    camera_mode = plan.get("camera_mode_suggestion") or "A_SELFIE"
    if camera_mode not in CAMERA_MODES:
        camera_mode = "A_SELFIE"
        warnings.append("camera_mode clamped")

    output = {
        "speech_budget_sec_target": min(cum or target, max_exec),
        "speech_budget_sec_hardcap": hardcap,
        "speech_segments": included,
        "actor_timeline": actor_timeline,
        "camera_mode_suggestion": camera_mode,
    }

    response_text = " ".join([seg["text"] for seg in included])
    return TurnPlanResult(response_text=response_text, plan=output, warnings=warnings)


def build_turn_plan_prompt(user_text: str, persona: Optional[Dict[str, str]] = None, camera_mode: str = "A_SELFIE") -> Dict[str, str]:
    budget = turn_budget()
    schema_text = json.dumps(load_turn_plan_schema(), indent=2, sort_keys=True)
    persona_name = persona.get("name") if persona else None
    persona_style = persona.get("style") if persona else None

    system = "\n".join([
        "You are a planning engine that outputs STRICT JSON only.",
        "Produce a TurnPlan that matches the provided JSON schema exactly.",
        f"Constraints: hardcap={budget['hardcap_sec']:g}s, default ~{budget['default_target_range_sec'][0]:g}s, allow up to {budget['default_target_range_sec'][1]:g}s, minimum {budget['min_target_sec']:g}s unless ultra-short.",
        f"Camera modes: {', '.join(CAMERA_MODES)}.",
        "Speech segments must be ordered by priority (0 is highest priority).",
        "Never cut mid-segment; segments should be safe boundaries.",
        "Actor timeline should include listening->speaking transitions and reasonable emotion/gaze hints.",
        "",
        "TURN PLAN JSON SCHEMA:",
        schema_text,
    ])

    user_lines = [
        f"Persona: {persona_name or '(unspecified)'}",
        f"Style: {persona_style or '(unspecified)'}",
        f"Camera mode suggestion: {camera_mode}",
        "",
        "User message:",
        user_text,
    ]

    return {"system": system, "user": "\n".join(user_lines)}

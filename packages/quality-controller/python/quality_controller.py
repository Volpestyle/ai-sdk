from __future__ import annotations

from typing import Dict, List, Optional


DEFAULT_QUALITY_POLICY = {
    "lip_warn": 0.55,
    "lip_fail": 0.45,
    "lip_fail_consecutive": 3,
    "drift_warn_identity": 0.8,
    "drift_fail_identity": 0.72,
    "av_offset_warn_ms": 80,
    "av_offset_fail_ms": 140,
    "cooldown_ms_heavy_action": 1500,
    "ok_consecutive_to_recover": 8,
}


def create_initial_controller_state() -> Dict[str, int]:
    return {
        "lip_fail_streak": 0,
        "lip_ok_streak": 0,
        "drift_fail_streak": 0,
        "overall_ok_streak": 0,
        "degrade_level": 0,
        "last_heavy_action_ms": 0,
    }


def normalize_quality_policy(policy: Optional[Dict[str, float]] = None) -> Dict[str, float]:
    merged = dict(DEFAULT_QUALITY_POLICY)
    if policy:
        merged.update(policy)
    return merged


def _cooldown_ready(state: Dict[str, int], now_ms: int, policy: Dict[str, float]) -> bool:
    return now_ms - state["last_heavy_action_ms"] >= policy["cooldown_ms_heavy_action"]


def _contains_heavy_action(actions: List[Dict[str, object]]) -> bool:
    heavy = {
        "RESTART_PROVIDER_STREAM",
        "FAILOVER_BACKEND",
        "FALLBACK_OFFLINE_CLIP",
        "FORCE_ANCHOR_RESET",
        "RERENDER_BLOCK",
    }
    return any(str(action.get("type")) in heavy for action in actions)


def decide(
    caps: Dict[str, object],
    lipsync: Optional[Dict[str, object]] = None,
    drift: Optional[Dict[str, object]] = None,
    playback: Optional[Dict[str, object]] = None,
    system: Optional[Dict[str, object]] = None,
    ctx: Optional[Dict[str, object]] = None,
    policy: Optional[Dict[str, float]] = None,
    state: Optional[Dict[str, int]] = None,
    now_ms: Optional[int] = None,
    options: Optional[Dict[str, object]] = None,
) -> Dict[str, object]:
    policy = normalize_quality_policy(policy)
    now_ms = int(now_ms or __import__("time").time() * 1000)
    state = dict(state or create_initial_controller_state())
    options = options or {}
    debug: Dict[str, object] = {}

    lipsync = lipsync or {}
    drift = drift or {}
    playback = playback or {}
    system = system or {}

    lip_band = "ignore"
    if lipsync.get("is_silence") or lipsync.get("score") is None:
        lip_band = "ignore"
        debug["lip_ignore_reason"] = "silence"
    elif lipsync.get("occluded"):
        lip_band = "ignore"
        debug["lip_ignore_reason"] = "occluded"
    elif isinstance(lipsync.get("score"), (int, float)):
        confidence = lipsync.get("confidence", 1)
        if confidence < 0.2:
            lip_band = "ignore"
            debug["lip_ignore_reason"] = "low_confidence"
        elif lipsync["score"] < policy["lip_fail"]:
            lip_band = "fail"
        elif lipsync["score"] < policy["lip_warn"]:
            lip_band = "warn"
        else:
            lip_band = "ok"
    else:
        lip_band = "ignore"
        debug["lip_ignore_reason"] = "missing_score"

    drift_band = "ignore"
    if isinstance(drift.get("identity_similarity"), (int, float)):
        if drift["identity_similarity"] < policy["drift_fail_identity"]:
            drift_band = "fail"
        elif drift["identity_similarity"] < policy["drift_warn_identity"]:
            drift_band = "warn"
        else:
            drift_band = "ok"

    playback_band = "ignore"
    if isinstance(playback.get("av_offset_ms"), (int, float)):
        abs_offset = abs(playback["av_offset_ms"])
        if abs_offset >= policy["av_offset_fail_ms"]:
            playback_band = "fail"
        elif abs_offset >= policy["av_offset_warn_ms"]:
            playback_band = "warn"
        else:
            playback_band = "ok"
        debug["playback_abs_offset_ms"] = abs_offset

    system_band = "ignore"
    if isinstance(system.get("render_fps"), (int, float)):
        if system["render_fps"] < 20:
            system_band = "fail"
        elif system["render_fps"] < 26:
            system_band = "warn"
        else:
            system_band = "ok"

    debug["bands"] = {"lip": lip_band, "drift": drift_band, "playback": playback_band, "system": system_band}

    if lip_band == "fail":
        state["lip_fail_streak"] += 1
        state["lip_ok_streak"] = 0
    elif lip_band == "ok":
        state["lip_ok_streak"] += 1
        state["lip_fail_streak"] = 0
    else:
        state["lip_ok_streak"] = 0

    if drift_band == "fail":
        state["drift_fail_streak"] += 1
    elif drift_band == "ok":
        state["drift_fail_streak"] = 0

    any_fail = lip_band == "fail" or drift_band == "fail" or playback_band == "fail" or system_band == "fail"
    all_ok = all(
        band in {"ok", "ignore"} for band in (lip_band, drift_band, playback_band, system_band)
    )

    if all_ok:
        state["overall_ok_streak"] += 1
    else:
        state["overall_ok_streak"] = 0

    actions: List[Dict[str, object]] = []
    sustained_lip_fail = lip_band == "fail" and state["lip_fail_streak"] >= policy["lip_fail_consecutive"]
    sustained_drift_fail = drift_band == "fail" and state["drift_fail_streak"] >= 2
    can_do_heavy = _cooldown_ready(state, now_ms, policy)

    if playback_band == "fail" and can_do_heavy:
        if caps.get("supports_restart_stream"):
            actions.append({"type": "RESTART_PROVIDER_STREAM"})
        elif caps.get("supports_failover") and options.get("failover_backend_id"):
            actions.append({"type": "FAILOVER_BACKEND", "backend_id": options["failover_backend_id"]})
        else:
            actions.append({"type": "REDUCE_FPS", "target_fps": 24})
            remaining = min(6, ctx.get("remaining_turn_sec", 6) if ctx else 6)
            actions.append({"type": "SHORTEN_REMAINING_TURN", "target_sec": remaining})

    if sustained_lip_fail:
        if caps.get("supports_mouth_corrector"):
            actions.append({"type": "APPLY_MOUTH_CORRECTOR", "window": "last_block"})
        elif caps.get("supports_rerender_block"):
            actions.append({"type": "RERENDER_BLOCK", "strengthen_anchor": True})
        elif caps.get("supports_restart_stream") and can_do_heavy:
            actions.append({"type": "RESTART_PROVIDER_STREAM"})
        elif caps.get("supports_failover") and options.get("failover_backend_id") and can_do_heavy:
            actions.append({"type": "FAILOVER_BACKEND", "backend_id": options["failover_backend_id"]})

    if sustained_drift_fail and can_do_heavy:
        if caps.get("supports_anchor_reset"):
            actions.append({"type": "FORCE_ANCHOR_RESET"})
        elif caps.get("supports_restart_stream"):
            actions.append({"type": "RESTART_PROVIDER_STREAM"})
        elif caps.get("supports_failover") and options.get("failover_backend_id"):
            actions.append({"type": "FAILOVER_BACKEND", "backend_id": options["failover_backend_id"]})

    degrade_fps_targets = options.get("degrade_fps_targets") or [30, 24, 20, 15]
    degrade_short_targets = options.get("degrade_short_side_targets") or [720, 640, 512, 384]
    should_increase_degrade = any_fail or (system_band == "warn" and state["degrade_level"] < 3)
    if should_increase_degrade:
        state["degrade_level"] = min(3, state["degrade_level"] + 1)

    if state["degrade_level"] > 0:
        target_fps = degrade_fps_targets[state["degrade_level"]] if state["degrade_level"] < len(degrade_fps_targets) else degrade_fps_targets[-1]
        target_short = degrade_short_targets[state["degrade_level"]] if state["degrade_level"] < len(degrade_short_targets) else degrade_short_targets[-1]
        if not any(action["type"] in {"RESTART_PROVIDER_STREAM", "FAILOVER_BACKEND"} for action in actions):
            actions.append({"type": "REDUCE_FPS", "target_fps": target_fps})
            actions.append({"type": "REDUCE_RESOLUTION", "target_short_side": target_short})

    if state["degrade_level"] > 0 and state["overall_ok_streak"] >= policy["ok_consecutive_to_recover"]:
        state["degrade_level"] = max(0, state["degrade_level"] - 1)
        state["overall_ok_streak"] = 0

    if _contains_heavy_action(actions):
        state["last_heavy_action_ms"] = now_ms

    debug["state_after"] = dict(state)
    debug["sustained"] = {"lip": sustained_lip_fail, "drift": sustained_drift_fail, "canDoHeavy": can_do_heavy}
    debug["inputs"] = {
        "lipsync": {"score": lipsync.get("score"), "confidence": lipsync.get("confidence"), "offset_ms": lipsync.get("offset_ms")},
        "drift": {"identity_similarity": drift.get("identity_similarity")},
        "playback": {"av_offset_ms": playback.get("av_offset_ms")},
        "system": {"render_fps": system.get("render_fps")},
    }

    return {"actions": actions, "state": state, "debug": debug}

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional


CAMERA_MODES = ["A_SELFIE", "B_MIRROR", "C_CUTAWAY"]

DEFAULT_ANCHOR_REFRESH_POLICY = {
    "refresh_every_turns": 8,
    "drift_fail_threshold": 0.74,
    "drift_warn_threshold": 0.84,
    "flicker_fail_threshold": 0.6,
}


def _schema_path() -> Path:
    return Path(__file__).resolve().parents[1] / "schemas" / "persona_pack.schema.json"


def read_persona_pack_schema_text() -> str:
    return _schema_path().read_text("utf-8")


def read_persona_pack_schema_json() -> Dict[str, Any]:
    return json.loads(read_persona_pack_schema_text())


def validate_persona_pack(pack: Any) -> Dict[str, Any]:
    errors: List[str] = []
    if pack is None or not isinstance(pack, dict):
        errors.append("pack must be an object")
        return {"ok": False, "errors": errors}

    if not isinstance(pack.get("persona_id"), str) or not pack.get("persona_id"):
        errors.append("persona_id must be a string")
    if not isinstance(pack.get("version"), str) or not pack.get("version"):
        errors.append("version must be a string")
    if not isinstance(pack.get("anchor_sets"), dict):
        errors.append("anchor_sets must be an object")
    if not isinstance(pack.get("identity"), dict):
        errors.append("identity must be an object")
    if not isinstance(pack.get("style"), dict):
        errors.append("style must be an object")
    if not isinstance(pack.get("behavior_policy"), dict):
        errors.append("behavior_policy must be an object")

    anchor_sets = pack.get("anchor_sets")
    if isinstance(anchor_sets, dict):
        for mode, anchors in anchor_sets.items():
            if not isinstance(anchors, list) or len(anchors) == 0:
                errors.append(f"anchor_sets.{mode} must be a non-empty array")
                continue
            for idx, anchor in enumerate(anchors):
                if not isinstance(anchor, dict) or not anchor.get("image_ref"):
                    errors.append(f"anchor_sets.{mode}[{idx}].image_ref is required")

    return {"ok": len(errors) == 0, "errors": errors}


def get_anchor_set(pack: Dict[str, Any], mode: str) -> List[Dict[str, Any]]:
    anchor_sets = pack.get("anchor_sets") if isinstance(pack, dict) else None
    if isinstance(anchor_sets, dict) and mode in anchor_sets:
        anchors = anchor_sets.get(mode)
        return anchors if isinstance(anchors, list) else []
    if isinstance(anchor_sets, dict):
        for anchors in anchor_sets.values():
            if isinstance(anchors, list):
                return anchors
    return []


def select_canonical_anchor(anchors: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not anchors:
        return None
    canonical = next(
        (anchor for anchor in anchors if "canonical" in (anchor.get("metadata", {}).get("best_for") or [])),
        None,
    )
    if canonical:
        return canonical
    fallback = next(
        (anchor for anchor in anchors if "default" in (anchor.get("metadata", {}).get("best_for") or [])),
        None,
    )
    return fallback or anchors[0]


def score_anchor(anchor: Dict[str, Any], desired_emotion: Optional[str]) -> float:
    score = 0.0
    if desired_emotion:
        desired = desired_emotion.lower()
        expression = anchor.get("metadata", {}).get("expression_tag")
        if isinstance(expression, str) and expression.lower() == desired:
            score += 2.0
        best_for = anchor.get("metadata", {}).get("best_for") or []
        if any(isinstance(tag, str) and tag.lower() == desired for tag in best_for):
            score += 1.0
    best_for = anchor.get("metadata", {}).get("best_for") or []
    if "canonical" in best_for:
        score += 0.25
    return score


def should_refresh_anchor(args: Dict[str, Any]) -> Dict[str, Any]:
    policy = dict(DEFAULT_ANCHOR_REFRESH_POLICY)
    policy.update(args.get("policy") or {})
    drift = args.get("drift") or {}

    identity_similarity = drift.get("identity_similarity")
    if isinstance(identity_similarity, (int, float)) and identity_similarity < policy["drift_fail_threshold"]:
        return {"refresh": True, "reason": "identity_fail"}
    bg_similarity = drift.get("bg_similarity")
    if isinstance(bg_similarity, (int, float)) and bg_similarity < policy["drift_fail_threshold"]:
        return {"refresh": True, "reason": "background_fail"}
    flicker_score = drift.get("flicker_score")
    if isinstance(flicker_score, (int, float)) and flicker_score > policy["flicker_fail_threshold"]:
        return {"refresh": True, "reason": "flicker_fail"}

    turn_index = int(args.get("turn_index") or 0)
    refresh_every = int(policy.get("refresh_every_turns", 0) or 0)
    if refresh_every > 0 and turn_index > 0 and turn_index % refresh_every == 0:
        return {"refresh": True, "reason": "periodic_refresh"}

    return {"refresh": False, "reason": "stable"}


def select_anchor(args: Dict[str, Any]) -> Dict[str, Any]:
    anchors = get_anchor_set(args.get("persona_pack") or {}, args.get("mode") or "")
    if not anchors:
        return {"anchor": None, "mode": args.get("mode"), "reason": "no_anchors"}

    refresh = should_refresh_anchor(
        {
            "drift": args.get("drift"),
            "turn_index": args.get("turn_index"),
            "policy": args.get("policy"),
        }
    )
    last_anchor_ref = args.get("last_anchor_ref")
    if not refresh.get("refresh") and last_anchor_ref:
        last = next((anchor for anchor in anchors if anchor.get("image_ref") == last_anchor_ref), None)
        if last:
            return {"anchor": last, "mode": args.get("mode"), "reason": "reuse_last_anchor"}

    if refresh.get("refresh"):
        canonical = select_canonical_anchor(anchors)
        return {
            "anchor": canonical,
            "mode": args.get("mode"),
            "reason": f"refresh:{refresh.get('reason')}",
        }

    sorted_anchors = sorted(
        anchors,
        key=lambda anchor: (
            -score_anchor(anchor, args.get("desired_emotion")),
            str(anchor.get("image_ref") or ""),
        ),
    )
    return {"anchor": sorted_anchors[0], "mode": args.get("mode"), "reason": "best_match"}


def clamp_actor_timeline(
    timeline: List[Dict[str, Any]],
    behavior_policy: Dict[str, Any],
) -> List[Dict[str, Any]]:
    allowed = behavior_policy.get("allowed_emotions")
    allowed_emotions = [str(item) for item in allowed] if isinstance(allowed, list) else None
    ranges = behavior_policy.get("emotion_ranges") or {}

    clamped: List[Dict[str, Any]] = []
    for event in timeline or []:
        next_event = dict(event)
        emotion = next_event.get("emotion")
        if allowed_emotions and emotion and emotion not in allowed_emotions:
            next_event["emotion"] = allowed_emotions[0] if allowed_emotions else "neutral"

        emotion_key = next_event.get("emotion")
        if emotion_key in ranges and isinstance(next_event.get("intensity"), (int, float)):
            bounds = ranges.get(emotion_key) or {}
            min_intensity = bounds.get("min", 0)
            max_intensity = bounds.get("max", 1)
            next_event["intensity"] = max(min_intensity, min(max_intensity, next_event["intensity"]))
        elif isinstance(next_event.get("intensity"), (int, float)):
            next_event["intensity"] = max(0, min(1, next_event["intensity"]))

        clamped.append(next_event)
    return clamped


@dataclass
class PersonaRegistryEntry:
    metadata: Dict[str, Any]
    versions: Dict[str, Dict[str, Any]]


class PersonaRegistry:
    def __init__(self, asset_resolver: Optional[Callable[[str], str]] = None) -> None:
        self.asset_resolver = asset_resolver
        self.personas: Dict[str, PersonaRegistryEntry] = {}

    def create_persona(self, persona_id: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        if not persona_id:
            raise ValueError("persona_id is required")
        if persona_id in self.personas:
            raise ValueError(f"persona already exists: {persona_id}")
        self.personas[persona_id] = PersonaRegistryEntry(metadata=metadata or {}, versions={})

    def create_persona_version(self, persona_id: str, pack: Dict[str, Any]) -> str:
        if not persona_id:
            raise ValueError("persona_id is required")
        entry = self.personas.get(persona_id)
        if not entry:
            raise ValueError(f"persona not found: {persona_id}")

        validation = validate_persona_pack(pack)
        if not validation["ok"]:
            raise ValueError(f"invalid PersonaPack: {'; '.join(validation['errors'])}")
        if pack.get("persona_id") != persona_id:
            raise ValueError("persona_id mismatch in PersonaPack")

        version = pack.get("version")
        if not isinstance(version, str) or not version:
            raise ValueError("version must be a string")

        entry.versions[version] = pack
        return version

    def get_persona_pack(self, persona_id: str, version: str) -> Optional[Dict[str, Any]]:
        entry = self.personas.get(persona_id)
        if not entry:
            return None
        return entry.versions.get(version)

    def list_persona_versions(self, persona_id: str) -> List[str]:
        entry = self.personas.get(persona_id)
        if not entry:
            return []
        return list(entry.versions.keys())

    def resolve_asset(self, ref: str) -> str:
        if not self.asset_resolver:
            return ref
        return self.asset_resolver(ref)

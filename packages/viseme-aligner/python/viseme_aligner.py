from __future__ import annotations

from typing import Dict, List, Optional


NORMALIZED_VISEMES = [
    "SIL",
    "AA",
    "AE",
    "AH",
    "AO",
    "EH",
    "ER",
    "IH",
    "IY",
    "OW",
    "UH",
    "UW",
    "BMP",
    "FV",
    "L",
    "WQ",
    "CHJSH",
    "TH",
    "TDK",
    "S",
]


def normalize_phoneme(phoneme: str) -> str:
    return str(phoneme).strip().upper().rstrip("012")


def phoneme_to_viseme_id(phoneme: str) -> str:
    p = normalize_phoneme(phoneme)
    if not p:
        return "SIL"
    if p in {"SIL", "SP", "SPN"}:
        return "SIL"
    if p == "AA":
        return "AA"
    if p == "AE":
        return "AE"
    if p == "AH":
        return "AH"
    if p == "AO":
        return "AO"
    if p == "EH":
        return "EH"
    if p == "ER":
        return "ER"
    if p == "IH":
        return "IH"
    if p == "IY":
        return "IY"
    if p in {"OW", "OY"}:
        return "OW"
    if p == "UH":
        return "UH"
    if p == "UW":
        return "UW"
    if p in {"B", "M", "P"}:
        return "BMP"
    if p in {"F", "V"}:
        return "FV"
    if p == "L":
        return "L"
    if p in {"W", "Q"}:
        return "WQ"
    if p in {"CH", "JH", "SH", "ZH"}:
        return "CHJSH"
    if p in {"TH", "DH"}:
        return "TH"
    if p in {"T", "D", "K", "G"}:
        return "TDK"
    if p in {"S", "Z"}:
        return "S"
    if p == "R":
        return "ER"
    if p == "Y":
        return "IY"
    return "SIL"


def merge_adjacent_visemes(events: List[Dict[str, object]]) -> List[Dict[str, object]]:
    merged: List[Dict[str, object]] = []
    for ev in events:
        prev = merged[-1] if merged else None
        if not prev:
            merged.append(dict(ev))
            continue
        if prev["viseme_id"] == ev["viseme_id"] and ev["start_ms"] <= prev["end_ms"]:
            prev_dur = prev["end_ms"] - prev["start_ms"]
            ev_dur = ev["end_ms"] - ev["start_ms"]
            total = max(1, prev_dur + ev_dur)
            prev_weight = prev_dur / total
            ev_weight = ev_dur / total
            prev["end_ms"] = max(prev["end_ms"], ev["end_ms"])
            prev["confidence"] = prev["confidence"] * prev_weight + ev["confidence"] * ev_weight
            continue
        merged.append(dict(ev))
    return merged


def timeline_from_timed_phonemes(
    utterance_id: str,
    phonemes: List[Dict[str, object]],
    language: str = "en",
    source: str = "tts_alignment",
) -> Dict[str, object]:
    if not utterance_id:
        raise ValueError("utterance_id is required")
    visemes = []
    for phoneme in phonemes:
        start_ms = phoneme.get("start_ms", 0)
        end_ms = phoneme.get("end_ms", start_ms)
        visemes.append(
            {
                "start_ms": start_ms,
                "end_ms": end_ms,
                "viseme_id": phoneme_to_viseme_id(str(phoneme.get("phoneme", ""))),
                "confidence": phoneme.get("confidence", 0.8),
            }
        )
    return {"utterance_id": utterance_id, "language": language, "source": source, "visemes": merge_adjacent_visemes(visemes)}


def heuristic_timeline_from_visemes(
    utterance_id: str,
    viseme_ids: List[str],
    total_duration_ms: float,
    language: str = "en",
    start_ms: float = 0,
    confidence: Optional[float] = None,
) -> Dict[str, object]:
    if not utterance_id:
        raise ValueError("utterance_id is required")
    if not viseme_ids:
        raise ValueError("viseme_ids must be non-empty")
    if total_duration_ms <= 0:
        raise ValueError("total_duration_ms must be positive")
    conf = max(0.0, min(1.0, confidence if confidence is not None else 0.3))
    step = total_duration_ms / len(viseme_ids)
    events = []
    for i, viseme_id in enumerate(viseme_ids):
        s = round(start_ms + i * step)
        e = round(start_ms + (i + 1) * step)
        events.append({"start_ms": s, "end_ms": max(e, s), "viseme_id": str(viseme_id), "confidence": conf})
    return {
        "utterance_id": utterance_id,
        "language": language,
        "source": "heuristic",
        "visemes": merge_adjacent_visemes(events),
    }

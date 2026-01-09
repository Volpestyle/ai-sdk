"""
Generated from persona_pack.schema.json
Single source of truth for PersonaPack types across all packages.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple
from pydantic import BaseModel, Field


class AnchorMetadata(BaseModel):
    expressionTag: Optional[str] = None
    headPose: Optional[Dict[str, object]] = None
    lightingTag: Optional[str] = None
    cropBox: Optional[Tuple[float, float, float, float]] = None
    bestFor: Optional[List[str]] = None


class AnchorEntry(BaseModel):
    imageRef: str
    maskRef: Optional[str] = None
    metadata: AnchorMetadata


class Identity(BaseModel):
    faceEmbeddingRefs: List[str]
    adapterRefs: Optional[List[str]] = None


class Style(BaseModel):
    styleEmbeddingRefs: Optional[List[str]] = None
    stageConstraints: Optional[Dict[str, object]] = None


class VoiceProfile(BaseModel):
    providerVoiceId: Optional[str] = None
    speakerEmbeddingRef: Optional[str] = None
    prosodyBounds: Optional[Dict[str, object]] = None


class EmotionRange(BaseModel):
    min: Optional[float] = None
    max: Optional[float] = None


class BehaviorPolicy(BaseModel):
    personaCard: Optional[str] = None
    emotionRanges: Optional[Dict[str, EmotionRange]] = None
    allowedGestures: Optional[Dict[str, object]] = None


class PersonaPack(BaseModel):
    personaId: str
    version: str
    createdAt: Optional[str] = None
    anchorSets: Dict[str, List[AnchorEntry]]
    identity: Identity
    style: Style
    voiceProfile: Optional[VoiceProfile] = None
    behaviorPolicy: BehaviorPolicy


# Camera modes for anchor sets
CAMERA_MODES = ["A_SELFIE", "B_MIRROR", "C_CUTAWAY"]

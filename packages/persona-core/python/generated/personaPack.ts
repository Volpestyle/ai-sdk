/**
 * Generated from persona_pack.schema.json
 * Single source of truth for PersonaPack types across all packages.
 */

export interface AnchorMetadata {
  expressionTag?: string;
  headPose?: Record<string, unknown>;
  lightingTag?: string;
  cropBox?: [number, number, number, number];
  bestFor?: string[];
}

export interface AnchorEntry {
  imageRef: string;
  maskRef?: string;
  metadata: AnchorMetadata;
}

export interface Identity {
  faceEmbeddingRefs: string[];
  adapterRefs?: string[];
}

export interface Style {
  styleEmbeddingRefs?: string[];
  stageConstraints?: Record<string, unknown>;
}

export interface VoiceProfile {
  providerVoiceId?: string;
  speakerEmbeddingRef?: string;
  prosodyBounds?: Record<string, unknown>;
}

export interface BehaviorPolicy {
  personaCard?: string;
  emotionRanges?: Record<string, { min?: number; max?: number }>;
  allowedGestures?: Record<string, unknown>;
}

export interface PersonaPack {
  personaId: string;
  version: string;
  createdAt?: string;
  anchorSets: Record<string, AnchorEntry[]>;
  identity: Identity;
  style: Style;
  voiceProfile?: VoiceProfile;
  behaviorPolicy: BehaviorPolicy;
}

/**
 * Camera modes for anchor sets.
 */
export const CAMERA_MODES = ["A_SELFIE", "B_MIRROR", "C_CUTAWAY"] as const;
export type CameraMode = (typeof CAMERA_MODES)[number];

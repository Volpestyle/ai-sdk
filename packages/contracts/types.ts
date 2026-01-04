// Shared SDK interfaces for lip-sync reliability components.
// Keep these types backend-agnostic and stable over time.

export type CameraMode = "A_SELFIE" | "B_MIRROR" | "C_CUTAWAY";

export interface BackendCapabilities {
  backend_id: string;

  // Local-only style capabilities
  supports_rerender_block: boolean;
  supports_anchor_reset: boolean;
  supports_mouth_corrector: boolean;
  supports_viseme_conditioning: boolean;

  // Provider/bridge style capabilities
  supports_restart_stream: boolean;
  supports_param_update: boolean;
  supports_failover: boolean;

  // Media transport
  provides_webRTC_stream: boolean; // true if backend streams directly
}

export interface ROITransform {
  crop_xywh: [number, number, number, number]; // pixels
  affine_2x3?: [number, number, number, number, number, number];
  normalized_size?: [number, number];
}

export interface FaceObservation {
  track_id: string;
  bbox_xywh: [number, number, number, number];
  pose_yaw_pitch_roll?: [number, number, number];
  confidence: number;
  mouth_roi?: ROITransform;
  face_roi?: ROITransform;
  occlusion_flags?: string[];
}

export interface FaceTrackResult {
  frame_id: string;
  timestamp_ms: number;
  faces: FaceObservation[];
}

export interface LipSyncScore {
  window_id: string;
  score: number | null; // null => silence/unknown
  offset_ms: number | null;
  confidence: number;
  label: "ok" | "warn" | "fail" | "silence" | "occluded" | "unknown";
  debug?: Record<string, unknown>;
}

export interface LipSyncSignal extends LipSyncScore {
  occluded?: boolean;
  is_silence?: boolean;
}

export interface DriftSignal {
  identity_similarity: number; // 0..1
  bg_similarity: number;       // 0..1
  flicker_score: number;       // 0..1 (higher worse)
  pose_jitter_deg_per_s?: number;
}

export interface PlaybackHealth {
  av_offset_ms: number;
  late_video_frames_per_s: number;
  jitter_buffer_ms?: number;
}

export interface SystemHealth {
  render_fps: number;
  gpu_util?: number;
  queue_depth?: number;
  p99_block_latency_ms?: number;
}

export interface TurnContext {
  session_id: string;
  persona_id: string;
  mode: CameraMode;
  remaining_turn_sec: number;
  hardcap_turn_sec: number; // 30
}

export type QualityAction =
  | { type: "RERENDER_BLOCK"; strengthen_anchor?: boolean }
  | { type: "APPLY_MOUTH_CORRECTOR"; window: "last_block" | "last_second" }
  | { type: "FORCE_ANCHOR_RESET" }
  | { type: "REDUCE_FPS"; target_fps: number }
  | { type: "REDUCE_RESOLUTION"; target_short_side: number }
  | { type: "REDUCE_MOTION"; factor: number } // 0..1
  | { type: "SHORTEN_REMAINING_TURN"; target_sec: number }
  | { type: "RESTART_PROVIDER_STREAM" }
  | { type: "FAILOVER_BACKEND"; backend_id: string }
  | { type: "FALLBACK_OFFLINE_CLIP" };

export interface QualityDecision {
  actions: QualityAction[];
  debug?: Record<string, unknown>;
}

export interface VisemeEvent {
  start_ms: number;
  end_ms: number;
  viseme_id: string;
  confidence: number;
}

export interface VisemeTimeline {
  utterance_id: string;
  language: string;
  source: "tts_alignment" | "forced_aligner" | "heuristic" | "asr_alignment";
  visemes: VisemeEvent[];
}


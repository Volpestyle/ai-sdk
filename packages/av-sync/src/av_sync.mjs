/**
 * av-sync — reference helpers
 *
 * Implements the timestamping + policy decisions described in:
 * `packages/av-sync/tech_spec.md`
 *
 * This is not a full WebRTC implementation; it provides deterministic
 * computations and policy helpers for an encoder/sender boundary.
 */

/**
 * @typedef {"local_encode"|"provider_bridge"} AvSyncMode
 * @typedef {"DROP"|"REPEAT_LAST"|"DEGRADE_FPS"|"TIME_STRETCH_AUDIO"} LateFramePolicy
 *
 * @typedef {Object} AvSyncPolicy
 * @property {AvSyncMode} mode
 * @property {number=} audio_sample_rate_hz
 * @property {number=} video_rtp_clock_hz
 * @property {number=} target_jitter_buffer_ms
 * @property {number=} max_jitter_buffer_ms
 * @property {LateFramePolicy=} late_frame_policy
 * @property {number=} resync_threshold_ms
 */

export const DEFAULT_AVSYNC_POLICY = Object.freeze({
  mode: "local_encode",
  audio_sample_rate_hz: 48_000,
  video_rtp_clock_hz: 90_000,
  target_jitter_buffer_ms: 90,
  max_jitter_buffer_ms: 250,
  late_frame_policy: "DROP",
  resync_threshold_ms: 120,
});

/**
 * @param {Partial<AvSyncPolicy>} policy
 * @returns {AvSyncPolicy}
 */
export function normalizeAvSyncPolicy(policy) {
  return /** @type {AvSyncPolicy} */ ({ ...DEFAULT_AVSYNC_POLICY, ...(policy ?? {}) });
}

/**
 * Audio-master clock: audio RTP timestamp is `audio_samples_sent`.
 * Video RTP timestamp is derived from the audio timeline (recommended).
 */
export class AudioMasterClock {
  /**
   * @param {Partial<AvSyncPolicy>=} policy
   */
  constructor(policy) {
    /** @type {AvSyncPolicy} */
    this.policy = normalizeAvSyncPolicy(policy ?? {});
    /** @type {number} */
    this.audio_samples_sent = 0;
  }

  /** @returns {number} */
  getAudioSamplesSent() {
    return this.audio_samples_sent;
  }

  /**
   * @param {number} sampleCount number of PCM samples just enqueued/sent
   * @returns {{ audio_rtp_ts: number, video_rtp_ts: number, elapsed_audio_sec: number }}
   */
  pushAudioSamples(sampleCount) {
    if (!Number.isFinite(sampleCount) || sampleCount < 0) {
      throw new Error(`pushAudioSamples(sampleCount) must be a non-negative finite number; got ${sampleCount}`);
    }
    this.audio_samples_sent += sampleCount;
    const elapsedAudioSec = this.audio_samples_sent / this.policy.audio_sample_rate_hz;
    const videoRtpTs = Math.round(elapsedAudioSec * this.policy.video_rtp_clock_hz);
    return { audio_rtp_ts: this.audio_samples_sent, video_rtp_ts: videoRtpTs, elapsed_audio_sec: elapsedAudioSec };
  }

  /**
   * Pure helper: compute video RTP ts from current audio samples sent.
   * @returns {number}
   */
  computeVideoRtpTimestamp() {
    const elapsedAudioSec = this.audio_samples_sent / this.policy.audio_sample_rate_hz;
    return Math.round(elapsedAudioSec * this.policy.video_rtp_clock_hz);
  }
}

/**
 * Estimate A/V offset at a sender as `video_pts_time - audio_pts_time`.
 *
 * @param {{ audio_pts_time_ms: number, video_pts_time_ms: number }} args
 * @returns {number} av_offset_ms
 */
export function estimateAvOffsetMs(args) {
  return args.video_pts_time_ms - args.audio_pts_time_ms;
}

/**
 * Decide whether the stream should trigger a resync action based on observed offset.
 *
 * @param {{ av_offset_ms: number, policy?: Partial<AvSyncPolicy> }} args
 * @returns {boolean}
 */
export function shouldResync(args) {
  const policy = normalizeAvSyncPolicy(args.policy ?? {});
  return Math.abs(args.av_offset_ms) >= policy.resync_threshold_ms;
}

/**
 * Determine late-frame handling.
 *
 * @param {{
 *   now_ms: number,
 *   expected_send_time_ms: number,
 *   policy?: Partial<AvSyncPolicy>,
 *   late_threshold_ms?: number
 * }} args
 * @returns {{ late_by_ms: number, decision: "SEND"|"DROP"|"REPEAT_LAST"|"DEGRADE_FPS"|"TIME_STRETCH_AUDIO" }}
 */
export function decideLateFrame(args) {
  const policy = normalizeAvSyncPolicy(args.policy ?? {});
  const lateByMs = args.now_ms - args.expected_send_time_ms;
  const threshold = args.late_threshold_ms ?? policy.target_jitter_buffer_ms;

  if (lateByMs <= threshold) return { late_by_ms: lateByMs, decision: "SEND" };

  /** @type {ReturnType<typeof decideLateFrame>["decision"]} */
  let decision = "DROP";
  switch (policy.late_frame_policy) {
    case "DROP":
      decision = "DROP";
      break;
    case "REPEAT_LAST":
      decision = "REPEAT_LAST";
      break;
    case "DEGRADE_FPS":
      decision = "DEGRADE_FPS";
      break;
    case "TIME_STRETCH_AUDIO":
      decision = "TIME_STRETCH_AUDIO";
      break;
    default:
      decision = "DROP";
  }
  return { late_by_ms: lateByMs, decision };
}


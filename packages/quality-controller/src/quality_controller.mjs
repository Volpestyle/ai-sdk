/**
 * quality-controller — reference implementation
 *
 * Implements the "policy + hysteresis + capability-aware actions" loop described in:
 * `packages/quality-controller/tech_spec.md`
 *
 * No external deps; intended as a deterministic, testable baseline.
 */

/**
 * @typedef {Object} BackendCapabilities
 * @property {string} backend_id
 * @property {boolean} supports_rerender_block
 * @property {boolean} supports_anchor_reset
 * @property {boolean} supports_mouth_corrector
 * @property {boolean} supports_viseme_conditioning
 * @property {boolean} supports_restart_stream
 * @property {boolean} supports_param_update
 * @property {boolean} supports_failover
 * @property {boolean} provides_webRTC_stream
 */

/**
 * @typedef {Object} LipSyncSignal
 * @property {string=} window_id
 * @property {number|null=} score
 * @property {number|null=} offset_ms
 * @property {number=} confidence
 * @property {boolean=} occluded
 * @property {boolean=} is_silence
 */

/**
 * @typedef {Object} DriftSignal
 * @property {number=} identity_similarity
 * @property {number=} bg_similarity
 * @property {number=} flicker_score
 * @property {number=} pose_jitter_deg_per_s
 */

/**
 * @typedef {Object} PlaybackHealth
 * @property {number=} av_offset_ms
 * @property {number=} late_video_frames_per_s
 * @property {number=} jitter_buffer_ms
 */

/**
 * @typedef {Object} SystemHealth
 * @property {number=} render_fps
 * @property {number=} gpu_util
 * @property {number=} queue_depth
 * @property {number=} p99_block_latency_ms
 */

/**
 * @typedef {Object} TurnContext
 * @property {string=} session_id
 * @property {string=} persona_id
 * @property {string=} mode
 * @property {number=} remaining_turn_sec
 * @property {number=} hardcap_turn_sec
 */

/**
 * @typedef {Object} QualityPolicy
 * @property {number} lip_warn
 * @property {number} lip_fail
 * @property {number} lip_fail_consecutive
 * @property {number} drift_warn_identity
 * @property {number} drift_fail_identity
 * @property {number} av_offset_warn_ms
 * @property {number} av_offset_fail_ms
 * @property {number} cooldown_ms_heavy_action
 * @property {number} ok_consecutive_to_recover
 */

/**
 * @typedef {Object} ControllerState
 * @property {number} lip_fail_streak
 * @property {number} lip_ok_streak
 * @property {number} drift_fail_streak
 * @property {number} overall_ok_streak
 * @property {number} degrade_level
 * @property {number} last_heavy_action_ms
 */

/**
 * @typedef {Object} DecideOptions
 * @property {string=} failover_backend_id
 * @property {number[]=} degrade_fps_targets
 * @property {number[]=} degrade_short_side_targets
 */

/**
 * @typedef {Object} DecideInput
 * @property {BackendCapabilities} caps
 * @property {LipSyncSignal=} lipsync
 * @property {DriftSignal=} drift
 * @property {PlaybackHealth=} playback
 * @property {SystemHealth=} system
 * @property {TurnContext=} ctx
 * @property {Partial<QualityPolicy>=} policy
 * @property {ControllerState=} state
 * @property {number=} now_ms
 * @property {DecideOptions=} options
 */

/**
 * @typedef {Object} DecideOutput
 * @property {Array<Record<string, any>>} actions
 * @property {ControllerState} state
 * @property {Record<string, any>} debug
 */

export const DEFAULT_QUALITY_POLICY = Object.freeze({
  lip_warn: 0.55,
  lip_fail: 0.45,
  lip_fail_consecutive: 3,
  drift_warn_identity: 0.8,
  drift_fail_identity: 0.72,
  av_offset_warn_ms: 80,
  av_offset_fail_ms: 140,
  cooldown_ms_heavy_action: 1500,
  ok_consecutive_to_recover: 8,
});

/** @returns {ControllerState} */
export function createInitialControllerState() {
  return {
    lip_fail_streak: 0,
    lip_ok_streak: 0,
    drift_fail_streak: 0,
    overall_ok_streak: 0,
    degrade_level: 0,
    last_heavy_action_ms: 0,
  };
}

/**
 * @param {Partial<QualityPolicy>=} policy
 * @returns {QualityPolicy}
 */
export function normalizeQualityPolicy(policy) {
  return /** @type {QualityPolicy} */ ({ ...DEFAULT_QUALITY_POLICY, ...(policy ?? {}) });
}

/**
 * @param {number} value
 * @returns {number}
 */
function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * @param {ControllerState} state
 * @param {number} nowMs
 * @param {QualityPolicy} policy
 * @returns {boolean}
 */
function cooldownReady(state, nowMs, policy) {
  return nowMs - state.last_heavy_action_ms >= policy.cooldown_ms_heavy_action;
}

/**
 * @param {Record<string, any>[]} actions
 * @returns {boolean}
 */
function containsHeavyAction(actions) {
  const heavy = new Set([
    "RESTART_PROVIDER_STREAM",
    "FAILOVER_BACKEND",
    "FALLBACK_OFFLINE_CLIP",
    "FORCE_ANCHOR_RESET",
    "RERENDER_BLOCK",
  ]);
  return actions.some((a) => heavy.has(String(a.type)));
}

/**
 * Reference decision function.
 * @param {DecideInput} input
 * @returns {DecideOutput}
 */
export function decide(input) {
  const policy = normalizeQualityPolicy(input.policy);
  const nowMs = input.now_ms ?? Date.now();
  const state = { ...(input.state ?? createInitialControllerState()) };
  const options = input.options ?? {};

  /** @type {Record<string, any>} */
  const debug = {};

  const lipsync = input.lipsync ?? {};
  const drift = input.drift ?? {};
  const playback = input.playback ?? {};
  const system = input.system ?? {};
  const caps = input.caps;

  // 1) Compute metric bands
  /** @type {"ignore"|"ok"|"warn"|"fail"} */
  let lipBand = "ignore";
  if (lipsync.is_silence || lipsync.score === null) {
    lipBand = "ignore";
    debug.lip_ignore_reason = "silence";
  } else if (lipsync.occluded) {
    lipBand = "ignore";
    debug.lip_ignore_reason = "occluded";
  } else if (typeof lipsync.score === "number") {
    const conf = lipsync.confidence ?? 1;
    if (conf < 0.2) {
      lipBand = "ignore";
      debug.lip_ignore_reason = "low_confidence";
    } else if (lipsync.score < policy.lip_fail) {
      lipBand = "fail";
    } else if (lipsync.score < policy.lip_warn) {
      lipBand = "warn";
    } else {
      lipBand = "ok";
    }
  } else {
    lipBand = "ignore";
    debug.lip_ignore_reason = "missing_score";
  }

  /** @type {"ignore"|"ok"|"warn"|"fail"} */
  let driftBand = "ignore";
  if (typeof drift.identity_similarity === "number") {
    if (drift.identity_similarity < policy.drift_fail_identity) driftBand = "fail";
    else if (drift.identity_similarity < policy.drift_warn_identity) driftBand = "warn";
    else driftBand = "ok";
  }

  /** @type {"ignore"|"ok"|"warn"|"fail"} */
  let playbackBand = "ignore";
  if (typeof playback.av_offset_ms === "number") {
    const absOffset = Math.abs(playback.av_offset_ms);
    if (absOffset >= policy.av_offset_fail_ms) playbackBand = "fail";
    else if (absOffset >= policy.av_offset_warn_ms) playbackBand = "warn";
    else playbackBand = "ok";
    debug.playback_abs_offset_ms = absOffset;
  }

  /** @type {"ignore"|"ok"|"warn"|"fail"} */
  let systemBand = "ignore";
  if (typeof system.render_fps === "number") {
    // Conservative defaults: "warn" below 26fps, "fail" below 20fps.
    if (system.render_fps < 20) systemBand = "fail";
    else if (system.render_fps < 26) systemBand = "warn";
    else systemBand = "ok";
  }

  debug.bands = { lip: lipBand, drift: driftBand, playback: playbackBand, system: systemBand };

  // 2) Update hysteresis state
  if (lipBand === "fail") {
    state.lip_fail_streak += 1;
    state.lip_ok_streak = 0;
  } else if (lipBand === "ok") {
    state.lip_ok_streak += 1;
    state.lip_fail_streak = 0;
  } else {
    // For ignore/warn, don't accumulate; also don't erase existing fail streak immediately.
    state.lip_ok_streak = 0;
  }

  if (driftBand === "fail") state.drift_fail_streak += 1;
  else if (driftBand === "ok") state.drift_fail_streak = 0;

  const anyFail = lipBand === "fail" || driftBand === "fail" || playbackBand === "fail" || systemBand === "fail";
  const allOk =
    (lipBand === "ok" || lipBand === "ignore") &&
    (driftBand === "ok" || driftBand === "ignore") &&
    (playbackBand === "ok" || playbackBand === "ignore") &&
    (systemBand === "ok" || systemBand === "ignore");

  if (allOk) state.overall_ok_streak += 1;
  else state.overall_ok_streak = 0;

  // 3) Determine action list (priority-ordered)
  /** @type {Array<Record<string, any>>} */
  const actions = [];

  const sustainedLipFail = lipBand === "fail" && state.lip_fail_streak >= policy.lip_fail_consecutive;
  const sustainedDriftFail = driftBand === "fail" && state.drift_fail_streak >= 2;
  const canDoHeavy = cooldownReady(state, nowMs, policy);

  // 3a) Playback A/V offset problems: prefer resync/restart before rerendering.
  if (playbackBand === "fail" && canDoHeavy) {
    if (caps.supports_restart_stream) {
      actions.push({ type: "RESTART_PROVIDER_STREAM" });
    } else if (caps.supports_failover && options.failover_backend_id) {
      actions.push({ type: "FAILOVER_BACKEND", backend_id: options.failover_backend_id });
    } else {
      // No restart/failover: degrade to reduce jitter and shorten tail latency.
      actions.push({ type: "REDUCE_FPS", target_fps: 24 });
      actions.push({ type: "SHORTEN_REMAINING_TURN", target_sec: Math.min(6, input.ctx?.remaining_turn_sec ?? 6) });
    }
  }

  // 3b) Lip-sync sustained FAIL
  if (sustainedLipFail) {
    if (caps.supports_mouth_corrector) {
      actions.push({ type: "APPLY_MOUTH_CORRECTOR", window: "last_block" });
    } else if (caps.supports_rerender_block) {
      actions.push({ type: "RERENDER_BLOCK", strengthen_anchor: true });
    } else if (caps.supports_restart_stream && canDoHeavy) {
      actions.push({ type: "RESTART_PROVIDER_STREAM" });
    } else if (caps.supports_failover && options.failover_backend_id && canDoHeavy) {
      actions.push({ type: "FAILOVER_BACKEND", backend_id: options.failover_backend_id });
    }
  }

  // 3c) Drift sustained FAIL
  if (sustainedDriftFail && canDoHeavy) {
    if (caps.supports_anchor_reset) actions.push({ type: "FORCE_ANCHOR_RESET" });
    else if (caps.supports_restart_stream) actions.push({ type: "RESTART_PROVIDER_STREAM" });
    else if (caps.supports_failover && options.failover_backend_id) {
      actions.push({ type: "FAILOVER_BACKEND", backend_id: options.failover_backend_id });
    }
  }

  // 3d) System health degradation: stepwise degrade controls.
  // Use degrade_level as a stable knob (0..3).
  const degradeFpsTargets = options.degrade_fps_targets ?? [30, 24, 20, 15];
  const degradeShortSideTargets = options.degrade_short_side_targets ?? [720, 640, 512, 384];

  const shouldIncreaseDegrade = anyFail || (systemBand === "warn" && state.degrade_level < 3);
  if (shouldIncreaseDegrade) state.degrade_level = Math.min(3, state.degrade_level + 1);

  if (state.degrade_level > 0) {
    const targetFps = degradeFpsTargets[state.degrade_level] ?? degradeFpsTargets[degradeFpsTargets.length - 1];
    const targetShortSide =
      degradeShortSideTargets[state.degrade_level] ?? degradeShortSideTargets[degradeShortSideTargets.length - 1];

    // Avoid emitting redundant degrade actions if a heavier action is already requested.
    if (!actions.some((a) => a.type === "RESTART_PROVIDER_STREAM" || a.type === "FAILOVER_BACKEND")) {
      actions.push({ type: "REDUCE_FPS", target_fps: targetFps });
      actions.push({ type: "REDUCE_RESOLUTION", target_short_side: targetShortSide });
    }
  }

  // Recover slowly once stable.
  if (state.degrade_level > 0 && state.overall_ok_streak >= policy.ok_consecutive_to_recover) {
    state.degrade_level = Math.max(0, state.degrade_level - 1);
    state.overall_ok_streak = 0;
  }

  // If we emitted heavy actions, advance cooldown timer.
  if (containsHeavyAction(actions)) state.last_heavy_action_ms = nowMs;

  debug.state_after = { ...state };
  debug.sustained = { lip: sustainedLipFail, drift: sustainedDriftFail, canDoHeavy };
  debug.inputs = {
    lipsync: { score: lipsync.score, confidence: lipsync.confidence, offset_ms: lipsync.offset_ms },
    drift: { identity_similarity: drift.identity_similarity },
    playback: { av_offset_ms: playback.av_offset_ms },
    system: { render_fps: system.render_fps },
  };

  return { actions, state, debug };
}


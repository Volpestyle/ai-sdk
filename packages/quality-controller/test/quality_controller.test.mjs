import test from "node:test";
import assert from "node:assert/strict";

import { createInitialControllerState, decide } from "../src/quality_controller.mjs";

const capsProvider = {
  backend_id: "provider_a",
  supports_rerender_block: false,
  supports_anchor_reset: false,
  supports_mouth_corrector: false,
  supports_viseme_conditioning: false,
  supports_restart_stream: true,
  supports_param_update: true,
  supports_failover: true,
  provides_webRTC_stream: true,
};

const capsLocal = {
  backend_id: "local",
  supports_rerender_block: true,
  supports_anchor_reset: true,
  supports_mouth_corrector: true,
  supports_viseme_conditioning: true,
  supports_restart_stream: false,
  supports_param_update: true,
  supports_failover: false,
  provides_webRTC_stream: false,
};

test("playback A/V offset fail prioritizes restart when supported", () => {
  const out = decide({
    caps: capsProvider,
    playback: { av_offset_ms: 200, late_video_frames_per_s: 0 },
    now_ms: 10_000,
  });
  assert.ok(out.actions.length > 0);
  assert.equal(out.actions[0].type, "RESTART_PROVIDER_STREAM");
});

test("lip fail hysteresis triggers correction only after N consecutive fails", () => {
  let state = createInitialControllerState();

  for (let i = 0; i < 2; i++) {
    const out = decide({
      caps: capsLocal,
      lipsync: { score: 0.2, confidence: 0.9, occluded: false, is_silence: false },
      state,
      now_ms: 10_000 + i,
    });
    state = out.state;
    assert.ok(out.actions.every((a) => a.type !== "APPLY_MOUTH_CORRECTOR"));
    assert.ok(out.actions.every((a) => a.type !== "RERENDER_BLOCK"));
  }

  const out3 = decide({
    caps: capsLocal,
    lipsync: { score: 0.2, confidence: 0.9, occluded: false, is_silence: false },
    state,
    now_ms: 10_010,
  });
  assert.ok(out3.actions.some((a) => a.type === "APPLY_MOUTH_CORRECTOR"));
});

test("silence windows are ignored for lip-sync decisions", () => {
  const out = decide({
    caps: capsLocal,
    lipsync: { score: null, is_silence: true, confidence: 0 },
    now_ms: 10_000,
  });
  assert.equal(out.actions.length, 0);
});

test("cooldown suppresses heavy restart actions but still allows degrade actions", () => {
  const out = decide({
    caps: capsProvider,
    playback: { av_offset_ms: 200 },
    now_ms: 10_500,
    state: { ...createInitialControllerState(), last_heavy_action_ms: 10_000 },
    policy: { cooldown_ms_heavy_action: 1_000 },
  });

  assert.ok(out.actions.every((a) => a.type !== "RESTART_PROVIDER_STREAM"));
  assert.ok(out.actions.some((a) => a.type === "REDUCE_FPS"));
});


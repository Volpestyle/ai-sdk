import test from "node:test";
import assert from "node:assert/strict";

import { AudioMasterClock, decideLateFrame, shouldResync } from "../src/av_sync.mjs";

test("AudioMasterClock derives video RTP timestamp from audio timeline", () => {
  const clock = new AudioMasterClock({ audio_sample_rate_hz: 48_000, video_rtp_clock_hz: 90_000 });

  const t1 = clock.pushAudioSamples(48_000);
  assert.equal(t1.audio_rtp_ts, 48_000);
  assert.equal(t1.video_rtp_ts, 90_000);
  assert.equal(t1.elapsed_audio_sec, 1);

  const t2 = clock.pushAudioSamples(24_000);
  assert.equal(t2.audio_rtp_ts, 72_000);
  assert.equal(t2.video_rtp_ts, 135_000);
  assert.equal(t2.elapsed_audio_sec, 1.5);
});

test("decideLateFrame returns SEND when within threshold", () => {
  const out = decideLateFrame({
    now_ms: 1_000,
    expected_send_time_ms: 950,
    policy: { target_jitter_buffer_ms: 90, late_frame_policy: "DROP", mode: "local_encode" },
  });
  assert.equal(out.decision, "SEND");
  assert.equal(out.late_by_ms, 50);
});

test("decideLateFrame applies configured policy when late", () => {
  const out = decideLateFrame({
    now_ms: 1_000,
    expected_send_time_ms: 700,
    policy: { target_jitter_buffer_ms: 90, late_frame_policy: "REPEAT_LAST", mode: "local_encode" },
  });
  assert.equal(out.decision, "REPEAT_LAST");
  assert.equal(out.late_by_ms, 300);
});

test("shouldResync compares absolute offset against threshold", () => {
  assert.equal(shouldResync({ av_offset_ms: 119, policy: { resync_threshold_ms: 120, mode: "local_encode" } }), false);
  assert.equal(shouldResync({ av_offset_ms: 120, policy: { resync_threshold_ms: 120, mode: "local_encode" } }), true);
  assert.equal(shouldResync({ av_offset_ms: -140, policy: { resync_threshold_ms: 120, mode: "local_encode" } }), true);
});


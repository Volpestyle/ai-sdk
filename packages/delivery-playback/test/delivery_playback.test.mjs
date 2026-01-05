import test from "node:test";
import assert from "node:assert/strict";

import { buildEncodeLadder, signCdnUrl, WebRtcSessionManager } from "../src/delivery_playback.mjs";

test("buildEncodeLadder filters by target height", () => {
  const ladder = buildEncodeLadder({ height: 720, fps: 30 });
  assert.ok(ladder.length > 0);
  assert.ok(ladder.every((p) => p.height <= 720));
  assert.ok(ladder.every((p) => p.fps === 30));
});

test("signCdnUrl appends exp and sig", () => {
  const url = signCdnUrl({ url: "https://cdn.example.com/video.mp4", secret: "secret", expires_at: 1234 });
  assert.ok(url.includes("exp=1234"));
  assert.ok(url.includes("sig="));
});

test("WebRtcSessionManager stores sessions", () => {
  const mgr = new WebRtcSessionManager();
  const session = mgr.createSession({ offer_sdp: "offer" });
  const fetched = mgr.getSession(session.session_id);
  assert.equal(fetched?.offer_sdp, "offer");
});

/**
 * delivery-playback -- reference implementation
 *
 * Provides WebRTC session scaffolding and CDN signing helpers described in:
 * `packages/delivery-playback/product_spec.md`
 * `packages/delivery-playback/tech_spec.md`
 */

import { createHmac, randomUUID } from "node:crypto";

export const DEFAULT_LADDER = Object.freeze([
  { height: 1080, bitrate_kbps: 4500 },
  { height: 720, bitrate_kbps: 2500 },
  { height: 480, bitrate_kbps: 1200 },
]);

/**
 * @param {{ height?: number, fps?: number }} args
 * @returns {{ height: number, bitrate_kbps: number, fps: number }[]}
 */
export function buildEncodeLadder(args) {
  const height = args.height ?? 720;
  const fps = args.fps ?? 24;
  return DEFAULT_LADDER.filter((p) => p.height <= height).map((p) => ({ ...p, fps }));
}

/**
 * @param {{ url: string, secret: string, expires_at: number }} args
 * @returns {string}
 */
export function signCdnUrl(args) {
  const url = new URL(args.url);
  const payload = `${url.pathname}:${args.expires_at}`;
  const sig = createHmac("sha256", args.secret).update(payload).digest("hex");
  url.searchParams.set("exp", String(args.expires_at));
  url.searchParams.set("sig", sig);
  return url.toString();
}

/**
 * @typedef {Object} WebRtcSession
 * @property {string} session_id
 * @property {string} token
 * @property {string} offer_sdp
 * @property {string=} answer_sdp
 * @property {string[]} ice_servers
 * @property {number} created_ms
 * @property {number} expires_ms
 * @property {string[]} ice_candidates
 */

export class WebRtcSessionManager {
  constructor() {
    /** @type {Map<string, WebRtcSession>} */
    this.sessions = new Map();
  }

  /**
   * @param {{ offer_sdp: string, ice_servers?: string[], ttl_ms?: number, session_id?: string }} args
   * @returns {WebRtcSession}
   */
  createSession(args) {
    const sessionId = args.session_id ?? `webrtc_${randomUUID()}`;
    const token = `token_${randomUUID()}`;
    const now = Date.now();
    const ttl = args.ttl_ms ?? 60_000;
    const session = {
      session_id: sessionId,
      token,
      offer_sdp: args.offer_sdp,
      answer_sdp: undefined,
      ice_servers: args.ice_servers ?? [],
      created_ms: now,
      expires_ms: now + ttl,
      ice_candidates: [],
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * @param {{ session_id: string, answer_sdp: string }} args
   */
  acceptAnswer(args) {
    const session = this.sessions.get(args.session_id);
    if (!session) throw new Error(`session not found: ${args.session_id}`);
    session.answer_sdp = args.answer_sdp;
  }

  /**
   * @param {{ session_id: string, candidate: string }} args
   */
  addIceCandidate(args) {
    const session = this.sessions.get(args.session_id);
    if (!session) throw new Error(`session not found: ${args.session_id}`);
    session.ice_candidates.push(args.candidate);
  }

  /**
   * @param {string} sessionId
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) ?? null;
  }
}

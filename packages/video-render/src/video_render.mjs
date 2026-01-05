/**
 * video-render -- reference implementation
 *
 * Provides a backend-neutral render interface and a noop backend that
 * emits placeholder frame metadata for block-based streaming.
 */

export const DEFAULT_RENDER_CONFIG = Object.freeze({
  fps: 24,
  block_frames: 12,
  width: 720,
  height: 1280,
});

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
 * @typedef {Object} RenderInit
 * @property {string} anchor_image_ref
 * @property {Object=} mode_constraints
 * @property {Object=} context_cache
 * @property {Partial<typeof DEFAULT_RENDER_CONFIG>=} config
 */

/**
 * @typedef {Object} AudioFeatureChunk
 * @property {number} t0_ms
 * @property {number} t1_ms
 * @property {number[]} mel
 * @property {number} pitch_hz
 * @property {number} energy
 */

/**
 * @typedef {Object} FrameChunk
 * @property {string} frame_id
 * @property {number} timestamp_ms
 * @property {number} width
 * @property {number} height
 * @property {number} frame_index
 * @property {number} block_index
 * @property {string} anchor_image_ref
 * @property {any=} data
 */

/**
 * @typedef {Object} RenderSession
 * @property {string} session_id
 * @property {BackendCapabilities} caps
 * @property {RenderInit} init
 * @property {AudioFeatureChunk[]} audio_features
 */

/**
 * @param {Partial<typeof DEFAULT_RENDER_CONFIG>=} config
 */
export function normalizeRenderConfig(config) {
  return { ...DEFAULT_RENDER_CONFIG, ...(config ?? {}) };
}

/**
 * @param {AudioFeatureChunk[]} features
 * @returns {number}
 */
export function estimateDurationMs(features) {
  if (!features?.length) return 0;
  return Math.max(...features.map((f) => f.t1_ms ?? 0));
}

/**
 * @param {{ duration_ms: number, fps: number }} args
 * @returns {number[]}
 */
export function buildFrameTimeline(args) {
  const fps = Math.max(1, args.fps);
  const frameMs = 1000 / fps;
  const count = Math.max(0, Math.round(args.duration_ms / frameMs));
  return Array.from({ length: count }, (_, i) => i * frameMs);
}

/**
 * @param {{
 *  anchor_image_ref: string,
 *  duration_ms: number,
 *  config?: Partial<typeof DEFAULT_RENDER_CONFIG>
 * }} args
 */
export async function* streamNoopFrames(args) {
  const config = normalizeRenderConfig(args.config);
  const timeline = buildFrameTimeline({ duration_ms: args.duration_ms, fps: config.fps });
  for (let i = 0; i < timeline.length; i++) {
    const blockIndex = Math.floor(i / config.block_frames);
    yield {
      frame_id: `frame_${i}`,
      timestamp_ms: timeline[i],
      width: config.width,
      height: config.height,
      frame_index: i,
      block_index: blockIndex,
      anchor_image_ref: args.anchor_image_ref,
      data: null,
    };
  }
}

/**
 * Reference backend that emits metadata frames.
 */
export class NoopRenderBackend {
  constructor() {
    this.backend_id = "noop";
  }

  /** @param {RenderInit} init */
  startSession(init) {
    const sessionId = `session_${Date.now()}`;
    /** @type {BackendCapabilities} */
    const caps = {
      backend_id: this.backend_id,
      supports_rerender_block: false,
      supports_anchor_reset: false,
      supports_mouth_corrector: false,
      supports_viseme_conditioning: false,
      supports_restart_stream: false,
      supports_param_update: false,
      supports_failover: false,
      provides_webRTC_stream: false,
    };
    /** @type {RenderSession} */
    const session = { session_id: sessionId, caps, init, audio_features: [] };
    return session;
  }

  /**
   * @param {{ session: RenderSession, audio_features: AudioFeatureChunk[] | AsyncIterable<AudioFeatureChunk> }} args
   */
  async streamAudioFeatures(args) {
    const features = [];
    if (Symbol.asyncIterator in Object(args.audio_features)) {
      for await (const f of /** @type {AsyncIterable<AudioFeatureChunk>} */ (args.audio_features)) features.push(f);
    } else {
      features.push(.../** @type {AudioFeatureChunk[]} */ (args.audio_features));
    }
    args.session.audio_features.push(...features);
  }

  /**
   * @param {{ session: RenderSession, controls?: AsyncIterable<any> | any[] }} _args
   */
  async streamControls(_args) {
    return;
  }

  /**
   * @param {{ session: RenderSession }} args
   */
  async *streamFrames(args) {
    const config = normalizeRenderConfig(args.session.init.config);
    const durationMs = estimateDurationMs(args.session.audio_features);
    yield* streamNoopFrames({
      anchor_image_ref: args.session.init.anchor_image_ref,
      duration_ms: durationMs,
      config,
    });
  }

  /** @param {{ session: RenderSession }} _args */
  async endSession(_args) {
    return;
  }
}

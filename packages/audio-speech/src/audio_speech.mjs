/**
 * audio-speech -- reference implementation
 *
 * Implements streaming TTS adapter interfaces and audio feature extraction
 * helpers described in:
 * `packages/audio-speech/product_spec.md`
 * `packages/audio-speech/tech_spec.md`
 */

export const DEFAULT_AUDIO_FEATURES = Object.freeze({
  sample_rate_hz: 16_000,
  frame_ms: 25,
  hop_ms: 10,
  mel_bins: 80,
  pitch_floor_hz: 60,
  pitch_ceil_hz: 400,
  energy_floor: 1e-4,
});

/**
 * @typedef {Object} TtsRequest
 * @property {string} text
 * @property {string=} voice_id
 * @property {string=} language
 * @property {number=} sample_rate_hz
 * @property {number=} channels
 * @property {number=} chunk_ms
 * @property {Record<string, any>=} tags
 * @property {number=} duration_hint_sec
 */

/**
 * @typedef {Object} PcmChunk
 * @property {Float32Array|Int16Array|number[]} samples
 * @property {number} sample_rate_hz
 * @property {number} channels
 * @property {number} seq
 * @property {number} t0_ms
 * @property {number} t1_ms
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
 * Estimate speech duration from text using a deterministic heuristic.
 * @param {string} text
 * @param {{ words_per_minute?: number }=} opts
 * @returns {number}
 */
export function estimateSpeechSeconds(text, opts) {
  const s = String(text ?? "").trim();
  if (!s) return 0;
  const words = s.split(/\s+/u).filter(Boolean).length;
  const wpm = opts?.words_per_minute ?? 150;
  return words / Math.max(1e-6, wpm / 60);
}

/**
 * @param {Float32Array|Int16Array|number[]} samples
 * @returns {Float32Array}
 */
export function normalizePcm(samples) {
  if (samples instanceof Float32Array) return samples;
  if (samples instanceof Int16Array) {
    const out = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) out[i] = samples[i] / 32768;
    return out;
  }
  const arr = Array.isArray(samples) ? samples : Array.from(samples ?? []);
  return Float32Array.from(arr.map((v) => Number(v)));
}

/**
 * @param {Float32Array} frame
 * @returns {number}
 */
export function rmsEnergy(frame) {
  if (!frame.length) return 0;
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

/**
 * Naive pitch estimate from zero crossings.
 * @param {Float32Array} frame
 * @param {number} sampleRate
 * @param {number} energyFloor
 * @returns {number}
 */
export function estimatePitchHz(frame, sampleRate, energyFloor) {
  const energy = rmsEnergy(frame);
  if (energy < energyFloor) return 0;
  let crossings = 0;
  for (let i = 1; i < frame.length; i++) {
    if ((frame[i - 1] >= 0 && frame[i] < 0) || (frame[i - 1] < 0 && frame[i] >= 0)) crossings++;
  }
  const durationSec = frame.length / Math.max(1, sampleRate);
  if (durationSec <= 0) return 0;
  return Math.max(0, (crossings / durationSec) / 2);
}

/**
 * @param {{
 *  samples: Float32Array|Int16Array|number[],
 *  sample_rate_hz?: number,
 *  frame_ms?: number,
 *  hop_ms?: number,
 *  mel_bins?: number,
 *  energy_floor?: number,
 *  pitch_floor_hz?: number,
 *  pitch_ceil_hz?: number
 * }} args
 * @returns {AudioFeatureChunk[]}
 */
export function extractAudioFeatures(args) {
  const opts = { ...DEFAULT_AUDIO_FEATURES, ...args };
  const sampleRate = opts.sample_rate_hz;
  const frameSize = Math.max(1, Math.round((sampleRate * opts.frame_ms) / 1000));
  const hopSize = Math.max(1, Math.round((sampleRate * opts.hop_ms) / 1000));
  const samples = normalizePcm(args.samples);

  /** @type {AudioFeatureChunk[]} */
  const out = [];
  for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
    const frame = samples.subarray(start, start + frameSize);
    const energy = rmsEnergy(frame);
    let pitch = estimatePitchHz(frame, sampleRate, opts.energy_floor);
    if (pitch > 0 && (pitch < opts.pitch_floor_hz || pitch > opts.pitch_ceil_hz)) pitch = 0;

    const mel = new Array(opts.mel_bins).fill(Math.min(1, energy));
    const t0 = (start / sampleRate) * 1000;
    const t1 = ((start + frameSize) / sampleRate) * 1000;
    out.push({ t0_ms: t0, t1_ms: t1, mel, pitch_hz: pitch, energy });
  }
  return out;
}

/**
 * Stream audio feature chunks from a PCM stream.
 * @param {{
 *  pcm_stream: AsyncIterable<PcmChunk>,
 *  sample_rate_hz?: number,
 *  frame_ms?: number,
 *  hop_ms?: number,
 *  mel_bins?: number
 * }} args
 */
export async function* streamAudioFeatures(args) {
  const opts = { ...DEFAULT_AUDIO_FEATURES, ...args };
  const sampleRate = opts.sample_rate_hz;
  const frameSize = Math.max(1, Math.round((sampleRate * opts.frame_ms) / 1000));
  const hopSize = Math.max(1, Math.round((sampleRate * opts.hop_ms) / 1000));

  /** @type {number[]} */
  let buffer = [];
  let offsetSamples = 0;

  for await (const chunk of args.pcm_stream) {
    const samples = normalizePcm(chunk.samples);
    for (let i = 0; i < samples.length; i++) buffer.push(samples[i]);

    while (buffer.length >= frameSize) {
      const frame = Float32Array.from(buffer.slice(0, frameSize));
      const features = extractAudioFeatures({
        samples: frame,
        sample_rate_hz: sampleRate,
        frame_ms: opts.frame_ms,
        hop_ms: opts.frame_ms,
        mel_bins: opts.mel_bins,
      })[0];

      if (features) {
        features.t0_ms = (offsetSamples / sampleRate) * 1000;
        features.t1_ms = ((offsetSamples + frameSize) / sampleRate) * 1000;
        yield features;
      }

      buffer = buffer.slice(hopSize);
      offsetSamples += hopSize;
    }
  }
}

/**
 * Create PCM chunks from a Float32Array for streaming tests.
 * @param {Float32Array|number[]} samples
 * @param {{ sample_rate_hz?: number, chunk_ms?: number }} opts
 * @returns {PcmChunk[]}
 */
export function chunkPcm(samples, opts) {
  const sampleRate = opts?.sample_rate_hz ?? DEFAULT_AUDIO_FEATURES.sample_rate_hz;
  const chunkMs = opts?.chunk_ms ?? 40;
  const chunkSamples = Math.max(1, Math.round((sampleRate * chunkMs) / 1000));
  const normalized = normalizePcm(samples);

  /** @type {PcmChunk[]} */
  const out = [];
  let seq = 0;
  for (let start = 0; start < normalized.length; start += chunkSamples) {
    const slice = normalized.subarray(start, Math.min(normalized.length, start + chunkSamples));
    const t0 = (start / sampleRate) * 1000;
    const t1 = ((start + slice.length) / sampleRate) * 1000;
    out.push({ samples: slice, sample_rate_hz: sampleRate, channels: 1, seq, t0_ms: t0, t1_ms: t1 });
    seq += 1;
  }
  return out;
}

/**
 * Streaming TTS adapter that emits silence for the estimated duration.
 */
export class MockTtsAdapter {
  /** @param {{ default_sample_rate_hz?: number, default_chunk_ms?: number }=} opts */
  constructor(opts) {
    this.default_sample_rate_hz = opts?.default_sample_rate_hz ?? DEFAULT_AUDIO_FEATURES.sample_rate_hz;
    this.default_chunk_ms = opts?.default_chunk_ms ?? 40;
  }

  /** @param {TtsRequest} request */
  async *startTts(request) {
    const sampleRate = request.sample_rate_hz ?? this.default_sample_rate_hz;
    const chunkMs = request.chunk_ms ?? this.default_chunk_ms;
    const durationSec = request.duration_hint_sec ?? estimateSpeechSeconds(request.text);
    const totalSamples = Math.max(0, Math.round(durationSec * sampleRate));
    const silence = new Float32Array(totalSamples);
    const chunks = chunkPcm(silence, { sample_rate_hz: sampleRate, chunk_ms: chunkMs });
    for (const chunk of chunks) yield chunk;
  }
}

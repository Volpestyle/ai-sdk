import test from "node:test";
import assert from "node:assert/strict";

import {
  estimateSpeechSeconds,
  extractAudioFeatures,
  streamAudioFeatures,
  chunkPcm,
  MockTtsAdapter,
} from "../src/audio_speech.mjs";

test("estimateSpeechSeconds returns non-zero for text", () => {
  const sec = estimateSpeechSeconds("hello world");
  assert.ok(sec > 0);
});

test("extractAudioFeatures produces energy", () => {
  const sampleRate = 16_000;
  const samples = Float32Array.from({ length: sampleRate }, (_, i) => Math.sin((2 * Math.PI * 220 * i) / sampleRate));
  const feats = extractAudioFeatures({ samples, sample_rate_hz: sampleRate, frame_ms: 25, hop_ms: 25 });
  assert.ok(feats.length > 0);
  assert.ok(feats[0].energy > 0);
});

test("streamAudioFeatures yields chunks from PCM stream", async () => {
  const sampleRate = 16_000;
  const samples = Float32Array.from({ length: sampleRate / 2 }, (_, i) => Math.sin((2 * Math.PI * 180 * i) / sampleRate));
  const chunks = chunkPcm(samples, { sample_rate_hz: sampleRate, chunk_ms: 40 });
  async function* makeStream() {
    for (const chunk of chunks) yield chunk;
  }

  const out = [];
  for await (const feat of streamAudioFeatures({ pcm_stream: makeStream(), sample_rate_hz: sampleRate, frame_ms: 25, hop_ms: 25 })) {
    out.push(feat);
    if (out.length > 2) break;
  }
  assert.ok(out.length > 0);
});

test("MockTtsAdapter yields PCM chunks", async () => {
  const adapter = new MockTtsAdapter({ default_sample_rate_hz: 16_000, default_chunk_ms: 40 });
  let totalSamples = 0;
  for await (const chunk of adapter.startTts({ text: "hello world", duration_hint_sec: 0.4 })) {
    totalSamples += chunk.samples.length;
  }
  assert.ok(totalSamples > 0);
});

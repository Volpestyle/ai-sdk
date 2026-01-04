# Model / Provider Matrix (recommended defaults + alternates)

This is a **pragmatic “ship it” matrix**: pick a default per capability, keep alternates behind adapters.

> Notes:
> - “Provider” options prioritize **quality + low integration effort**.
> - “Local” options prioritize **control + privacy**, but usually require more engineering.

---

## A) Planning & reasoning (LLM)
**Used by:** `planning-control` (TurnPlan, ScenePlan)

- Default (provider): **OpenAI GPT-5.2 / GPT-5 mini** (structured outputs, long context, strong instruction following)
- Local / self-host: **OpenAI gpt-oss-120b** (open-weight) or **Meta Llama 4 Scout/Maverick**; smaller local tiers can run on single GPU with quantization.

---

## B) Moderation (illegal-only baseline)
**Used by:** `moderation-policy`

- Default (provider): **OpenAI omni-moderation-latest** (multimodal text+image moderation)
- Local: **Llama Guard** (text safety classification) + optional image safety classifier
- Video: sampled-frame moderation using the same image moderation classifier (defense-in-depth)

---

## C) Text-to-speech (TTS, streaming)
**Used by:** `audio-speech` and FT-Gen turn loop

- Default (provider): **OpenAI gpt-4o-mini-tts** (streaming)
- Alternate (provider): **ElevenLabs v3** (audio tags for expressive control)
- Local: **Coqui XTTS-v2** (voice cloning from short refs) + **Piper** (fast baseline voices)

---

## D) Speech-to-text (ASR, optional now; required later for voice input)
**Used by:** `audio-speech` (future user audio)

- Default (provider): **OpenAI gpt-4o-mini-transcribe** (better WER vs legacy Whisper)
- Local: **Whisper** or **faster-whisper** (CTranslate2)

---

## E) Audio features (mel/energy/pitch/visemes)
**Used by:** `audio-speech` -> `video-render`

- Default (local): mel-spectrogram + pitch/energy contours (torchaudio/librosa)
- Optional: phoneme/viseme timings via lightweight aligner (see `viseme-aligner`; backend dependent)

---

## F) I2V / talking head video render (FT-Gen differentiator)
**Used by:** `video-render`

- Default (local, pragmatic): **LivePortrait** (audio-driven portrait animation; real-time leaning)
- Provider alternatives (realtime avatar streaming): **HeyGen Streaming API**, **D-ID Agents Streams**, **Simli**, **Tavus** (all WebRTC-ish integrations)
- Offline/high-quality fallback: **OpenAI Sora 2** (video with synced audio; non-streaming clip generation)

---

## G) Matting / segmentation (Personastu + ingestion)
**Used by:** `ingestion-normalization`, `postprocess-compositing`

- Default (local, images): **MODNet** (trimap-free portrait matting)
- Default (local, video): **Robust Video Matting (RVM)** (temporal memory; real-time claims)
- High-quality interactive segmentation: **SAM 2** (images + videos; promptable; streaming memory)

---

## H) Face/pose detection + identity embeddings
**Used by:** `persona-core`, `identity-drift`, `ingestion-normalization`

- Default (local): **InsightFace** (face detection/alignment + embeddings)
- For stable mouth ROI + landmarks (lip-sync scoring/correction): use `face-track` (InsightFace/MediaPipe/etc)
- Speaker embeddings (local): **SpeechBrain ECAPA-TDNN** or **Resemblyzer**

---

## I) Identity-preserving image generation (Personastu persona transfer)
**Used by:** `scene-system` + `postprocess-compositing`

- Default (local): **InstantID** or **IP-Adapter FaceID** on **SDXL**
- Note: classic “face-swap” models often have restrictive licensing; prefer ID-preserving diffusion modules unless you have explicit commercial rights.

---

## J) Post-processing
**Used by:** `postprocess-compositing`

- Upscale/restore: **Real-ESRGAN** (general) + optional **CodeFormer** (faces)
- Lip-sync correction (optional): **MuseTalk** (real-time lip sync) or **Wav2Lip** baseline
- Lip-sync confidence: **SyncNet** (A/V sync scoring; see `sync-scorer`)

---

## K) Realtime transport + playback
**Used by:** `delivery-playback`

- Default: **WebRTC** with SFU (e.g., LiveKit self-host or managed)
- Encoding: H.264/AV1 + Opus
- A/V timestamps + sync monitoring: `av-sync` at the encoder/WebRTC boundary

---

## Source pointers (non-exhaustive)
- OpenAI model catalog + moderation/audio/vision/video docs
- Meta Llama 4 blog + HuggingFace pages
- DeepSeek-V3 GitHub/HF
- LivePortrait / MuseTalk / RVM / MODNet / SAM2 / InsightFace / Real-ESRGAN / CodeFormer repos

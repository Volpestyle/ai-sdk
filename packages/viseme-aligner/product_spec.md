# viseme-aligner — Product Spec

## Summary
`viseme-aligner` produces a **viseme timeline** (mouth shape targets over time) for a given
spoken utterance.

It is optional but high leverage for:
- improving lip sync stability (renderer can “aim” at visemes)
- deterministic mouth correction (especially for offline Personastu loops)
- debugging: explains *why* a segment is hard to sync

## Goals
- Provide a normalized `VisemeTimeline` contract used by:
  - video-render backends that accept viseme conditioning
  - mouth-corrector backends
  - sync-scorer auxiliary checks
- Support both realtime (FT-Gen) and offline (Personastu) modes.

## Non-goals
- Not a full multilingual phonology engine; it is a practical interface with pluggable backends.

## Inputs
- `text`: the exact spoken text (from TurnPlan segment)
- `audio`: the generated audio (PCM) or TTS stream
- `language`: BCP-47 tag (e.g., en-US)

## Outputs
- `VisemeTimeline`:
  - list of `{start_ms, end_ms, viseme_id, confidence}`
  - `source`: one of `tts_alignment`, `forced_aligner`, `heuristic`, `asr_alignment`
  - optional: phoneme timeline

## Backend options
1) **TTS-provided alignment (preferred for streaming)**
   - some TTS engines can return phoneme/word timings
2) **Forced aligner (best for offline)**
   - run alignment after audio is produced (adds latency)
3) **Heuristic / predicted durations (fallback)**
   - g2p + duration model or rule-based durations

## Success metrics
- timeline is temporally stable and doesn’t jump around
- confidence reflects uncertainty (occlusion/silence)
- improves measured sync score when used for conditioning/correction

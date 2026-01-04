# viseme-aligner — Tech Spec

## Data model

### VisemeTimeline
- `utterance_id`
- `language`
- `source`
- `visemes[]`:
  - `start_ms`, `end_ms`
  - `viseme_id` (normalized set)
  - `confidence`
- optional: `phonemes[]`:
  - `phoneme`, `start_ms`, `end_ms`, `confidence`

## Normalized viseme set
Use a small, backend-agnostic viseme inventory (example 15–20 classes), e.g.:
- `SIL` (silence)
- `AA`, `AE`, `AH`, `AO`
- `EH`, `ER`, `IH`, `IY`
- `OW`, `UH`, `UW`
- `BMP` (b/m/p)
- `FV` (f/v)
- `L`
- `WQ` (w/q)
- `CHJSH` (ch/j/sh)
- `TH`
- `TDK` (t/d/k/g)
- `S` (s/z)

Backends can map these to their own conditioning tokens.

## Backend implementations

### 1) TTS alignment backend (streaming-friendly)
If TTS provides:
- per-phoneme timestamps, or
- per-word timestamps + grapheme-to-phoneme,
then map phonemes to visemes and emit the timeline.

### 2) Forced aligner backend (offline/high quality)
- Take (text, audio)
- Run aligner to obtain phoneme timestamps
- Map phonemes -> visemes
- Emit timeline

This is the most accurate but adds latency.

### 3) Heuristic backend (low latency fallback)
- Run g2p on text
- Estimate duration per phoneme based on:
  - speaking rate estimate (words/sec) from TTS or default priors
  - punctuation-based pauses
- Produce approximate timestamps
- Confidence should be low; use mainly for conditioning.

### 4) ASR alignment backend (streaming-ish)
- Run lightweight ASR on recent audio window
- Align recognized text to expected text (edit-distance + timing)
- Emit refined timeline
This is complex but can be useful if TTS alignment is unavailable.

## Integration
- In FT-Gen:
  - call aligner only if backend supports viseme conditioning OR if you want diagnostics
  - prefer TTS alignment or heuristic; avoid forced aligner latency
- In Personastu offline loops:
  - forced aligner is acceptable and recommended

## Testing
- compare aligner timeline against ground truth on a small labeled set
- ensure viseme IDs map correctly for English baseline

## Mermaid diagram
Source: `diagrams/viseme_aligner_flow.mmd`

![Viseme Aligner Flow](diagrams/viseme_aligner_flow.png)

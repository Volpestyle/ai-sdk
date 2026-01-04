# audio-speech — Product Spec

## What it is
A set of services/libraries for **real-time audio IO**:
- streaming TTS (with expressive controls)
- optional ASR (for voice input later)
- audio feature extraction (mel/pitch/energy/visemes)
- VAD for barge-in and turn taking

## Used by
- FT-Gen turn pipeline (TTS → features → video render)
- Personastu (optional: add voiceover or short looping clips later)

## Deliverables
- Streaming TTS adapter interface (provider + local)
- Audio feature service (streaming windows)
- Optional ASR adapter interface
- Standard audio packet format between components

# video-render — Product Spec

## What it is
A pluggable “render engine” interface for **I2V talking-head generation**.

It standardizes inputs/outputs so you can swap:
- local research backends (e.g., LivePortrait)
- provider realtime avatar APIs (HeyGen/D-ID/Simli/Tavus)
- offline clip generation (Sora 2) as a fallback path

## Used by
- FT-Gen: core differentiator (per assistant turn → short video clip)
- Personastu: optional short loops, story assets, or “speaking” posts

## Deliverables
- Backend-neutral render API (gRPC recommended)
- Block-based streaming contract (frames out as soon as they’re ready)
- Backend capability flags (supports sink frames? supports listening loops?)

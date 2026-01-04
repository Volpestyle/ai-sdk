# postprocess-compositing — Product Spec

## What it is
Shared post-processing utilities to turn raw model outputs into **feed-ready media**:
- background replacement / alpha compositing
- lighting & color matching
- denoise / deartifact
- upscaling / restoration
- export profiles (PNG/JPEG/MP4, bitrates, etc.)

## Used by
- Personastu: core (background replacement, polish, exports)
- FT-Gen: optional (mouth refinement, stabilization, encode settings)

## Deliverables
- Compositing pipeline (matte + background + relight)
- Upscale/restore pipeline
- Export profiles + presets

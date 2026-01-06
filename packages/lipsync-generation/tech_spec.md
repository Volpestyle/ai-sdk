# lipsync-generation — Tech Spec

## Reference implementation (Python)
The reference implementation lives under `packages/lipsync-generation/python/` and exposes:

- `apply_lipsync(...)` — provider dispatch and output normalization.
- `apply_lipsync_fal(...)` — fal-specific adapter with streaming logs.
- `apply_lipsync_replicate(...)` — replicate adapter (handles LatentSync vs standard key names).

### Provider quirks
- **fal** expects `video_url`, `audio_url`, and `sync_mode`. The adapter uploads inputs, subscribes, and
  downloads the resulting clip.
- **replicate** expects either (`video`, `audio`) for LatentSync models or (`video_url`, `audio_file`) for others.

### Output normalization
Provider responses can be bytes, URLs, dicts with `url`, or arrays. `_coerce_output_to_bytes` normalizes
these cases into raw bytes for the caller to store.

### Error handling
- Missing clients raise `ProviderError("<provider>_client_unavailable")`.
- Unsupported provider raises `ProviderError("unsupported_lipsync_provider:<provider>")`.
- Missing output raises `ProviderError("provider returned no output")`.

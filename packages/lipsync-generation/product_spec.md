# lipsync-generation — Product Spec

## Summary
`lipsync-generation` applies provider-based lip-sync correction/generation to a video + audio pair, returning
synced video bytes that downstream systems can store or stream.

## Goals
- Provide a single entrypoint for provider-specific lip-sync generation.
- Normalize provider quirks (input keys, output formats, logging callbacks).
- Keep the output portable (bytes) so storage is handled by the caller.

## Non-goals
- Media storage, CDN URLs, or asset metadata (handled by storage-metadata or app code).
- Lip-sync quality scoring (handled by sync-scorer + quality-controller).

## Inputs
- `video_path`: local path to the source video.
- `audio_path`: local path to the audio track.
- `provider`: provider slug (`fal`, `replicate`, etc.).
- `model`: provider model id.
- `sync_mode`: provider-specific sync option (when supported).
- `extra_params`: passthrough overrides for provider APIs.

## Outputs
- Video bytes (MP4) for the lip-synced clip.

## Default providers
- **fal**: `fal-ai/sync-lipsync/v2/pro` (sync_mode supported).
- **replicate**: `kwaivgi/kling-lip-sync` or `latentsync` variants.

## Failure modes
- Provider returns no output or unexpected output shape.
- Unsupported provider or missing client library.
- Network timeouts or provider errors.

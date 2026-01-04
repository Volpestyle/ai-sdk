# Service Contracts (overview)

This repo uses **backend-agnostic** contracts so you can mix and match:

- local renderers
- provider avatar WebRTC bridges
- different scorers/aligners

For concrete gRPC definitions, see `proto/*.proto`.

## Recommended transport patterns

### In-process / same worker
- pass raw frames/audio as memory views or shared buffers
- avoid serialization overhead

### Cross-process (same host)
- pass `shm://` references + metadata
- or use UNIX domain sockets + shared memory

### Cross-host (cluster)
- pass references to object store / blob store
- use chunked streaming only for low-res monitoring

## Security
These components process biometric-like data (faces). Treat all payloads as sensitive:
- encrypt at rest
- restrict retention
- enforce access controls

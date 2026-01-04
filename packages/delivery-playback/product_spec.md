# delivery-playback — Product Spec

## What it is
Shared delivery primitives:
- **WebRTC playback** for low-latency interactive video (FT-Gen)
- **CDN delivery** (signed URLs) for downloadable/exported assets (Personastu)
- caching, retention, and client SDK helpers

## Deliverables
- WebRTC session primitives (signaling, auth, SFU integration)
- Encode ladders + adaptive degradation
- CDN link generation (signed URLs) + caching headers

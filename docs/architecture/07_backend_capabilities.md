# Backend Capability Profiles (examples)

The quality-controller relies on a backend-advertised capability profile.

## Local: LivePortrait + optional MuseTalk/Wav2Lip

```json
{
  "backend_id": "local_liveportrait_v0",
  "supports_rerender_block": true,
  "supports_anchor_reset": true,
  "supports_mouth_corrector": true,
  "supports_viseme_conditioning": false,
  "supports_restart_stream": false,
  "supports_param_update": true,
  "supports_failover": true,
  "provides_webRTC_stream": false
}
```

## Provider: HeyGen WebRTC

```json
{
  "backend_id": "provider_heygen",
  "supports_rerender_block": false,
  "supports_anchor_reset": false,
  "supports_mouth_corrector": false,
  "supports_viseme_conditioning": false,
  "supports_restart_stream": true,
  "supports_param_update": true,
  "supports_failover": true,
  "provides_webRTC_stream": true
}
```

## Provider: Bridge + local re-encode (advanced)

If you relay the provider stream into your own encoder (decode/re-encode),
you *can* apply local mouth correction at the cost of latency/compute:

```json
{
  "backend_id": "provider_bridge_reencode",
  "supports_rerender_block": false,
  "supports_anchor_reset": false,
  "supports_mouth_corrector": true,
  "supports_viseme_conditioning": false,
  "supports_restart_stream": true,
  "supports_param_update": true,
  "supports_failover": true,
  "provides_webRTC_stream": true
}
```

This is an important knob if provider lip sync is good but sometimes degrades in hard phoneme cases.

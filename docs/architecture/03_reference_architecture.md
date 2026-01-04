# Reference Architecture (AWS-first “ship it” stack)

This is a reasonable first production stack that keeps the system modular and AWS-native.

## Control plane (AWS)
- DynamoDB (metadata, jobs, personas, scenes)
- S3 (assets, masks, embeddings)
- ElastiCache Redis (session state + low-latency queues)
- SQS + Step Functions (durable queues and workflow orchestration)
- CloudWatch + X-Ray + OpenTelemetry (logs, metrics, traces)
- Secrets Manager + SSM Parameter Store (secrets/config)

## Realtime plane (FT-Gen)
- Session Gateway (API Gateway WebSocket or ECS service behind ALB) + Cognito auth
- SFU (LiveKit on ECS/EKS or managed LiveKit Cloud in AWS)
- Sticky Render Workers (GPU) on ECS/EKS/EC2 running:
  - Orchestrator
  - TTS adapter (or remote provider)
  - Audio features
  - Video render backend adapter (local or provider bridge)
  - Drift monitoring + lip-sync quality loop (identity-drift, face-track, sync-scorer, quality-controller)
  - A/V sync monitor at the WebRTC boundary (av-sync)

## Batch plane (Personastu)
- Step Functions + SQS (workflow engine + queue)
- GPU workers on ECS/EKS/AWS Batch for:
  - image generation / editing
  - matting/segmentation
  - upscaling/restoration

## Model/provider defaults
- LLM planning: OpenAI GPT-5.2 / GPT-5 mini
- Moderation: OpenAI omni-moderation-latest
- TTS: OpenAI gpt-4o-mini-tts (or ElevenLabs v3 if you need tags)
- I2V backend: LivePortrait locally for v0; provider streaming avatar as v1
- Image gen: OpenAI gpt-image-1.x or SDXL locally
- Video gen (non-stream fallback): OpenAI Sora 2

## Key scaling decisions
- Split “render” GPU pool from “batch” GPU pool to avoid tail latency.
- Sticky sessions for any backend that benefits from caches.
- Always record seeds/params for replay + debugging.

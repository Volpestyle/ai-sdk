# eval-lipsync-benchmark — Product Spec

## Summary
`eval-lipsync-benchmark` is a repeatable evaluation harness that prevents lip-sync regressions.

It runs standardized cases through either:
- local render pipeline, or
- provider avatar pipeline (via bridge)

and computes metrics:
- lip-sync score distribution (mean/p50/p95)
- estimated A/V offset distribution
- failure rate (below fail threshold)
- playback A/V offset (if WebRTC stats available)

## Goals
- Make lip-sync quality measurable and comparable across backends.
- Provide CI-friendly pass/fail gates.
- Provide debugging artifacts (sample clips, plots, raw scores).

## Non-goals
- Not a “beauty” or realism benchmark.
- Not a full end-to-end moderation test suite (separate).

## Inputs
- `EvalSuite` config:
  - personas (or synthetic anchors)
  - texts (short/long, plosives, fricatives)
  - voices / languages
  - backend targets (local/provider)
  - network simulation params (optional)

## Outputs
- JSON report + summary markdown
- optional: rendered clips for worst cases
- time-series of per-window scores

## Success metrics
- stable scores between releases (low variance)
- catch regressions before production

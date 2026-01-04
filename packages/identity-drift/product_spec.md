# identity-drift — Product Spec

## What it is
A shared quality/safety component that:
- measures **identity stability**, **style stability**, and **temporal artifacts**
- triggers **corrective actions** (anchor refresh, stronger conditioning, block re-render)
- provides metrics dashboards and regression testing signals

## Where it’s used
- FT-Gen: continuous monitoring during block streaming (drift prevention)
- Personastu: post-generation validation; auto-rerun or upscale path changes

## Deliverables
- Drift metric definitions + implementations
- Threshold bands (OK / warn / fail) per persona/mode
- Corrective controller interface used by orchestrator and render backends

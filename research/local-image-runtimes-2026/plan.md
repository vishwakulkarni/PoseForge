# Local image runtimes for PoseForge

Date: 2026-08-04

## Decision

Choose a local-first runtime and model set for PoseForge pose transfer, identity-preserving portrait generation, multi-person composition, and batches of up to six outputs. This is an approval document only; it does not change application code.

## Falsifiable hypotheses

1. ComfyUI is the best primary local backend because it combines workflow-level pose/identity control with a queue and a documented HTTP contract.
2. `stable-diffusion.cpp` is the best true CLI, but its narrower structural-control support makes it a fallback rather than the main PoseForge backend.
3. A commercially usable modern multi-reference model can cover most identity-preserving edits without InsightFace.
4. Exact skeletal pose transfer still benefits from an SDXL ControlNet workflow, but the strongest face-embedding adapters are not commercially clean.

## Scope and evidence

- Official repositories, documentation, model cards, and license files only.
- Runtimes: ComfyUI, Diffusers, InvokeAI, and stable-diffusion.cpp.
- Models/workflows: FLUX.2 Klein 4B, Qwen Image Edit 2511, SDXL OpenPose plus identity adapters.
- Hardware, batching, API/CLI shape, Apple Silicon/CUDA, licensing, and image input implications.

## Risks and stop criteria

- Model quality claims in model cards are vendor claims, not independent benchmarks.
- VRAM varies by precision, quantization, resolution, offload, and workflow nodes.
- Runtime license and model/adapter licenses are separate and must all be satisfied.
- Stop after an official contract, hardware statement, and license source exists for each shortlisted option.


# Hugging Face Diffusers

- Repository: https://github.com/huggingface/diffusers
- MPS: https://huggingface.co/docs/diffusers/optimization/mps
- Batch inference: https://huggingface.co/docs/diffusers/using-diffusers/batched_inference
- ControlNet: https://huggingface.co/docs/diffusers/using-diffusers/controlnet
- License: Apache-2.0
- Retrieved: 2026-08-04

Verbatim evidence:

> "Diffusers is a modular toolbox"

> "Diffusers is compatible with Apple silicon (M1/M2 chips) using the PyTorch `mps` device"

> "Generating multiple prompts in a batch can crash or fail to work reliably. If this is the case, try iterating instead of batching."

> "Batch inference processes multiple prompts at a time to increase throughput."

> "The downside is increased latency ... and more GPU memory is required for large batches."

Notes: best reference implementation and custom-pipeline library. It has Python pipeline calls, not a stable job-server or one-shot generation CLI, so PoseForge would need to own process lifecycle, API, queue, cancellation, model residency, and output transport.


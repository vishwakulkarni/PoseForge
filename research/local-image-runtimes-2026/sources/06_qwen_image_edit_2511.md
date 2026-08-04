# Qwen Image Edit 2511

- Model card: https://huggingface.co/Qwen/Qwen-Image-Edit-2511
- License: Apache-2.0
- Retrieved: 2026-08-04

Verbatim evidence:

> "notably better consistency"

> "improved character consistency"

> "Improved Multi-Person Consistency"

The official Diffusers example passes multiple PIL images as `image: [image1, image2]`.

Notes: strongest open commercial candidate for identity-sensitive and multi-person editing. It is a much larger model than FLUX.2 Klein 4B, and the official card does not state a minimum VRAM figure. Treat 24GB CUDA or 32–48GB unified memory with quantization/offload as an operational target to validate, not an official requirement.


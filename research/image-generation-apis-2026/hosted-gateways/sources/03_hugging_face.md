# S09-S10 and S13 — Hugging Face Inference Providers

Official sources:

- https://huggingface.co/docs/inference-providers/pricing
- https://huggingface.co/docs/inference-providers/tasks/image-to-image
- https://huggingface.co/api/models/black-forest-labs/FLUX.2-dev?expand=inferenceProviderMapping
- https://huggingface.co/api/models/black-forest-labs/FLUX.2-klein-9B?expand=inferenceProviderMapping

Verbatim evidence:

> "Access 200+ models from leading AI inference providers with centralized, transparent, pay-as-you-go pricing."

> "Hugging Face charges you the same rates as the provider, with no additional fees."

> Routed requests need no separate provider account; custom provider keys are also supported.

The current image-to-image mapping reports FLUX.2 Dev live on fal.ai, Together, and WaveSpeed. FLUX.2 klein 9B edit is live on fal.ai. Replicate mappings for these entries were reporting `error` when checked.

The normalized image-to-image request exposes prompt, guidance scale, negative prompt, steps, and target size. It does not expose every provider-specific multi-reference/indexing field in the documented common schema.

License metadata:

> FLUX.2 Dev and FLUX.2 klein 9B declare `flux-non-commercial-license` for downloadable weights.

Assessment: excellent evaluation router or bring-your-own-key abstraction, but not the first production adapter for PoseForge's advanced multi-reference controls.


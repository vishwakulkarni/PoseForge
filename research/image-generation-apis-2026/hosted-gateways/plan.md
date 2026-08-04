# Hosted image gateway research plan

Checked: 2026-08-04 (America/Los_Angeles)

## Decision

Choose the smallest hosted-provider set that gives PoseForge excellent multi-reference identity preservation, image editing, bulk generation, and an advanced pose-control escape hatch without committing the app to one model vendor.

## Hypotheses

1. Together AI is the best primary multi-model API because its current catalog exposes FLUX.2, Ideogram, Google, OpenAI, Qwen, and ByteDance image models behind one API key.
2. Replicate is the best secondary gateway because it combines current proprietary models with long-tail/community identity pipelines and asynchronous predictions.
3. Hugging Face Inference Providers is best for evaluation and provider portability, but its normalized image schema hides some model-specific controls needed by PoseForge.
4. RunPod becomes attractive only for a custom pose/identity pipeline or sustained traffic; cold starts, packaging, scaling, and model licenses make it a poor first hosted integration.

## Scope and stopping rule

Official provider/model documentation, official pricing, API behavior, concurrency/batching, and model-license metadata. Stop after a defensible primary, fallback, and self-host shortlist is verified. fal.ai pages were protected by a browser checkpoint, so fal-specific price claims are deliberately excluded rather than inferred.

## Risks

- Multi-reference consistency is not the same as skeleton/keypoint-accurate pose transfer.
- Hosted access does not automatically grant self-hosting or commercial-weight rights.
- Provider catalogs, prices, and rate limits change quickly.
- Community-model dependencies may have stricter licenses than the headline repository.


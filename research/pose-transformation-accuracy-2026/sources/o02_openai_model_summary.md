# OpenAI image model parameter summary

- URL: https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide#model-summary
- Accessed: 2026-08-20
- Type: primary vendor documentation / cookbook
- Credibility: high
- Recency: high (dated 2026-04-21)
- Bias: medium (vendor recommendation)

## Verbatim quotes

> “gpt-image-2 ... Recommended default for new builds. Use for highest-quality generation and editing, text-heavy images, photorealism, compositing, identity-sensitive edits, and workflows where fewer retries matter more than the lowest possible cost.”

> “gpt-image-2 ... input_fidelity: Disabled. input_fidelity does not work for this model because output is already high fidelity by default.”

> “gpt-image-1 ... Legacy compatibility only. If you are starting a new workflow or refreshing prompts, move to gpt-image-2.”

> “During migration, keep prompts largely the same at first, then retune only after you have compared output quality, latency, and retry rates on your real workload.”

## Notes

PoseForge currently hardcodes `gpt-image-1`; current official guidance recommends validating a move to GPT Image 2 for identity-sensitive production editing. Model recommendation does not prove keypoint-level pose adherence.


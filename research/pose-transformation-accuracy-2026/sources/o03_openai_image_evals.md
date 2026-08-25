# OpenAI image editing evaluation guidance

- URL: https://developers.openai.com/cookbook/examples/multimodal/image_evals#virtual-try-on
- Accessed: 2026-08-20
- Type: primary vendor evaluation guidance
- Credibility: high
- Recency: high
- Bias: medium

## Verbatim quotes

> “Unlike ‘creative’ edits, VTO is judged on fidelity + preservation.”

> “Preserve the wearer (face identity, body shape, pose).”

> “Use these as 0–5 scores to rank models and track improvement. Keep them separate (don’t average them inside the grader).”

> “Fail if any metric ≤ 2; Pass if all metrics ≥ 3.”

> “Add periodic calibration: keep a small set of ‘anchor’ examples that raters re-score to prevent drift.”

## Notes

The use case is virtual try-on rather than pose replacement, but the separation of facial similarity, body/pose preservation, artifacts, and calibrated human review transfers directly to PoseForge evaluation design.


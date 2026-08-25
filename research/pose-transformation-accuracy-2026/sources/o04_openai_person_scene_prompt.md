# OpenAI person-in-scene identity-sensitive prompting

- URL: https://developers.openai.com/cookbook/examples/multimodal/image-gen-1.5-prompting_guide#58-insert-the-person-into-a-scene
- Accessed: 2026-08-20
- Type: primary vendor prompting guide
- Credibility: high
- Recency: high
- Bias: medium

## Verbatim quotes

> “Anchor realism by specifying a grounded photographic look (natural lighting, believable detail, no cinematic grading), and lock what must not change about the subject.”

> “When available, higher input fidelity helps maintain likeness during larger scene edits.”

The official example uses `input_fidelity="high"` and `quality="high"` for a person-in-scene edit.

## Notes

Supports explicit invariant/realism language and high fidelity for legacy models. The example changes a scene rather than copying a separate pose, so exact pose-transfer prompting remains an engineering extension requiring evaluation.


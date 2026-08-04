# S01-S05 — Replicate

Official sources:

- https://replicate.com/pricing
- https://replicate.com/black-forest-labs/flux-2-pro
- https://replicate.com/black-forest-labs/flux-2-max
- https://replicate.com/docs/topics/predictions/create-a-prediction
- https://replicate.com/bytedance/flux-pulid
- https://replicate.com/zsxkib/instant-id
- https://replicate.com/tencentarc/photomaker

Verbatim evidence:

> "You only pay for what you use on Replicate. Some models are billed by hardware and time, others by input and output."

> FLUX.2 Pro: "High-quality image generation and editing with support for eight reference images."

> FLUX.2 Pro: "maintains consistent characters or styles across multiple reference images."

> FLUX.2 Max: "Up to 8 reference images via API" and "highest editing consistency across tasks."

Current embedded pricing metadata:

> FLUX.2 Pro: "$0.015" per run, "$0.015" per input image megapixel, and "$0.015" per output image megapixel.

> FLUX.2 Max: "$0.04" per run, "$0.03" per input image megapixel, and "$0.03" per output image megapixel.

> FLUX.1 Kontext Pro: "$0.04" per output image; Kontext Max: "$0.08" per output image.

> FLUX.2 klein 9B: "$2" per thousand input image megapixels and "$0.015" per output image megapixel.

API behavior:

> "There are two modes for creating predictions with the API: synchronous (sync) and asynchronous (async)."

> "Async mode (default) ... Returns immediately with a prediction ID."

Long-tail identity models remain available but are older: PuLID-FLUX is approximately $0.021/run, InstantID approximately $0.025/run, and PhotoMaker approximately $0.0053/run on their current pages. InstantID warns that its InsightFace face models are for non-commercial research despite Apache-licensed code.

Assessment: Replicate is the best secondary gateway and experimentation catalog. It is less attractive as the only provider because community versions vary operationally and per-megapixel billing complicates estimates.


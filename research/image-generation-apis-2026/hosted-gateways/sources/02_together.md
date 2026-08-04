# S06-S08 — Together AI

Official sources:

- https://docs.together.ai/docs/quickstart-flux
- https://docs.together.ai/docs/quickstart-flux-kontext
- https://docs.together.ai/docs/serverless/models
- https://www.together.ai/pricing
- https://docs.together.ai/docs/serverless/rate-limits

Verbatim evidence:

> "FLUX.2 is the next generation of image models, featuring enhanced control through JSON structured prompts, HEX color code support, reference image editing, and exceptional text rendering capabilities."

> FLUX.2 Pro supports "Multi-reference editing" and lets callers "Reference specific images by number."

> FLUX.2 Max is for "Ultimate quality"; Pro for production quality/speed; Dev for iteration; Flex for adjustable steps, guidance, and typography.

Current official image prices:

> FLUX.2 Pro $0.03/image; FLUX.2 Dev $0.0154/image; FLUX.2 Flex $0.03/image; FLUX.2 Max $0.070/MP; FLUX.1 Kontext Pro $0.04/image; Kontext Max $0.08/image; Ideogram 4.0 $0.06/image; Qwen Image 2.0 $0.04/image; Qwen Image 2.0 Pro $0.08/image.

The same catalog also lists GPT Image 2, Gemini 3.1 Flash Image, Nano Banana Pro, Imagen 4, and Seedream.

API style:

> `POST https://api.together.ai/v1/images/generations`

The official TypeScript SDK exposes `together.images.generate`, accepts `reference_images`, and can return base64 directly.

Operational limit:

> "Together AI applies dynamic per-model rate limits that scale with your sustained traffic."

> "If you need a known, fixed limit ... use a dedicated endpoint instead."

Assessment: strongest single-token primary gateway for PoseForge's hosted models. Dynamic rate limits require retry/backoff and prevent a hard public concurrency guarantee.


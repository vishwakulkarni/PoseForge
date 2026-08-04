# PoseForge engine and image-model options

Date: 2026-08-04  
Status: Research and approval proposal only. No PoseForge application code has been changed.

## Goal

Expand PoseForge beyond one hard-coded model per provider while preserving its local-first design. Users should be able to choose a provider and model directly or select a goal such as Best Quality, Fast, Budget, Exact Pose, or Local Private.

## Research status

- Local runtime research was completed and saved under `research/local-image-runtimes-2026/`.
- Hosted gateway research was substantially completed and saved under `hosted-gateways/` in this folder.
- The broad first-party provider sweep was stopped before completion to control research cost. OpenAI details below were verified against current official documentation. Google, Adobe, Stability, Ideogram, Recraft, Black Forest Labs direct API, and Seedream model identifiers must receive one final official-documentation check before implementation.
- All research agents were stopped after the approval shortlist was requested.

## Current PoseForge architecture findings

PoseForge currently exposes three engines:

- Codex CLI, with image generation selected indirectly by the CLI.
- OpenAI, hard-coded to `gpt-image-1`.
- Replicate, hard-coded to `black-forest-labs/flux-kontext-pro`.

The application currently treats provider and model as the same selection. Credentials are also stored as plain values in the settings table. Adding more integrations should therefore begin with a provider/model registry and safer credential storage, not more hard-coded adapters.

The current Replicate adapter also needs review: its own comment states that FLUX Kontext accepts one `input_image`, while the request additionally sends `pose_image`. The replacement must be tested against the live schema before Replicate remains a supported default.

## Recommended provider and model matrix

| Provider or runtime | Models or workflows | Best use | Recommendation |
|---|---|---|---|
| OpenAI API | `gpt-image-2`, `gpt-image-1-mini`; `gpt-image-1.5` fallback | General multi-reference editing, identity preservation, quality and budget tiers | Add first |
| Google Gemini API | Gemini 3 Pro Image and Gemini 3.1 Flash Image candidates | Quality and fast multi-reference portrait tiers | Add after final official slug verification |
| ComfyUI local API | FLUX.2 Klein 4B, Qwen Image Edit 2511, SDXL OpenPose workflow | Private local generation, family/couple identity, exact pose control | Best local engine |
| Together AI | FLUX.2 Pro, Max, Flex, Dev; Ideogram 4 | Broad hosted model catalog behind one API token | Best verified hosted multi-model provider |
| Replicate | FLUX.2 models and expert/custom identity workflows | Long-tail models, custom Cog deployments and experimentation | Keep as secondary after adapter repair |
| RunPod Serverless | Custom ComfyUI/OpenPose/identity container | Deterministic hosted exact-pose pipeline | Advanced phase only |
| fal.ai | Current FLUX/Qwen/Seedream candidates | Low-latency hosted specialist models | Promising, but pricing/queue evidence was not verified in this pass |
| Black Forest Labs direct | Current FLUX.2 Pro/Flex candidates | Photorealistic editing through a first-party route | Optional direct integration after verification |
| Stability AI | Stable Image Ultra/Core and structure/control services | Composition and structural control | Optional specialist provider |
| Adobe Firefly | Latest Firefly Image plus structure reference | Commercially conservative branded content | Defer until core portrait engines are evaluated |
| Ideogram | Current generation/remix models | Typography and promotional design | Not a PoseForge priority |
| Recraft | Current raster/vector models | Design assets and illustration | Defer |
| ByteDance Seedream | Current hosted editing model | Photorealistic generation/editing | Prefer through a verified gateway initially |
| Hugging Face Inference Providers | Provider-routed image models | Evaluation and abstraction | Optional; common schema hides advanced model controls |

## OpenAI options verified from official documentation

OpenAI's current image-generation guide identifies `gpt-image-2` as the latest GPT Image model.

### Recommended OpenAI tiers

- `gpt-image-2`: quality default and replacement for the hard-coded `gpt-image-1`.
- `gpt-image-1-mini`: economical/draft tier.
- `gpt-image-1.5`: compatibility fallback, not the default.
- `gpt-image-1`: legacy option; do not present as the recommended model.

### Current token prices captured on 2026-08-04

| Model | Image input | Cached image input | Image output | Text input |
|---|---:|---:|---:|---:|
| `gpt-image-2` | $8/M tokens | $2/M | $30/M | $5/M |
| `gpt-image-1.5` | $8/M | $2/M | $32/M | $5/M |
| `gpt-image-1-mini` | $2.50/M | $0.25/M | $8/M | $2/M |

Per-generation cost must be calculated from actual input/output token usage and resolution. PoseForge should display a preflight estimate and replace it with reported provider usage after generation.

Official sources:

- https://developers.openai.com/api/docs/guides/image-generation.md
- https://developers.openai.com/api/docs/pricing.md

## Best local and CLI options

### 1. ComfyUI local API — recommended production runtime

ComfyUI provides workflow JSON submission through `/prompt`, upload/history endpoints, queue behavior, and websocket progress. PoseForge should bind ComfyUI to `127.0.0.1`, keep public authentication in PoseForge, and submit pinned/versioned workflows.

Recommended workflows:

- FLUX.2 Klein 4B: default local general editing model. Apache-2.0 and approximately a 13 GB official VRAM target.
- Qwen Image Edit 2511: quality/multi-person tier with multiple image inputs and improved character/group consistency. Validate around 24 GB CUDA or 32–48 GB unified memory with quantization/offload.
- SDXL + OpenPose ControlNet + commercially permitted identity adapter: exact-pose tier. Older image quality but stronger skeletal control.

### 2. stable-diffusion.cpp — best true CLI

Use later as a lightweight GGUF/Apple Metal fallback. It offers a clean `sd-cli` and broad hardware support, but its strongest explicit ControlNet path is older and its RPC interface should never be exposed directly.

### 3. Codex CLI — keep as experimental convenience

Codex CLI is already integrated and remains useful for local workflows, but it does not give PoseForge deterministic model selection, provider pricing, or a stable image-generation contract. Do not make it the production default once explicit engines exist.

### Other local runtimes

- Diffusers: good engineering/prototype layer, but not a standard user-facing generation server.
- InvokeAI: capable FastAPI/queue alternative with optional Bearer/JWT support, but heavier than the ComfyUI integration.

Detailed local report:

- `research/local-image-runtimes-2026/2026-08-04_decision.md`

## Hosted gateway findings

### Together AI — recommended verified multi-model gateway

The completed gateway review recommends Together as the first hosted multi-model provider because it exposes a broad image catalog through one API token and an OpenAI-like Images API.

Captured model options and advertised prices:

- FLUX.2 Pro: default hosted transformation candidate; $0.03/image.
- FLUX.2 Max: premium/final tier; $0.070/megapixel.
- FLUX.2 Dev: economical advanced tier; $0.0154/image. Downloadable weights are non-commercial without separate licensing.
- FLUX.2 Flex: typography/parameter-control specialist; $0.03/image.
- Ideogram 4: text/design specialist; $0.06/image.

Dynamic rate limits mean PoseForge must handle 429/503 responses, backoff, and per-provider queue caps. No fixed concurrency promise should be shown.

### Replicate — secondary and experimental

Replicate remains valuable for FLUX.2 parity, asynchronous predictions, custom deployments, and experimental PuLID/InstantID/PhotoMaker pipelines. Do not label face-identity adapters commercially safe without resolving InsightFace and checkpoint licenses.

### RunPod — advanced custom-pipeline phase

RunPod is suitable for a containerized ComfyUI workflow that combines OpenPose/ControlNet with a commercially permitted identity path. It offers deterministic control but requires packaging, model caching, worker/concurrency configuration, cold-start tuning, and license management.

Detailed hosted report:

- `research/image-generation-apis-2026/hosted-gateways/2026-08-04_decision.md`

## Required architecture before adding providers

Introduce an engine-neutral generation request:

```text
generate({
  provider, model,
  identityImages[], poseImages[],
  prompt, negativePrompt,
  width, height, quality, seed,
  outputCount, controls, jobId
}) -> { externalJobIds[], usage }
```

Each model registry entry should include:

- Provider and stable model identifier.
- Capabilities: text-to-image, single-image edit, multi-reference, identity reference, exact pose/control, async, batch.
- Maximum identity/reference images and maximum outputs.
- Supported sizes, aspect ratios, quality levels and seeds.
- Cost formula: token, flat image, megapixel, GPU-second, or unknown.
- Privacy classification: local, first-party API, hosted gateway.
- Commercial/license classification and any warning.
- Expected latency tier and provider concurrency policy.
- Deprecation/replacement metadata.

Store provider, model, version, seed, input/output dimensions, estimate, actual usage, elapsed time and workflow version with every result.

## Studio UI proposal

### Normal mode

Show goal-oriented presets instead of a large model list:

- Best Quality
- Fast
- Budget
- Exact Pose
- Local Private

Display the selected provider/model beneath the preset with estimated price, expected speed, privacy location and reference limits.

### Advanced mode

Expose provider and model selectors plus capability-driven controls. Disable controls that a model cannot honor. For example, do not offer exact pose, four identities, seeds, or six simultaneous outputs when the chosen model/runtime does not support them.

## Bulk-generation behavior

- Keep six logical jobs in the UI and backend.
- Cloud providers may process jobs concurrently subject to rate limits and queue caps.
- A single local GPU should normally queue six jobs rather than execute six graphs simultaneously.
- Real local parallelism requires multiple workers/GPUs or measured device memory.
- For shared conditioning, model-native batching can be enabled only after memory benchmarking.

## Credential and privacy requirements

Before adding more API tokens:

- Stop storing provider secrets as unencrypted database values.
- Prefer environment variables or OS keychain/encrypted-at-rest storage.
- Never return full secrets through an API.
- Add test-credential and remove-credential actions.
- Tell users when identity/biometric images leave the computer and name the provider receiving them.
- Keep passport/visa/OCI processing local by default; generative assistance stays optional and experimental.

## Licensing exclusions

- Apache-licensed runtime code does not automatically clear model weights, face encoders, or checkpoints.
- FLUX Dev/Klein variants can have different licenses by checkpoint. FLUX.2 Klein 4B was selected because its reviewed card is Apache-2.0; do not assume the same terms for 9B/dev/Kontext variants.
- InstantID, IP-Adapter FaceID, PuLID and PhotoMaker variants may depend on research-only InsightFace/checkpoint terms.
- Hosted endpoint terms, output ownership, data retention and regional processing still require a provider-terms review.

## Mandatory evaluation before choosing defaults

Build a fixed PoseForge test set covering:

- One person, couple and family inputs.
- Several skin tones and age groups.
- Full-body, seated, action, crossed-limb and hand-heavy poses.
- One uploaded pose, library pose and pose collage.
- Square, portrait and landscape outputs.

Score each model on:

- Identity similarity per person.
- Pose/keypoint similarity.
- Missing or duplicated people.
- Hands, teeth and eyes.
- Prompt adherence.
- Latency, provider failures and retry rate.
- Actual cost.
- Local peak memory.

No provider marketing claim should determine the default without this evaluation.

## Approval packages for later implementation

### Minimal

- Provider/model registry.
- OpenAI `gpt-image-2` and `gpt-image-1-mini`.
- ComfyUI with FLUX.2 Klein 4B, Qwen Image Edit 2511 and SDXL OpenPose.
- Credential-security upgrade.

### Recommended

- Everything in Minimal.
- Together AI with FLUX.2 Pro/Max/Flex.
- Repair and retain Replicate as a secondary provider.
- Goal-oriented Normal mode and full Advanced model selector.
- Capability-aware cost/privacy/license display.

### Broad

- Everything in Recommended.
- Google quality/fast image models after official slug verification.
- RunPod custom exact-pose deployment.
- Optional direct Black Forest Labs, Stability and fal.ai integrations after evaluation.

Recommended future approval response: **Approve recommended package**.

## Primary research sources

OpenAI:

- https://developers.openai.com/api/docs/guides/image-generation.md
- https://developers.openai.com/api/docs/pricing.md

Hosted providers:

- https://docs.together.ai/docs/quickstart-flux
- https://www.together.ai/pricing
- https://docs.together.ai/docs/serverless/rate-limits
- https://replicate.com/pricing
- https://replicate.com/black-forest-labs/flux-2-pro
- https://replicate.com/black-forest-labs/flux-2-max
- https://replicate.com/docs/topics/predictions/create-a-prediction
- https://docs.runpod.io/serverless/endpoints/endpoint-configurations
- https://docs.runpod.io/serverless/pricing
- https://huggingface.co/docs/inference-providers/pricing
- https://huggingface.co/docs/inference-providers/tasks/image-to-image

Local runtimes and models:

- https://github.com/Comfy-Org/ComfyUI
- https://github.com/leejet/stable-diffusion.cpp
- https://github.com/huggingface/diffusers
- https://github.com/invoke-ai/InvokeAI
- https://huggingface.co/black-forest-labs/FLUX.2-klein-4B
- https://huggingface.co/Qwen/Qwen-Image-Edit-2511
- https://huggingface.co/xinsir/controlnet-openpose-sdxl-1.0
- https://github.com/instantX-research/InstantID

## Refresh checklist

Before implementation, refresh:

- OpenAI image model aliases and token prices.
- Google image model slugs, reference-image limits and prices.
- Together catalog and pricing.
- FLUX.2 checkpoint licenses.
- fal.ai pricing and queue documentation.
- Replicate input schemas for selected models.
- Provider retention/training/privacy terms.
- ComfyUI, model and custom-node versions/hashes.

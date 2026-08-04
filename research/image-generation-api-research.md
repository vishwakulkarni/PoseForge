# Image Generation/Editing API Research — Cost, Local vs. Cloud, Accuracy
*Compiled August 2026. Pricing changes fast on this market — verify before locking a launch budget, especially anything marked "preview."*

## Recommended provider and model matrix (completed)

| Provider or runtime | Models or workflows | Best use | Recommendation | Est. cost / image | Local feasible? | Accuracy signal |
|---|---|---|---|---|---|---|
| OpenAI API | `gpt-image-2`, `gpt-image-1-mini`; `gpt-image-1.5` fallback | General multi-reference editing, identity preservation, quality and budget tiers | Add first | $0.006–$0.05 low/med, $0.21 high (1K sq); ~$0.03–$0.06 flat on some resellers | No (API-only) | **#1 on Artificial Analysis text-to-image (Elo ~1339) and #1 on image-editing (Elo ~1258)**, best pose/anatomical accuracy per Kingy AI's category breakdown |
| Google Gemini API | Gemini 3 Pro Image ("Nano Banana Pro") and Gemini 3.1 Flash Image ("Nano Banana 2") | Quality and fast multi-reference portrait tiers | Add after final official slug verification | Pro: $0.134 (1K/2K), $0.24 (4K); Flash/Nano Banana 2: ~$0.04–$0.067 | No (API-only) | Nano Banana 2 (Flash) sits #4 on the editing leaderboard (Elo ~1247); Pro leads on native 4K output and skin texture, and is specifically called out as strong on identity preservation across up to 5 subjects |
| ComfyUI local API | FLUX.2 Klein 4B, Qwen Image Edit 2511, SDXL + OpenPose | Private local generation, family/couple identity, exact pose control | Best local engine | ~$0 marginal (electricity only, fraction of a cent/image) | **Yes** — see hardware table below | Below closed-API tier on blind-vote leaderboards, but Qwen Image Edit 2511 update specifically improved face-identity preservation across pose/style transforms; OpenPose ControlNet gives the most literal pose accuracy of anything in this list since it's a direct skeletal constraint, not a learned approximation |
| Together AI | FLUX.2 Pro, Max, Flex, Dev; Ideogram 4 | Broad hosted model catalog behind one API token | Best verified hosted multi-model provider | FLUX.2 [dev] $0.0154/img, FLUX.1 [schnell] $0.0027/img, SD3 $0.0019/img, FLUX.2 [pro] ~$0.03/img | No | FLUX.2 Pro/Max rank well on photorealism and cinematic lighting but trail GPT Image 2/Nano Banana on blind-vote Elo |
| Replicate | FLUX.2 models and expert/custom identity workflows | Long-tail models, custom Cog deployments and experimentation | Keep as secondary after adapter repair | $0.03–$0.05/img typical (billed per-second GPU compute — cold starts on unpopular models add $0.02–$0.08) | No | Same underlying models as Together/fal, so accuracy = whatever model you pick; markup is the real story (10–17x more than Together for the same FLUX weights) |
| RunPod Serverless | Custom ComfyUI/OpenPose/identity container | Deterministic hosted exact-pose pipeline | Advanced phase only | GPU-hour billed (varies by card); effectively local-model economics but hosted | N/A — hosted version of the local stack | Identical accuracy profile to the local ComfyUI stack it's running, since it's the same weights/workflow |
| fal.ai | Current FLUX/Qwen/Seedream candidates | Low-latency hosted specialist models | Promising, but pricing/queue evidence was not verified in this pass | FLUX schnell ~$0.003/img, SDXL/Flux $0.002–$0.004/img, Seedream 5.0 Pro ~$0.0675/img (≤1536²) | No | Sub-second latency; quality mirrors whichever underlying model is called (Flux, Qwen, Seedream) |
| Black Forest Labs direct | Current FLUX.2 Pro/Flex candidates | Photorealistic editing through a first-party route | Optional direct integration after verification | ~$0.03/MP text-to-image, ~$0.045/MP editing (≈$0.003–$0.05/img); Klein/dev weights free to self-host | Partially — [dev] and [klein] have downloadable weights; Pro/Max are API-only | Strong photorealism; FLUX.2 [klein] 4B is the only Apache-2.0 (fully commercial-safe) weight in the family |
| Stability AI | Stable Image Ultra/Core and structure/control services | Composition and structural control | Optional specialist provider | Not independently re-verified this pass | SD 3.5 fully self-hostable (~7GB FP8–12GB FP16) | Good value tier, generally below Flux/GPT/Nano Banana on blind Elo |
| Adobe Firefly | Latest Firefly Image plus structure reference | Commercially conservative branded content | Defer until core portrait engines are evaluated | $0.02–$0.10/img via API (credit-based); ~$1,000/mo enterprise minimum for API access | No | Not leaderboard-competitive on raw quality; value is IP-indemnified commercial safety, not accuracy |
| Ideogram | Current generation/remix models | Typography and promotional design | Not a PoseForge priority | Not independently re-verified this pass | No | Leads on text rendering/typography specifically, not portraits |
| Recraft | Current raster/vector models | Design assets and illustration | Defer | Not independently re-verified this pass | No | N/A to photoreal portrait/pose use case |
| ByteDance Seedream | Seedream 5.0 Pro | Photorealistic generation/editing | Prefer through a verified gateway initially | $0.045 (≤1.5K/2.36MP), $0.09 (2K) official; fal.ai lists ~$0.0675/img; first reference image typically free, extra refs ~$0.003 each | No | Ranked in the top tier on cost-adjusted quality; ByteDance's own comparisons claim an edge over Flux.2 on cinematic/multi-figure composition; independent Elo still trails GPT Image 2/Nano Banana Pro |
| Hugging Face Inference Providers | Provider-routed image models | Evaluation and abstraction | Optional; common schema hides advanced model controls | Passthrough — same as underlying provider | Varies by routed model | Abstraction layer, not its own accuracy profile |

## Local hardware requirements (for the "best local engine" row)

| Model | VRAM (practical) | Notes |
|---|---|---|
| FLUX.2 [klein] 4B | ~8–13 GB (Apache 2.0) | The only fully commercial-safe local Flux weight; ~2.6GB at Q4_K_M GGUF; sub-second generation on modern cards |
| FLUX.2 [klein] 9B | ~15–16 GB (FP8) | Non-commercial license |
| FLUX.2 [dev] | ~19GB (GGUF Q4 on a 4090) up to 64GB at BF16 | Non-commercial license; heaviest local option |
| Qwen Image Edit 2511 | 8GB (Q2_K, lower quality) to 40GB (BF16); ~16GB at FP8, ~14GB at GGUF Q4_K_M | Best local option for instruction-based editing, multi-image composition, and — notably for a pose app — improved face-identity preservation across pose/style transforms in the 2511 update |
| SDXL | ~8GB floor | Widest ControlNet/OpenPose ecosystem; best for exact pose control via skeletal conditioning |

System-level notes: budget 32–64GB system RAM alongside VRAM, ~60GB free disk per large model (weights + VAE + text encoder), and treat marginal per-image cost as electricity only once hardware is paid for. Several sources put the local/API breakeven around 25K–50K images/month for a card capable of running FLUX.2 [dev] or [klein] 9B.

## Local vs. cloud — the actual tradeoff

- **Cost crossover**: at low volume (hundreds to low thousands of images/month), hosted APIs are cheaper than buying a GPU. The breakeven most sources converge on is roughly 25K–50K images/month, after which a local 24GB+ card (RTX 4090/5090, or a rented A100/A6000 at $0.35–$1.15/hr) pays for itself.
- **Privacy/control**: local is the only option that keeps user-uploaded character photos off third-party servers entirely — relevant given the app's "family/couple identity" use case.
- **Accuracy ceiling**: the closed APIs (GPT Image 2, Gemini 3 Pro/Flash Image, Seedream 5.0 Pro) currently sit above every local open-weight model on blind-vote leaderboards (Artificial Analysis Image Arena). For pose-exact work specifically, though, local SDXL/Qwen + ControlNet-OpenPose gives a more literal, deterministic pose match than any closed API, because the pose is enforced as a hard skeletal constraint rather than inferred from a reference image.
- **Practical read for a pose-transfer app**: hosted GPT Image 2 or Nano Banana Pro/2 for launch-quality identity preservation without infra work; local ComfyUI (Qwen Image Edit 2511 or SDXL+OpenPose) once volume or privacy needs justify the hardware, matching the two-phase plan already in place — hosted first, self-hosted (InstantID/PhotoMaker + ControlNet on SDXL/Flux) later.

## Accuracy leaderboard snapshot (Artificial Analysis Image Arena, blind Elo)

**Text-to-image**: GPT Image 2 (high) ~1339 > Reve 2.1 ~1299 > MAI-Image-2.5 ~1270 > Nano Banana 2 Lite ~1263 ≈ GPT Image 1.5 (high) ~1263.

**Image editing** (more relevant to a pose-transfer/character-in-a-new-pose workflow): GPT Image 2 (high) ~1258 > MAI-Image-2.5 ~1254 > GPT Image 1.5 (high) ~1253 > Nano Banana 2 ~1247 > Seedream 5.0 Pro ~1243.

Caveat directly from Artificial Analysis: on the editing leaderboard specifically, GPT Image 2's lead over GPT Image 1.5 nearly disappears — the editing gap between top models is much tighter than the text-to-image gap, so for an editing-heavy pose app, price and speed may matter more than the last few Elo points.

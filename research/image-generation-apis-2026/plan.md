# Image-generation API options for PoseForge

Date: 2026-08-04

## Decision

Which first-party image-generation/editing APIs should PoseForge expose, by provider and model, for identity-preserving pose transformation, multi-reference portraits, and batches of up to six images?

## Scope

- Providers: OpenAI, Google Gemini/Imagen, Adobe Firefly, Black Forest Labs, Stability AI, Ideogram, Recraft, and ByteDance/Seedream where a direct first-party API is documented.
- Evidence: official model, API, pricing, rate-limit, security/privacy, and commercial-use documentation.
- Outputs: capabilities matrix, model slugs, authentication/integration notes, price units, uncertainties, and a recommended shortlist.
- Excluded: implementing providers, testing paid endpoints, third-party aggregators as a primary integration, and unsupported benchmark claims.

## Falsifiable hypotheses

1. OpenAI and Google provide the strongest first-party multi-image editing primitives for PoseForge identity plus pose references.
2. Black Forest Labs offers a better specialist pathway for explicit pose/depth control than general-purpose image APIs.
3. No single provider simultaneously leads identity preservation, explicit pose control, price, and enterprise indemnity/privacy.
4. A direct first-party Seedream API is either unavailable or materially less documented than access through a cloud/marketplace.

## Sourcing strategy

- Fetch current official provider documentation and pricing pages.
- Prefer model/API reference pages over launch posts; use launch posts for model positioning only.
- Treat marketing quality claims as provider claims, not independent evidence.
- Record unknown limits explicitly rather than infer them.
- Use retrieved-at dates because pricing and model names are volatile.

## Risk register

- Dynamic docs may not render in simple HTML fetches.
- Provider pricing may differ by region, resolution, sync/async endpoint, or image-edit vs image-generate operation.
- "Reference image" may mean style/composition rather than durable identity preservation.
- Public rate limits may be account-tier-specific or only visible after authentication.
- Data-retention and training terms can differ between consumer products and paid API/business products.

## Stop criteria

- An official model/API and pricing source for each provider that exposes a direct API.
- Explicitly identify providers without a verifiable direct first-party API.
- Enough evidence to propose a small approved integration set without claiming unverified identity quality.

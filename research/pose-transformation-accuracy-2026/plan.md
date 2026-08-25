# Pose transformation accuracy research plan

Date: 2026-08-20
Genre: decision report with implementation guidance
Depth: deep

## Decision

Choose the most accurate, commercially usable pose-transformation workflow for PoseForge, including identity inputs, pose controls, model/provider settings, prompts, validation, user capture guidance, and an evaluation protocol.

## Falsifiable hypotheses

1. Prompt-only multi-reference editing is insufficient for repeatable keypoint-accurate pose transfer; explicit pose conditioning or a pose-derived control representation is required for the highest adherence.
2. Identity and pose should be represented through separate conditioning channels; multi-view identity references plus explicit pose control outperform a single reference image or synthetic 3D avatar used alone.
3. Commercial photo editors expose simplified reference/strength controls, but their underlying product patterns still separate subject identity, structure/pose, and local preservation.
4. Input quality gates and automated evaluation reduce failed generations more reliably than increasingly long prompts.

## Report blocks

- Executive recommendation and ranked architecture options
- How commercial editors handle subject and pose references
- Academic/open-source evidence on pose and identity conditioning
- GPT Image-specific prompts, settings, and limitations
- Recommended PoseForge pipeline, user guidance, and failure recovery
- Evaluation metrics, acceptance thresholds, and experiment design
- Licensing/privacy risks and disconfirming evidence

## Sourcing strategy

- Primary vendor/API documentation for product capabilities and settings
- Original papers, project pages, and model cards for technical methods
- Independent benchmarks or practitioner evidence for comparative limitations
- Existing PoseForge research only as a starting map; refresh material claims against current sources
- Require three differently typed sources for high-confidence theses; flag weakly supported claims

## Opposition queries

- Cases where prompt-only editing beats ControlNet or pose conditioning
- Evidence that face restoration changes identity rather than preserving it
- Failures of OpenPose/DensePose with hands, occlusion, unusual camera angles, or multiple people
- Licensing restrictions around InsightFace-dependent identity adapters
- Commercial-editor marketing claims without reproducible evaluation

## Risk register

- Vendor internals are proprietary; distinguish documented UI behavior from inferred architecture.
- Public leaderboards may not measure identity and pose simultaneously.
- Academic metrics can reward facial similarity while ignoring anatomy or vice versa.
- Generated multi-view references can amplify hallucinated identity details.
- Model names, pricing, and API capabilities change quickly.

## Stop criteria

- At least 12 substantive sources across vendor, academic/open-source, official API, and independent/evaluation categories
- Every major recommendation supported by at least three independent sources or explicitly marked as an engineering hypothesis
- At least one adversarial source or limitation for each leading method
- Actionable prompts, settings, user instructions, and a PoseForge evaluation matrix

## Capability map

- Official OpenAI documentation search/fetch for GPT Image claims
- Direct web retrieval for vendor documentation, papers, model cards, and repositories
- Existing PoseForge research corpus for deduplication and prior licensing analysis
- Parallel research agents for commercial products, academic methods, and evaluation/user guidance

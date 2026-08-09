# PoseForge v0.1.0 — Release Notes

This is the first public release. Everything documented under `0.1.0` in the
changelog, including the early foundation work, ships in this release.

## What's in v0.1.0

Local-first pose transformation studio. Give PoseForge an identity photo and
a pose reference; it returns the same person or family in the new pose and
composition.

- Studio workbench with Normal and Advanced modes, per-person direction,
  camera/lighting/styling controls, fidelity controls, multi-pose collage
  splitting, recipes, and up to six queued variants.
- Multi-character support: up to four identity slots per generation.
- Codex CLI and Google Antigravity CLI as the primary, subscription-powered
  generation engines. ComfyUI and hosted API adapters (OpenAI, Gemini,
  Replicate, fal.ai) are available behind `POSEFORGE_ENABLE_ADDITIONAL_ENGINES`.
- Reusable character and pose libraries with best-effort AI auto-tagging.
- Generation history with inputs, outputs, latency, cost estimates, and
  rerun context.
- ID Photos formatting (U.S. and Indian passport, visa, e-Visa, OCI) behind
  `POSEFORGE_ENABLE_ID_PHOTOS`.
- One-command setup (`npm run setup`) that creates `.env`, installs
  dependencies, starts Docker PostgreSQL, runs migrations, and verifies
  bundled offline poses.

## Installation

```bash
git clone https://github.com/vishwakulkarni/PoseForge.git
cd PoseForge
npm run setup
npm run dev
```

Prerequisites: Node.js 20.9+, Docker Desktop or Docker Engine with Compose.
Open http://localhost:3000. No image engine is required to explore the
interface; authenticate Codex or Google Antigravity, connect local ComfyUI,
or configure a hosted provider in Settings to generate images.

## Tested platforms

- Ubuntu Linux, Node.js 20 and 22 — CI tested.
- macOS on Apple Silicon — maintainer tested.
- macOS on Intel, other Linux distributions — expected, community
  verification requested.
- Windows 11 with Docker Desktop — experimental; clean-install verification
  still needed before this can be claimed as supported.

## Known limitations

- No authentication or authorization layer — PoseForge is a trusted,
  single-user local application and should not be exposed to the internet
  or a shared network (see `SECURITY.md`).
- Database-backed API keys and ComfyUI workflow JSON are stored in plain
  text in local PostgreSQL; environment variables are preferred where
  supported.
- ComfyUI and hosted API adapters are feature-flagged off by default in this
  release.
- Windows setup is experimental and not yet verified on a clean machine.
- Generation-time benchmarks are not yet published per-demo (see
  `LAUNCH_CHECKLIST.md`, section 5).
- Clean-clone installation remains a release gate; consult
  `launch-readiness.json` for the latest verification record before publishing
  the tag.

## Upgrade instructions

This is the first public release; there is no prior version to upgrade
from. Future releases will document upgrade steps here, including any
required `.env` or database migration changes.

## Links

- [15-second generation walkthrough](https://github.com/vishwakulkarni/PoseForge/blob/v0.1.0/demo-output/poseforge-generation-walkthrough-15s.mp4)
- [Compatibility matrix](https://github.com/vishwakulkarni/PoseForge/blob/v0.1.0/docs/COMPATIBILITY.md)
- [Privacy and data flow](https://github.com/vishwakulkarni/PoseForge/blob/v0.1.0/PRIVACY.md)
- [Security policy](https://github.com/vishwakulkarni/PoseForge/blob/v0.1.0/SECURITY.md)
- [Support](https://github.com/vishwakulkarni/PoseForge/blob/v0.1.0/SUPPORT.md)
- [Changelog](https://github.com/vishwakulkarni/PoseForge/blob/v0.1.0/CHANGELOG.md)

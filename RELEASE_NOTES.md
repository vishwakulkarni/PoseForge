# PoseForge v1.0.0 — Release Notes

This is the first stable public release. It supersedes the unreleased
`0.1.0` line of work with a simplified, Docker-free setup and a reworked
Fluid Studio canvas.

## What's in v1.0.0

Local-first pose transformation studio. Give PoseForge an identity photo and
a pose reference; it returns the same person or family in the new pose and
composition.

- **PGlite by default.** No Docker or separate PostgreSQL server required;
  `npm run setup` creates an embedded database in `storage/pglite`. Existing
  PostgreSQL users can migrate with `npm run db:import-postgres`, or keep
  using PostgreSQL via `DATABASE_MODE=postgres`.
- Fluid Studio canvas: a persistent, multi-project workspace with
  configurable image blocks, protected project deletion, clipboard image
  pasting into sources, and reusable per-character angle profiles.
- Multi-character support: up to four identity slots per generation.
- Codex CLI and Google Antigravity CLI as the primary, subscription-powered
  generation engines, with in-app Settings guidance for detecting and
  authenticating each one. ComfyUI and hosted API adapters (OpenAI, Gemini,
  Replicate, fal.ai) are available behind `POSEFORGE_ENABLE_ADDITIONAL_ENGINES`.
- Reusable character and pose libraries with best-effort AI auto-tagging.
- Generation history with inputs, outputs, latency, cost estimates, and
  rerun context.
- ID Photos formatting (U.S. and Indian passport, visa, e-Visa, OCI) behind
  `POSEFORGE_ENABLE_ID_PHOTOS`.

## Installation

```bash
git clone https://github.com/vishwakulkarni/PoseForge.git
cd PoseForge
npm run setup
npm run dev
```

Prerequisites: Node.js 20.9+. Docker is optional (only needed to keep using
an external PostgreSQL instance). Open http://localhost:3000. No image
engine is required to explore the interface; authenticate Codex or Google
Antigravity, connect local ComfyUI, or configure a hosted provider in
Settings to generate images.

## Upgrade instructions

Existing local checkouts using PostgreSQL will keep working unchanged with
`DATABASE_MODE=postgres` set in `.env`. To move to the new default embedded
database, run `npm run db:import-postgres -- --yes`; it builds and validates
a fresh PGlite copy before switching over and keeps the previous embedded
database as a timestamped `pglite.backup-*` directory. Restart PoseForge
after the import.

## Tested platforms

- Ubuntu Linux, Node.js 20 and 22 — CI tested.
- macOS on Apple Silicon — maintainer tested.
- macOS on Intel, other Linux distributions — expected, community
  verification requested.
- Windows 11 — experimental; clean-install verification still needed before
  this can be claimed as supported.

## Known limitations

- No authentication or authorization layer — PoseForge is a trusted,
  single-user local application and should not be exposed to the internet
  or a shared network (see `SECURITY.md`).
- Database-backed API keys and ComfyUI workflow JSON are stored in plain
  text in local storage; environment variables are preferred where
  supported.
- ComfyUI and hosted API adapters are feature-flagged off by default in this
  release.
- Windows setup is experimental and not yet verified on a clean machine.

## Links

- [15-second generation walkthrough](https://github.com/vishwakulkarni/PoseForge/blob/v1.0.0/demo-output/poseforge-generation-walkthrough-15s.mp4)
- [Compatibility matrix](https://github.com/vishwakulkarni/PoseForge/blob/v1.0.0/docs/COMPATIBILITY.md)
- [Privacy and data flow](https://github.com/vishwakulkarni/PoseForge/blob/v1.0.0/PRIVACY.md)
- [Security policy](https://github.com/vishwakulkarni/PoseForge/blob/v1.0.0/SECURITY.md)
- [Support](https://github.com/vishwakulkarni/PoseForge/blob/v1.0.0/SUPPORT.md)
- [Changelog](https://github.com/vishwakulkarni/PoseForge/blob/v1.0.0/CHANGELOG.md)

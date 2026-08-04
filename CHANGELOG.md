# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- PoseForge Studio 2.0: a three-panel creative workbench with Normal and
  Advanced modes, light/dark theme switching, a responsive composition
  canvas, and an engine-aware generation dock.
- Advanced creative controls for per-person direction, identity and pose
  fidelity, camera, lighting, negative direction, aspect ratio, quality,
  and batches of up to four queued variants.
- Reusable Studio recipes via the new `studio_recipes` table and
  `GET/POST/DELETE /api/recipes` endpoints.
- Generation provenance for `studio_mode`, JSONB advanced settings, and
  multi-variant `batch_id` grouping.
- A creator-focused redesign across Landing, Characters, Pose Library,
  History, and Settings, with a persistent theme toggle.

- Open-source project scaffolding: Apache-2.0 license, `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md`, `ARCHITECTURE.md`, issue/PR
  templates, CI workflow, and an initial test suite.
- Pose library: the Gallery is now a functional, reusable pose picker
  instead of a static showcase. Every pose photo uploaded in Studio is
  automatically saved to the library (no separate "save" step) alongside a
  curated starter set, and can be reused from a small thumbnail strip
  directly in Studio or the full Gallery grid.
- Best-effort AI auto-tagging for pose references (`lib/poseTagger.js`):
  tries OpenAI vision, falls back to Codex CLI, and never blocks an upload
  if neither is configured.
- New `pose_references` table and `POST/GET/DELETE /api/pose-references`
  endpoints; `POST /api/generations` now accepts a `poseReferenceId` as an
  alternative to a raw `posePhoto` upload.
- Second pose-library seed batch (`007_family_pose_seed.sql`): 8 real,
  license-compliant group/family poses (2-4 people) from Pexels, tagged
  `category: group`, to pair with multi-character generations.
- Multi-character generations: Studio now supports up to 4 people per
  photo (progressive "+ Add another person" slots, each upload-or-saved
  like before). New `generation_characters` table backs this; all three
  engine adapters and the prompt template were updated to handle 1-4
  character references instead of exactly one.

### Changed

- **Breaking:** `POST /api/generations` no longer accepts singular
  `characterId`/`characterPhoto` fields — use `characterId_1..4` /
  `characterPhoto_1..4` instead (slots must be filled contiguously from
  1). The response shape's `characterId`/`characterName`/
  `characterPhotoUrl` fields are replaced by a `characters` array.

## [0.1.0] — 2026-08-03

### Added

- Local Express + PostgreSQL app for transforming a character photo into a
  pose reference's pose, framing, and composition.
- Pluggable generation engine adapters: Codex CLI (default, no API key
  needed), OpenAI (`gpt-image-1`), and Replicate.
- Character library with saved reference photos.
- Background and style presets, including a family-photoshoot and
  Instagram-post oriented preset set.
- Studio, Characters, Gallery (curated examples), History (your own past
  generations), and Settings screens with an Apple-inspired, always-light
  design system.
- Painter-dog mascot artwork (SVG placeholder + a `npm run generate:mascot`
  script that produces the full-quality version via Codex CLI).
- Docker Compose file for a local PostgreSQL instance.

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Open-source project scaffolding: Apache-2.0 license, `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md`, `ARCHITECTURE.md`, issue/PR
  templates, CI workflow, and an initial test suite.

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

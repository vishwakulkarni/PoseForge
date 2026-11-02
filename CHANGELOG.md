# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- MCP server at `http://127.0.0.1:3000/mcp`: local agents (Claude Code,
  Cursor, local models) can manage characters and poses, build and run
  Advanced Studio workflows, and read history, metrics, engines and
  settings. Loopback-only with DNS-rebinding protection; optional bearer
  token when listening beyond localhost. See `docs/MCP.md`.
- `POST /api/advanced-studio-projects/:id/run` runs a whole workflow (or
  chosen nodes) in dependency order in the background; projects report
  in-flight nodes as `activeRun`.
- Advanced Studio create and update responses include `warnings` for nodes,
  edges and generator settings that were dropped or will be ignored.
- CI fails when an API route has neither an MCP tool nor a reasoned
  exclusion (`tests/mcpCoverage.test.js`).
- Advanced Studio workflows can be templates: `{{name}}` placeholders and
  `inputName` nodes are filled per run, and `POST /:id/batch` runs one
  workflow once per row of inputs (up to 100).
- Every Advanced Studio run is recorded with its version, inputs, outputs and
  estimated cost. A **Versions** menu in the toolbar lists each version with
  what its runs cost and can restore an older version (results are kept).
- Image inputs can reference a character (its current primary photo), a pose
  library entry, or a web image URL, which is downloaded once at run time.
- Share Advanced Studio workflows as one `.poseforge.json` file.
  - **Share** in the toolbar exports the nodes, connections, prompts, chosen
    models and embedded input images and clips. Outputs are not included.
  - **Import workflow** shows how each generator fits your setup and keeps the
    author's model unless you switch to one you have configured.
  - New API routes: `GET /:id/export`, `POST /import/preview` and `POST /import`.
  - New MCP tools: `export_workflow`, `preview_workflow_import` and
    `import_workflow`.
- Adaptable automation for Advanced Studio workflows:
  - New nodes: **LLM Text** writes captions, hooks and prompt ideas with an
    engine that can write text (OpenAI, Gemini). **List** fans a workflow out:
    everything after it runs once per line, up to 25. **Image Transform**
    crops or pads an image to 9:16, 4:5, 1:1, 16:9 or 3:4, and can write a
    caption band on it, locally and for free. **Output** marks what a run
    delivers; runs now report `deliverables`, named after the output node.
  - The **Codex CLI** can write text for LLM Text nodes (and prompt
    assistance), and can edit images for Image Transform nodes from a
    free-form instruction, using local tools or its image generator.
  - **Fallback models**: a generator or LLM Text node tries the next model in
    `fallbacks` when its own is not set up or fails. Each result records the
    engine and model that made it.
  - **Setting inputs**: `inputBindings` lets a run input set a node's model,
    aspect ratio, resolution, outputs or duration, or a transform's format.
    Video and audio inputs can be filled with web URLs too.
  - **Resume**: `POST /:id/runs/:runId/resume` (MCP `resume_run`) reruns a
    failed or partial run's unfinished nodes, reusing what the finished ones
    produced. At startup, runs a restart cut off are closed as partial or
    failed instead of staying `running`.
  - **Triggers** run a workflow unattended: on a schedule (every N minutes,
    or daily at a set time), from a webhook with a secret token, or on demand.
    The new routes are `/:id/triggers` and `POST /hooks/:triggerId`. The new
    MCP tools are `list_triggers`, `create_trigger`, `update_trigger`,
    `delete_trigger` and `run_trigger`. Migration `018` adds the triggers
    table.
  - Node types are defined once on the server (`lib/advancedNodes/`), and
    `GET /capabilities` describes them as `nodeTypes`. A new node type is
    now one server module and one UI module.

### Changed

- Each image engine declares its Advanced Studio settings (`imageSettings`:
  aspect ratios and resolution tiers) in its own module, as video engines
  already did with `videoModels`. Adding a provider is one engine file.

### Removed

- The Google Antigravity CLI engine, along with its Settings card, model
  setting, Metrics quota panel and `ANTIGRAVITY_*` variables. Its image
  generation no longer works: the image service returns `500 Internal Server
  Error` on every request, and the CLI keeps retrying until it times out, still
  reporting success. Past Antigravity generations stay in History, and a saved
  default engine of `antigravity` falls back to Codex.

## [1.0.0] — 2026-08-26

### Added

- Fluid Studio canvas: a persistent, multi-project workspace with
  configurable image blocks, protected project deletion, clipboard image
  pasting into sources, and reusable per-character angle profiles.
- Settings guidance for Codex CLI and Google Antigravity CLI: readiness
  reasons now include concrete setup steps (`codex login`, `agy install`)
  and install links, plus a reminder to reopen the terminal so an updated
  `PATH` takes effect.

### Changed

- **Breaking:** PGlite is now the default embedded database; PostgreSQL via
  Docker Compose is no longer required for local development. A
  `npm run db:import-postgres` script is provided to migrate data from an
  existing PostgreSQL instance.
- Reworked Pages publishing to only build and ship the landing page and
  documentation, and repaired broken documentation links.

### Fixed

- Stabilized Studio canvas source workflows and the canvas dot grid.

### Security

- Patched a high-severity Dependabot advisory in the transitive `nanoid`
  dependency (indefinite loop on a zero-size custom generator) via an npm
  override to `nanoid@^3.3.18`.

## [0.1.0] — 2026-08-08

### Added

- PoseForge Studio 2.0: a three-panel creative workbench with Normal and
  Advanced modes, light/dark theme switching, a responsive composition
  canvas, and an engine-aware generation dock.
- Advanced creative controls for per-person direction, identity and pose
  fidelity, camera, lighting, negative direction, aspect ratio, quality,
  and batches of up to six queued variants.
- Reusable Studio recipes via the new `studio_recipes` table and
  `GET/POST/DELETE /api/recipes` endpoints.
- Generation provenance for `studio_mode`, JSONB advanced settings, and
  multi-variant `batch_id` grouping.
- A creator-focused redesign across Landing, Characters, Pose Library,
  History, and Settings, with a persistent theme toggle.
- A rebuilt ID Photos workflow for U.S. and Indian passport, visa, e-Visa,
  and OCI photos, with local formatting, optional AI assistance, 4×6 sheets,
  dated requirements, and official authority links.
- In-app User Guide and Metrics reference generated from repository Markdown.

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

- Hardened Next.js hydration and responsive navigation across the app and
  Fumadocs, including desktop and mobile Docs navigation.
- Combined Express and Next.js behind one local server and one origin; local
  development now uses `npm run dev` and production uses `npm start`.
- Made production builds offline-friendly by replacing build-time Google Font
  downloads with polished system font stacks.
- Expanded CI and Playwright coverage to include documentation changes and
  both desktop and mobile browser projects.

- **Breaking:** `POST /api/generations` no longer accepts singular
  `characterId`/`characterPhoto` fields — use `characterId_1..4` /
  `characterPhoto_1..4` instead (slots must be filled contiguously from
  1). The response shape's `characterId`/`characterName`/
  `characterPhotoUrl` fields are replaced by a `characters` array.

### Also included (early foundation work)

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

[1.0.0]: https://github.com/vishwakulkarni/PoseForge/releases/tag/v1.0.0
[0.1.0]: https://github.com/vishwakulkarni/PoseForge/releases/tag/v0.1.0

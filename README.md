# PoseForge

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

**Your identity. Any pose.**

PoseForge is a local-first AI photo studio: give it a photo of someone and a
reference photo of a pose, and it generates a new photo of that person in
that pose — same identity, new composition. Built with family photoshoots
and Instagram-ready posts in mind, but useful for any character-in-pose
transformation.

It runs entirely on your own machine. No account, no cloud dependency
required — pick from six interchangeable generation engines (Codex CLI,
Antigravity CLI, ComfyUI, OpenAI, Gemini, or Replicate) depending on what
you have access to.

## Screens

- **Studio** — a three-column workbench: **Sources** on the left (up to four
  identity slots and the pose reference), a live composition **canvas** in the
  middle, and **Direction** on the right. Normal mode keeps it to background,
  style and a free-form brief. Advanced mode adds per-person direction,
  identity/pose/age/hair fidelity, camera and lighting, composition, finish,
  aspect ratio, up to six queued variants, multi-pose collage splitting, and
  reusable recipes. A docked bar at the bottom holds the engine picker, a live
  usage estimate, and the generate action.
- **Characters** — a saved library of people you photograph often, so you
  never have to re-upload them.
- **Poses** — your pose library. Curated starter poses plus every pose
  you've ever uploaded (auto-saved and AI-tagged, no extra step), filterable
  by category and tag, ready to reuse in Studio.
- **History** — every generation you've actually run, filterable, with full
  detail and the ability to delete.
- **Metrics** — token usage, spend, latency percentiles, queue wait, engine
  mix and grouped failure reasons across every run, with Session/Historical
  scope and JSON/CSV export.
- **Settings** — configure engine API keys and your default engine.
- **Docs** — the project's own documentation, rendered in-app.

## Architecture at a glance

The UI and the API are separate processes:

| Process | Port | Owns |
|---|---|---|
| Express (`server.js`) | 3004 | API, generation queue, engine adapters, file storage |
| Next.js (`web/`) | 3000 | The entire UI, proxying `/api` and `/storage` to Express |

The Next.js app holds no business logic. Every rule about what makes a valid
generation is enforced in the Express layer; the React app mirrors those
rules only to give faster feedback.

## Quickstart

Prerequisites: Node.js 20+, Docker (for local Postgres), and optionally the
[Codex CLI](https://github.com/openai/codex) authenticated if you want to
use that engine.

```bash
git clone https://github.com/yourusername/poseforge.git
cd poseforge
cp .env.example .env
docker compose up -d postgres
npm run install:all      # installs both the API and web/ dependencies
npm run migrate
npm run dev:all          # Express on :3004, Next.js on :3000
```

Open http://localhost:3000. Configure OpenAI, Gemini or Replicate keys from
Settings — Codex, Antigravity and ComfyUI readiness is auto-detected.

Development logs include request IDs, HTTP status/duration, generation
queue transitions, and engine start/finish/failure events. API keys and
image contents are never logged.

### Useful scripts

| Command | What it does |
|---|---|
| `npm run dev:all` | Both processes, with reload |
| `npm run dev` | API only, on :3004 |
| `npm run dev:web` | UI only, on :3000 |
| `npm run test:all` | API tests and web unit/component tests |
| `npm run test:e2e` | Playwright smoke suite (needs the API running) |
| `npm run build:web` | Production build of the UI |

## Testing

| Layer | Tool | Location |
|---|---|---|
| API units | `node:test` | `tests/*.test.js` |
| UI units, hooks, reducers | Vitest | `web/tests/*.test.ts` |
| Components with mocked API | Vitest + RTL + MSW | `web/tests/*.test.tsx` |
| End-to-end | Playwright | `web/e2e/*.spec.ts` |

Some API tests require the native `sharp` module and will fail in
environments where native addons cannot load.

## Generation engines

| Engine | Requires | Notes |
|---|---|---|
| **Codex CLI** | Codex CLI installed + authenticated | Default, no API key stored in the app |
| **Antigravity CLI** | Antigravity CLI + a signed-in Google plan | Token and credit usage depends on the plan; cost is not exposed |
| **ComfyUI** | A local ComfyUI server and an exported API workflow | Fully local; no provider tokens, no API charges |
| **OpenAI** | An OpenAI API key (Settings screen) | Uses `gpt-image-1` |
| **Gemini** | A Gemini API key (Settings screen) | Flash and Pro image model tiers |
| **Replicate** | A Replicate API key (Settings screen) | Configurable model slug in `engines/replicateEngine.js` |

Adding a seventh engine is a small, self-contained change — see
`ARCHITECTURE.md` and `CONTRIBUTING.md`.

## Mascot artwork

The site's painter-dog mascot has two layers: a hand-built SVG placeholder
(always available, no dependencies) and a full-quality version you can
generate yourself:

```bash
npm run generate:mascot
```

This calls Codex CLI with the mascot's prompt and writes the result to
`public/images/mascot-painter-dog.png`. The site already points there with
an automatic SVG fallback, so this is the only step needed.

## Configuration

Copy `.env.example` to `.env` and adjust as needed:

```text
PORT=3004
DATABASE_URL=postgres://postgres:postgres@localhost:5432/poseforge
```

The Settings screen includes guided setup for Codex CLI, Google Antigravity
CLI, Google Gemini, and local ComfyUI workflows. Antigravity accepts
`ANTIGRAVITY_BIN`, `ANTIGRAVITY_MODEL`, and `ANTIGRAVITY_TIMEOUT_MS` and
uses the cached login created by an interactive `agy` session. Gemini accepts `GEMINI_API_KEY` and
`GEMINI_IMAGE_MODEL`; ComfyUI accepts `COMFYUI_URL`, `COMFYUI_MODEL`,
`COMFYUI_WORKFLOW_PATH`, and `COMFYUI_TIMEOUT_MS`. ComfyUI is restricted to
loopback addresses unless `COMFYUI_ALLOW_REMOTE=true` is explicitly set.
Database-backed API keys and workflows are stored as plain text — see
`SECURITY.md` before running this anywhere but your own machine.

## Testing

```bash
npm test
```

## Project docs

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — stack, data model, and the engine
  adapter pattern
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — dev setup, testing, how to add an engine
- [`SECURITY.md`](SECURITY.md) — threat model and how to report vulnerabilities
- [`CHANGELOG.md`](CHANGELOG.md) — notable changes, by version

## License

Apache License 2.0 — see [`LICENSE`](LICENSE).

# PoseForge

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

**Your identity. Any pose.**

PoseForge is a local-first AI photo studio: give it a photo of someone and a
reference photo of a pose, and it generates a new photo of that person in
that pose — same identity, new composition. Built with family photoshoots
and Instagram-ready posts in mind, but useful for any character-in-pose
transformation.

It runs entirely on your own machine. No account, no cloud dependency
required — pick from three interchangeable generation engines (Codex CLI,
OpenAI, or Replicate) depending on what you have access to.

## Screens

- **Studio** — a light-first creative workbench with a persistent light/dark
  theme and Normal/Advanced modes. Add up to 4 identities, choose a reusable
  pose, then direct background, style, and a free-form brief. Advanced mode
  adds per-person direction, identity/pose fidelity, camera and lighting
  controls, aspect ratio, quality, 1-4 queued variants, and reusable Studio
  recipes. Engine capability notes explain when a control is native or
  interpreted as prompt direction.
- **Characters** — a saved library of people you photograph often, so you
  never have to re-upload them.
- **Gallery** — your pose library. Curated starter poses plus every pose
  you've ever uploaded (auto-saved and AI-tagged, no extra step), filterable
  by pose type, ready to reuse in Studio.
- **History** — every generation you've actually run, filterable, with full
  detail and the ability to delete.
- **Settings** — configure engine API keys and your default engine.

## Quickstart

Prerequisites: Node.js 18+, Docker (for local Postgres), and optionally the
[Codex CLI](https://github.com/openai/codex) authenticated if you want to
use that engine.

```bash
git clone https://github.com/yourusername/poseforge.git
cd poseforge
cp .env.example .env
docker compose up -d postgres
npm install
npm run migrate
npm start
```

Open http://localhost:3004. Configure OpenAI or Replicate keys from
Settings — Codex CLI readiness is auto-detected from your `PATH`.

For development with auto-restart and verbose JSON logs:

```bash
npm run dev
```

Development logs include request IDs, HTTP status/duration, generation
queue transitions, and engine start/finish/failure events. API keys and
image contents are never logged.

## Generation engines

| Engine | Requires | Notes |
|---|---|---|
| **Codex CLI** | Codex CLI installed + authenticated | Default, no API key stored in the app |
| **OpenAI** | An OpenAI API key (Settings screen) | Uses `gpt-image-1` |
| **Replicate** | A Replicate API key (Settings screen) | Configurable model slug in `engines/replicateEngine.js` |

Adding a fourth engine is a small, self-contained change — see
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

Optional engine settings are `CODEX_BIN`, `CODEX_TIMEOUT_MS`, and
`REPLICATE_TIMEOUT_MS`. API keys are configured from the Settings screen
and stored as plain text in the local database — see `SECURITY.md` before
running this anywhere but your own machine.

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

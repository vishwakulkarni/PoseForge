# PoseForge

[![CI](https://github.com/vishwakulkarni/PoseForge/actions/workflows/ci.yml/badge.svg)](https://github.com/vishwakulkarni/PoseForge/actions/workflows/ci.yml)
[![Web](https://github.com/vishwakulkarni/PoseForge/actions/workflows/web.yml/badge.svg)](https://github.com/vishwakulkarni/PoseForge/actions/workflows/web.yml)
[![Latest release](https://img.shields.io/github/v/release/vishwakulkarni/PoseForge?include_prereleases)](https://github.com/vishwakulkarni/PoseForge/releases)
[![Node.js 20.9+](https://img.shields.io/badge/Node.js-20.9%2B-339933?logo=nodedotjs&logoColor=white)](package.json)
[![Ubuntu CI tested](https://img.shields.io/badge/Ubuntu-CI%20tested-E95420?logo=ubuntu&logoColor=white)](docs/COMPATIBILITY.md)
[![macOS maintainer tested](https://img.shields.io/badge/macOS-maintainer%20tested-000000?logo=apple&logoColor=white)](docs/COMPATIBILITY.md)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

[Open the landing page and documentation](https://vishwakulkarni.github.io/PoseForge/) · The full Studio runs locally because generation, storage, and its embedded database are intentionally not hosted on GitHub Pages.

## Turn the AI subscription you already pay for into a private, local-first photo studio

Give PoseForge an identity photo and a pose reference. It returns the same
person—or family—in the new pose and composition, with controls for camera,
lighting, styling, fidelity, and output format.

PoseForge exists so Codex, Google Antigravity, and ComfyUI users can turn their
existing AI access into a repeatable visual workflow instead of rebuilding the
same multi-image prompt in chat for every photograph.

[![PoseForge character to pose to transformed-result demo](web/public/demo/poseforge-homepage-demo.gif)](demo-output/poseforge-generation-walkthrough-15s.mp4)

[Watch the 15-second generation walkthrough](demo-output/poseforge-generation-walkthrough-15s.mp4) ·
[Download the lightweight 10-second MP4](web/public/demo/poseforge-readme-demo.mp4) ·
[Quickstart](#quickstart) ·
[How it works](#how-it-works) ·
[Examples](#examples) ·
[Landing page source](web/app/page.tsx) ·
[Documentation](docs/USER_GUIDE.md) ·
[Roadmap](ROADMAP.md) ·
[Support](SUPPORT.md) ·
[Discussions](https://github.com/vishwakulkarni/PoseForge/discussions)

<video controls preload="metadata" width="100%" poster="web/public/demo/poseforge-homepage-demo.gif">
  <source src="demo-output/poseforge-generation-walkthrough-15s.mp4" type="video/mp4">
  Your Markdown viewer does not support embedded video. Use the walkthrough link above.
</video>

> **Local-first, not automatically offline.** Your workspace, embedded PGlite
> database, character library, pose library, and generated files stay on your
> machine. ComfyUI can keep inference fully local. Codex CLI, Google
> Antigravity, and hosted API engines send only the references, prompt, and
> settings selected for that generation to their provider. See
> [Privacy and data flow](PRIVACY.md).

## Quickstart

Prerequisite: Node.js 20.9+. PGlite is embedded, so Docker and a separate database server are not required.

```bash
git clone https://github.com/vishwakulkarni/PoseForge.git
cd PoseForge
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). `npm install` installs both
the API and web dependencies. The embedded PGlite database is created and
migrated automatically on first start. Settings can be configured in the app;
copy `.env.example` to `.env` only if you want to set options such as API keys
up front. To check a fresh install end to end (database and the 16 bundled
offline poses), run `npm run setup`.

No image engine is required to explore the interface. To generate images,
authenticate Codex or Google Antigravity, connect local ComfyUI, or configure
a hosted provider in **Settings**.

## How it works

1. **Choose the identity.** Upload one to four people, or reuse saved character
   references.
2. **Choose the pose.** Upload a pose, split a pose sheet, or select one of the
   bundled references.
3. **Direct and generate.** Set composition, camera, lighting, styling, and
   fidelity; then run through Codex, Antigravity, ComfyUI, or a hosted API.

PoseForge stores successful pose uploads in the reusable pose library and
keeps generation history, usage, latency, cost estimates, and outputs together
on the local machine.

## Consistent characters, on any provider

PoseForge keeps the parts that make a result look like the *same person* on your
machine, then hands each provider the same carefully prepared inputs:

- **Characters live locally.** Saved character references, per-character angle
  profiles, your pose library, and every generation are stored in the embedded
  PGlite database and local image storage, not in a provider account.
- **A local pipeline does the preparation.** References are normalized, poses can
  be split from multi-pose sheets, and the multi-image prompt is assembled with
  your identity, pose, camera, lighting, and fidelity controls before any engine
  is called, so engines receive consistent, well-formed input.
- **The same characters carry through images and videos.** Reuse one saved
  character across Studio stills and Advanced Studio image and video nodes, with
  up to four people per generation, instead of re-describing them each time.
- **Switch providers without starting over.** Characters, poses, history,
  projects, and metrics all stay put when you change engine, so you can try
  Codex, Antigravity, Dreamina, Higgsfield, ComfyUI, or a hosted API and compare
  results from identical inputs.
- **Metrics are calculated locally.** Usage, cost, latency, and reliability come
  from your own stored runs; nothing is sent to a PoseForge cloud, because there
  isn't one.

Output quality still depends on the engine and model you choose; PoseForge's job
is to give each one the best, most consistent starting point.

## Choose where the image is made

[![Codex CLI](https://img.shields.io/badge/Codex%20CLI-supported-111827)](https://github.com/openai/codex)
[![Google Antigravity](https://img.shields.io/badge/Google%20Antigravity-supported-4285F4?logo=google&logoColor=white)](docs/COMPATIBILITY.md)
[![ComfyUI](https://img.shields.io/badge/ComfyUI-fully%20local-111827)](docs/COMPATIBILITY.md)

| Engine | Existing plan/account | Separate API key | Fully local | Selected inputs leave machine |
|---|---|---:|---:|---:|
| **Codex CLI** | Authenticated Codex access | No | No | Yes, to the CLI provider |
| **Google Antigravity CLI** | Signed-in Google plan | No | No | Yes, to Google services |
| **ComfyUI** | Not required | No | **Yes**, when loopback-only | **No**, when loopback-only |
| **OpenAI API** | API billing/account | Yes | No | Yes, to OpenAI |
| **Google Gemini API** | API billing/account | Yes | No | Yes, to Google Gemini |
| **Replicate** | API billing/account | Yes | No | Yes, to Replicate/model provider |
| **fal.ai** | API billing/account | Yes | No | Yes, to fal.ai |

Consumer subscriptions and API billing are often separate products. Signed-in
CLI behavior, quotas, and retention remain subject to the provider account and
terms. Database-backed API keys and ComfyUI workflow JSON are stored in plain
text in the local database; prefer environment variables where supported and
read [SECURITY.md](SECURITY.md) before use on a shared machine.

Studio supports **seven** interchangeable engines. **Advanced Studio** adds two
more providers, **Higgsfield** and **Dreamina**, for image and video nodes, and
uses fal.ai for video too:

| Advanced Studio engine | Access | Image models | Video models |
|---|---|---|---|
| **Higgsfield** | API credentials (hosted) | Higgsfield Soul, Grok Imagine | Seedance 2.5, Kling 2.5 Turbo |
| **Dreamina** | Signed-in Dreamina Canvas CLI | Seedream 4.0–5.0, GPT Image 2 / 2.5 | Seedance 2.0 / 2.5 |

Higgsfield and Dreamina usage is metered in credits and shown on the
**Metrics** page next to token and dollar spend. Selected inputs leave your
machine for both providers. Adding another engine is a small adapter change; see
[the engine interface](engines/engineInterface.md).

## Examples

The people below are fictional, AI-created demo subjects. These visuals show
the intended character → pose → result contract without publishing private
user photos. They are product demonstrations, not provider quality benchmarks.

### Individual editorial pose transfer

Identity stays recognizable while the reference contributes body position,
camera framing, and composition; the final scene adds new lighting and art
direction.

![Fictional model identity, pose reference, and cobalt editorial result](web/public/images/poseforge-transformation-hero.webp)

| Detail | Value |
|---|---|
| Engine | Codex CLI |
| Configuration | Default Studio Normal mode, cobalt editorial preset |
| Hardware | Maintainer macOS development machine |
| Generation time | Recorded per-run in **History**; not yet published for this asset |

### Indian family using an American family pose

The middle photograph supplies only the arrangement: parents seated on either
side while their two-year-old stands between them. The result keeps the Indian
family identities and applies that family pose in a new festive setting.

![Fictional Indian family identity, American family pose reference, and transformed Indian family result](web/public/images/poseforge-indian-family-pose-transfer-v2.webp)

| Detail | Value |
|---|---|
| Engine | Google Antigravity CLI |
| Configuration | Multi-character Studio mode (3 identity slots), festive setting preset |
| Hardware | Maintainer macOS development machine |
| Generation time | Recorded per-run in **History**; not yet published for this asset |

### Reproducible 10-second demo reel

The README animation combines both transformations into a character → pose →
result story. AGY assembled the local media pipeline; `sharp` renders 300
frames and FFmpeg creates the MP4 and optimized GIF without network assets.

| Detail | Value |
|---|---|
| Inputs | The two fictional triptychs above |
| Output | [MP4](web/public/demo/poseforge-readme-demo.mp4) and [GIF](web/public/demo/poseforge-homepage-demo.gif) |
| Media engine | AGY-orchestrated local `sharp` + FFmpeg pipeline |
| Runtime output | Exactly 10.00 seconds, 300 frames at 30 FPS |
| Hardware | Maintainer macOS development machine; media render is CPU-local |
| Reproduce | `bash scripts/generate-readme-demo.sh` |

For generation benchmarks, record the exact engine, model, prompt, runtime,
local hardware, and provider date. Do not compare providers using unrecorded
launch assets or publish identifiable photos without permission.

## Studio, Advanced Studio, and Metrics

### Studio: character → pose → result

The guided workbench. Pick up to four identity slots, a pose reference (or split
a multi-pose sheet), then direct per-person styling, camera, lighting, and
fidelity. A live workflow canvas shows what feeds the generation, recipes save
your settings, and up to six variants can be queued at once. Normal mode keeps
the controls compact; Advanced mode adds per-person direction and identity and pose
fidelity controls.

### Advanced Studio: free-form node workflows

A multi-project node canvas for workflows that do not start from a character
and a pose. Start from a template or a blank canvas, wire nodes together, and
run them from the canvas:

| Template | Opens with |
|---|---|
| **Image generation** | Prompt node → Image Generator (text-to-image or image-to-image) |
| **Video generation** | Prompt node → Video Generator, with frames or references where the model allows |
| **Storyboard** | Three ordered scene groups, each with a prompt and a still; rename, duplicate, and extend |
| **Blank canvas** | Add any node you like |

Node types include text/prompt, image and media inputs, image and video
generators, and groups. Generator options (aspect ratios, resolutions,
reference-image limits) come from what each engine can actually do rather than
a global list. Generator nodes can run on Higgsfield and Dreamina as well as
the Studio engines (see below). Projects autosave, edges can be cut, and the canvas has
keyboard shortcuts and a selection toolbar. Open it at `/studio-advanced`.

![Advanced Studio node canvas for the "baby running" example: prompt nodes feed image generators whose outputs chain into video generators](web/public/images/poseforge-advanced-studio-baby-running.webp)

*The bundled "Example: baby running" project: prompts feed image generators, and
their outputs chain into video generators. Fictional, AI-created subjects.*

### Automate it: MCP server for local agents

PoseForge serves an MCP endpoint at `http://127.0.0.1:3000/mcp`, so Claude
Code, Cursor or any local agent can create characters, build and run Advanced
Studio workflows, and pull results, history and metrics without the UI:

```bash
claude mcp add --transport http poseforge http://127.0.0.1:3000/mcp
```

See the [MCP guide](docs/MCP.md) for the tool list and an end-to-end example.

### Metrics: know what each generation cost

The Metrics page summarizes every generation stored locally: lifetime spend,
tokens, success rate, median and P95 latency, queue wait, and active days. It
adds a cumulative usage chart (group by day, week, month, or run; tokens or
cost), a per-engine and per-model breakdown, recurring failure groups, and
Codex and Antigravity account-limit windows. Switch between **Historical** and
**Session** scope, and export JSON or CSV. Values are marked actual, estimated,
partial, or local, so you can tell provider-reported usage from estimates; see
the [metrics reference](docs/METRICS.md).

### Try it without installing

A read-only static demo of the whole app, including sample Metrics data, is
published from `main` to GitHub Pages: <https://vishwakulkarni.github.io/PoseForge/>.
Generation is disabled there; run PoseForge locally to create images.

## What is included

- **Studio:** guided character → pose → result workbench described above.
- **Advanced Studio:** node-canvas image, video, and storyboard workflows.
- **Characters and poses:** reusable local libraries with normalized image
  storage, pose filtering, and best-effort tagging.
- **History:** generation details, inputs, outputs, deletion, and rerun context.
- **ID Photos:** local formatting for U.S. and Indian passport, visa, e-Visa,
  and OCI profiles, with optional AI assistance kept separate.
- **Metrics:** usage, spend, latency, reliability, and exports described above.
- **Documentation:** repository Markdown rendered inside the application.

## Architecture

PoseForge runs as one Node.js server. Express owns `/api`, `/storage`, database
rules, generation queues, and engine adapters; Next.js owns the interface. The
browser talks to one local origin. See [ARCHITECTURE.md](ARCHITECTURE.md) for
the request lifecycle, data model, and adapter contract.

![PoseForge architecture: Codex, Antigravity, Dreamina, OpenAI, Gemini, Replicate, fal.ai, Higgsfield and ComfyUI connect to PoseForge, which stores data and calculates metrics on your machine](web/public/images/poseforge-architecture.svg)

[System architecture](ARCHITECTURE.md#system-architecture) ·
[Generation call flow](ARCHITECTURE.md#generation-call-flow) ·
[Object and data flow](ARCHITECTURE.md#object-and-data-flow)

## Useful commands

| Command | Purpose |
|---|---|
| `npm install` | Install API and web dependencies |
| `npm run setup` | Optional: clean-install dependencies, create `.env`, migrate, and verify bundled poses |
| `npm run dev` | Start the complete application with Next.js development mode |
| `npm run build:web` | Create the production web build |
| `npm run test:all` | Run API and web unit/component tests |
| `npm run test:e2e` | Run Playwright desktop and mobile smoke tests |
| `npm run docs:sync` | Regenerate in-app documentation from repository Markdown |
| `bash scripts/generate-readme-demo.sh` | Rebuild the README MP4 and GIF locally |

## Documentation and community

- [User guide](docs/USER_GUIDE.md)
- [MCP server for local agents](docs/MCP.md)
- [Troubleshooting and FAQ](docs/TROUBLESHOOTING.md)
- [Compatibility and hardware matrix](docs/COMPATIBILITY.md)
- [Privacy and data flow](PRIVACY.md)
- [Security policy](SECURITY.md)
- [Architecture](ARCHITECTURE.md)
- [Contributor guide](CONTRIBUTING.md)
- [Roadmap](ROADMAP.md)
- [Support](SUPPORT.md)
- [Changelog](CHANGELOG.md)
- [GitHub Discussions](https://github.com/vishwakulkarni/PoseForge/discussions)

## Configuration

The default `.env.example` uses embedded PGlite under `storage/pglite`. Set
`DATABASE_MODE=postgres` and `DATABASE_URL` to use an existing PostgreSQL
server instead. Other optional environment variables include `CODEX_BIN`,
`CODEX_TIMEOUT_MS`, `ANTIGRAVITY_BIN`,
`ANTIGRAVITY_MODEL`, `ANTIGRAVITY_TIMEOUT_MS`, `GEMINI_API_KEY`,
`GEMINI_IMAGE_MODEL`, `FAL_KEY`, `COMFYUI_URL`, `COMFYUI_MODEL`,
`COMFYUI_WORKFLOW_PATH`, and `COMFYUI_TIMEOUT_MS`.

PGlite is a single-process embedded database. Do not run multiple PoseForge
server processes against the same `PGLITE_DATA_DIR`; use PostgreSQL for
multi-process or remotely hosted deployments.

### Import an existing PostgreSQL database

Keep the source `DATABASE_URL` in `.env`, stop PoseForge, and run:

```bash
npm run db:import-postgres -- --yes
```

The command builds and validates a fresh PGlite copy before replacing the
configured `PGLITE_DATA_DIR`. It preserves the previous embedded database as a
timestamped `pglite.backup-*` directory. Restart PoseForge after the import.

ComfyUI is restricted to loopback addresses unless
`COMFYUI_ALLOW_REMOTE=true` is deliberately configured. OpenAI, Gemini,
Replicate, and fal.ai credentials can also be configured in Settings.

## Production and security boundary

```bash
npm start
```

`npm start` builds the web app on first run. After pulling updates, rebuild it
with `npm run build:web`.

PoseForge is a trusted, single-user local application. It has no authentication
or authorization layer and should not be exposed directly to the internet or a
shared network. Review [SECURITY.md](SECURITY.md) and [PRIVACY.md](PRIVACY.md)
before changing that boundary.

## License

Apache License 2.0. See [LICENSE](LICENSE).

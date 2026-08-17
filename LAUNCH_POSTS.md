# PoseForge v0.1.0 Launch Kit

Target launch: Tuesday, September 1, 2026. Replace `[RELEASE_URL]` only after
the `v0.1.0` GitHub Release is live. Verify each community's current rules
before posting; these drafts do not authorize automated or coordinated posts.

## Core facts

- Promise: Turn the AI subscription you already pay for into a private,
  local-first photo studio.
- Primary v0.1.0 paths: authenticated Codex CLI and Google Antigravity CLI.
- Local boundary: workspace, PostgreSQL data, libraries, history, and outputs
  stay local. Selected references, prompt, and settings go to the chosen CLI
  provider for generation.
- Setup: Node.js 20.9+, Docker Compose, `npm run setup`, then `npm run dev`.
- Call to action: try the release, report install friction, and share only
  transformations you have permission to publish.

## Show HN

Title: `Show HN: PoseForge – use Codex or Antigravity as a local-first pose studio`

Post:

> I built PoseForge because repeating multi-image identity/pose prompts in chat
> was hard to reproduce and even harder to organize. It is an Apache-2.0
> Node.js application that keeps identities, pose references, generation
> history, settings, and outputs on your machine while using an authenticated
> Codex or Google Antigravity CLI for the generation step.
>
> The workflow is character → pose → direction → result. It supports up to
> four identity references, reusable pose and character libraries, camera and
> styling controls, batches, and local usage/latency metrics. The browser talks
> to one Express/Next.js origin; PostgreSQL and file storage remain local.
>
> Setup is `npm run setup`, which installs locked dependencies, starts the
> bundled PostgreSQL service, migrates it, and verifies the offline pose pack.
> The app has no auth layer and is deliberately a trusted single-user tool,
> not something to expose to the public internet.
>
> I would especially value reports from clean macOS/Linux installs and
> criticism of the provider/privacy boundary. Demo and release: [RELEASE_URL]

## Product Hunt

Tagline: `Turn Codex or Antigravity into your local-first AI pose studio`

Short description: `Give PoseForge identity photos and a pose reference, then direct the composition and generate through AI access you already have—while keeping your library, history, and files local.`

Gallery order:

1. 15-second generation walkthrough.
2. Individual identity → editorial pose → result triptych.
3. Indian family → American-family pose → transformed family triptych.
4. Studio workbench screenshot.
5. Privacy/data-flow diagram.

First comment:

> I made PoseForge after wanting a repeatable way to preserve identity while
> borrowing only pose and composition from another image. v0.1.0 focuses on
> Codex CLI and Google Antigravity CLI, with one-command local setup and no
> separate API key for those signed-in paths. I am here all day for questions,
> setup reports, and honest feedback—especially where the first-generation
> flow takes more than 15 minutes.

FAQ:

- **Is generation offline?** Not with Codex or Antigravity: the selected
  references and prompt go to that provider. Local ComfyUI exists behind an
  additional-engine flag but is not a primary supported v0.1.0 path.
- **Do I need an API key?** Not for the signed-in CLI paths. Hosted adapters
  are feature-flagged and may require separately billed keys.
- **Where are my files?** On the machine running PoseForge. See `PRIVACY.md`
  for the exact boundary.
- **Can I host it publicly?** No. v0.1.0 has no authentication or authorization
  layer and is intended for a trusted single-user environment.

## X / Twitter thread

1. I built PoseForge to turn the AI subscription you already pay for into a private, local-first photo studio. Give it identities + a pose reference; direct the shot; generate through Codex or Google Antigravity. [video]
2. The pose image supplies composition—not identity. PoseForge keeps character slots, poses, settings, batches, results, and history together instead of rebuilding the prompt in chat every time. [triptych]
3. Your workspace, PostgreSQL data, libraries, and outputs stay local. The selected references + prompt leave the machine only for the CLI provider you choose. That boundary is documented plainly.
4. Fresh setup is Node 20.9+ + Docker, then `npm run setup` and `npm run dev`. The setup verifies the 16 bundled offline poses before declaring success.
5. v0.1.0 is Apache-2.0 and open source. I want clean-install reports and blunt feedback on the first-generation flow: [RELEASE_URL]

## LinkedIn

Most AI subscriptions are powerful, but the useful workflow often disappears
inside one-off chats. I built PoseForge to make one workflow repeatable:
identity photos + a pose reference → the same person or family in a directed
composition.

PoseForge uses authenticated Codex or Google Antigravity access for generation
while keeping the workspace, character and pose libraries, PostgreSQL history,
and outputs on the user's machine. It is an open-source, local-first studio—not
a hosted photo service.

The v0.1.0 release includes one-command setup, multi-character direction,
reusable libraries, generation history, and transparent privacy boundaries.
If you work with Codex or Antigravity, I would value a clean-install test and
an honest account of where the workflow is confusing: [RELEASE_URL]

## Reddit: r/ChatGPTCoding

Title: `I built an open-source local-first pose studio around authenticated Codex CLI`

Body: `PoseForge turns identity photos + a pose reference into a repeatable Codex CLI workflow with local libraries, history, PostgreSQL metadata, and outputs. v0.1.0 does not need a separate API key for the signed-in Codex path, but selected references and prompts still go to the provider—I document that boundary explicitly. It is Apache-2.0, single-user, and starts with npm run setup. I am looking for clean-install feedback, not stars or coordinated votes: [RELEASE_URL]`

## Reddit: Gemini / Google AI community

Title: `Open-source pose workflow using the signed-in Google Antigravity CLI`

Body: `I built PoseForge to make character + pose-reference generations reproducible through Google Antigravity. It stores identities, poses, settings, history, and outputs locally, while the selected inputs go to Google's service for the generation step. v0.1.0 focuses on the signed-in CLI path, multi-character direction, and one-command setup. If Antigravity is part of your workflow, I would appreciate install and generation feedback: [RELEASE_URL]`

## Reddit: r/opensource

Title: `PoseForge v0.1.0: Apache-2.0, local-first pose transformation studio`

Body: `PoseForge is a Node.js/Express/Next.js/PostgreSQL application for organizing identity + pose-reference image workflows. Data and outputs remain local; authenticated Codex or Google Antigravity CLI is used for the provider generation step. The repository includes setup verification, CI on Node 20/22, privacy/security docs, contributor issues, and reproducible demo media. I would value feedback on packaging, clean Linux/macOS setup, and the engine adapter boundary: [RELEASE_URL]`

## Technical article outline

Title: `Building a local-first photo workflow around signed-in AI CLIs`

1. Why one-off multi-image chats fail as a repeatable workflow.
2. The character → pose → directed result contract.
3. Single-origin Express + Next.js architecture.
4. PostgreSQL metadata and local file-storage boundary.
5. CLI adapters, workspace isolation, timeouts, and artifact recovery.
6. Privacy language: local-first does not mean provider-offline.
7. Testing: Node 20/22 CI, real PostgreSQL smoke tests, and Playwright.
8. What v0.1.0 deliberately feature-flags and why.
9. Clean-install lessons and the under-15-minute activation target.
10. Release/demo link and invitation for reproducible bug reports.

## Launch-day order (Pacific Time)

- 08:00 — Confirm protected `main`, green release commit, and support coverage.
- 08:15 — Push signed `v0.1.0`; wait for the Release workflow to finish.
- 08:30 — Verify release notes and all three media attachments from a logged-out browser.
- 09:00 — Update every `[RELEASE_URL]`, then publish owned repository and Discussion announcement.
- 09:30 — Publish Show HN and the X thread.
- 10:00 — Publish Product Hunt and the LinkedIn post.
- 11:00 — Post only to communities whose current self-promotion rules permit it.
- Every hour through 18:00 — Triage setup failures and answer substantive questions.
- 18:00 — Record installs, first generations, failure themes, and channel source.
- Day 2 — Follow up with reporters, publish fixes, and share an evidence-based recap.

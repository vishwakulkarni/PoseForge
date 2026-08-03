# Architecture

This document describes how PoseForge is put together — useful background
before contributing, especially if you're adding a new generation engine or
touching the data model.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js 18+ | No framework lock-in, easy to run anywhere |
| Web framework | Express | Small surface area, well understood |
| Database | PostgreSQL | Real relational data (characters, presets, generation history) with simple foreign-key relationships |
| Migrations | Plain `.sql` files, custom runner | No ORM needed at this schema size — see `db/migrate.js` |
| File storage | Local filesystem under `storage/` | Postgres stores paths and metadata only, never image bytes |
| Frontend | Plain HTML/CSS/JS, no build step | Keeps the project approachable — clone and run, no bundler required |
| Generation engines | Pluggable adapters behind a common interface | See below — this is the project's main extension point |

## Directory layout

```
server.js                 Express app entry point, mounts routers
db/
  pool.js                 Shared pg.Pool built from DATABASE_URL
  migrate.js               Runs pending .sql files in db/migrations, tracked in schema_migrations
  migrations/               001_init.sql (schema), 002/003_*_seed.sql (starter presets)
routes/
  characters.js, generations.js, presets.js, engines.js, settings.js
engines/
  index.js                 Registry: engine key -> adapter module
  engineInterface.md        The adapter contract, documented
  codexEngine.js, openaiEngine.js, replicateEngine.js
lib/
  promptTemplate.js         Builds the merge instruction sent to an engine
  storage.js                 Centralized, path-traversal-safe file path helpers
  generationQueue.js         In-memory FIFO single-flight job queue
  imageNormalizer.js         Normalizes uploads to PNG before generation
  logger.js                  Structured JSON request/event logging
public/
  index.html, studio.html, characters.html, gallery.html, history.html, settings.html
  css/, js/                  Design system + per-screen logic, no bundler
scripts/
  generate-mascot.js         One-off Codex CLI call that produces the mascot artwork
storage/                    Runtime-created, gitignored: characters/, generations/, upload-v2/
```

## Data model

Five tables, no ORM:

- **`characters`** — a saved identity (name + timestamps).
- **`character_photos`** — one or more reference photos per character, one
  flagged `is_primary`.
- **`presets`** — background/style presets. Each has a `prompt_fragment`
  appended into the generation prompt when selected. `is_custom` marks
  user-added presets versus the seeded starter set.
- **`settings`** — flat key/value store: `default_engine`,
  `openai_api_key`, `replicate_api_key`. Deliberately *not* environment
  variables — see `SECURITY.md` for why keys live in the database instead.
- **`generations`** — one row per generation attempt. Tracks `status`
  (`pending` → `running` → `completed`/`failed`), the resolved prompt, and
  paths to the pose photo and output. `character_id` and
  `character_photo_id` use `ON DELETE SET NULL`, so deleting a character
  never deletes its generation history.

Run `npm run migrate` to apply `db/migrations/*.sql` in order; it tracks
what's already applied in a `schema_migrations` table, so it's safe to run
repeatedly.

## The engine adapter pattern

This is the part most contributions touch. Every generation engine —
Codex CLI, OpenAI, Replicate, or a future one — implements the same shape:

```js
{
  key: "engine-key",
  label: "Human-readable name",
  async isReady() {
    // return { ready: true } or { ready: false, reason: "..." }
  },
  async generate({ characterPhotoPath, posePhotoPath, prompt, outputPath, apiKey }) {
    // write a PNG to outputPath, or throw an Error with a clear message
  },
}
```

`engines/index.js` holds the registry (`{ codex, openai, replicate }`) and
`listEngines()`, which calls `isReady()` on each — that's what powers both
the Studio's engine dropdown and the Settings screen's status list. Adding
a new engine is: write the adapter, register it, done — no route or
frontend changes needed. See `CONTRIBUTING.md` for the walkthrough.

Two adapters worth knowing about specifically:

- **`codexEngine.js`** shells out to the Codex CLI (`codex exec --sandbox
  workspace-write --skip-git-repo-check --ephemeral ...`), passing the two
  reference images directly via `-i` flags rather than embedding file paths
  in the prompt text. No API key required — readiness is just "is the
  binary on PATH."
- **`openaiEngine.js`** and **`replicateEngine.js`** call their respective
  HTTP APIs directly using a key read from the `settings` table.

## Generation flow (async status, serial execution)

There's no true concurrency — one generation runs at a time — but the UI
doesn't block on it:

1. `POST /api/generations` validates input, persists the uploaded pose
   photo, resolves the character photo, builds the prompt (base
   instructions + any preset fragments), inserts a `generations` row with
   `status: 'pending'`, and calls `lib/generationQueue.js`'s `enqueue()`.
   It responds `202` immediately — it does not wait for generation to finish.
2. The queue (`lib/generationQueue.js`) is a plain in-memory FIFO array with
   a `running` flag. Jobs run one at a time, in order.
3. When a job runs: update the row to `running`, call the selected engine's
   `generate()`, then update to `completed` (with `output_path`) or
   `failed` (with `error_message`).
4. The frontend polls `GET /api/generations/:id` every ~1.5s until the
   status leaves `pending`/`running`.

Known limitation: the queue is in-memory only. A server restart mid-job
leaves that row stuck in `running` — acceptable for a local single-user
tool, but worth knowing if you're debugging a "stuck" generation.

## Storage

`lib/storage.js` centralizes every filesystem path the app touches
(`getCharacterPhotoPath`, `getGenerationPosePath`, `getGenerationOutputPath`,
etc.) and validates that resolved paths stay inside `storage/` — nothing
else in the codebase should build a `storage/` path by hand. `server.js`
serves `storage/` read-only at `/storage`.

## Frontend

No build step, no framework — plain HTML/CSS/JS per screen, sharing a
design system (`public/css/base.css`, `public/js/base.js`) for typography,
color tokens, the nav bar, and common fetch/status helpers. Each screen
(`studio.js`, `characters.js`, `gallery.js`, `history.js`, `settings.js`)
is self-contained and talks to the JSON API directly via `fetch`.

## What we'd want before a 1.0

- An automated test suite with real coverage (see `tests/` for the current
  starting point — pure-function tests for `promptTemplate` and `storage`,
  meant to grow).
- Recovery for generations stuck in `running` after a restart.
- An opt-in auth layer, if PoseForge is ever meant to run somewhere other
  than localhost (see `SECURITY.md`).

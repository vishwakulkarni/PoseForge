# Troubleshooting and FAQ

Start with:

```bash
npm run setup
npm run dev
```

The setup command is safe to rerun. It preserves an existing `.env`, installs
locked dependencies, starts Docker PostgreSQL, applies migrations, and checks
the bundled pose collection.

## Setup cannot find Docker

Install Docker Desktop or Docker Engine with the Compose plugin, start the
Docker daemon, and confirm:

```bash
docker compose version
docker info
```

Then rerun `npm run setup`.

## PostgreSQL does not become ready

Inspect the container and its logs:

```bash
docker compose ps
docker compose logs postgres
```

Port `5432` may already be occupied by another PostgreSQL installation. Stop
the conflicting service or configure that database through `DATABASE_URL`.
Do not delete the Docker volume unless you intentionally want to erase local
PoseForge database data.

## The app reports a missing table or migration

Run:

```bash
npm run migrate
node scripts/verify-setup.js
```

Migrations are incremental and safe to rerun.

## A fresh clone has no poses

Confirm that `storage/pose-library/seed/` contains the committed PNG files,
then run:

```bash
npm run migrate
node scripts/verify-setup.js
```

The verification command checks both PostgreSQL records and their local files.

## An engine is unavailable

Open **Settings** and read the readiness reason shown for that engine.

- **Codex CLI:** install `codex`, authenticate it, and verify `codex` is on
  `PATH`. Use `CODEX_BIN` if the executable has a custom path.
- **Google Antigravity:** install `agy`, sign in interactively, and verify it
  is on `PATH`. Use `ANTIGRAVITY_BIN` for a custom path.
- **ComfyUI:** start ComfyUI, keep its API on a loopback address, and provide
  an API-format workflow containing the placeholders documented in Settings.
- **Cloud API engines:** verify the API key, account access, quota, and selected
  model. Provider subscriptions and API billing are often separate products.

## Generation finishes without an image

- Read the server log for the engine’s exact failure reason.
- Verify the selected model supports image creation and image references.
- For ComfyUI, confirm the configured output node produces an image and all
  required models and custom nodes are installed.
- Try one character and one pose before debugging a multi-person composition.
- Do not post private input images or credentials in a public issue.

## The browser shows an old landing-page image

Stop the development server, restart it, and hard-refresh the browser. If the
asset filename was reused, clear the site cache. Contributors should prefer a
new filename for replaced launch assets so deployed caches cannot retain an
older image indefinitely.

## Native image dependencies fail to install

PoseForge uses `sharp`. Use a supported Node.js LTS release and reinstall the
locked dependencies with `npm run setup`. On an unsupported CPU/OS combination,
include the complete non-secret install error in a bug report.

## Can PoseForge be exposed to the internet?

Not safely by default. PoseForge is a trusted, single-user local application
without authentication or authorization. See [SECURITY.md](../SECURITY.md)
and [PRIVACY.md](../PRIVACY.md).

## Where can I ask for help?

See [SUPPORT.md](../SUPPORT.md) for the correct channel and diagnostic
information to include.


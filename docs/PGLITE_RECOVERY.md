# Recovering a corrupted PGlite data directory

This is a runbook for the "`Aborted(). Build with -sASSERTIONS for more
info.`" crash on startup, thrown from inside the PGlite WASM Postgres binary.
It has been hit at least once (2026-09-10) after the dev server was killed
mid-write. Automatic daily backups (see bottom) now reduce how often this
runbook is needed, but it does not prevent corruption itself.

## 1. Confirm the diagnosis

The bare error from `npm run dev` gives no detail. Reproduce it directly
against the data directory with PGlite's `debug` option to get the real
Postgres log line:

```js
const { PGlite } = require("@electric-sql/pglite");
const db = new PGlite({ dataDir: "storage/pglite", debug: 5 });
await db.query("select 1");
```

Look for lines like:

```
LOG:  database system was interrupted; last known up at <timestamp>
LOG:  invalid xl_info in checkpoint record
PANIC: could not locate valid checkpoint record at <LSN>
```

This means the WAL segment that `pg_control` points to for crash recovery is
missing or was never fully written (e.g. the process was killed mid-checkpoint).
Check that the LSN in the PANIC actually falls inside an existing
`pg_wal/0000000...` segment file (segments are 16MB); if it doesn't, the
segment was never created on disk and recovery has nothing to replay from.

Also check `storage/pglite/postmaster.pid` — a *stale* lock left over from an
unclean shutdown is a separate, much more common and harmless cause of
startup failures. Removing it (when no `node server.js` process is actually
running) is safe and should be ruled out first before assuming corruption.

## 2. Never operate on the live directory directly

Copy `storage/pglite` to a scratch location and do all diagnosis/repair
there. Any existing `storage/pglite.backup-*` or `storage/pglite-corrupt.tar.gz`
snapshots should be inspected first (open read-only, run
`select count(*) from <table>` on the app's tables) — they are frequently
just earlier copies of the *same* corrupted state and won't help.

## 3. Repair with the real `pg_resetwal`

PGlite does not bundle `pg_resetwal`. Install a matching major-version
PostgreSQL via Homebrew purely to get the CLI tool (this does not touch the
app's embedded database or config):

```bash
cat storage/pglite/PG_VERSION   # e.g. "18" -> install postgresql@18
brew install postgresql@18
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
```

Work on a copy:

```bash
cp -a storage/pglite /tmp/pglite-repair
rm -f /tmp/pglite-repair/postmaster.pid
pg_resetwal --dry-run -D /tmp/pglite-repair   # sanity check first
pg_resetwal -f -D /tmp/pglite-repair          # -f: shutdown wasn't clean
```

`pg_resetwal` rebuilds `pg_control` and creates a fresh WAL segment at a safe
LSN using the last known-good checkpoint state. It does **not** replay the
lost WAL, so writes made in the last few minutes before the crash (since the
last completed checkpoint) can be gone, and in rare cases a table could be
left slightly inconsistent. It is a last-resort tool, not a guaranteed-clean
recovery.

## 4. Verify before promoting

```bash
PGLITE_DATA_DIR=/tmp/pglite-repair node scripts/verify-setup.js
```

Also spot-check row counts (`characters`, `generations`, `studio_projects`,
...) against what you'd expect, and check `max(created_at)` on a few tables
to see how close to the crash time the recovered data reaches.

## 5. Promote the repaired copy

Move the corrupted directory aside (never delete outright) before swapping in
the repair:

```bash
mv storage/pglite storage/pglite.corrupt-preswap-$(date -u +%Y%m%dT%H%M%SZ)
cp -a /tmp/pglite-repair storage/pglite
rm -f storage/pglite/postmaster.pid
npm run dev   # confirm clean startup
```

## Automatic backups

`lib/dbBackup.js` takes a consistent snapshot (via PGlite's own
`dumpDataDir()`, not a raw file copy, so it can't capture a torn write) to
`backups/pglite/pglite-<date>.tar.gz`:

- once on every server startup (skipped if today's file already exists), and
- once per day thereafter for long-running processes,

with backups older than 14 days pruned automatically. This does not prevent
the WAL corruption above, but caps the worst-case data loss at roughly one
day, so this full recovery runbook is only needed to try to save the time
since the most recent daily backup.

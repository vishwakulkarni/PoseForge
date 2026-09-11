const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BACKUP_DIR = path.join(ROOT, "backups", "pglite");
const RETENTION_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function backupPathForToday() {
  const isoDate = new Date().toISOString().slice(0, 10);
  return path.join(BACKUP_DIR, `pglite-${isoDate}.tar.gz`);
}

async function pruneOldBackups() {
  const cutoff = Date.now() - RETENTION_DAYS * DAY_MS;
  const entries = await fs.promises.readdir(BACKUP_DIR).catch(() => []);
  for (const entry of entries) {
    const filePath = path.join(BACKUP_DIR, entry);
    const stat = await fs.promises.stat(filePath).catch(() => null);
    if (stat && stat.mtimeMs < cutoff) await fs.promises.unlink(filePath).catch(() => {});
  }
}

// One backup per calendar day: skipped if today's backup already exists, so
// frequent dev restarts don't spam the backups directory.
async function createDailyBackup(pool, logger) {
  if (pool.mode !== "pglite") return;

  const targetPath = backupPathForToday();
  if (fs.existsSync(targetPath)) return;

  await fs.promises.mkdir(BACKUP_DIR, { recursive: true });
  const file = await pool.dumpDataDir("gzip");
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.promises.writeFile(targetPath, buffer);
  await pruneOldBackups();
  logger.info("database backup created", { path: targetPath, bytes: buffer.length });
}

function scheduleDailyBackups(pool, logger) {
  const interval = setInterval(() => {
    createDailyBackup(pool, logger).catch((error) =>
      logger.error("scheduled database backup failed", { error: error.message })
    );
  }, DAY_MS);
  interval.unref();
  return interval;
}

module.exports = { createDailyBackup, scheduleDailyBackups, BACKUP_DIR };

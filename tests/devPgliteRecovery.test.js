const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  isRecoverablePgliteFailure,
  restorePgliteBackup,
  utcDate,
} = require("../scripts/dev-with-pglite-recovery");

test("recognizes only the PGlite WASM abort used for automatic recovery", () => {
  const pgliteAbort = "server failed to start: Aborted(). Build with -sASSERTIONS at node_modules/@electric-sql/pglite/dist/index.cjs";
  assert.equal(isRecoverablePgliteFailure(pgliteAbort), true);
  assert.equal(isRecoverablePgliteFailure("server failed to start: EADDRINUSE"), false);
  assert.equal(isRecoverablePgliteFailure("Aborted(). Build with -sASSERTIONS"), false);
});

test("uses the UTC date used by daily backup filenames", () => {
  assert.equal(utcDate(new Date("2026-09-12T23:59:59-07:00")), "2026-09-13");
});

test("restores a backup and quarantines the failed data directory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "poseforge-dev-recovery-"));
  const sourceDir = path.join(root, "source");
  const dataDir = path.join(root, "storage", "pglite");
  const backupPath = path.join(root, "pglite-2026-09-12.tar.gz");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "PG_VERSION"), "18\n");
  fs.writeFileSync(path.join(sourceDir, "restored.txt"), "from backup\n");
  fs.writeFileSync(path.join(dataDir, "corrupt.txt"), "keep for diagnosis\n");
  const archived = spawnSync("tar", ["-czf", backupPath, "-C", sourceDir, "."]);
  assert.equal(archived.status, 0);

  try {
    const failedDir = restorePgliteBackup({
      dataDir,
      backupPath,
      now: new Date("2026-09-12T15:00:00Z"),
    });
    assert.equal(fs.readFileSync(path.join(dataDir, "restored.txt"), "utf8"), "from backup\n");
    assert.equal(fs.readFileSync(path.join(failedDir, "corrupt.txt"), "utf8"), "keep for diagnosis\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

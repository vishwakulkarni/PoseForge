#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const MAX_DIAGNOSTIC_BYTES = 256 * 1024;

function utcDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function utcTimestamp(now = new Date()) {
  return now.toISOString().replace(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
}

function isRecoverablePgliteFailure(output) {
  return output.includes("Aborted(). Build with -sASSERTIONS")
    && output.includes("@electric-sql/pglite");
}

function resolvePgliteDataDir(root = ROOT) {
  const configured = process.env.PGLITE_DATA_DIR || "storage/pglite";
  if (configured === ":memory:") return null;
  return path.isAbsolute(configured) ? configured : path.resolve(root, configured);
}

function restorePgliteBackup({ dataDir, backupPath, now = new Date() }) {
  const resolvedDataDir = path.resolve(dataDir);
  const filesystemRoot = path.parse(resolvedDataDir).root;
  if (resolvedDataDir === filesystemRoot) {
    throw new Error(`Refusing to replace filesystem root: ${resolvedDataDir}`);
  }
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Today's PGlite backup does not exist: ${backupPath}`);
  }

  const parentDir = path.dirname(resolvedDataDir);
  fs.mkdirSync(parentDir, { recursive: true });
  const restoredDir = fs.mkdtempSync(path.join(parentDir, ".pglite-restore-"));
  let failedDir = null;

  try {
    const extraction = spawnSync("tar", ["-xzf", backupPath, "-C", restoredDir], {
      encoding: "utf8",
    });
    if (extraction.status !== 0) {
      throw new Error(`Could not extract PGlite backup: ${extraction.stderr.trim()}`);
    }
    if (!fs.existsSync(path.join(restoredDir, "PG_VERSION"))) {
      throw new Error(`PGlite backup is missing PG_VERSION: ${backupPath}`);
    }

    if (fs.existsSync(resolvedDataDir)) {
      failedDir = `${resolvedDataDir}.failed-${utcTimestamp(now)}`;
      fs.renameSync(resolvedDataDir, failedDir);
    }

    try {
      fs.renameSync(restoredDir, resolvedDataDir);
    } catch (error) {
      if (failedDir && fs.existsSync(failedDir) && !fs.existsSync(resolvedDataDir)) {
        fs.renameSync(failedDir, resolvedDataDir);
      }
      throw error;
    }
    fs.rmSync(path.join(resolvedDataDir, "postmaster.pid"), { force: true });
    return failedDir;
  } finally {
    fs.rmSync(restoredDir, { recursive: true, force: true });
  }
}

function appendDiagnostic(current, chunk) {
  const next = current + chunk;
  return next.length > MAX_DIAGNOSTIC_BYTES
    ? next.slice(next.length - MAX_DIAGNOSTIC_BYTES)
    : next;
}

function runServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, "server.js"), "--dev"], {
      cwd: ROOT,
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
    });
    let diagnostic = "";

    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      diagnostic = appendDiagnostic(diagnostic, chunk.toString());
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      diagnostic = appendDiagnostic(diagnostic, chunk.toString());
    });

    const forwardSignal = (signal) => child.kill(signal);
    const onSigint = () => forwardSignal("SIGINT");
    const onSigterm = () => forwardSignal("SIGTERM");
    process.once("SIGINT", onSigint);
    process.once("SIGTERM", onSigterm);

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      process.removeListener("SIGINT", onSigint);
      process.removeListener("SIGTERM", onSigterm);
      resolve({ code: code ?? (signal === "SIGINT" ? 130 : 1), diagnostic });
    });
  });
}

async function main() {
  require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });
  const firstRun = await runServer();
  if (firstRun.code === 0) return;

  const databaseMode = String(process.env.DATABASE_MODE || "pglite").trim().toLowerCase();
  if (databaseMode !== "pglite" || !isRecoverablePgliteFailure(firstRun.diagnostic)) {
    process.exitCode = firstRun.code;
    return;
  }

  const dataDir = resolvePgliteDataDir();
  if (!dataDir) {
    process.exitCode = firstRun.code;
    return;
  }
  const backupPath = path.join(ROOT, "backups", "pglite", `pglite-${utcDate()}.tar.gz`);

  try {
    process.stderr.write(`[dev-recovery] PGlite failed to open; restoring ${backupPath}\n`);
    const failedDir = restorePgliteBackup({ dataDir, backupPath });
    if (failedDir) {
      process.stderr.write(`[dev-recovery] Failed database retained at ${failedDir}\n`);
    }
    process.stderr.write("[dev-recovery] Restore complete; restarting development server\n");
  } catch (error) {
    process.stderr.write(`[dev-recovery] Automatic restore failed: ${error.message}\n`);
    process.exitCode = firstRun.code;
    return;
  }

  const secondRun = await runServer();
  process.exitCode = secondRun.code;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`[dev-recovery] ${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  isRecoverablePgliteFailure,
  resolvePgliteDataDir,
  restorePgliteBackup,
  utcDate,
};

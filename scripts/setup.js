#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const MINIMUM_NODE = [20, 9, 0];

function parseVersion(version) {
  const match = String(version).match(/^(?:v)?(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function versionAtLeast(actual, minimum = MINIMUM_NODE) {
  const parsed = Array.isArray(actual) ? actual : parseVersion(actual);
  if (!parsed) return false;
  for (let index = 0; index < minimum.length; index += 1) {
    if (parsed[index] > minimum[index]) return true;
    if (parsed[index] < minimum[index]) return false;
  }
  return true;
}

function run(command, args, options = {}) {
  const printable = [command, ...args].join(" ");
  console.log(`\n[setup] ${options.label || printable}`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: process.env,
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf8",
  });
  if (result.error) throw new Error(`Could not run ${command}: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = options.capture ? String(result.stderr || result.stdout || "").trim() : "";
    throw new Error(`${printable} failed${detail ? `: ${detail}` : ""}`);
  }
  return result;
}

function ensureNodeVersion() {
  if (!versionAtLeast(process.version)) {
    throw new Error(`PoseForge requires Node.js 20.9.0 or newer; found ${process.version}. Install a current Node.js LTS release and retry.`);
  }
  console.log(`[setup] Node.js ${process.version} is supported.`);
}

function ensureEnvironmentFile() {
  const target = path.join(ROOT, ".env");
  if (fs.existsSync(target)) {
    console.log("[setup] Keeping the existing .env file.");
    return false;
  }
  fs.copyFileSync(path.join(ROOT, ".env.example"), target, fs.constants.COPYFILE_EXCL);
  console.log("[setup] Created .env from .env.example.");
  return true;
}

function installDependencies() {
  run("npm", ["ci"], { label: "Installing server dependencies" });
  run("npm", ["--prefix", "web", "ci"], { label: "Installing web dependencies" });
}

function main() {
  console.log("PoseForge setup\n===============");
  ensureNodeVersion();
  ensureEnvironmentFile();
  installDependencies();
  run("npm", ["run", "migrate"], { label: "Applying database migrations and seed data" });
  run("node", ["scripts/verify-setup.js"], { label: "Verifying database and bundled poses" });
  console.log("\n[setup] PoseForge is ready. Start it with `npm run dev`, then open http://localhost:3000.");
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`\n[setup] Failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { MINIMUM_NODE, parseVersion, versionAtLeast };

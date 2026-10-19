#!/usr/bin/env node
// `npm start` serves the production build; create it on first run.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

if (!fs.existsSync(path.join(ROOT, "web", ".next", "BUILD_ID"))) {
  console.log("[start] No production web build found; building it once...");
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["run", "build:web"], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
  process.exit(result.status ?? 1);
}

#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "web", "out");
const APPLICATION_ROUTES = [
  "characters",
  "history",
  "metrics",
  "passport",
  "poses",
  "settings",
  "studio",
];

function pruneApplicationRoutes(outputDirectory = OUTPUT_DIR) {
  if (!fs.existsSync(outputDirectory)) {
    throw new Error("GitHub Pages output is missing. Run the static web build first.");
  }

  const removed = [];
  for (const route of APPLICATION_ROUTES) {
    const target = path.join(outputDirectory, route);
    if (!fs.existsSync(target)) continue;
    fs.rmSync(target, { recursive: true, force: true });
    removed.push(route);
  }
  return removed;
}

function main() {
  const removed = pruneApplicationRoutes();
  console.log(`Removed ${removed.length} local-app route(s): ${removed.join(", ")}.`);
}

if (require.main === module) main();

module.exports = {
  APPLICATION_ROUTES,
  pruneApplicationRoutes,
};

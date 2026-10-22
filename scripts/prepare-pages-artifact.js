#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "web", "out");
const APP_DIR = path.join(ROOT, "web", "app");
const APPLICATION_ROUTES = [
  "characters",
  "history",
  "metrics",
  "passport",
  "poses",
  "settings",
  "studio",
  "studio-advanced",
];

/**
 * `output: "export"` cannot build a dynamic route without generateStaticParams,
 * and the local-app project routes (`studio/[projectId]` and friends) are
 * per-user data with nothing to pre-render. Run this on the CI checkout before
 * the build so those routes are never compiled into the static export.
 */
function pruneApplicationSources(appDirectory = APP_DIR) {
  const removed = [];
  for (const route of APPLICATION_ROUTES) {
    const routeDirectory = path.join(appDirectory, route);
    if (!fs.existsSync(routeDirectory)) continue;
    for (const entry of fs.readdirSync(routeDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^\[.+\]$/.test(entry.name)) continue;
      fs.rmSync(path.join(routeDirectory, entry.name), { recursive: true, force: true });
      removed.push(`${route}/${entry.name}`);
    }
  }
  return removed;
}

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
  if (process.argv.includes("--sources")) {
    const removed = pruneApplicationSources();
    console.log(`Removed ${removed.length} dynamic local-app route(s) before build: ${removed.join(", ")}.`);
    return;
  }
  const removed = pruneApplicationRoutes();
  console.log(`Removed ${removed.length} local-app route(s): ${removed.join(", ")}.`);
}

if (require.main === module) main();

module.exports = {
  APPLICATION_ROUTES,
  pruneApplicationRoutes,
  pruneApplicationSources,
};

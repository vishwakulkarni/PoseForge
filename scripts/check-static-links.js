#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "web", "out");
const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH || "/PoseForge";
const basePath = rawBasePath === "/" ? "" : `/${rawBasePath.replace(/^\/+|\/+$/g, "")}`;
const deployedRoot = `${basePath}/`;
const placeholderOrigin = "https://poseforge-pages.invalid";

function collectHtmlFiles(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) collectHtmlFiles(target, files);
    else if (entry.name.endsWith(".html")) files.push(target);
  }
  return files;
}

function pagePath(file) {
  const relative = path.relative(OUTPUT_DIR, file).split(path.sep).join("/");
  if (relative === "index.html") return deployedRoot;
  return `${deployedRoot}${relative.replace(/index\.html$/, "")}`;
}

function targetExists(pathname) {
  const relative = decodeURIComponent(pathname.slice(deployedRoot.length));
  const candidates = [
    path.join(OUTPUT_DIR, relative),
    path.join(OUTPUT_DIR, relative, "index.html"),
    path.join(OUTPUT_DIR, `${relative}.html`),
  ];
  return candidates.some((candidate) => fs.existsSync(candidate));
}

function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    console.error("GitHub Pages output is missing. Run the static web build first.");
    process.exit(1);
  }

  const failures = new Map();
  const files = collectHtmlFiles(OUTPUT_DIR);

  for (const file of files) {
    const sourcePage = pagePath(file);
    const html = fs.readFileSync(file, "utf8");
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const href = match[1];
      if (/^(?:#|mailto:|tel:|javascript:|data:)/i.test(href)) continue;

      const url = new URL(href, `${placeholderOrigin}${sourcePage}`);
      if (url.origin !== placeholderOrigin) continue;

      let reason = null;
      if (!url.pathname.startsWith(deployedRoot)) reason = "escapes the Pages base path";
      else if (!targetExists(url.pathname)) reason = "target is missing from the export";
      if (!reason) continue;

      const failure = { page: sourcePage, href, reason };
      failures.set(JSON.stringify(failure), failure);
    }
  }

  if (failures.size) {
    console.error(`Found ${failures.size} broken GitHub Pages link(s):`);
    for (const failure of failures.values()) {
      console.error(`- ${failure.page} -> ${failure.href} (${failure.reason})`);
    }
    process.exit(1);
  }

  console.log(`Checked ${files.length} HTML files; every local GitHub Pages link resolves.`);
}

main();

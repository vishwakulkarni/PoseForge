#!/usr/bin/env node
/**
 * Captures the read-only data behind the static demo site.
 *
 * Reads the GET endpoints the app's pages use from a PoseForge server that holds
 * only sample data (the seeded example projects plus sample usage rows from
 * demo-output/seed-demo-usage.cjs), strips anything machine-specific, recompresses
 * the media it references, and writes:
 *
 *   web/public/demo-api/<path>.json    one file per endpoint, e.g. characters.json
 *   web/public/demo-media/<path>       images (webp) and videos referenced by those files
 *
 * The web app serves these instead of its API when built with NEXT_PUBLIC_STATIC_DEMO=true
 * (see web/lib/api/demo.ts). Never point this at a server holding real user data.
 *
 *   node scripts/capture-demo-fixtures.js [http://127.0.0.1:3100]
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const BASE = process.argv[2] || "http://127.0.0.1:3100";
const API_DIR = path.join(ROOT, "web", "public", "demo-api");
const MEDIA_DIR = path.join(ROOT, "web", "public", "demo-media");
const STORAGE = path.join(ROOT, "storage");
const METRICS_SNAPSHOT = path.join(__dirname, "demo-metrics-snapshot.json");

/**
 * `/api/metrics?scope=historical` -> `metrics@scope=historical.json`. Only metrics and presets
 * answer differently per query; every other path has a single fixture (mirrors web/lib/api/demo.ts).
 */
function fixtureFile(apiPath) {
  return `${apiPath.replace(/^\/api\//, "").replace("?", "@")}.json`;
}

async function get(apiPath) {
  const response = await fetch(BASE + apiPath);
  if (!response.ok) throw new Error(`${apiPath} -> ${response.status}`);
  return response.json();
}

/** Copies one `/storage/...` file into demo-media, recompressing PNGs, and returns its new public URL. */
const mediaCache = new Map();
async function publishMedia(url) {
  if (mediaCache.has(url)) return mediaCache.get(url);
  const relative = url.replace(/^\/storage\//, "");
  const source = path.join(STORAGE, relative);
  if (!fs.existsSync(source)) {
    mediaCache.set(url, null);
    return null;
  }
  const isPng = /\.png$/i.test(relative);
  const targetRelative = isPng ? relative.replace(/\.png$/i, ".webp") : relative;
  const target = path.join(MEDIA_DIR, targetRelative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (isPng) {
    await sharp(source).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toFile(target);
  } else {
    fs.copyFileSync(source, target);
  }
  const published = `/demo-media/${targetRelative}`;
  mediaCache.set(url, published);
  return published;
}

/** Rewrites every `/storage/...` URL found in a JSON value to its published `/demo-media/...` copy. */
async function rewriteMedia(value) {
  if (typeof value === "string") {
    return value.startsWith("/storage/") ? ((await publishMedia(value.split("?")[0])) ?? value) : value;
  }
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) out.push(await rewriteMedia(item));
    return out;
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = await rewriteMedia(item);
    return out;
  }
  return value;
}

function markReady(engines) {
  return engines.map((engine) => ({ ...engine, ready: true, reason: null }));
}

async function main() {
  const fixtures = new Map();
  const capture = async (apiPath) => fixtures.set(apiPath, await get(apiPath));

  for (const apiPath of [
    "/api/characters", "/api/presets", "/api/engines", "/api/pose-references", "/api/generations",
    "/api/recipes", "/api/studio-projects", "/api/studio-projects/default", "/api/advanced-studio-projects",
    "/api/advanced-studio-projects/capabilities", "/api/settings", "/api/passport/config",
    "/api/higgsfield/status", "/api/dreamina/status",
    "/api/presets?type=background", "/api/presets?type=style",
    "/api/generations/estimate?engine=codex&quality=medium&aspectRatio=1%3A1&subjects=1&variants=1&promptChars=600",
  ]) await capture(apiPath);
  for (const character of fixtures.get("/api/characters").characters) await capture(`/api/characters/${character.id}`);
  for (const project of fixtures.get("/api/studio-projects").projects) await capture(`/api/studio-projects/${project.id}`);
  for (const project of fixtures.get("/api/advanced-studio-projects").projects) await capture(`/api/advanced-studio-projects/${project.id}`);

  // Machine-specific values become neutral sample values.
  const engines = fixtures.get("/api/engines");
  fixtures.set("/api/engines", { ...engines, engines: markReady(engines.engines) });
  const capabilities = fixtures.get("/api/advanced-studio-projects/capabilities");
  fixtures.set("/api/advanced-studio-projects/capabilities", { ...capabilities, engines: markReady(capabilities.engines) });
  fixtures.set("/api/dreamina/status", {
    ...fixtures.get("/api/dreamina/status"),
    installed: false, loggedIn: false, canvas: null, version: null, expiresAt: null, region: null, membership: null,
  });

  // Only generations that still have their output on disk (the sample usage rows have none).
  const generations = fixtures.get("/api/generations");
  const kept = generations.generations.filter((g) => g.outputUrl && fs.existsSync(path.join(STORAGE, g.outputUrl.replace(/^\/storage\//, ""))));
  fixtures.set("/api/generations", { ...generations, generations: kept, total: kept.length });
  for (const generation of kept) await capture(`/api/generations/${generation.id}`);
  // Every cost estimate in the demo is this one fixture (see web/lib/api/demo.ts).
  fixtures.set("/api/generations/estimate", fixtures.get("/api/generations/estimate?engine=codex&quality=medium&aspectRatio=1%3A1&subjects=1&variants=1&promptChars=600"));
  fixtures.delete("/api/generations/estimate?engine=codex&quality=medium&aspectRatio=1%3A1&subjects=1&variants=1&promptChars=600");

  // Workflows open read-only and fit to the screen rather than at a stored viewport.
  for (const [apiPath, body] of fixtures) {
    if (/^\/api\/(studio-projects|advanced-studio-projects)\/[^/]+$/.test(apiPath) && !apiPath.endsWith("/default") && !apiPath.endsWith("/capabilities") && body.document) {
      body.document = { ...body.document, locked: true, ...(apiPath.includes("advanced") ? { viewport: null } : {}) };
    }
  }

  // Metrics come from the reviewed sample snapshot, not the server's live numbers.
  const snapshot = JSON.parse(fs.readFileSync(METRICS_SNAPSHOT, "utf8"));
  fixtures.set("/api/metrics?scope=historical", { ...snapshot, scope: "historical" });
  fixtures.set("/api/metrics?scope=session", { ...snapshot, scope: "session" });

  fs.rmSync(API_DIR, { recursive: true, force: true });
  fs.rmSync(MEDIA_DIR, { recursive: true, force: true });
  for (const [apiPath, body] of fixtures) {
    const file = path.join(API_DIR, fixtureFile(apiPath));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(await rewriteMedia(body)));
  }

  const missing = [...mediaCache].filter(([, published]) => !published).map(([url]) => url);
  console.log(`Wrote ${fixtures.size} fixtures and ${[...mediaCache.values()].filter(Boolean).length} media files.`);
  if (missing.length) console.log(`Media missing on disk (left as-is): ${missing.length}\n  ${missing.slice(0, 5).join("\n  ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

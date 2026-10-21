const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const express = require("express");
const sharp = require("sharp");

const storageRoot = path.join(__dirname, "..", "storage");
const cacheDir = path.join(storageRoot, "cache", "thumbnails");
const fixtureDir = path.join(storageRoot, `thumbnail-test-${process.pid}`);
const cacheBefore = new Set(fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir) : []);

let server;
let base;
test.before(async () => {
  fs.mkdirSync(fixtureDir, { recursive: true });
  // Tall portrait: a bright "face" near the top on a dark field. A centered
  // 4:3 crop would cut the face; an attention crop must keep it.
  await sharp({ create: { width: 400, height: 1000, channels: 3, background: "#101010" } })
    .composite([{
      input: await sharp({ create: { width: 140, height: 140, channels: 3, background: "#ffb48a" } }).png().toBuffer(),
      left: 130, top: 40,
    }])
    .png().toFile(path.join(fixtureDir, "portrait.png"));
  fs.writeFileSync(path.join(fixtureDir, "clip.mp4"), "not an image");

  const app = express();
  app.use("/api/thumbnails", require("../routes/thumbnails"));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}/api/thumbnails`;
});

test.after(() => {
  server.close();
  fs.rmSync(fixtureDir, { recursive: true, force: true });
  // Leave the real thumbnail cache as the test found it.
  if (fs.existsSync(cacheDir)) {
    for (const file of fs.readdirSync(cacheDir)) if (!cacheBefore.has(file)) fs.rmSync(path.join(cacheDir, file), { force: true });
    if (!cacheBefore.size && !fs.readdirSync(cacheDir).length) fs.rmSync(path.join(storageRoot, "cache"), { recursive: true, force: true });
  }
});

const url = (name, w = 200, h = 150) =>
  `${base}?url=${encodeURIComponent(`/storage/${path.basename(fixtureDir)}/${name}`)}&w=${w}&h=${h}`;

test("returns a fixed-size crop that keeps the subject in frame", async () => {
  const response = await fetch(url("portrait.png"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/jpeg");
  assert.match(response.headers.get("cache-control"), /max-age/);

  const image = sharp(Buffer.from(await response.arrayBuffer()));
  const meta = await image.metadata();
  assert.deepEqual([meta.width, meta.height], [200, 150]);

  // The bright block must survive the crop (a centered crop would drop it).
  const { channels } = await image.stats();
  assert.ok(channels[0].max > 200, "the subject region is inside the thumbnail");
});

test("rejects bad sizes, foreign paths, traversal, missing and non-image files", async () => {
  assert.equal((await fetch(`${base}?url=/storage/x.png`)).status, 400);
  assert.equal((await fetch(`${base}?url=${encodeURIComponent("/etc/passwd")}&w=100&h=100`)).status, 400);
  assert.equal((await fetch(`${base}?url=${encodeURIComponent("/storage/../server.js")}&w=100&h=100`)).status, 400);
  assert.equal((await fetch(url("missing.png"))).status, 404);
  assert.equal((await fetch(url("clip.mp4"))).status, 415);
});

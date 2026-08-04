const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { normalizeToPng, createPreviewPng, looksLikeHeic } = require("../lib/imageNormalizer");

test("HEIC and HEIF uploads are detected from filename or MIME type", () => {
  assert.equal(looksLikeHeic("/tmp/upload", { originalName: "IMG_1001.HEIC" }), true);
  assert.equal(looksLikeHeic("/tmp/upload", { mimeType: "image/heif" }), true);
  assert.equal(looksLikeHeic("/tmp/photo.jpg"), false);
});

test("normalization and preview produce valid PNG files", async (t) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "poseforge-normalizer-"));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const input = path.join(directory, "input.jpg");
  const output = path.join(directory, "output.png");
  await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#6d63ef" } }).jpeg().toFile(input);
  await normalizeToPng(input, output);
  const normalized = await sharp(output).metadata();
  assert.equal(normalized.format, "png");
  const preview = await createPreviewPng(input);
  const previewMeta = await sharp(preview).metadata();
  assert.equal(previewMeta.format, "png");
  assert.ok(previewMeta.width <= 720);
  assert.ok(previewMeta.height <= 720);
});

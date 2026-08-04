const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { RETRIEVED_ON, DOCUMENT_PHOTO_PROFILES } = require("../lib/passportGuidelines");
const { createDocumentAssets } = require("../routes/passport");

test("document photo profiles cover U.S. and India passport, visa, and OCI workflows", () => {
  assert.match(RETRIEVED_ON, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(Object.keys(DOCUMENT_PHOTO_PROFILES), ["us-passport", "us-visa", "in-passport", "in-visa", "in-evisa", "in-oci"]);
  for (const profile of Object.values(DOCUMENT_PHOTO_PROFILES)) {
    assert.equal(profile.retrievedOn, RETRIEVED_ON);
    assert.ok(profile.sourceVersionLabel);
    assert.ok(profile.officialLinks.length >= 1);
    assert.ok(profile.officialLinks.every((link) => /^https:\/\//.test(link.url)));
    assert.match(profile.disclaimer, /acceptance is not guaranteed/i);
  }
  assert.deepEqual(DOCUMENT_PHOTO_PROFILES["in-passport"].output, { widthPx: 630, heightPx: 810, format: "jpeg", printWidthMm: 35, printHeightMm: 45, sheet: true });
  assert.equal(DOCUMENT_PHOTO_PROFILES["in-oci"].output.maxBytes, 200000);
});

test("local document formatting produces exact profile dimensions and a 4x6 sheet", async (t) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "poseforge-document-"));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const input = path.join(directory, "input.png");
  const output = path.join(directory, "output.jpg");
  const sheet = path.join(directory, "sheet.png");
  await sharp({ create: { width: 900, height: 1200, channels: 3, background: "#ece8df" } }).png().toFile(input);
  await createDocumentAssets(input, output, sheet, DOCUMENT_PHOTO_PROFILES["in-passport"]);
  const outputMeta = await sharp(output).metadata();
  assert.equal(outputMeta.format, "jpeg");
  assert.equal(outputMeta.width, 630);
  assert.equal(outputMeta.height, 810);
  const sheetMeta = await sharp(sheet).metadata();
  assert.equal(sheetMeta.width, 1200);
  assert.equal(sheetMeta.height, 1800);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { ANGLES, anglePrompt, buildSheet, validateSource } = require("../lib/characterAngleProfiles");

test("angle prompts cover five unambiguous camera-relative views", () => {
  assert.deepEqual(ANGLES, [0, 45, 90, 135, 180]);
  assert.match(anglePrompt(0), /left-side profile/i);
  assert.match(anglePrompt(90), /straight-on front view/i);
  assert.match(anglePrompt(180), /right-side profile/i);
  for (const angle of ANGLES) {
      assert.match(anglePrompt(angle), /change only the viewpoint/i);
      assert.match(anglePrompt(angle), /eyeglasses or sunglasses/i);
      assert.match(anglePrompt(angle), /complete visible clothing/i);
      assert.match(anglePrompt(angle), /exact hairstyle/i);
      assert.match(anglePrompt(angle), /do not remove, add, replace, or alter/i);
      assert.doesNotMatch(anglePrompt(angle), /no accessories/i);
      assert.doesNotMatch(anglePrompt(angle), /plain light-gray background/i);
    assert.match(anglePrompt(angle), /exactly one person/i);
  }
});

test("profile sheet composition combines all five generated views", async (t) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "poseforge-profile-sheet-"));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const paths = new Map();
  for (const [index, angle] of ANGLES.entries()) {
    const imagePath = path.join(directory, `${angle}.png`);
    await sharp({ create: { width: 300, height: 400, channels: 4, background: { r: 40 * index, g: 80, b: 160, alpha: 1 } } }).png().toFile(imagePath);
    paths.set(angle, imagePath);
  }
  const outputPath = path.join(directory, "sheet.png");
  await buildSheet(paths, outputPath);
  const metadata = await sharp(outputPath).metadata();
  assert.equal(metadata.width, 2048);
  assert.equal(metadata.height, 584);
  assert.equal(metadata.format, "png");
  await validateSource(paths.get(90));
});

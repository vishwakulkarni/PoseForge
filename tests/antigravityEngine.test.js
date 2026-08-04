const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");

test("Antigravity runs headlessly in the generation workspace and records CLI usage", async (t) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "poseforge-agy-test-"));
  const fixture = path.join(__dirname, "fixtures", "fake-antigravity.js");
  await fs.promises.chmod(fixture, 0o755);
  const previousBinary = process.env.ANTIGRAVITY_BIN;
  process.env.ANTIGRAVITY_BIN = fixture;
  const modulePath = require.resolve("../engines/antigravityEngine");
  delete require.cache[modulePath];
  const engine = require(modulePath);
  t.after(async () => {
    if (previousBinary == null) delete process.env.ANTIGRAVITY_BIN;
    else process.env.ANTIGRAVITY_BIN = previousBinary;
    delete require.cache[modulePath];
    await fs.promises.rm(directory, { recursive: true, force: true });
  });

  const characterPath = path.join(directory, "character-1.png");
  const posePath = path.join(directory, "pose.png");
  const outputPath = path.join(directory, "output.png");
  await sharp({ create: { width: 8, height: 8, channels: 4, background: "#3186ff" } }).png().toFile(characterPath);
  await sharp({ create: { width: 8, height: 8, channels: 4, background: "#fbbc04" } }).png().toFile(posePath);

  const result = await engine.generate({
    characterPhotoPaths: [characterPath],
    posePhotoPath: posePath,
    prompt: "Preserve the subject and apply the reference pose.",
    outputPath,
    outputSettings: { aspectRatio: "4:5", quality: "high" },
    model: "gemini-3.6-flash-high",
  });

  assert.equal((await sharp(outputPath).metadata()).format, "png");
  assert.equal(result.usage.source, "actual");
  assert.equal(result.usage.model, "gemini-3.6-flash-high");
  assert.equal(result.usage.totalTokens, 150);
  assert.equal(result.usage.thinkingTokens, 10);
  assert.equal(result.usage.estimatedCostUsd, null);
});

test("Antigravity rejects reference paths outside its generation workspace", async () => {
  const engine = require("../engines/antigravityEngine");
  await assert.rejects(engine.generate({
    characterPhotoPaths: ["/tmp/outside.png"],
    posePhotoPath: "/tmp/pose.png",
    prompt: "test",
    outputPath: "/tmp/poseforge-workspace/output.png",
    model: "gemini-3.6-flash-high",
  }), /inside the generation workspace/);
});

test("Antigravity safely recovers native image output from its conversation brain directory", async (t) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "poseforge-agy-brain-test-"));
  const fixture = path.join(__dirname, "fixtures", "fake-antigravity.js");
  const previous = {
    binary: process.env.ANTIGRAVITY_BIN,
    brain: process.env.ANTIGRAVITY_BRAIN_DIR,
    conversation: process.env.FAKE_AGY_CONVERSATION_ID,
  };
  process.env.ANTIGRAVITY_BIN = fixture;
  process.env.ANTIGRAVITY_BRAIN_DIR = path.join(directory, "brain");
  process.env.FAKE_AGY_CONVERSATION_ID = "11111111-2222-3333-4444-555555555555";
  const modulePath = require.resolve("../engines/antigravityEngine");
  delete require.cache[modulePath];
  const engine = require(modulePath);
  t.after(async () => {
    if (previous.binary == null) delete process.env.ANTIGRAVITY_BIN; else process.env.ANTIGRAVITY_BIN = previous.binary;
    if (previous.brain == null) delete process.env.ANTIGRAVITY_BRAIN_DIR; else process.env.ANTIGRAVITY_BRAIN_DIR = previous.brain;
    if (previous.conversation == null) delete process.env.FAKE_AGY_CONVERSATION_ID; else process.env.FAKE_AGY_CONVERSATION_ID = previous.conversation;
    delete require.cache[modulePath];
    await fs.promises.rm(directory, { recursive: true, force: true });
  });

  const characterPath = path.join(directory, "character-1.png");
  const posePath = path.join(directory, "pose.png");
  const outputPath = path.join(directory, "output.png");
  await sharp({ create: { width: 8, height: 8, channels: 4, background: "#3186ff" } }).png().toFile(characterPath);
  await sharp({ create: { width: 8, height: 8, channels: 4, background: "#fbbc04" } }).png().toFile(posePath);

  await engine.generate({
    characterPhotoPaths: [characterPath],
    posePhotoPath: posePath,
    prompt: "Preserve the subject and apply the reference pose.",
    outputPath,
    model: "gemini-3.6-flash-high",
  });

  assert.equal((await sharp(outputPath).metadata()).format, "png");
});

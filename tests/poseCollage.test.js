const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { gridFor, splitPoseCollage } = require("../lib/poseCollage");

test("automatic collage grids never exceed six cells", () => {
  assert.deepEqual(gridFor({ count: 2, width: 1200, height: 600, layout: "auto" }), { columns: 2, rows: 1 });
  assert.deepEqual(gridFor({ count: 4, width: 1000, height: 1000, layout: "auto" }), { columns: 2, rows: 2 });
  assert.deepEqual(gridFor({ count: 6, width: 1800, height: 1200, layout: "auto" }), { columns: 3, rows: 2 });
});

test("pose collage splitter creates one clean image per cell", async (t) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "poseforge-collage-"));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, "source.png");
  const left = await sharp({ create: { width: 300, height: 400, channels: 3, background: "#ff0000" } }).png().toBuffer();
  const right = await sharp({ create: { width: 300, height: 400, channels: 3, background: "#0000ff" } }).png().toBuffer();
  await sharp({ create: { width: 600, height: 400, channels: 3, background: "#ffffff" } }).composite([{ input: left, left: 0, top: 0 }, { input: right, left: 300, top: 0 }]).png().toFile(source);
  const result = await splitPoseCollage(source, path.join(directory, "cells"), { count: 2, layout: "horizontal" });
  assert.equal(result.outputs.length, 2);
  for (const output of result.outputs) {
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.width, 300);
    assert.equal(metadata.height, 400);
  }
});

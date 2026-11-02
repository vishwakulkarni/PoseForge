/**
 * The Codex CLI as a text writer (LLM Text) and an image editor (Image
 * Transform), against a stand-in `codex` binary that records how it was
 * called and does what the real one is asked to.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "poseforge-fake-codex-"));
const callLog = path.join(scratch, "calls.jsonl");
const fakeCodex = path.join(scratch, "codex");
fs.writeFileSync(fakeCodex, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
if (args[0] === "--version") process.exit(0);
fs.appendFileSync(${JSON.stringify(callLog)}, JSON.stringify(args) + "\\n");
const prompt = args[args.length - 1];
const answer = args.indexOf("-o");
if (answer >= 0) {
  fs.writeFileSync(args[answer + 1], "Hook one\\nHook two\\n");
  process.exit(0);
}
const output = prompt.match(/exact path:\\n(.+)\\n/)[1];
fs.copyFileSync(args[args.indexOf("-i") + 1], output);
`);
fs.chmodSync(fakeCodex, 0o755);
process.env.CODEX_BIN = fakeCodex;
const codex = require("../engines/codexEngine");

const calls = () => fs.readFileSync(callLog, "utf8").trim().split("\n").map((line) => JSON.parse(line));

test.after(() => fs.rmSync(scratch, { recursive: true, force: true }));

test("Codex writes text in a read-only sandbox and returns its final message", async () => {
  const { text } = await codex.assistPrompt({ instruction: "Write two hooks about kites.", system: "You write hooks." });
  assert.equal(text, "Hook one\nHook two");
  const args = calls().at(-1);
  assert.equal(args[args.indexOf("--sandbox") + 1], "read-only");
  assert.match(args.at(-1), /^You write hooks\.\n\nWrite two hooks about kites\./);
  assert.equal(codex.capabilities.assistPrompt, true);
});

test("Codex edits an image from an instruction, given the text to use", async () => {
  const workDir = fs.mkdtempSync(path.join(scratch, "work-"));
  const inputPath = path.join(scratch, "photo.png");
  await sharp({ create: { width: 20, height: 10, channels: 3, background: "#ff8800" } }).png().toFile(inputPath);
  const outputPath = path.join(workDir, "output.png");

  await codex.transformImage({ inputPath, instruction: "Remove the background.", context: "Summer sale", outputPath });
  assert.ok(fs.existsSync(outputPath));
  const args = calls().at(-1);
  assert.equal(args[args.indexOf("--sandbox") + 1], "workspace-write");
  assert.equal(args[args.indexOf("-C") + 1], workDir, "Codex works in the scratch folder, not next to the source");
  assert.equal(path.dirname(args[args.indexOf("-i") + 1]), workDir, "it edits a copy of the image");
  assert.match(args.at(-1), /Instruction: Remove the background\./);
  assert.match(args.at(-1), /Text to use[^\n]*\nSummer sale/);
});

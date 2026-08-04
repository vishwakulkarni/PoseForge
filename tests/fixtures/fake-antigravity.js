#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const args = process.argv.slice(2);
if (args.includes("--help")) process.exit(0);
const promptIndex = args.indexOf("-p");
const modelIndex = args.indexOf("--model");
const prompt = promptIndex >= 0 ? args[promptIndex + 1] : "";
const identity = prompt.match(/Identity image 1: ([^\n]+)/)?.[1];
const output = prompt.match(/Write one valid PNG to exactly: ([^\n]+)/)?.[1];
if (!identity || !output || !args.includes("--sandbox") || !args.includes("--dangerously-skip-permissions") || !args.includes("--disable-slash-commands") || modelIndex < 0) {
  process.stderr.write("Invalid Antigravity test invocation");
  process.exit(2);
}
const conversationId = process.env.FAKE_AGY_CONVERSATION_ID;
let response = "Generated the requested image.";
if (conversationId) {
  const brainOutput = path.join(process.env.ANTIGRAVITY_BRAIN_DIR, conversationId, "output.png");
  fs.mkdirSync(path.dirname(brainOutput), { recursive: true });
  fs.copyFileSync(identity, brainOutput);
  response = `Generated and saved [output.png](${pathToFileURL(brainOutput).href}).`;
} else {
  fs.copyFileSync(identity, output);
}
process.stdout.write(JSON.stringify({
  conversation_id: conversationId,
  status: "SUCCESS",
  response,
  duration_seconds: 1.25,
  usage: { input_tokens: 120, output_tokens: 30, thinking_tokens: 10, total_tokens: 150 },
}));

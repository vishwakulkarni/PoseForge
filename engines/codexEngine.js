const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const logger = require("../lib/logger");

const CODEX_BIN = process.env.CODEX_BIN || "codex";
const TIMEOUT_MS = Number(process.env.CODEX_TIMEOUT_MS || 300000);

/**
 * The CLI's stderr is a multi-line blob that can include the entire prompt
 * (multi-image generations echo it back) plus its own ERROR: lines. Users
 * see this text verbatim in the generation history, so it's parsed down to
 * a short, actionable message instead of the raw blob.
 */
function describeCodexFailure(stderr, stdout, code) {
  const text = stderr || stdout || "";
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const usageLimitLine = lines.find((line) => /usage limit/i.test(line));
  if (usageLimitLine) {
    const retryMatch = usageLimitLine.match(/try again at ([^.]+)/i);
    const retrySuffix = retryMatch ? ` Try again at ${retryMatch[1].trim()}.` : "";
    return `Codex CLI usage limit reached.${retrySuffix} Upgrade at https://chatgpt.com/explore/pro or check usage at https://chatgpt.com/codex/settings/usage.`;
  }
  const errorLines = lines.filter((line) => line.startsWith("ERROR:"));
  if (errorLines.length) return `Codex CLI failed: ${errorLines[errorLines.length - 1]}`;
  return `Codex CLI exited with code ${code}.`;
}

function runCodexImageGeneration({ referencePaths, prompt, outputPath, referenceDescription }) {
  return new Promise((resolve, reject) => {
    const fullPrompt = `${prompt}\n\nThe attached images are the references: ${referenceDescription}. Use the image-generation tool directly. Do not inspect skill documentation, run exploratory shell commands, or ask for clarification.\n\nOUTPUT CONTRACT: Generate the image now and write a valid PNG to this exact path:\n${outputPath}\nAfter the file exists, finish immediately.`;
    let child;
    const startedAt = Date.now();
    logger.info("starting Codex CLI", { referencePaths, outputPath, timeoutMs: TIMEOUT_MS });
    try {
      const imageFlags = referencePaths.flatMap((filePath) => ["-i", filePath]);
      child = spawn(CODEX_BIN, [
        "exec", "--sandbox", "workspace-write", "--skip-git-repo-check", "--ephemeral",
        "--ignore-user-config", "--ignore-rules", "-C", path.dirname(outputPath),
        ...imageFlags,
        "-c", "sandbox_workspace_write.network_access=true", fullPrompt,
      ], { stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) { return reject(new Error(`Failed to start Codex CLI: ${err.message}`)); }
    let stdout = ""; let stderr = ""; let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; child.kill("SIGKILL"); logger.error("Codex CLI timed out", { durationMs: Date.now() - startedAt, timeoutMs: TIMEOUT_MS, stderr: stderr.slice(-2000) }); reject(new Error(`Codex CLI timed out after ${TIMEOUT_MS}ms. ${stderr.slice(-2000)}`)); } }, TIMEOUT_MS);
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });
    child.on("error", (err) => { if (!settled) { settled = true; clearTimeout(timer); logger.error("Codex CLI process error", { error: err.message }); reject(new Error(`Failed to run Codex CLI: ${err.message}`)); } });
    child.on("close", (code) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (code !== 0) { logger.error("Codex CLI exited unsuccessfully", { code, durationMs: Date.now() - startedAt, stderr: stderr.slice(-2000) }); return reject(new Error(describeCodexFailure(stderr, stdout, code))); }
      if (!fs.existsSync(outputPath)) { logger.error("Codex CLI produced no output", { outputPath, durationMs: Date.now() - startedAt, stdout: stdout.slice(-1000), stderr: stderr.slice(-2000) }); return reject(new Error(`Codex CLI finished but did not write ${outputPath}.`)); }
      logger.info("Codex CLI completed", { outputPath, durationMs: Date.now() - startedAt });
      resolve();
    });
  });
}

const engine = {
  key: "codex",
  label: "Codex CLI",
  capabilities: { multiImage: true, angleProfiles: true, aspectRatio: "prompt", quality: "prompt", variants: true },
  async isReady() {
    const result = spawnSync(CODEX_BIN, ["--version"], { stdio: "ignore" });
    return result.error || result.status !== 0
      ? { ready: false, reason: "Codex CLI is not installed or not on PATH" }
      : { ready: true };
  },
  generate({ characterPhotoPaths, posePhotoPath, prompt, outputPath }) {
    const paths = Array.isArray(characterPhotoPaths) ? characterPhotoPaths : [characterPhotoPaths];
    const attachmentList = paths.length === 1
      ? "attachment 1 is the character and attachment 2 is the pose"
      : `attachments 1-${paths.length} are the characters (in order) and attachment ${paths.length + 1} is the pose`;
    return runCodexImageGeneration({
      referencePaths: [...paths, posePhotoPath],
      prompt,
      outputPath,
      referenceDescription: attachmentList,
    });
  },
  generateProfileView({ sourcePath, prompt, outputPath }) {
    return runCodexImageGeneration({
      referencePaths: [sourcePath],
      prompt,
      outputPath,
      referenceDescription: "attachment 1 is the only source image; change only its camera viewpoint as requested and preserve every other visible detail exactly",
    });
  },
};
/* --- Advanced Studio -------------------------------------------------------
 * Freeform image generation through the local Codex CLI.
 *
 * Codex has no API parameters for aspect ratio or resolution — the engine
 * declares both as "prompt", meaning they are expressed in the instruction —
 * so they are appended as an explicit line rather than silently dropped.
 * With no connected images this is a plain text-to-image request. */
function freeformSettingsLine({ aspectRatio, quality }) {
  const parts = [];
  if (aspectRatio) parts.push(`Aspect ratio: ${aspectRatio}.`);
  if (quality === "high") parts.push("Render at the highest detail the tool supports (about 2K on the long edge).");
  else if (quality) parts.push("Render at standard detail (about 1K on the long edge).");
  return parts.join(" ");
}

engine.capabilities.freeform = true;
engine.capabilities.textToImage = true;
engine.capabilities.maxReferenceImages = 6;
engine.capabilities.promptDrivenSettings = true;
engine.generateFreeform = function generateFreeform({ referencePaths = [], prompt, outputPath, outputSettings = {} }) {
  const settings = freeformSettingsLine(outputSettings);
  const fullPrompt = settings ? `${prompt}\n\n${settings}` : prompt;
  if (!referencePaths.length) {
    return runCodexImageGeneration({
      referencePaths: [],
      prompt: fullPrompt,
      outputPath,
      referenceDescription: "no reference images are attached; generate the image from the description alone",
    });
  }
  const description = referencePaths.length === 1
    ? "attachment 1 is a visual reference for the described subject, style, or composition"
    : `attachments 1-${referencePaths.length} are visual references, in order, for the described subject, style, or composition`;
  return runCodexImageGeneration({ referencePaths, prompt: fullPrompt, outputPath, referenceDescription: description });
};

module.exports = engine;
module.exports.describeCodexFailure = describeCodexFailure;
// Exported for tests: the settings line is the only way aspect ratio and
// resolution reach a provider that has no parameters for them.
module.exports.freeformSettingsLine = freeformSettingsLine;

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const logger = require("../lib/logger");
const { SYSTEM_PROMPT } = require("../lib/promptAssistant");

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

/**
 * Runs `codex exec` once in `cwd` with `prompt`, attaching `imagePaths`.
 * Resolves with the CLI's output when it exits cleanly; rejects with a short,
 * readable message otherwise. `sandbox` is the CLI sandbox mode: generation
 * and edits write files in `cwd`, text answers only read.
 */
function runCodex({ prompt, cwd, imagePaths = [], sandbox = "workspace-write", extraArgs = [], label = "Codex CLI" }) {
  return new Promise((resolve, reject) => {
    let child;
    const startedAt = Date.now();
    logger.info(`starting ${label}`, { imagePaths, cwd, timeoutMs: TIMEOUT_MS });
    try {
      const imageFlags = imagePaths.flatMap((filePath) => ["-i", filePath]);
      const network = sandbox === "workspace-write" ? ["-c", "sandbox_workspace_write.network_access=true"] : [];
      child = spawn(CODEX_BIN, [
        "exec", "--sandbox", sandbox, "--skip-git-repo-check", "--ephemeral",
        "--ignore-user-config", "--ignore-rules", "-C", cwd,
        ...imageFlags, ...extraArgs, ...network, prompt,
      ], { stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) { return reject(new Error(`Failed to start Codex CLI: ${err.message}`)); }
    let stdout = ""; let stderr = ""; let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; child.kill("SIGKILL"); logger.error(`${label} timed out`, { durationMs: Date.now() - startedAt, timeoutMs: TIMEOUT_MS, stderr: stderr.slice(-2000) }); reject(new Error(`Codex CLI timed out after ${TIMEOUT_MS}ms. ${stderr.slice(-2000)}`)); } }, TIMEOUT_MS);
    child.stdout.on("data", (data) => { stdout += data; });
    child.stderr.on("data", (data) => { stderr += data; });
    child.on("error", (err) => { if (!settled) { settled = true; clearTimeout(timer); logger.error("Codex CLI process error", { error: err.message }); reject(new Error(`Failed to run Codex CLI: ${err.message}`)); } });
    child.on("close", (code) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (code !== 0) { logger.error(`${label} exited unsuccessfully`, { code, durationMs: Date.now() - startedAt, stderr: stderr.slice(-2000) }); return reject(new Error(describeCodexFailure(stderr, stdout, code))); }
      logger.info(`${label} completed`, { durationMs: Date.now() - startedAt });
      resolve({ stdout, stderr });
    });
  });
}

/** Runs Codex and checks it wrote `outputPath`. */
async function runCodexForFile({ prompt, outputPath, imagePaths, label }) {
  const { stdout, stderr } = await runCodex({ prompt, cwd: path.dirname(outputPath), imagePaths, label });
  if (!fs.existsSync(outputPath)) {
    logger.error(`${label} produced no output`, { outputPath, stdout: stdout.slice(-1000), stderr: stderr.slice(-2000) });
    throw new Error(`Codex CLI finished but did not write ${outputPath}.`);
  }
}

function runCodexImageGeneration({ referencePaths, prompt, outputPath, referenceDescription }) {
  const fullPrompt = `${prompt}\n\nThe attached images are the references: ${referenceDescription}. Use the image-generation tool directly. Do not inspect skill documentation, run exploratory shell commands, or ask for clarification.\n\nOUTPUT CONTRACT: Generate the image now and write a valid PNG to this exact path:\n${outputPath}\nAfter the file exists, finish immediately.`;
  return runCodexForFile({ prompt: fullPrompt, outputPath, imagePaths: referencePaths, label: "Codex CLI" });
}

/** Writes text for an LLM Text node: Codex answers in a read-only sandbox
 * and its final message is the text. */
async function assistPrompt({ instruction, system = SYSTEM_PROMPT }) {
  const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "poseforge-codex-text-"));
  const answerPath = path.join(workDir, "answer.txt");
  try {
    const prompt = `${system}\n\n${instruction}\n\nAnswer in your final message only. Do not run commands or create files.`;
    await runCodex({ prompt, cwd: workDir, sandbox: "read-only", extraArgs: ["-o", answerPath], label: "Codex CLI text" });
    const text = fs.existsSync(answerPath) ? (await fs.promises.readFile(answerPath, "utf8")).trim() : "";
    if (!text) throw new Error("Codex CLI returned no text.");
    return { text };
  } finally {
    await fs.promises.rm(workDir, { recursive: true, force: true });
  }
}

/**
 * Edits an image however `instruction` says, for an Image Transform node.
 * Codex works on a copy in a scratch folder and may use any local tool —
 * Python with Pillow, ImageMagick, its image-generation tool for generative
 * changes — so one node can remove a background, add a logo, apply a grade
 * or lay out text. `context` is connected text it should use (a caption).
 */
async function transformImage({ inputPath, instruction, context, outputPath }) {
  const workDir = path.dirname(outputPath);
  const workingCopy = path.join(workDir, `input${path.extname(inputPath) || ".png"}`);
  await fs.promises.copyFile(inputPath, workingCopy);
  const prompt = [
    "Edit the attached image exactly as the instruction says. It is also on disk at:",
    workingCopy,
    `\nInstruction: ${instruction}`,
    context ? `\nText to use (for example as a caption or title):\n${context}` : "",
    "\nUse whatever local tools fit the job best: Python with Pillow, ImageMagick, or your image-generation tool for",
    "generative changes. Keep everything the instruction does not mention unchanged. Do not ask questions.",
    `\nOUTPUT CONTRACT: write the result as a valid PNG to this exact path:\n${outputPath}\nAfter the file exists, finish immediately.`,
  ].filter(Boolean).join("\n");
  await runCodexForFile({ prompt, outputPath, imagePaths: [workingCopy], label: "Codex CLI transform" });
}

const engine = {
  key: "codex",
  label: "Codex CLI",
  // Advanced Studio settings. The Codex CLI has no API parameters for aspect
  // ratio or resolution, so these are expressed in the instruction it gets.
  imageSettings: {
    aspectRatios: ["1:1", "4:5", "16:9", "9:16"],
    resolutions: [
      { id: "1K", label: "Standard", quality: "medium" },
      { id: "2K", label: "High detail", quality: "high" },
    ],
    defaultResolution: "1K",
    note: "Runs locally through the Codex CLI. Aspect ratio and detail are expressed in the prompt.",
  },
  capabilities: { multiImage: true, angleProfiles: true, aspectRatio: "prompt", quality: "prompt", variants: true, assistPrompt: true },
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

engine.assistPrompt = assistPrompt;
engine.transformImage = transformImage;

module.exports = engine;
module.exports.describeCodexFailure = describeCodexFailure;
// Exported for tests: the settings line is the only way aspect ratio and
// resolution reach a provider that has no parameters for them.
module.exports.freeformSettingsLine = freeformSettingsLine;

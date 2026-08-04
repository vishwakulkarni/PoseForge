const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { fileURLToPath } = require("url");
const { pool } = require("../db/pool");
const logger = require("../lib/logger");
const { RATE_DATE } = require("../lib/usageEstimator");

const models = [
  { id: "gemini-3.6-flash-high", label: "Gemini 3.6 Flash · High", tier: "quality", note: "Latest Antigravity Gemini tier with high reasoning effort; recommended for complex identity and pose work." },
  { id: "gemini-3.5-flash-medium", label: "Gemini 3.5 Flash · Medium", tier: "balanced", note: "Balanced Antigravity tier for everyday portrait transformations." },
  { id: "gemini-3.1-pro-high", label: "Gemini 3.1 Pro · High", tier: "deep", note: "Deeper agent reasoning for difficult multi-person or highly directed compositions." },
];
const DEFAULT_MODEL = models[0].id;
const AGY_BIN = process.env.ANTIGRAVITY_BIN || "agy";
const TIMEOUT_MS = Math.max(Number(process.env.ANTIGRAVITY_TIMEOUT_MS) || 600000, 30000);
const BRAIN_ROOT = path.resolve(process.env.ANTIGRAVITY_BRAIN_DIR || path.join(os.homedir(), ".gemini", "antigravity-cli", "brain"));
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function setting(key) {
  const result = await pool.query("SELECT value FROM settings WHERE key = $1", [key]);
  return result.rows[0]?.value || "";
}

function validModel(value) {
  return models.some((model) => model.id === value) ? value : DEFAULT_MODEL;
}

async function configuredModel() {
  return validModel(process.env.ANTIGRAVITY_MODEL || await setting("antigravity_model"));
}

function workspaceFile(workspace, filePath) {
  const absoluteWorkspace = path.resolve(workspace);
  const absoluteFile = path.resolve(filePath);
  if (path.dirname(absoluteFile) !== absoluteWorkspace) throw new Error("Antigravity reference images must be inside the generation workspace.");
  return path.basename(absoluteFile);
}

function usageFromEnvelope(envelope, model) {
  const usage = envelope?.usage || {};
  const inputTokens = Number(usage.input_tokens || 0);
  const outputTokens = Number(usage.output_tokens || 0);
  const thinkingTokens = Number(usage.thinking_tokens || 0);
  const totalTokens = Number(usage.total_tokens || inputTokens + outputTokens);
  return {
    source: totalTokens ? "actual" : "local-plan",
    rateDate: RATE_DATE,
    model,
    inputTokens,
    outputTokens,
    thinkingTokens,
    totalTokens,
    estimatedCostUsd: null,
    runtimeSeconds: Number(envelope?.duration_seconds || 0) || undefined,
    pricingNote: "Token usage reported by Antigravity CLI. Dollar cost and G1 credit consumption depend on the signed-in Google plan and are not exposed as a price by the CLI.",
  };
}

function recoverBrainArtifact(envelope, outputPath) {
  if (fs.existsSync(outputPath)) return null;
  const conversationId = String(envelope?.conversation_id || "");
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(conversationId)) return null;

  const response = String(envelope?.response || "");
  const fileUrls = response.match(/file:\/\/[^\s<>"')\]]+/g) || [];
  const conversationRoot = path.resolve(BRAIN_ROOT, conversationId);
  if (path.dirname(conversationRoot) !== BRAIN_ROOT || !fs.existsSync(conversationRoot)) return null;

  let realConversationRoot;
  try { realConversationRoot = fs.realpathSync(conversationRoot); } catch (_) { return null; }
  for (const fileUrl of fileUrls) {
    let candidate;
    try { candidate = fileURLToPath(fileUrl); } catch (_) { continue; }
    if (path.basename(candidate).toLowerCase() !== "output.png") continue;

    let realCandidate;
    try { realCandidate = fs.realpathSync(candidate); } catch (_) { continue; }
    if (path.dirname(realCandidate) !== realConversationRoot) continue;

    const stat = fs.statSync(realCandidate);
    if (!stat.isFile() || stat.size < PNG_SIGNATURE.length || stat.size > 100 * 1024 * 1024) continue;
    const signature = Buffer.alloc(PNG_SIGNATURE.length);
    const descriptor = fs.openSync(realCandidate, "r");
    try { fs.readSync(descriptor, signature, 0, signature.length, 0); } finally { fs.closeSync(descriptor); }
    if (!signature.equals(PNG_SIGNATURE)) continue;

    fs.copyFileSync(realCandidate, outputPath);
    return realCandidate;
  }
  return null;
}

const engine = {
  key: "antigravity",
  label: "Google Antigravity CLI",
  models,
  capabilities: { multiImage: true, aspectRatio: "prompt", quality: "prompt", variants: true, local: false, localCli: true, nativeImageTool: true },
  getConfiguredModel: configuredModel,
  async isReady() {
    const result = spawnSync(AGY_BIN, ["--help"], { stdio: "ignore", timeout: 3000 });
    return result.error || result.status !== 0
      ? { ready: false, reason: "Antigravity CLI is not installed or not on PATH" }
      : { ready: true };
  },
  async generate({ characterPhotoPaths, posePhotoPath, prompt, outputPath, outputSettings = {}, model }) {
    const workspace = path.dirname(outputPath);
    const characters = (Array.isArray(characterPhotoPaths) ? characterPhotoPaths : [characterPhotoPaths])
      .map((filePath) => workspaceFile(workspace, filePath));
    const pose = workspaceFile(workspace, posePhotoPath);
    const output = workspaceFile(workspace, outputPath);
    const selectedModel = validModel(model || await configuredModel());
    const references = characters.map((file, index) => `Identity image ${index + 1}: ${file}`).join("\n");
    const fullPrompt = `${prompt}

The source images are files in the current trusted workspace:
${references}
Pose image: ${pose}

Use Antigravity's native image-generation capability now. Inspect every source image and create one photorealistic transformation. Preserve identity and subject order exactly. Treat the pose file only as pose and composition direction. Target aspect ratio: ${outputSettings.aspectRatio || "1:1"}. Quality direction: ${outputSettings.quality || "medium"}.

OUTPUT CONTRACT:
- Write one valid PNG to exactly: ${output}
- Do not overwrite the reference images or create unrelated artifacts.
- Do not use shell commands; use the native image-generation and file tools.
- The task is not complete until ${output} exists. After writing it, respond briefly and exit.`;

    return new Promise((resolve, reject) => {
      const args = [
        "-p", fullPrompt,
        "--output-format", "json",
        "--model", selectedModel,
        "--effort", selectedModel.endsWith("-high") ? "high" : "medium",
        "--print-timeout", `${Math.ceil(TIMEOUT_MS / 1000)}s`,
        "--sandbox",
        // Headless mode cannot ask for read_file/image-tool approval. The
        // process is already confined to a generation directory containing
        // disposable normalized copies of the selected references.
        "--dangerously-skip-permissions",
        "--disable-slash-commands",
      ];
      let child;
      try {
        child = spawn(AGY_BIN, args, { cwd: workspace, stdio: ["ignore", "pipe", "pipe"] });
      } catch (error) {
        return reject(new Error(`Failed to start Antigravity CLI: ${error.message}`));
      }
      let stdout = "";
      let stderr = "";
      let settled = false;
      const startedAt = Date.now();
      logger.info("starting Antigravity CLI", { workspace, outputPath, model: selectedModel, timeoutMs: TIMEOUT_MS });
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGKILL");
        reject(new Error(`Antigravity CLI timed out after ${Math.round(TIMEOUT_MS / 1000)} seconds. ${stderr.slice(-1500)}`));
      }, TIMEOUT_MS + 15000);
      child.stdout.on("data", (data) => { stdout += data; });
      child.stderr.on("data", (data) => { stderr += data; });
      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Failed to run Antigravity CLI: ${error.message}`));
      });
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        let envelope = null;
        try { envelope = JSON.parse(stdout.trim()); } catch (_) { /* output file remains the primary contract */ }
        if (code !== 0 || envelope?.status === "ERROR") {
          const detail = envelope?.error || stderr || envelope?.response || stdout;
          return reject(new Error(`Antigravity CLI failed${code == null ? "" : ` with code ${code}`}. ${String(detail).slice(-2000)}`));
        }
        const recoveredArtifact = recoverBrainArtifact(envelope, outputPath);
        if (!fs.existsSync(outputPath)) {
          return reject(new Error(`Antigravity CLI completed but did not write ${output}. ${String(envelope?.response || stderr || stdout).slice(-1200)}`));
        }
        if (recoveredArtifact) logger.info("recovered Antigravity brain artifact", { outputPath, conversationId: envelope?.conversation_id });
        logger.info("Antigravity CLI completed", { outputPath, model: selectedModel, durationMs: Date.now() - startedAt });
        resolve({ usage: usageFromEnvelope(envelope, selectedModel) });
      });
    });
  },
};

module.exports = engine;

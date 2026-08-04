const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const logger = require("../lib/logger");

const CODEX_BIN = process.env.CODEX_BIN || "codex";
const TIMEOUT_MS = Number(process.env.CODEX_TIMEOUT_MS || 300000);

const engine = {
  key: "codex",
  label: "Codex CLI",
  async isReady() {
    const result = spawnSync(CODEX_BIN, ["--version"], { stdio: "ignore" });
    return result.error || result.status !== 0
      ? { ready: false, reason: "Codex CLI is not installed or not on PATH" }
      : { ready: true };
  },
  generate({ characterPhotoPaths, posePhotoPath, prompt, outputPath }) {
    return new Promise((resolve, reject) => {
      const paths = Array.isArray(characterPhotoPaths) ? characterPhotoPaths : [characterPhotoPaths];
      const attachmentList = paths.length === 1
        ? "attachment 1 is the character and attachment 2 is the pose"
        : `attachments 1-${paths.length} are the characters (in order) and attachment ${paths.length + 1} is the pose`;
      const fullPrompt = `${prompt}\n\nThe attached images are the references: ${attachmentList}. Use the image-generation tool directly. Do not inspect skill documentation, run exploratory shell commands, or ask for clarification.\n\nOUTPUT CONTRACT: Generate the image now and write a valid PNG to this exact path:\n${outputPath}\nAfter the file exists, finish immediately.`;
      let child;
      const startedAt = Date.now();
      logger.info("starting Codex CLI", { characterPhotoPaths: paths, posePhotoPath, outputPath, timeoutMs: TIMEOUT_MS });
      try {
        const imageFlags = [...paths, posePhotoPath].flatMap((p) => ["-i", p]);
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
        if (code !== 0) { logger.error("Codex CLI exited unsuccessfully", { code, durationMs: Date.now() - startedAt, stderr: stderr.slice(-2000) }); return reject(new Error(`Codex CLI exited with code ${code}. ${stderr || stdout}`)); }
        if (!fs.existsSync(outputPath)) { logger.error("Codex CLI produced no output", { outputPath, durationMs: Date.now() - startedAt, stdout: stdout.slice(-1000), stderr: stderr.slice(-2000) }); return reject(new Error(`Codex CLI finished but did not write ${outputPath}.`)); }
        logger.info("Codex CLI completed", { outputPath, durationMs: Date.now() - startedAt });
        resolve();
      });
    });
  },
};
module.exports = engine;

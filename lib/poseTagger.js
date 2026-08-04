const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { pool } = require("../db/pool");
const logger = require("./logger");

const CODEX_BIN = process.env.CODEX_BIN || "codex";
const CODEX_TAG_TIMEOUT_MS = Number(process.env.CODEX_TAG_TIMEOUT_MS || 60000);

async function getOpenAiKey() {
  const result = await pool.query("SELECT value FROM settings WHERE key = 'openai_api_key'");
  return result.rows[0]?.value || "";
}

function parseTagJson(text) {
  const match = String(text || "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    const title = String(parsed.title || "").trim().slice(0, 80);
    const category = String(parsed.category || "").trim().toLowerCase().slice(0, 40);
    const tags = Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 8) : [];
    if (!title && !category && !tags.length) return null;
    return { title: title || undefined, category: category || undefined, tags };
  } catch (_) { return null; }
}

const TAG_INSTRUCTIONS = "Look at this reference photo of a human pose. Respond with ONLY a JSON object, no prose, no markdown fences, shaped exactly like: " +
  '{"title": "short 3-6 word description", "category": "one of standing, sitting, action, portrait, candid, group", "tags": ["3-6 lowercase single/double word tags describing the pose, angle, and setting"]}';

async function tagViaOpenAi(imagePath, apiKey) {
  const image = await fs.promises.readFile(imagePath);
  const b64 = image.toString("base64");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: TAG_INSTRUCTIONS },
          { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
        ],
      }],
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || `OpenAI request failed (${response.status}).`);
  return parseTagJson(body.choices?.[0]?.message?.content);
}

function tagViaCodex(imagePath) {
  return new Promise((resolve, reject) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "poseforge-tag-"));
    const outputPath = path.join(workDir, "tags.json");
    const prompt = `${TAG_INSTRUCTIONS}\n\nWrite that JSON object (and nothing else) to this exact path: ${outputPath}\nThen finish immediately. Do not generate or edit any image.`;
    let child;
    try {
      child = spawn(CODEX_BIN, [
        "exec", "--sandbox", "workspace-write", "--skip-git-repo-check", "--ephemeral",
        "--ignore-user-config", "--ignore-rules", "-C", workDir,
        "-i", imagePath, prompt,
      ], { stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) { return reject(err); }
    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; child.kill("SIGKILL"); reject(new Error("Codex CLI tagging timed out")); } }, CODEX_TAG_TIMEOUT_MS);
    child.on("error", (err) => { if (!settled) { settled = true; clearTimeout(timer); reject(err); } });
    child.on("close", () => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (!fs.existsSync(outputPath)) return reject(new Error("Codex CLI did not write a tags file"));
      try { resolve(parseTagJson(fs.readFileSync(outputPath, "utf8"))); }
      catch (err) { reject(err); }
      finally { fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {}); }
    });
  });
}

function codexAvailable() {
  const result = spawnSync(CODEX_BIN, ["--version"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

/**
 * Best-effort AI tagging for a pose reference image. Never throws — a
 * failure here should never block the upload/generation flow that
 * triggered it. Returns { title?, category?, tags } or null when no
 * tagging engine is available/succeeded (caller should mark 'skipped').
 */
async function tagPoseImage(imagePath) {
  try {
    const openAiKey = await getOpenAiKey();
    if (openAiKey) {
      const result = await tagViaOpenAi(imagePath, openAiKey);
      if (result) return result;
    }
  } catch (err) { logger.warn("OpenAI pose tagging failed, falling back", { error: err.message }); }

  try {
    if (codexAvailable()) {
      const result = await tagViaCodex(imagePath);
      if (result) return result;
    }
  } catch (err) { logger.warn("Codex CLI pose tagging failed", { error: err.message }); }

  return null;
}

/**
 * Fires tagging in the background and writes the result back to the
 * pose_references row. Intentionally not awaited by callers.
 */
function tagPoseReferenceInBackground(poseReferenceId, imagePath) {
  tagPoseImage(imagePath)
    .then(async (result) => {
      if (!result) {
        await pool.query("UPDATE pose_references SET tag_status = 'skipped' WHERE id = $1 AND tag_status = 'pending'", [poseReferenceId]);
        return;
      }
      const fields = [];
      const values = [];
      if (result.title) { values.push(result.title); fields.push(`title = $${values.length}`); }
      if (result.category) { values.push(result.category); fields.push(`category = $${values.length}`); }
      values.push(result.tags || []); fields.push(`tags = $${values.length}`);
      values.push(poseReferenceId);
      await pool.query(`UPDATE pose_references SET ${fields.join(", ")}, tag_status = 'tagged' WHERE id = $${values.length}`, values);
      logger.info("pose reference tagged", { poseReferenceId, tags: result.tags });
    })
    .catch(async (err) => {
      logger.warn("pose tagging pipeline failed", { poseReferenceId, error: err.message });
      await pool.query("UPDATE pose_references SET tag_status = 'skipped' WHERE id = $1 AND tag_status = 'pending'", [poseReferenceId]).catch(() => {});
    });
}

module.exports = { tagPoseImage, tagPoseReferenceInBackground, parseTagJson };

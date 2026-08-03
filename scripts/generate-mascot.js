/**
 * One-off asset generator: creates the site's painter-dog mascot using the
 * Codex CLI (the same engine the app uses for pose generations), and saves
 * it to public/images/mascot-painter-dog.png.
 *
 * The site already points its <img> tags at that PNG path with a fallback
 * to the hand-drawn public/images/mascot-painter-dog.svg placeholder, so
 * running this script is the only step needed to swap in the real
 * Pixar-style artwork — no other code changes required.
 *
 * Usage:
 *   node scripts/generate-mascot.js
 *
 * Requires the Codex CLI installed and authenticated (same prerequisite as
 * the app's Codex generation engine — see README.md).
 */

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const CODEX_BIN = process.env.CODEX_BIN || "codex";
const TIMEOUT_MS = Number(process.env.CODEX_TIMEOUT_MS || 300000);
const OUTPUT_PATH = path.join(__dirname, "..", "public", "images", "mascot-painter-dog.png");

const PROMPT = [
  "An adorable, Pixar-style Golden Retriever character stands joyfully as an artist on a solid, pure white background.",
  "The dog wears a small, tilted red beret and a splattered denim artist's apron over its fur.",
  "In one paw, it enthusiastically holds a wooden paint palette smeared with vibrant acrylic colors, while its other paw grips a paintbrush wet with blue paint.",
  "The entire character is rendered with soft 3D lighting, expressive cartoon eyes, and clean, isolated edges perfect for graphic design.",
  "",
  `Use the image-generation tool directly. Do not inspect skill documentation, run exploratory shell commands, or ask for clarification.`,
  `OUTPUT CONTRACT: Generate the image now and write a valid PNG (transparent or pure white background, square, at least 1024x1024) to this exact path:`,
  OUTPUT_PATH,
  `After the file exists, finish immediately.`,
].join(" ");

function checkCodexInstalled() {
  const result = spawnSync(CODEX_BIN, ["--version"], { stdio: "ignore" });
  return !(result.error || result.status !== 0);
}

function run() {
  if (!checkCodexInstalled()) {
    console.error(`Codex CLI ("${CODEX_BIN}") is not installed or not on PATH.`);
    console.error("Install and authenticate it first (see README.md), then re-run this script.");
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });

  console.log("Generating mascot with Codex CLI — this can take a minute...");
  const child = spawn(CODEX_BIN, [
    "exec", "--sandbox", "workspace-write", "--skip-git-repo-check", "--ephemeral",
    "--ignore-user-config", "--ignore-rules", "-C", path.dirname(OUTPUT_PATH),
    "-c", "sandbox_workspace_write.network_access=true", PROMPT,
  ], { stdio: ["ignore", "inherit", "inherit"] });

  const timer = setTimeout(() => {
    child.kill("SIGKILL");
    console.error(`Codex CLI timed out after ${TIMEOUT_MS}ms.`);
    process.exit(1);
  }, TIMEOUT_MS);

  child.on("error", (err) => {
    clearTimeout(timer);
    console.error(`Failed to run Codex CLI: ${err.message}`);
    process.exit(1);
  });

  child.on("close", (code) => {
    clearTimeout(timer);
    if (code !== 0) {
      console.error(`Codex CLI exited with code ${code}.`);
      process.exit(1);
    }
    if (!fs.existsSync(OUTPUT_PATH)) {
      console.error(`Codex CLI finished but did not write ${OUTPUT_PATH}.`);
      process.exit(1);
    }
    console.log(`Mascot saved to ${OUTPUT_PATH}`);
    console.log("Refresh the site — the new artwork will appear automatically.");
  });
}

run();

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");
const storage = require("../storage");
const {
  MAX_PROMPT_LENGTH,
  activeResult,
  engineRegistry,
  nodeError,
  sanitizeInputBindings,
  sanitizeRunState,
  shortText,
} = require("./shared");

/** Output sizes for the common post formats; "original" keeps the size and
 * only applies the overlay. */
const PRESETS = {
  original: null,
  "9:16": { width: 1080, height: 1920 },
  "4:5": { width: 1080, height: 1350 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
  "3:4": { width: 1080, height: 1440 },
};
const FITS = new Set(["cover", "contain"]);
const POSITIONS = new Set(["top", "bottom"]);
const BINDABLE = ["preset", "fit"];
const MAX_OVERLAY_LINES = 6;

function escapeXml(text) {
  return text.replace(/[<>&'"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char]);
}

/** Greedy word wrap by character count; good enough for a caption band. */
function wrap(text, maxChars) {
  const lines = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && (line.length + 1 + word.length) > maxChars) {
        lines.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) lines.push(line);
  }
  if (lines.length > MAX_OVERLAY_LINES) {
    lines.length = MAX_OVERLAY_LINES;
    lines[MAX_OVERLAY_LINES - 1] = `${lines[MAX_OVERLAY_LINES - 1].replace(/\s*\S*$/, "")}…`;
  }
  return lines;
}

/** A translucent band with white text across the top or bottom. */
function overlaySvg(text, width, height, position) {
  const fontSize = Math.max(Math.round(width * 0.045), 14);
  const lineHeight = Math.round(fontSize * 1.3);
  const lines = wrap(text, Math.max(Math.floor((width * 0.9) / (fontSize * 0.55)), 8));
  const padding = Math.round(fontSize * 0.8);
  const bandHeight = lines.length * lineHeight + padding * 2;
  const bandY = position === "top" ? 0 : height - bandHeight;
  const tspans = lines.map((line, index) => (
    `<tspan x="50%" y="${bandY + padding + (index + 1) * lineHeight - Math.round(lineHeight * 0.25)}">${escapeXml(line)}</tspan>`
  )).join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
    + `<rect x="0" y="${bandY}" width="${width}" height="${bandHeight}" fill="rgba(0,0,0,0.55)"/>`
    + `<text font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="600" fill="#ffffff" text-anchor="middle">${tspans}</text>`
    + "</svg>"
  );
}

/**
 * Has an engine (the Codex CLI) edit the image as `instruction` says and
 * returns the path of the PNG it wrote, in a scratch folder the caller
 * removes. Connected text is handed over for the engine to use.
 */
async function editWithEngine(data, sourcePath, text, workDir) {
  const engine = engineRegistry()[data.engine];
  if (typeof engine?.transformImage !== "function") throw new Error(`${data.engine} cannot edit images. Choose Codex CLI or Built-in.`);
  const ready = await engine.isReady();
  if (!ready.ready) throw new Error(ready.reason || `${engine.label} is not ready.`);
  if (!data.instruction) throw nodeError("Write what to do to the image.");
  const outputPath = path.join(workDir, "output.png");
  await engine.transformImage({ inputPath: sourcePath, instruction: data.instruction, context: text, outputPath });
  return outputPath;
}

/**
 * Prepares an image for a post, two ways:
 * - built in (no engine): crops or pads to a post format and optionally
 *   writes a caption band, locally with sharp — no provider, no cost;
 * - with an engine that edits images (the Codex CLI): the engine does
 *   whatever the instruction says, with connected text to work from, and
 *   the format is applied to its result.
 * Connected text (an LLM caption, say) wins over the node's own overlay text.
 */
module.exports = {
  type: "imageTransform",
  inputs: [
    { id: "image", dataType: "image" },
    { id: "text", dataType: "text" },
  ],
  outputs: ["image"],
  PRESETS,
  templateFields: ["overlayText", "instruction"],
  sanitize(value) {
    const preset = shortText(value.preset, 12);
    const fit = shortText(value.fit, 8);
    const data = {
      preset: Object.prototype.hasOwnProperty.call(PRESETS, preset) ? preset : "1:1",
      fit: FITS.has(fit) ? fit : "cover",
    };
    const background = shortText(value.background, 7);
    if (/^#[0-9a-f]{6}$/i.test(background)) data.background = background.toLowerCase();
    const overlayText = shortText(value.overlayText, 500);
    if (overlayText) data.overlayText = overlayText;
    const position = shortText(value.overlayPosition, 8);
    if (POSITIONS.has(position)) data.overlayPosition = position;
    const engine = shortText(value.engine, 32);
    if (engine) data.engine = engine;
    const instruction = shortText(value.instruction, MAX_PROMPT_LENGTH);
    if (instruction) data.instruction = instruction;
    const bindings = sanitizeInputBindings(value.inputBindings, BINDABLE);
    if (bindings) data.inputBindings = bindings;
    return sanitizeRunState(value, data);
  },
  items(node) {
    const result = activeResult(node.data);
    return result?.imageUrl ? [{ image: result.imageUrl }] : [];
  },
  bindable: {
    preset() {
      return { type: "enum", options: Object.keys(PRESETS) };
    },
    fit() {
      return { type: "enum", options: [...FITS] };
    },
  },
  async execute(node, inputs, { projectId }) {
    const { data } = node;
    const imageUrl = (inputs.image || [])[0];
    if (!imageUrl) throw nodeError("Connect an image to transform.");
    const sourcePath = storage.absolutePathFromPublicUrl(imageUrl);
    if (!sourcePath || !fs.existsSync(sourcePath)) throw nodeError("The connected image could not be resolved.");
    const overlay = ((inputs.text || []).join("\n").trim() || data.overlayText || "").slice(0, MAX_PROMPT_LENGTH);

    if (!data.engine) return saveResult(projectId, await render(sourcePath, data, overlay));
    const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "poseforge-transform-"));
    try {
      const edited = await editWithEngine(data, sourcePath, overlay, workDir);
      // The engine was given the caption; the format still applies.
      return await saveResult(projectId, await render(edited, data, ""));
    } finally {
      await fs.promises.rm(workDir, { recursive: true, force: true });
    }
  },
};

/** Resizes to the node's format and draws the caption band, as PNG. */
async function render(sourcePath, data, overlay) {
  const size = PRESETS[data.preset] || null;
  let pipeline = sharp(sourcePath).rotate();
  if (size) {
    pipeline = pipeline.resize(size.width, size.height, {
      fit: data.fit === "contain" ? "contain" : "cover",
      position: "attention",
      background: data.background || "#000000",
    });
  }
  let { data: buffer, info } = await pipeline.png().toBuffer({ resolveWithObject: true });
  if (overlay) {
    ({ data: buffer, info } = await sharp(buffer)
      .composite([{ input: overlaySvg(overlay, info.width, info.height, data.overlayPosition || "bottom") }])
      .png()
      .toBuffer({ resolveWithObject: true }));
  }

  return { buffer, info };
}

async function saveResult(projectId, { buffer, info }) {
  const relativePath = storage.getAdvancedAssetPath(projectId, `transform-${crypto.randomUUID()}`, ".png");
  const destination = storage.absolutePath(relativePath);
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  await fs.promises.writeFile(destination, buffer);
  const result = { imageUrl: storage.publicUrl(relativePath), width: info.width, height: info.height };
  return { results: [result], item: { image: result.imageUrl } };
}

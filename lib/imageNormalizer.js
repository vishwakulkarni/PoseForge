const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const heicConvert = require("heic-convert");

function looksLikeHeic(inputPath, { originalName = "", mimeType = "" } = {}) {
  const extension = path.extname(originalName || inputPath).toLowerCase();
  return extension === ".heic" || extension === ".heif" || /hei[cf]/i.test(mimeType);
}

async function heicFallbackBuffer(inputPath) {
  return Buffer.from(await heicConvert({
    buffer: await fs.promises.readFile(inputPath),
    format: "PNG",
    quality: 1,
  }));
}

async function renderPng(inputPath, options = {}, transform = (pipeline) => pipeline) {
  try {
    return await transform(sharp(inputPath, { failOn: "warning" }).rotate()).png().toBuffer();
  } catch (error) {
    if (!looksLikeHeic(inputPath, options)) throw error;
    const decoded = await heicFallbackBuffer(inputPath);
    return transform(sharp(decoded, { failOn: "warning" }).rotate()).png().toBuffer();
  }
}

/**
 * Re-encodes uploaded/reference images as clean PNGs. This removes iPhone
 * container metadata (including MPO markers) and applies EXIF orientation
 * before an engine receives the image.
 */
async function normalizeToPng(inputPath, outputPath, options = {}) {
  const buffer = await renderPng(inputPath, options);
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.writeFile(outputPath, buffer);
  return outputPath;
}

async function createPreviewPng(inputPath, options = {}) {
  return renderPng(inputPath, options, (pipeline) => pipeline.resize({ width: 720, height: 720, fit: "inside", withoutEnlargement: true }));
}

module.exports = { normalizeToPng, createPreviewPng, looksLikeHeic };

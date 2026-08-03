const sharp = require("sharp");

/**
 * Re-encodes uploaded/reference images as clean PNGs. This removes iPhone
 * container metadata (including MPO markers) and applies EXIF orientation
 * before an engine receives the image.
 */
async function normalizeToPng(inputPath, outputPath) {
  await sharp(inputPath, { failOn: "warning" })
    .rotate()
    .png()
    .toFile(outputPath);
  return outputPath;
}

module.exports = { normalizeToPng };

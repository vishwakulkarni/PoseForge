const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

function gridFor({ count, layout, width, height }) {
  if (layout === "horizontal") return { columns: count, rows: 1 };
  if (layout === "vertical") return { columns: 1, rows: count };
  if (layout === "2x2") return { columns: 2, rows: 2 };
  if (layout === "3x2") return { columns: 3, rows: 2 };
  if (layout === "2x3") return { columns: 2, rows: 3 };
  if (count === 2) return width >= height ? { columns: 2, rows: 1 } : { columns: 1, rows: 2 };
  if (count === 3) return width >= height ? { columns: 3, rows: 1 } : { columns: 1, rows: 3 };
  if (count === 4) return { columns: 2, rows: 2 };
  return width >= height ? { columns: 3, rows: 2 } : { columns: 2, rows: 3 };
}

async function splitPoseCollage(inputPath, outputDirectory, { count = 2, layout = "auto" } = {}) {
  const safeCount = Math.min(Math.max(Number(count) || 2, 2), 6);
  const metadata = await sharp(inputPath).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Could not read the pose collage dimensions.");
  const grid = gridFor({ count: safeCount, layout, width: metadata.width, height: metadata.height });
  if (grid.columns * grid.rows < safeCount) throw new Error(`The selected ${layout} layout does not have enough cells for ${safeCount} poses.`);
  await fs.promises.mkdir(outputDirectory, { recursive: true });
  const cellWidth = Math.floor(metadata.width / grid.columns);
  const cellHeight = Math.floor(metadata.height / grid.rows);
  const outputs = [];
  for (let index = 0; index < safeCount; index += 1) {
    const column = index % grid.columns;
    const row = Math.floor(index / grid.columns);
    const outputPath = path.join(outputDirectory, `pose-cell-${index + 1}.png`);
    await sharp(inputPath)
      .extract({ left: column * cellWidth, top: row * cellHeight, width: cellWidth, height: cellHeight })
      .png()
      .toFile(outputPath);
    outputs.push(outputPath);
  }
  return { outputs, grid };
}

module.exports = { gridFor, splitPoseCollage };

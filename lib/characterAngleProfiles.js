const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { pool } = require("../db/pool");
const { registry } = require("../engines");
const storage = require("./storage");
const logger = require("./logger");

const ANGLES = [0, 45, 90, 135, 180];
const ANGLE_DIRECTIONS = {
  0: "a complete left-side profile, with the nose pointing toward the left edge of the frame",
  45: "a left three-quarter view, turned halfway between a left profile and facing the camera",
  90: "a straight-on front view, looking directly toward the camera",
  135: "a right three-quarter view, turned halfway between facing the camera and a right profile",
  180: "a complete right-side profile, with the nose pointing toward the right edge of the frame",
};

function anglePrompt(angle) {
  return [
    "Image 1 is the only source of truth and contains one person.",
    `Render that exact same person and image from ${ANGLE_DIRECTIONS[angle]}.`,
    "CHANGE ONLY THE VIEWPOINT needed for the requested angle. Do not redesign, beautify, restyle, simplify, or otherwise modify the person, their outfit, or the scene.",
    "Preserve the person's exact identity, face, facial proportions, skin tone, apparent age, expression, makeup, facial hair, body proportions, and every distinguishing feature.",
    "Preserve all eyeglasses or sunglasses, the complete visible clothing and its fit, colors, patterns and textures, the exact hairstyle, hair length, texture and accessories, and all jewelry or other accessories. Do not remove, add, replace, or alter any of them.",
    "Keep the source image's crop and amount of the body shown, image scale, lighting, colors, background, and composition as closely as the new viewpoint permits. Do not turn it into a studio portrait or change the person's body pose.",
    "Show exactly one person. Do not add text, angle labels, borders, watermarks, or extra people.",
  ].join(" ");
}

async function validateSource(sourcePath) {
  const metadata = await sharp(sourcePath).metadata();
  if (!metadata.width || !metadata.height) throw new Error("The character photo could not be read.");
  if (metadata.width < 256 || metadata.height < 256) {
    const error = new Error("Use a character photo that is at least 256 by 256 pixels.");
    error.statusCode = 400;
    throw error;
  }
}

async function buildSheet(viewPaths, outputPath) {
  const panelWidth = 400;
  const photoHeight = 520;
  const labelHeight = 64;
  const gap = 12;
  const width = panelWidth * ANGLES.length + gap * (ANGLES.length - 1);
  const height = photoHeight + labelHeight;
  const composites = [];

  for (const [index, angle] of ANGLES.entries()) {
    const image = await sharp(viewPaths.get(angle))
      .rotate()
      .resize(panelWidth, photoHeight, {
        fit: "contain",
        background: { r: 245, g: 245, b: 245, alpha: 1 },
      })
      .png()
      .toBuffer();
    composites.push({ input: image, left: index * (panelWidth + gap), top: 0 });
  }

  const labels = `
    <svg width="${width}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#ffffff" />
      ${ANGLES.map((angle, index) => `<text x="${index * (panelWidth + gap) + panelWidth / 2}" y="42" text-anchor="middle" font-family="Arial, sans-serif" font-size="27" font-weight="700" fill="#17191f">${angle}°</text>`).join("")}
    </svg>`;
  composites.push({ input: Buffer.from(labels), left: 0, top: photoHeight });

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp({
    create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  }).composite(composites).png().toFile(outputPath);
}

async function runProfileGeneration({ characterId, profileSetId, sourcePath, engineKey, model, requestId }) {
  const engine = registry[engineKey];
  if (!engine?.capabilities?.angleProfiles || typeof engine.generateProfileView !== "function") {
    throw new Error(`Engine ${engineKey} does not support character angle profiles.`);
  }
  const viewPaths = new Map();
  try {
    await pool.query(
      "UPDATE character_profile_sets SET status = 'running', started_at = now(), error_message = NULL WHERE id = $1",
      [profileSetId],
    );

    const results = await Promise.allSettled(ANGLES.map(async (angle) => {
      const relativePath = storage.getCharacterProfileViewPath(characterId, profileSetId, angle);
      const outputPath = storage.absolutePath(relativePath);
      await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
      await pool.query(
        "UPDATE character_profile_views SET status = 'running', error_message = NULL WHERE profile_set_id = $1 AND angle = $2",
        [profileSetId, angle],
      );
      try {
        await engine.generateProfileView({
          sourcePath,
          prompt: anglePrompt(angle),
          outputPath,
          outputSettings: { aspectRatio: "4:5", size: "1024x1536", quality: "medium" },
          model,
        });
        await pool.query(
          "UPDATE character_profile_views SET status = 'completed', file_path = $3, error_message = NULL, completed_at = now() WHERE profile_set_id = $1 AND angle = $2",
          [profileSetId, angle, relativePath],
        );
        viewPaths.set(angle, outputPath);
      } catch (error) {
        await pool.query(
          "UPDATE character_profile_views SET status = 'failed', error_message = $3, completed_at = now() WHERE profile_set_id = $1 AND angle = $2",
          [profileSetId, angle, error.message],
        );
        throw error;
      }
    }));

    const failed = results.find((result) => result.status === "rejected");
    if (failed) throw failed.reason;

    const sheetPath = storage.getCharacterProfileSheetPath(characterId, profileSetId);
    await buildSheet(viewPaths, storage.absolutePath(sheetPath));
    await pool.transaction(async (transaction) => {
      await transaction.query("UPDATE character_profile_sets SET is_active = false WHERE character_id = $1", [characterId]);
      const completed = await transaction.query(
        "UPDATE character_profile_sets SET status = 'completed', sheet_path = $2, is_active = true, error_message = NULL, completed_at = now() WHERE id = $1 RETURNING id",
        [profileSetId, sheetPath],
      );
      if (!completed.rowCount) throw new Error("Character profile no longer exists.");
    });
    logger.info("character angle profile completed", { requestId, characterId, profileSetId, engine: engineKey, model });
  } catch (error) {
    await pool.query(
      "UPDATE character_profile_sets SET status = 'failed', error_message = $2, completed_at = now() WHERE id = $1",
      [profileSetId, error.message],
    ).catch(() => {});
    logger.error("character angle profile failed", {
      requestId,
      characterId,
      profileSetId,
      engine: engineKey,
      model,
      error: error.message,
    });
    throw error;
  }
}

module.exports = { ANGLES, ANGLE_DIRECTIONS, anglePrompt, validateSource, buildSheet, runProfileGeneration };

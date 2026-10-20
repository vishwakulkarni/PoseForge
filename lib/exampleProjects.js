/**
 * First-run example workflow.
 *
 * A fresh clone has no characters and no projects, so both studios open onto
 * nothing to learn from. On first start this seeds one example into each:
 * two different characters side by side, holding hands, driven by the bundled
 * hand-hold pose. The guided Studio gets it as a character/pose/generate
 * canvas; Advanced Studio gets the same idea as an explicit node graph.
 *
 * Runs once, gated by a settings flag, so deleting the examples stays deleted.
 * Photos are copied rather than referenced: deleting a character removes its
 * photo file, which must never be a committed pose-library seed.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { pool } = require("../db/pool");
const storage = require("./storage");
const { PROJECT_SCHEMA_VERSION, sanitizeStudioDocument } = require("./studioProject");
const { ADVANCED_SCHEMA_VERSION, sanitizeAdvancedDocument } = require("./advancedStudioProject");

const SEEDED_KEY = "example_projects_seeded";
const POSE_SOURCE_URL = "https://images.unsplash.com/photo-1576299657860-bd5eb28ceca7?auto=format&fit=crop&w=700&h=875&q=82";
const PROMPT =
  "Both people stand side by side, facing the camera and holding hands, exactly as in the pose reference. " +
  "Keep each person's own face, hair, skin tone and clothing. Use the pose reference for posture and framing only.";

const CHARACTERS = [
  { name: "Example – Zara", seedFile: "pose-library/seed/female-athletic-stance.png" },
  { name: "Example – Leo", seedFile: "pose-library/seed/male-editorial-lean.png" },
];

async function copyCharacterPhoto(character) {
  const id = crypto.randomUUID();
  const photoId = crypto.randomUUID();
  const filePath = storage.getCharacterPhotoPath(id, photoId, ".png");
  await fs.promises.mkdir(path.dirname(storage.absolutePath(filePath)), { recursive: true });
  await fs.promises.copyFile(storage.absolutePath(character.seedFile), storage.absolutePath(filePath));
  return { ...character, id, photoId, filePath, imageUrl: storage.publicUrl(filePath) };
}

function studioDocument(characters, pose) {
  const nodes = [
    ...characters.map((character, index) => ({
      id: `character-${character.id}`,
      kind: "character",
      position: { x: index * 380, y: 0 },
      label: character.name,
      assetType: "character",
      assetId: character.id,
      imageUrl: character.imageUrl,
    })),
    {
      id: `pose-${pose.id}`,
      kind: "pose",
      position: { x: characters.length * 380, y: 0 },
      label: "Holding hands",
      assetType: "pose",
      assetId: pose.id,
      imageUrl: pose.imageUrl,
    },
    { id: "generate", kind: "generate", position: { x: 380, y: 450 }, prompt: PROMPT },
  ];
  const edges = [
    ...characters.map((character) => ({
      id: `character-${character.id}-generate`,
      source: `character-${character.id}`,
      target: "generate",
      targetHandle: "character",
    })),
    { id: `pose-${pose.id}-generate`, source: `pose-${pose.id}`, target: "generate", targetHandle: "pose" },
  ];
  return sanitizeStudioDocument({ schemaVersion: PROJECT_SCHEMA_VERSION, viewport: null, nodes, edges, edgeState: "explicit" });
}

/** Image Inputs live under the project's own asset directory, so deleting the
 * example reclaims them like any other Advanced Studio upload. */
async function copyAdvancedImage(projectId, sourceFile) {
  const filePath = storage.getAdvancedAssetPath(projectId, crypto.randomUUID(), ".png");
  await fs.promises.mkdir(path.dirname(storage.absolutePath(filePath)), { recursive: true });
  await fs.promises.copyFile(storage.absolutePath(sourceFile), storage.absolutePath(filePath));
  return storage.publicUrl(filePath);
}

async function advancedDocument(projectId, poseFile) {
  const inputs = [
    { id: "image-input-zara", label: CHARACTERS[0].name, file: CHARACTERS[0].seedFile },
    { id: "image-input-leo", label: CHARACTERS[1].name, file: CHARACTERS[1].seedFile },
    { id: "image-input-pose", label: "Pose reference – holding hands", file: poseFile },
  ];
  const nodes = [{
    id: "text-1",
    type: "text",
    position: { x: 0, y: 0 },
    label: "Prompt #1",
    data: {
      mode: "plain",
      text: "Image 1 and image 2 are two different people; image 3 is a pose reference only. " + PROMPT,
    },
  }];
  for (const [index, input] of inputs.entries()) {
    nodes.push({
      id: input.id,
      type: "imageInput",
      position: { x: 0, y: 360 + index * 400 },
      label: input.label,
      data: { imageUrl: await copyAdvancedImage(projectId, input.file), fileName: path.basename(input.file), imageFit: "fill" },
    });
  }
  nodes.push({
    id: "image-generator-1",
    type: "imageGenerator",
    position: { x: 520, y: 0 },
    label: "Image Generator #1",
    data: { outputs: 1, activeResultIndex: 0 },
  });
  const edges = [
    { id: "e-text-1-image-generator-1", source: "text-1", sourceHandle: "text", target: "image-generator-1", targetHandle: "prompt", dataType: "text" },
    ...inputs.map((input) => ({
      id: `e-${input.id}-image-generator-1`,
      source: input.id,
      sourceHandle: "image",
      target: "image-generator-1",
      targetHandle: "image",
      dataType: "image",
    })),
  ];
  return sanitizeAdvancedDocument({ schemaVersion: ADVANCED_SCHEMA_VERSION, template: "image", viewport: null, nodes, edges });
}

async function seedExampleProjects() {
  const done = await pool.query("SELECT 1 FROM settings WHERE key = $1", [SEEDED_KEY]);
  if (done.rowCount) return false;

  const pose = (await pool.query(
    "SELECT id, file_path FROM pose_references WHERE source_url = $1 AND file_path IS NOT NULL",
    [POSE_SOURCE_URL]
  )).rows[0];
  if (!pose) return false;
  const poseImage = { id: pose.id, imageUrl: storage.publicUrl(pose.file_path) };

  const characters = [];
  for (const character of CHARACTERS) characters.push(await copyCharacterPhoto(character));
  const advancedId = crypto.randomUUID();
  const advanced = await advancedDocument(advancedId, pose.file_path);
  const studio = studioDocument(characters, poseImage);

  await pool.transaction(async (tx) => {
    for (const character of characters) {
      await tx.query("INSERT INTO characters (id, name) VALUES ($1, $2)", [character.id, character.name]);
      await tx.query("INSERT INTO character_photos (id, character_id, file_path) VALUES ($1, $2, $3)", [character.photoId, character.id, character.filePath]);
    }
    await tx.query(
      "INSERT INTO studio_projects (name, schema_version, document, workspace) VALUES ($1, $2, $3::jsonb, 'studio')",
      ["Example: two characters, hand in hand", PROJECT_SCHEMA_VERSION, JSON.stringify(studio)]
    );
    await tx.query(
      "INSERT INTO studio_projects (id, name, schema_version, document, workspace, template) VALUES ($1, $2, $3, $4::jsonb, 'advanced', 'image')",
      [advancedId, "Example: two characters, hand in hand", ADVANCED_SCHEMA_VERSION, JSON.stringify(advanced)]
    );
    await tx.query("INSERT INTO settings (key, value) VALUES ($1, 'true')", [SEEDED_KEY]);
  });
  return true;
}

module.exports = { seedExampleProjects, SEEDED_KEY, POSE_SOURCE_URL };

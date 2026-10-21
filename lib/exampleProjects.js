/**
 * First-run example projects.
 *
 * A fresh clone has no characters and no projects, so both studios open onto
 * nothing to learn from. On first start this seeds a few worked examples into
 * each studio, built from images that ship with the repo: the characters and
 * poses are saved to the library and wired into the project, and the finished
 * result sits in the result node, so a new user sees a complete run.
 *
 * Every example has its own settings flag, so it seeds once and deleting it
 * stays deleted, while examples added in a later release still seed. Photos are
 * copied rather than referenced: deleting a character or pose removes its
 * file, which must never be a committed seed.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { pool } = require("../db/pool");
const storage = require("./storage");
const logger = require("./logger");
const { PROJECT_SCHEMA_VERSION, sanitizeStudioDocument } = require("./studioProject");
const { ADVANCED_SCHEMA_VERSION, sanitizeAdvancedDocument } = require("./advancedStudioProject");

const DEMO_ROOT = path.join(__dirname, "..", "web", "public", "demo");
const demoFile = (relative) => path.join(DEMO_ROOT, relative);
const demoUrl = (relative) => `/demo/${relative}`;
const seedFile = (relative) => storage.absolutePath(`pose-library/seed/${relative}`);

const HAND_HOLD_POSE_URL = "https://images.unsplash.com/photo-1576299657860-bd5eb28ceca7?auto=format&fit=crop&w=700&h=875&q=82";

/**
 * `characters[].file` and `poses[].file` are source images. A pose with
 * `libraryUrl` already exists in the library (matched by its source URL)
 * instead of being added. `result` is a finished image (path under web/public/demo)
 * shown in the project.
 * The first pose is the one the guided Studio wires in; Advanced Studio gets a
 * generator per pose.
 */
const EXAMPLES = [
  {
    flag: "example_projects_seeded", // the original example predates per-example flags
    name: "Example: two characters, hand in hand",
    prompt:
      "Both people stand side by side, facing the camera and holding hands, exactly as in the pose reference. " +
      "Keep each person's own face, hair, skin tone and clothing. Use the pose reference for posture and framing only.",
    characters: [
      { name: "Example – Zara", file: seedFile("female-athletic-stance.png") },
      { name: "Example – Leo", file: seedFile("male-editorial-lean.png") },
    ],
    poses: [{ title: "Holding hands", libraryUrl: HAND_HOLD_POSE_URL, file: seedFile("couple-hand-hold.png") }],
  },
  {
    flag: "example_project:nri-family",
    name: "Example: family, walking pose",
    prompt:
      "Image 1 is the identity reference for the whole family: keep every person's face, hair, skin tone and outfit. " +
      "Image 2 is a pose reference only: copy its walking stance, framing and camera angle, not its people or clothes.",
    characters: [{ name: "Example – Indian family", file: demoFile("nri-family-american-poses/indian-family-identity.png") }],
    poses: [{
      title: "Walking together",
      tags: ["walking", "family", "outdoor"],
      file: demoFile("nri-family-american-poses/american-pose-01-walking.png"),
      result: "nri-family-american-poses/indian-result-01-walking.png",
    }],
  },
  {
    flag: "example_project:indian-model",
    name: "Example: one model, three poses",
    prompt:
      "Image 1 is the identity reference: keep her face, hair, skin tone, blue dress, earrings and shoes. " +
      "The pose image is a pose reference only: copy its posture, framing and camera direction, not its person or clothes.",
    characters: [{ name: "Example – Indian model", file: demoFile("indian-model-american-poses/indian-model-identity.png") }],
    poses: [
      {
        title: "Overhead editorial",
        tags: ["overhead", "editorial", "studio"],
        file: demoFile("indian-model-american-poses/american-pose-01-overhead.png"),
        result: "indian-model-american-poses/indian-result-01-overhead-v2.png",
      },
      {
        title: "Seated editorial",
        tags: ["seated", "editorial", "studio"],
        file: demoFile("indian-model-american-poses/american-pose-02-seated.png"),
        result: "indian-model-american-poses/indian-result-02-seated-v2.png",
      },
      {
        title: "Deep side lunge",
        tags: ["lunge", "athletic", "studio"],
        file: demoFile("indian-model-american-poses/american-pose-03-lunge.png"),
        result: "indian-model-american-poses/indian-result-03-lunge-v2.png",
      },
    ],
  },
];

async function copyInto(sourceFile, relativeTarget) {
  const target = storage.absolutePath(relativeTarget);
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.copyFile(sourceFile, target);
  return storage.publicUrl(relativeTarget);
}

async function copyCharacter(character) {
  const id = crypto.randomUUID();
  const photoId = crypto.randomUUID();
  const filePath = storage.getCharacterPhotoPath(id, photoId, ".png");
  return { ...character, id, photoId, filePath, imageUrl: await copyInto(character.file, filePath) };
}

/** Resolves a pose to a library row. A pose already in the library is reused;
 * otherwise its image is copied in and a row is inserted by `insertPose`. */
async function resolvePose(pose) {
  if (pose.libraryUrl) {
    const row = (await pool.query(
      "SELECT id, file_path FROM pose_references WHERE source_url = $1 AND file_path IS NOT NULL",
      [pose.libraryUrl]
    )).rows[0];
    if (!row) return null;
    return { ...pose, id: row.id, imageUrl: storage.publicUrl(row.file_path), existing: true };
  }
  const id = crypto.randomUUID();
  const filePath = storage.getPoseLibraryPath(id);
  return { ...pose, id, filePath, imageUrl: await copyInto(pose.file, filePath) };
}

/** Records the example's finished run as a real generation, so its result node
 * is an ordinary `result-<id>` node (not a one-off) and the run shows in
 * History. Every file is a copy, like a real run's, so deleting the history
 * item cannot remove a shipped demo image. */
async function copyGeneration(example, characters, pose) {
  const id = crypto.randomUUID();
  const outputPath = storage.getGenerationOutputPath(id);
  const posePath = storage.getGenerationPosePath(id, ".png");
  const imageUrl = await copyInto(demoFile(pose.result), outputPath);
  await copyInto(pose.file, posePath);
  const characterPaths = [];
  for (const [index, character] of characters.entries()) {
    const relative = storage.getGenerationCharacterPath(id, index + 1, ".png");
    await copyInto(storage.absolutePath(character.filePath), relative);
    characterPaths.push(relative);
  }
  return { id, imageUrl, outputPath, posePath, characterPaths, prompt: example.prompt };
}

function studioDocument(example, characters, poses, generation) {
  const pose = poses[0];
  const inputs = characters.length + 1;
  const span = inputs * 380 - 50;
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
      label: pose.title,
      assetType: "pose",
      assetId: pose.id,
      imageUrl: pose.imageUrl,
    },
    { id: "generate", kind: "generate", position: { x: (span - 330) / 2, y: 450 }, prompt: example.prompt },
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
  if (generation) {
    nodes.push({
      id: `result-${generation.id}`,
      kind: "result",
      position: { x: Math.max(0, (span - 300) / 2), y: 670 },
      generationId: generation.id,
      imageUrl: generation.imageUrl,
      status: "done",
    });
    edges.push({ id: `generate-result-${generation.id}`, source: "generate", target: `result-${generation.id}` });
  }
  return sanitizeStudioDocument({ schemaVersion: PROJECT_SCHEMA_VERSION, viewport: null, nodes, edges, edgeState: "explicit" });
}

/** Image Inputs live under the project's own asset directory, so deleting the
 * example reclaims them like any other Advanced Studio upload. */
async function advancedDocument(example, projectId) {
  const ROW = 660;
  const imageInput = async (id, label, x, y, file) => ({
    id,
    type: "imageInput",
    position: { x, y },
    label,
    data: {
      imageUrl: await copyInto(file, storage.getAdvancedAssetPath(projectId, crypto.randomUUID(), ".png")),
      fileName: path.basename(file),
      imageFit: "fill",
    },
  });
  const nodes = [{
    id: "text-1",
    type: "text",
    position: { x: 0, y: 0 },
    label: "Prompt #1",
    data: { mode: "plain", text: example.prompt },
  }];
  const edges = [];
  const link = (source, sourceHandle, target, targetHandle, dataType) =>
    edges.push({ id: `e-${source}-${target}`, source, sourceHandle, target, targetHandle, dataType });

  for (const [index, character] of example.characters.entries()) {
    nodes.push(await imageInput(`image-input-character-${index + 1}`, character.name, 0, 360 + index * 400, character.file));
  }
  for (const [index, pose] of example.poses.entries()) {
    const generatorId = `image-generator-${index + 1}`;
    const poseId = `image-input-pose-${index + 1}`;
    const y = index * ROW;
    nodes.push(await imageInput(poseId, `Pose reference – ${pose.title}`, 560, y, pose.file));
    nodes.push({
      id: generatorId,
      type: "imageGenerator",
      position: { x: 1120, y },
      label: `Image Generator #${index + 1}`,
      data: pose.result
        ? { outputs: 1, status: "done", results: [{ imageUrl: demoUrl(pose.result) }], activeResultIndex: 0 }
        : { outputs: 1, activeResultIndex: 0 },
    });
    link("text-1", "text", generatorId, "prompt", "text");
    // Characters first, then the pose: the generator reads its images in edge order.
    for (const [characterIndex] of example.characters.entries()) {
      link(`image-input-character-${characterIndex + 1}`, "image", generatorId, "image", "image");
    }
    link(poseId, "image", generatorId, "image", "image");
  }
  return sanitizeAdvancedDocument({ schemaVersion: ADVANCED_SCHEMA_VERSION, template: "image", viewport: null, nodes, edges });
}

async function seedExample(example) {
  const done = await pool.query("SELECT 1 FROM settings WHERE key = $1", [example.flag]);
  if (done.rowCount) return false;

  const poses = [];
  for (const pose of example.poses) {
    const resolved = await resolvePose(pose);
    if (!resolved) return false;
    poses.push(resolved);
  }
  const characters = [];
  for (const character of example.characters) characters.push(await copyCharacter(character));
  const advancedId = crypto.randomUUID();
  const advanced = await advancedDocument(example, advancedId);
  const generation = poses[0].result ? await copyGeneration(example, characters, poses[0]) : null;
  const studio = studioDocument(example, characters, poses, generation);

  await pool.transaction(async (tx) => {
    for (const character of characters) {
      await tx.query("INSERT INTO characters (id, name) VALUES ($1, $2)", [character.id, character.name]);
      await tx.query("INSERT INTO character_photos (id, character_id, file_path) VALUES ($1, $2, $3)", [character.photoId, character.id, character.filePath]);
    }
    for (const pose of poses.filter((item) => !item.existing)) {
      await tx.query(
        "INSERT INTO pose_references (id, title, category, tags, tag_status, file_path, is_custom) VALUES ($1, $2, 'Example', $3, 'tagged', $4, true)",
        [pose.id, pose.title, pose.tags || [], pose.filePath]
      );
    }
    if (generation) {
      await tx.query(
        "INSERT INTO generations (id, pose_photo_path, engine, prompt, status, output_path, started_at, completed_at) " +
        "VALUES ($1, $2, 'codex', $3, 'completed', $4, now(), now())",
        [generation.id, generation.posePath, generation.prompt, generation.outputPath]
      );
      for (const [index, character] of characters.entries()) {
        await tx.query(
          "INSERT INTO generation_characters (generation_id, position, character_id, file_path) VALUES ($1, $2, $3, $4)",
          [generation.id, index + 1, character.id, generation.characterPaths[index]]
        );
      }
    }
    await tx.query(
      "INSERT INTO studio_projects (name, schema_version, document, workspace) VALUES ($1, $2, $3::jsonb, 'studio')",
      [example.name, PROJECT_SCHEMA_VERSION, JSON.stringify(studio)]
    );
    await tx.query(
      "INSERT INTO studio_projects (id, name, schema_version, document, workspace, template) VALUES ($1, $2, $3, $4::jsonb, 'advanced', 'image')",
      [advancedId, example.name, ADVANCED_SCHEMA_VERSION, JSON.stringify(advanced)]
    );
    await tx.query("INSERT INTO settings (key, value) VALUES ($1, 'true')", [example.flag]);
  });
  return true;
}

/** Seeds every example not yet seeded. One failing example (say, a character
 * name the user already has) is logged and skipped, not fatal to the rest. */
async function seedExampleProjects() {
  let seeded = 0;
  for (const example of EXAMPLES) {
    try {
      if (await seedExample(example)) seeded += 1;
    } catch (error) {
      logger.error("example project seeding failed", { example: example.name, error: error.message });
    }
  }
  return seeded;
}

module.exports = { seedExampleProjects, EXAMPLES };

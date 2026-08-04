const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { pool } = require("../db/pool");
const storage = require("./storage");
const { normalizeToPng } = require("./imageNormalizer");
const { tagPoseReferenceInBackground } = require("./poseTagger");
const logger = require("./logger");

function shape(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    tags: row.tags || [],
    tagStatus: row.tag_status,
    imageUrl: row.file_path ? storage.publicUrl(row.file_path) : row.source_url,
    sourceProvider: row.source_provider || (row.source_url?.includes("pexels.com") ? "Pexels" : null),
    sourcePageUrl: row.source_page_url || null,
    isCustom: row.is_custom,
    createdAt: row.created_at,
  };
}

/**
 * Registers a locally-available image file as a reusable pose reference:
 * persists a normalized copy under storage/pose-library/, inserts the
 * pose_references row, and kicks off best-effort AI tagging in the
 * background (never blocks the caller). Used both by the explicit
 * "+ Add pose" flow and, transparently, by every pose photo a user
 * uploads in Studio — there is no way to use a pose without it also
 * landing in the library.
 */
async function addPoseReference(sourceFilePath, { title, category, isCustom = true, originalName, mimeType } = {}) {
  const id = crypto.randomUUID();
  const relativePath = storage.getPoseLibraryPath(id);
  await normalizeToPng(sourceFilePath, storage.absolutePath(relativePath), { originalName, mimeType });
  const result = await pool.query(
    `INSERT INTO pose_references (id, title, category, file_path, is_custom, tag_status)
     VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
    [id, title || "New pose", category || null, relativePath, isCustom]
  );
  const row = result.rows[0];
  tagPoseReferenceInBackground(id, storage.absolutePath(relativePath));
  logger.info("pose reference added", { poseReferenceId: id, isCustom });
  return row;
}

/**
 * Resolves a pose_reference to a local file path, lazily downloading and
 * caching seeded/external images (hotlinked via source_url) the first
 * time they're actually used in a generation. Browsing the library never
 * triggers a download — only using a pose does.
 */
async function resolvePoseReferenceFile(id) {
  const result = await pool.query("SELECT * FROM pose_references WHERE id = $1", [id]);
  const row = result.rows[0];
  if (!row) return null;
  if (row.file_path) return { row, absolutePath: storage.absolutePath(row.file_path) };
  if (!row.source_url) return null;
  const relativePath = storage.getPoseLibraryPath(row.id);
  const target = storage.absolutePath(relativePath);
  const response = await fetch(row.source_url);
  if (!response.ok) throw new Error(`Failed to fetch pose reference image (${response.status}).`);
  const buffer = Buffer.from(await response.arrayBuffer());
  // Sharp refuses to use the same path for input and output, so the raw
  // fetched bytes land in a temp file first and get normalized into the
  // real target from there.
  const tempPath = path.join(os.tmpdir(), `poseforge-pose-fetch-${crypto.randomUUID()}`);
  await fs.promises.writeFile(tempPath, buffer);
  try {
    await normalizeToPng(tempPath, target);
  } finally {
    await fs.promises.rm(tempPath, { force: true }).catch(() => {});
  }
  await pool.query("UPDATE pose_references SET file_path = $2 WHERE id = $1", [row.id, relativePath]);
  row.file_path = relativePath;
  logger.info("pose reference cached from source_url", { poseReferenceId: row.id });
  return { row, absolutePath: target };
}

module.exports = { shape, addPoseReference, resolvePoseReferenceFile };

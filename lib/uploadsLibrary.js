/**
 * Persistent library of every photo a user has uploaded (character or pose),
 * so the UI can offer a "previously uploaded" picker instead of forcing a
 * re-upload every time. Backed by `data/uploads.json` (via JsonStore) plus
 * permanent copies under `library/uploads/<type>/`.
 *
 * Entries are deduped per-type by sha256 content hash: re-uploading the same
 * file just bumps `lastUsedAt` on the existing entry instead of creating a
 * duplicate library file.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { JsonStore } = require("./jsonStore");

const ROOT = path.join(__dirname, "..");
const LIBRARY_DIR = path.join(ROOT, "library", "uploads");
const DATA_FILE = path.join(ROOT, "data", "uploads.json");

const TYPES = ["character", "pose"];

const store = new JsonStore(DATA_FILE, []);

function typeDir(type) {
  return path.join(LIBRARY_DIR, type);
}

function ensureDirs() {
  for (const type of TYPES) {
    fs.mkdirSync(typeDir(type), { recursive: true });
  }
}

async function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

/**
 * Archive an uploaded file into the permanent library. Never throws — on
 * any failure it logs and returns null, so callers can fall back to using
 * the original (ephemeral) upload path and generation isn't blocked by a
 * library/archival problem.
 *
 * @param {object} opts
 * @param {string} opts.tempFilePath - path to the just-uploaded file (e.g. multer's tmp path)
 * @param {"character"|"pose"} opts.type
 * @param {string} [opts.originalName]
 * @returns {Promise<{id:string,type:string,url:string,absPath:string,originalName:string}|null>}
 */
async function archiveUpload({ tempFilePath, type, originalName }) {
  if (!TYPES.includes(type)) {
    console.error(`[uploadsLibrary] invalid type "${type}"`);
    return null;
  }
  try {
    const hash = await hashFile(tempFilePath);
    const now = new Date().toISOString();

    let result = null;
    await store.update((entries) => {
      const existing = entries.find((e) => e.type === type && e.hash === hash);
      if (existing) {
        existing.lastUsedAt = now;
        result = existing;
        return entries;
      }

      const id = crypto.randomUUID();
      const ext = path.extname(originalName || tempFilePath) || ".png";
      const filename = `${id}${ext}`;
      const destPath = path.join(typeDir(type), filename);
      fs.copyFileSync(tempFilePath, destPath);

      const entry = {
        id,
        type,
        url: `/library/uploads/${type}/${filename}`,
        originalName: originalName || filename,
        hash,
        uploadedAt: now,
        lastUsedAt: now,
      };
      result = entry;
      return [entry, ...entries];
    });

    return { ...result, absPath: path.join(LIBRARY_DIR, result.type, path.basename(result.url)) };
  } catch (err) {
    console.error("[uploadsLibrary] archiveUpload failed:", err.message);
    return null;
  }
}

/**
 * @param {"character"|"pose"} type
 * @param {number} [limit]
 */
async function listUploads(type, limit = 60) {
  const entries = await store.read();
  return entries
    .filter((e) => e.type === type)
    .sort((a, b) => new Date(b.lastUsedAt) - new Date(a.lastUsedAt))
    .slice(0, limit);
}

/** @param {string} id */
async function getUploadById(id) {
  const entries = await store.read();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return null;
  const absPath = path.join(LIBRARY_DIR, entry.type, path.basename(entry.url));
  if (!fs.existsSync(absPath)) return null;
  return { ...entry, absPath };
}

/** Bump lastUsedAt without changing content, e.g. when a library entry is reused. */
async function touchUpload(id) {
  await store.update((entries) => {
    const entry = entries.find((e) => e.id === id);
    if (entry) entry.lastUsedAt = new Date().toISOString();
    return entries;
  });
}

module.exports = {
  LIBRARY_DIR,
  ensureDirs,
  archiveUpload,
  listUploads,
  getUploadById,
  touchUpload,
};

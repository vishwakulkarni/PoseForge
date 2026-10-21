/**
 * Smart-cropped thumbnails for the project galleries.
 *
 * A CSS crop can only guess where the subject is, so portraits lose their
 * heads. sharp's `attention` strategy crops around the most visually
 * prominent region instead, which keeps faces in frame at a fixed card size.
 * Results are cached on disk, keyed by the source file's identity and size, so
 * each image is processed once.
 */
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const storage = require("../lib/storage");
const { asyncHandler } = require("./helpers");

const router = express.Router();
const CACHE_DIR = path.join(storage.STORAGE_ROOT, "cache", "thumbnails");
const MIN_SIZE = 16;
const MAX_SIZE = 1200;

function size(value) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(Math.max(number, MIN_SIZE), MAX_SIZE) : null;
}

router.get("/", asyncHandler(async (req, res) => {
  const width = size(req.query.w);
  const height = size(req.query.h);
  if (!width || !height) return res.status(400).json({ error: "Give a width and height." });

  let source;
  try {
    source = storage.absolutePathFromPublicUrl(req.query.url);
  } catch (_) {
    source = null;
  }
  if (!source) return res.status(400).json({ error: "Only stored images can be thumbnailed." });

  const stat = await fs.promises.stat(source).catch(() => null);
  if (!stat?.isFile()) return res.status(404).json({ error: "Image not found." });

  const key = crypto.createHash("sha1").update(`${source}:${stat.mtimeMs}:${stat.size}:${width}x${height}`).digest("hex");
  const cached = path.join(CACHE_DIR, `${key}.jpg`);
  if (!fs.existsSync(cached)) {
    await fs.promises.mkdir(CACHE_DIR, { recursive: true });
    // Write beside the final name and rename, so a concurrent request never
    // reads a half-written file.
    const partial = `${cached}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await sharp(source)
        .rotate()
        .resize(width, height, { fit: "cover", position: sharp.strategy.attention })
        .jpeg({ quality: 80 })
        .toFile(partial);
      await fs.promises.rename(partial, cached);
    } catch (error) {
      await fs.promises.rm(partial, { force: true });
      return res.status(415).json({ error: "That file cannot be thumbnailed." });
    }
  }

  // /api responses default to no-store; a thumbnail is immutable per source
  // version, so let the browser reuse it between gallery visits.
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.type("image/jpeg");
  fs.createReadStream(cached).pipe(res);
}));

module.exports = router;

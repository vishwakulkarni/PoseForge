const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { asyncHandler, cleanup } = require("./helpers");
const { createPreviewPng } = require("../lib/imageNormalizer");

const router = express.Router();
const tempDir = path.join(__dirname, "..", "tmp", "media-preview");
fs.mkdirSync(tempDir, { recursive: true });
const upload = multer({ dest: tempDir, limits: { fileSize: 25 * 1024 * 1024 } });

router.post("/preview", upload.single("image"), asyncHandler(async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "An image is required." });
    const preview = await createPreviewPng(req.file.path, { originalName: req.file.originalname, mimeType: req.file.mimetype });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.send(preview);
  } finally {
    await cleanup(req.file);
  }
}));

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "That file is too large (25MB max)." : err.message });
  if (/heic|heif|unsupported image format/i.test(err.message || "")) return res.status(415).json({ error: "This HEIC image could not be decoded. Try exporting it again from Photos." });
  next(err);
});

module.exports = router;

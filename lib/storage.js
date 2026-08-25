const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const STORAGE_ROOT = path.join(ROOT, "storage");
function ensureStorage() {
  fs.mkdirSync(path.join(STORAGE_ROOT, "characters"), { recursive: true });
  fs.mkdirSync(path.join(STORAGE_ROOT, "generations"), { recursive: true });
  fs.mkdirSync(path.join(STORAGE_ROOT, "upload-v2"), { recursive: true });
  fs.mkdirSync(path.join(STORAGE_ROOT, "pose-library"), { recursive: true });
}
function ext(value, fallback = ".png") {
  const candidate = path.extname(String(value || "")).toLowerCase();
  return /^[.][a-z0-9]{1,8}$/.test(candidate) ? candidate : fallback;
}
function getCharacterPhotoPath(characterId, photoId, extension) { return `characters/${characterId}/${photoId}${ext(extension)}`; }
function getCharacterProfileViewPath(characterId, profileSetId, angle) { return `characters/${characterId}/profiles/${profileSetId}/angle-${angle}.png`; }
function getCharacterProfileSheetPath(characterId, profileSetId) { return `characters/${characterId}/profiles/${profileSetId}/sheet.png`; }
function getGenerationPosePath(generationId, extension) { return `generations/${generationId}/pose${ext(extension)}`; }
function getGenerationOutputPath(generationId) { return `generations/${generationId}/output.png`; }
function getGenerationCharacterPath(generationId, position, extension) { return `generations/${generationId}/character-${position}${ext(extension)}`; }
function getGenerationCharacterReferencePath(generationId, position, extension) { return `generations/${generationId}/character-${position}-identity-reference${ext(extension)}`; }
function getPassportRawPath(generationId) { return `generations/${generationId}/passport-raw.png`; }
function getPassportSheetPath(generationId) { return `generations/${generationId}/passport-sheet-4x6.png`; }
function getDocumentRawPath(generationId) { return `generations/${generationId}/document-photo-raw.png`; }
function getDocumentOutputPath(generationId, format = "jpeg") { return `generations/${generationId}/document-photo.${format === "png" ? "png" : "jpg"}`; }
function getDocumentSheetPath(generationId) { return `generations/${generationId}/document-photo-sheet-4x6.png`; }
function getUploadStagingPath(uploadId, role, originalName) { return `upload-v2/${uploadId}/${role}-original${ext(originalName)}`; }
function getPoseLibraryPath(poseReferenceId) { return `pose-library/${poseReferenceId}.png`; }
function absolutePath(relativePath) {
  const resolved = path.resolve(STORAGE_ROOT, relativePath);
  if (resolved !== STORAGE_ROOT && !resolved.startsWith(`${STORAGE_ROOT}${path.sep}`)) throw new Error("Invalid storage path.");
  return resolved;
}
function publicUrl(relativePath) { return `/storage/${String(relativePath).split(path.sep).join("/")}`; }
function removeRelative(relativePath) { return relativePath ? fs.promises.rm(absolutePath(relativePath), { force: true }) : Promise.resolve(); }
async function persistUpload(file, uploadId, role) {
  const relativePath = getUploadStagingPath(uploadId, role, file.originalname);
  const targetPath = absolutePath(relativePath);
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.promises.copyFile(file.path, targetPath);
  return { relativePath, absolutePath: targetPath };
}
module.exports = { STORAGE_ROOT, ensureStorage, getCharacterPhotoPath, getCharacterProfileViewPath, getCharacterProfileSheetPath, getGenerationPosePath, getGenerationOutputPath, getGenerationCharacterPath, getGenerationCharacterReferencePath, getPassportRawPath, getPassportSheetPath, getDocumentRawPath, getDocumentOutputPath, getDocumentSheetPath, getUploadStagingPath, getPoseLibraryPath, persistUpload, absolutePath, publicUrl, removeRelative };

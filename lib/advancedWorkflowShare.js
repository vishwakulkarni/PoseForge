/**
 * Sharing an Advanced Studio workflow as one JSON file.
 *
 * A share file holds what someone needs to rebuild the canvas elsewhere: the
 * nodes and their wiring, prompts, the engine and model each generator uses,
 * and the input images and clips embedded as base64. It never holds outputs
 * (the importer generates their own), settings, keys or history.
 *
 * Import treats the file as untrusted. Node data goes through the document
 * sanitizer like any client write, local file locations are dropped (a file
 * may only use its own embedded assets or web URLs, so it cannot point a run
 * at the importer's photos), and every embedded asset is decoded and checked
 * before anything is stored. Engines the importer has not set up are kept as
 * the author chose them; `compatibilityReport` says which need setup and
 * which configured models could stand in.
 */
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");
const storage = require("./storage");
const { normalizeToPng } = require("./imageNormalizer");
const { ADVANCED_SCHEMA_VERSION, diagnoseAdvancedDocument, sanitizeAdvancedDocument } = require("./advancedStudioProject");
const { coerceGeneratorSettings, diagnoseGeneratorSettings } = require("./advancedCapabilities");
const { MEDIA_TYPES, characterPhotoUrl, declaredInputs, poseImageUrl } = require("./advancedRunInputs");
const engines = require("../engines");
const { definition, isExecutable } = require("./advancedNodes");
const { version: APP_VERSION } = require("../package.json");

const registry = engines.advancedRegistry || engines.registry;

const SHARE_FORMAT = "poseforge.workflow";
const SHARE_FORMAT_VERSION = 1;
/** Raw bytes of embedded media; base64 makes the file about a third larger. */
const MAX_EMBEDDED_BYTES = 50 * 1024 * 1024;
const MAX_SHARE_FILE_BYTES = 75 * 1024 * 1024;
const MAX_ASSETS = 200;
const ASSET_REF = /^[A-Za-z0-9_-]{1,64}$/;
const OUTPUT_FIELDS = ["results", "status", "error", "activeResultIndex"];
const IMAGE_FORMATS = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };
/** Extensions accepted for Video and Audio Input clips, by kind. */
const MEDIA_EXTENSIONS = Object.fromEntries(Object.entries(MEDIA_TYPES).map(([kind, types]) => [kind, new Set(Object.keys(types))]));
const INPUT_KINDS = { imageInput: "image", videoInput: "video", audioInput: "audio" };

function shareError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isWebUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function nodeName(node) {
  return node.label || node.id;
}

/** Display labels for an engine and model, from the registry (no readiness
 * probe, so exporting never waits on a provider). */
function selectionLabels(engineKey, modelId) {
  const engine = registry[engineKey];
  if (!engine) return { engineLabel: engineKey, modelLabel: modelId || null };
  const models = [...(engine.models || []), ...(engine.videoModels || [])];
  const model = models.find((entry) => entry.id === modelId);
  return { engineLabel: engine.label, modelLabel: model?.label || modelId || null };
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Builds the share file for a stored project. Character and pose inputs are
 * resolved to the photo they show today and embedded, so the file works on a
 * machine that has neither record; web URLs stay URLs, since runs download
 * them anyway. Media past the size budget is left out with a warning rather
 * than failing the export.
 */
async function exportWorkflow(row) {
  const document = structuredClone(sanitizeAdvancedDocument(row.document));
  const assets = {};
  const refsByHash = new Map();
  const warnings = [];
  let embeddedBytes = 0;

  const embed = async (node, kind, url) => {
    let filePath;
    try {
      filePath = storage.absolutePathFromPublicUrl(url);
    } catch {
      filePath = null;
    }
    const bytes = filePath ? await fs.promises.readFile(filePath).catch(() => null) : null;
    if (!bytes) {
      warnings.push(`${nodeName(node)}: its ${kind} file is missing from storage, so the input is empty in the shared file.`);
      return null;
    }
    const hash = sha256(bytes);
    if (refsByHash.has(hash)) return refsByHash.get(hash);
    if (embeddedBytes + bytes.length > MAX_EMBEDDED_BYTES) {
      warnings.push(`${nodeName(node)}: its ${kind} was left out because the file would exceed ${MAX_EMBEDDED_BYTES / 1024 / 1024} MB. Add it again after importing.`);
      return null;
    }
    const asset = { kind, fileName: node.data.fileName || path.basename(filePath), bytes: bytes.length, sha256: hash };
    if (kind === "image") {
      const metadata = await sharp(bytes).metadata().catch(() => ({}));
      asset.mimeType = IMAGE_FORMATS[metadata.format] || "image/png";
      if (metadata.width) asset.width = metadata.width;
      if (metadata.height) asset.height = metadata.height;
    } else {
      asset.mimeType = MEDIA_TYPES[kind][path.extname(filePath).toLowerCase()] || `${kind}/octet-stream`;
    }
    asset.data = bytes.toString("base64");
    const ref = `a${Object.keys(assets).length + 1}`;
    assets[ref] = asset;
    refsByHash.set(hash, ref);
    embeddedBytes += bytes.length;
    return ref;
  };

  for (const node of document.nodes) {
    const data = node.data;
    if (isExecutable(node)) {
      for (const field of OUTPUT_FIELDS) delete data[field];
      continue;
    }
    const kind = INPUT_KINDS[node.type];
    if (!kind) continue;
    if (kind === "image") {
      let url = data.imageUrl || null;
      if (data.characterId) url = (await characterPhotoUrl(data.characterId)) || url;
      else if (data.poseId) url = (await poseImageUrl(data.poseId)) || url;
      delete data.characterId;
      delete data.poseId;
      delete data.imageUrl;
      if (!url) continue;
      if (isWebUrl(url)) {
        data.imageUrl = url;
        continue;
      }
      const ref = await embed(node, "image", url);
      if (ref) data.assetRef = ref;
    } else if (data.mediaUrl) {
      const url = data.mediaUrl;
      delete data.mediaUrl;
      const ref = await embed(node, kind, url);
      if (ref) data.assetRef = ref;
    }
  }

  const requirements = document.nodes
    .filter((node) => definition(node.type)?.engineKind && node.data.engine)
    .map((node) => ({
      nodeId: node.id,
      kind: definition(node.type).engineKind,
      engine: node.data.engine,
      model: node.data.model || null,
      ...selectionLabels(node.data.engine, node.data.model),
    }));

  return {
    format: SHARE_FORMAT,
    formatVersion: SHARE_FORMAT_VERSION,
    app: { name: "PoseForge", version: APP_VERSION },
    exportedAt: new Date().toISOString(),
    name: row.name,
    document,
    assets,
    requirements,
    exportWarnings: warnings,
  };
}

/** Decodes and checks every embedded asset. A bad asset is dropped with a
 * warning (its input imports empty); it never fails the whole import. */
async function decodeAssets(rawAssets, warnings) {
  const assets = new Map();
  if (!rawAssets || typeof rawAssets !== "object" || Array.isArray(rawAssets)) return assets;
  const entries = Object.entries(rawAssets);
  if (entries.length > MAX_ASSETS) warnings.push(`Only the first ${MAX_ASSETS} embedded files were read.`);
  for (const [ref, asset] of entries.slice(0, MAX_ASSETS)) {
    const reject = (reason) => warnings.push(`Embedded file ${JSON.stringify(ref)} was skipped: ${reason}.`);
    if (!ASSET_REF.test(ref) || !asset || typeof asset !== "object") { reject("it is not a valid entry"); continue; }
    const kind = asset.kind;
    if (kind !== "image" && kind !== "video" && kind !== "audio") { reject("its kind must be image, video or audio"); continue; }
    if (typeof asset.data !== "string" || !asset.data) { reject("it has no data"); continue; }
    const bytes = Buffer.from(asset.data, "base64");
    if (!bytes.length) { reject("its data is not base64"); continue; }
    if (asset.sha256 && asset.sha256 !== sha256(bytes)) { reject("its contents do not match its sha256"); continue; }
    const fileName = String(asset.fileName || `${kind}`).slice(0, 200);
    if (kind === "image") {
      const metadata = await sharp(bytes).metadata().catch(() => null);
      if (!metadata || !IMAGE_FORMATS[metadata.format]) { reject("it is not a PNG, JPEG or WebP image"); continue; }
      assets.set(ref, { kind, bytes, fileName, mimeType: IMAGE_FORMATS[metadata.format], width: metadata.width, height: metadata.height });
    } else {
      const extension = path.extname(fileName).toLowerCase();
      const mimeType = String(asset.mimeType || "");
      if (!MEDIA_EXTENSIONS[kind].has(extension) || !mimeType.startsWith(`${kind}/`)) {
        reject(`it is not a supported ${kind} file (${[...MEDIA_EXTENSIONS[kind]].join(", ")})`);
        continue;
      }
      assets.set(ref, { kind, bytes, fileName, mimeType, extension });
    }
  }
  return assets;
}

/**
 * Reads a share file (a Buffer or string of JSON). Throws `statusCode` 400 for
 * anything that is not a PoseForge workflow; otherwise returns the sanitized
 * document, with `assetRef` on inputs whose file is embedded, the decoded
 * assets, and warnings for everything that was dropped or adjusted.
 */
async function parseShareFile(raw) {
  let file;
  try {
    file = JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw));
  } catch {
    throw shareError(400, "This file is not valid JSON, so it is not a PoseForge workflow.");
  }
  if (!file || typeof file !== "object" || file.format !== SHARE_FORMAT) {
    throw shareError(400, `This is not a PoseForge workflow file (expected "format": "${SHARE_FORMAT}").`);
  }

  const warnings = [];
  if (Number(file.formatVersion) > SHARE_FORMAT_VERSION) {
    warnings.push("This file was made with a newer PoseForge. Anything this version does not understand was left out.");
  }
  const rawDocument = file.document && typeof file.document === "object" ? file.document : {};
  if (Number(rawDocument.schemaVersion) > ADVANCED_SCHEMA_VERSION && !warnings.length) {
    warnings.push("This workflow was made with a newer PoseForge. Anything this version does not understand was left out.");
  }

  // `assetRef` belongs to the share file, not the document, so the sanitizer
  // drops it: read it first, keyed the way the sanitizer normalizes ids.
  const refs = new Map();
  for (const node of Array.isArray(rawDocument.nodes) ? rawDocument.nodes : []) {
    const ref = node?.data?.assetRef;
    if (node?.id != null && typeof ref === "string") refs.set(String(node.id).trim().slice(0, 128), ref);
  }

  const document = sanitizeAdvancedDocument(rawDocument);
  warnings.push(...diagnoseAdvancedDocument(rawDocument, document));
  const assets = await decodeAssets(file.assets, warnings);

  for (const node of document.nodes) {
    const data = node.data;
    if (isExecutable(node)) {
      for (const field of OUTPUT_FIELDS) delete data[field];
      continue;
    }
    const kind = INPUT_KINDS[node.type];
    if (!kind) continue;
    if (data.characterId || data.poseId) {
      // Library records are local to the machine that exported the file.
      delete data.characterId;
      delete data.poseId;
      warnings.push(`${nodeName(node)}: its character or pose link was removed; shared files carry the photo itself.`);
    }
    const urlField = kind === "image" ? "imageUrl" : "mediaUrl";
    if (data[urlField] && !isWebUrl(data[urlField])) {
      warnings.push(`${nodeName(node)}: ignored the file location "${String(data[urlField]).slice(0, 80)}". Shared files can only use embedded files or web (http/https) URLs.`);
      delete data[urlField];
    }
    const ref = refs.get(node.id);
    if (ref == null) continue;
    const asset = assets.get(ref);
    if (!asset || asset.kind !== kind) {
      warnings.push(`${nodeName(node)}: its embedded ${kind} is missing from the file, so the input is empty.`);
      continue;
    }
    data.assetRef = ref;
    delete data[urlField];
  }

  const name = String(file.name || "").trim().slice(0, 100) || "Imported workflow";
  return { name, document, assets, warnings, inputs: declaredInputs(document) };
}

/** How many edges arrive at each of a node's input handles. */
function connectedCounts(document, nodeId) {
  const counts = {};
  for (const edge of document.edges || []) {
    if (edge.target !== nodeId || !edge.targetHandle) continue;
    counts[edge.targetHandle] = (counts[edge.targetHandle] || 0) + 1;
  }
  return counts;
}

/** Why an image model cannot take this node's connections, if it cannot. */
function imageFitIssues(capability, counts) {
  const images = counts.image || 0;
  if (images > capability.image.maxImages) return [`${capability.label} accepts at most ${capability.image.maxImages} reference images; ${images} are connected.`];
  if (!images && !capability.image.textToImage) return [`${capability.label} edits images, so it needs a connected image.`];
  return [];
}

/** Same checks as the video node body and the run route. */
function videoFitIssues(model, label, counts) {
  const issues = [];
  for (const handle of Object.keys(counts)) {
    if (handle !== "prompt" && !model.inputs.includes(handle)) issues.push(`${label} does not take ${handle} inputs.`);
  }
  if (model.inputs.includes("startFrame") && !counts.startFrame) issues.push(`${label} needs a connected start frame.`);
  if (model.inputs.includes("referenceVideo")) {
    const visual = (counts.reference || 0) + (counts.referenceVideo || 0);
    if (!visual && !(model.audioOnlyReferences && counts.referenceAudio)) issues.push(`${label} needs a connected reference image or video.`);
  } else if (model.inputs.includes("reference") && !counts.reference) {
    issues.push(`${label} needs a connected reference image.`);
  }
  for (const [handle, limit] of [["reference", model.maxReferences], ["referenceVideo", model.maxReferenceVideos], ["referenceAudio", model.maxReferenceAudios]]) {
    if (limit && (counts[handle] || 0) > limit) issues.push(`${label} accepts at most ${limit} ${handle} inputs.`);
  }
  return issues;
}

function modelLabel(capability, modelId) {
  return capability.models.find((model) => model.id === modelId)?.label || modelId;
}

/** Ready models that can take this node's connections, its own engine first. */
function alternativesFor(node, counts, capabilities) {
  const options = [];
  for (const capability of capabilities) {
    if (!capability.ready) continue;
    if (node.type === "imageGenerator") {
      if (!capability.image?.supported || imageFitIssues(capability, counts).length) continue;
      for (const model of capability.models) options.push({ engine: capability.key, engineLabel: capability.label, model: model.id, label: model.label });
    } else if (capability.video?.supported) {
      for (const model of capability.video.models) {
        const label = modelLabel(capability, model.id);
        if (!videoFitIssues(model, label, counts).length) options.push({ engine: capability.key, engineLabel: capability.label, model: model.id, label });
      }
    }
  }
  const current = (option) => option.engine === node.data.engine && option.model === node.data.model;
  return [
    ...options.filter((option) => option.engine === node.data.engine && !current(option)),
    ...options.filter((option) => option.engine !== node.data.engine),
  ];
}

/**
 * Per generator: whether it can run here as the author set it up, why not,
 * what its connections need, and which configured models could stand in.
 * `capabilities` is `listAdvancedCapabilities()`.
 */
function compatibilityReport(document, capabilities) {
  const generators = [];
  for (const node of document.nodes || []) {
    const kind = definition(node.type)?.engineKind;
    if (!kind) continue;
    const { engine: engineKey, model: modelId } = node.data;
    const counts = connectedCounts(document, node.id);
    const capability = capabilities.find((entry) => entry.key === engineKey);
    const supports = kind === "image" ? capability?.image?.supported : capability?.video?.supported;
    const row = {
      nodeId: node.id,
      label: nodeName(node),
      kind,
      engine: engineKey || null,
      engineLabel: capability?.label || engineKey || null,
      model: modelId || null,
      modelLabel: capability && modelId ? modelLabel(capability, modelId) : modelId || null,
      status: "ready",
      reason: null,
      issues: [],
      alternatives: alternativesFor(node, counts, capabilities),
    };
    if (!engineKey) {
      row.status = "unset";
      row.reason = `Choose ${kind === "video" ? "a video" : "an image"} model for this node.`;
    } else if (!capability || !supports) {
      row.status = "unknown-engine";
      row.reason = `${engineKey} is not available in this version of PoseForge.`;
    } else {
      const videoModel = kind === "video" ? capability.video.models.find((entry) => entry.id === modelId) : null;
      const knownModel = kind === "video" ? Boolean(videoModel) : !modelId || capability.models.some((entry) => entry.id === modelId);
      if (!knownModel) {
        row.status = "unknown-model";
        row.reason = `${capability.label} does not offer ${modelId || "a model for this node"} here.`;
      } else {
        if (!capability.ready) {
          row.status = "needs-setup";
          row.reason = capability.reason || `Set up ${capability.label} in Settings.`;
        }
        row.issues = kind === "video"
          ? videoFitIssues(videoModel, row.modelLabel, counts)
          : imageFitIssues(capability, counts);
      }
    }
    generators.push(row);
  }
  return { generators, warnings: diagnoseGeneratorSettings(document) };
}

/**
 * Switches the generators named in `replacements` (`{ [nodeId]: { engine,
 * model } }`) to another model, keeping each setting the new model supports.
 * Nodes not named keep the author's choice. Throws `statusCode` 422 for a
 * node or model that does not exist.
 */
function applyReplacements(document, replacements, capabilities) {
  if (!replacements || typeof replacements !== "object" || Array.isArray(replacements)) return document;
  const next = structuredClone(document);
  for (const [nodeId, choice] of Object.entries(replacements)) {
    const node = next.nodes.find((entry) => entry.id === nodeId);
    if (!node || !definition(node.type)?.engineKind) throw shareError(422, `Node ${nodeId} is not a generator in this workflow.`);
    const capability = capabilities.find((entry) => entry.key === choice?.engine);
    const known = capability && (node.type === "videoGenerator"
      ? capability.video?.models?.some((entry) => entry.id === choice.model)
      : capability.image?.supported && capability.models.some((entry) => entry.id === choice.model));
    const settings = known ? coerceGeneratorSettings(node.type, node.data, capability, choice.model) : null;
    if (!settings) throw shareError(422, `${choice?.engine ?? "?"} · ${choice?.model ?? "?"} is not a model ${nodeName(node)} can use.`);
    node.data = { ...node.data, ...settings, engine: capability.key, model: choice.model };
  }
  return next;
}

/** Stores each embedded asset under the project and points its input at the
 * stored file. Images are re-encoded through `normalizeToPng`, so only
 * decoded pixels reach storage. Returns the updated document. */
async function materializeAssets(projectId, document, assets) {
  const next = structuredClone(document);
  const stored = new Map();
  for (const node of next.nodes) {
    const ref = node.data?.assetRef;
    if (ref == null) continue;
    delete node.data.assetRef;
    const asset = assets.get(ref);
    if (!asset) continue;
    if (!stored.has(ref)) {
      const assetId = crypto.randomUUID();
      if (asset.kind === "image") {
        const relativePath = storage.getAdvancedAssetPath(projectId, assetId, ".png");
        const temporary = path.join(os.tmpdir(), `poseforge-import-${assetId}`);
        await fs.promises.writeFile(temporary, asset.bytes);
        try {
          await fs.promises.mkdir(path.dirname(storage.absolutePath(relativePath)), { recursive: true });
          await normalizeToPng(temporary, storage.absolutePath(relativePath), { originalName: asset.fileName, mimeType: asset.mimeType });
        } finally {
          await fs.promises.rm(temporary, { force: true });
        }
        stored.set(ref, storage.publicUrl(relativePath));
      } else {
        const relativePath = storage.getAdvancedAssetPath(projectId, assetId, asset.extension);
        await fs.promises.mkdir(path.dirname(storage.absolutePath(relativePath)), { recursive: true });
        await fs.promises.writeFile(storage.absolutePath(relativePath), asset.bytes);
        stored.set(ref, storage.publicUrl(relativePath));
      }
    }
    if (asset.kind === "image") {
      node.data.imageUrl = stored.get(ref);
      if (asset.width && !node.data.naturalWidth) node.data.naturalWidth = asset.width;
      if (asset.height && !node.data.naturalHeight) node.data.naturalHeight = asset.height;
    } else {
      node.data.mediaUrl = stored.get(ref);
    }
    if (!node.data.fileName) node.data.fileName = asset.fileName;
  }
  return next;
}

module.exports = {
  MAX_SHARE_FILE_BYTES,
  MEDIA_EXTENSIONS,
  SHARE_FORMAT,
  SHARE_FORMAT_VERSION,
  applyReplacements,
  compatibilityReport,
  exportWorkflow,
  materializeAssets,
  parseShareFile,
};

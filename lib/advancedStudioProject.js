/**
 * Document model for Advanced Studio projects.
 *
 * Advanced Studio stores its node graph in the same `studio_projects.document`
 * JSONB column as the guided Studio, but the two vocabularies are disjoint, so
 * this module owns its own sanitizer. `lib/studioProject.js` is deliberately
 * left untouched: it strips unknown node kinds, which would silently erase an
 * Advanced Studio graph if the two ever shared a sanitizer.
 *
 * Every persisted document carries `schemaVersion`. `migrateAdvancedDocument`
 * walks the MIGRATIONS ladder so older documents upgrade in place instead of
 * losing fields, and a document written by a *newer* build is sanitized
 * best-effort at the current version rather than rejected.
 */
const ADVANCED_SCHEMA_VERSION = 2;
const MAX_NODES = 400;
const MAX_EDGES = 800;
const MAX_COORDINATE = 1_000_000;
const MAX_PROMPT_LENGTH = 20_000;

const NODE_TYPES = new Set(["text", "imageInput", "imageGenerator", "videoGenerator", "group"]);
const DATA_TYPES = new Set(["text", "image", "video", "audio"]);
const NODE_STATUSES = new Set(["idle", "queued", "running", "done", "error"]);
const TEXT_MODES = new Set(["plain", "structured"]);
const TEMPLATES = new Set(["image", "video", "storyboard", "blank"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_ADVANCED_DOCUMENT = Object.freeze({
  schemaVersion: ADVANCED_SCHEMA_VERSION,
  template: "blank",
  viewport: null,
  nodes: [],
  edges: [],
  locked: false,
});

function finiteNumber(value, fallback, min = -MAX_COORDINATE, max = MAX_COORDINATE) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

function shortText(value, maxLength) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function idList(value, limit) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  for (const candidate of value.slice(0, limit)) {
    const id = shortText(candidate, 128);
    if (id) seen.add(id);
  }
  return [...seen];
}

function sanitizeResults(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((entry) => {
    if (!entry || typeof entry !== "object") return null;
    const result = {};
    const imageUrl = shortText(entry.imageUrl, 2_048);
    if (imageUrl) result.imageUrl = imageUrl;
    const videoUrl = shortText(entry.videoUrl, 2_048);
    if (videoUrl) result.videoUrl = videoUrl;
    const generationId = shortText(entry.generationId, 64);
    if (generationId && UUID_PATTERN.test(generationId)) result.generationId = generationId;
    const width = finiteNumber(entry.width, 0, 0, 16_384);
    const height = finiteNumber(entry.height, 0, 0, 16_384);
    if (width > 0) result.width = width;
    if (height > 0) result.height = height;
    const error = shortText(entry.error, 500);
    if (error) result.error = error;
    return result.imageUrl || result.videoUrl || result.error ? result : null;
  }).filter(Boolean);
}

/** Per-type data sanitizers. Adding a node type means adding one entry here
 * and one entry in the frontend registry — nothing else in the pipeline
 * needs to learn about it. */
const DATA_SANITIZERS = {
  text(value) {
    const data = { text: shortText(value.text, MAX_PROMPT_LENGTH) };
    const mode = shortText(value.mode, 16);
    data.mode = TEXT_MODES.has(mode) ? mode : "plain";
    return data;
  },
  imageInput(value) {
    const data = {};
    const imageUrl = shortText(value.imageUrl, 2_048);
    if (imageUrl) data.imageUrl = imageUrl;
    const fileName = shortText(value.fileName, 200);
    if (fileName) data.fileName = fileName;
    const naturalWidth = finiteNumber(value.naturalWidth, 0, 0, 16_384);
    const naturalHeight = finiteNumber(value.naturalHeight, 0, 0, 16_384);
    if (naturalWidth > 0) data.naturalWidth = naturalWidth;
    if (naturalHeight > 0) data.naturalHeight = naturalHeight;
    const imageFit = shortText(value.imageFit, 8);
    if (imageFit === "fit" || imageFit === "fill") data.imageFit = imageFit;
    return data;
  },
  imageGenerator(value) {
    const data = {};
    const engine = shortText(value.engine, 32);
    if (engine) data.engine = engine;
    const model = shortText(value.model, 128);
    if (model) data.model = model;
    const aspectRatio = shortText(value.aspectRatio, 12);
    if (/^\d{1,2}:\d{1,2}$/.test(aspectRatio)) data.aspectRatio = aspectRatio;
    const resolution = shortText(value.resolution, 12);
    if (resolution) data.resolution = resolution;
    data.outputs = finiteNumber(value.outputs, 1, 1, 4);
    const status = shortText(value.status, 16);
    if (NODE_STATUSES.has(status)) data.status = status;
    const error = shortText(value.error, 500);
    if (error) data.error = error;
    const results = sanitizeResults(value.results);
    if (results.length) data.results = results;
    data.activeResultIndex = finiteNumber(value.activeResultIndex, 0, 0, Math.max(results.length - 1, 0));
    return data;
  },
  videoGenerator(value) {
    // Reserved for the video phase. Sanitized now so a document written by a
    // build that has video nodes round-trips through an older build intact.
    const data = {};
    const engine = shortText(value.engine, 32);
    if (engine) data.engine = engine;
    const model = shortText(value.model, 128);
    if (model) data.model = model;
    const aspectRatio = shortText(value.aspectRatio, 12);
    if (/^\d{1,2}:\d{1,2}$/.test(aspectRatio)) data.aspectRatio = aspectRatio;
    const resolution = shortText(value.resolution, 12);
    if (resolution) data.resolution = resolution;
    data.duration = finiteNumber(value.duration, 5, 1, 60);
    if (value.sound === true) data.sound = true;
    data.outputs = finiteNumber(value.outputs, 1, 1, 4);
    const status = shortText(value.status, 16);
    if (NODE_STATUSES.has(status)) data.status = status;
    const error = shortText(value.error, 500);
    if (error) data.error = error;
    const results = sanitizeResults(value.results);
    if (results.length) data.results = results;
    data.activeResultIndex = finiteNumber(value.activeResultIndex, 0, 0, Math.max(results.length - 1, 0));
    return data;
  },
  group(value) {
    const data = { memberIds: idList(value.memberIds, MAX_NODES) };
    const color = shortText(value.color, 16);
    if (/^[a-z]+$/.test(color)) data.color = color;
    const scene = finiteNumber(value.scene, 0, 0, 999);
    if (scene > 0) data.scene = scene;
    return data;
  },
};

function sanitizeNode(value) {
  if (!value || typeof value !== "object") return null;
  const id = shortText(value.id, 128);
  const type = shortText(value.type, 32);
  if (!id || !NODE_TYPES.has(type)) return null;

  const node = {
    id,
    type,
    position: {
      x: finiteNumber(value.position?.x, 0),
      y: finiteNumber(value.position?.y, 0),
    },
    data: DATA_SANITIZERS[type](value.data && typeof value.data === "object" ? value.data : {}),
  };

  const width = finiteNumber(value.width, 0, 0, 6_000);
  const height = finiteNumber(value.height, 0, 0, 6_000);
  if (width > 0) node.width = width;
  if (height > 0) node.height = height;
  const label = shortText(value.label, 120);
  if (label) node.label = label;
  if (value.collapsed === true) node.collapsed = true;
  return node;
}

function sanitizeEdge(value, nodeIds) {
  if (!value || typeof value !== "object") return null;
  const id = shortText(value.id, 200);
  const source = shortText(value.source, 128);
  const target = shortText(value.target, 128);
  if (!id || !nodeIds.has(source) || !nodeIds.has(target) || source === target) return null;

  const edge = { id, source, target };
  const sourceHandle = shortText(value.sourceHandle, 64);
  const targetHandle = shortText(value.targetHandle, 64);
  if (sourceHandle) edge.sourceHandle = sourceHandle;
  if (targetHandle) edge.targetHandle = targetHandle;
  const dataType = shortText(value.dataType, 16);
  if (DATA_TYPES.has(dataType)) edge.dataType = dataType;
  return edge;
}

/** Schema ladder. Each entry upgrades a document *from* that version to the
 * next one. Version 1 is the guided Studio's shape, which has no Advanced
 * Studio equivalent, so it upgrades to an empty v2 graph rather than
 * mistranslating `kind` nodes into `type` nodes. */
const MIGRATIONS = {
  1(document) {
    return {
      ...DEFAULT_ADVANCED_DOCUMENT,
      viewport: document.viewport ?? null,
      locked: document.locked === true,
      schemaVersion: 2,
    };
  },
};

function migrateAdvancedDocument(input) {
  let document = input && typeof input === "object" ? { ...input } : { ...DEFAULT_ADVANCED_DOCUMENT };
  let version = Number(document.schemaVersion);
  if (!Number.isInteger(version) || version < 1) version = ADVANCED_SCHEMA_VERSION;

  // Walk forward one version at a time. A document from a newer build falls
  // through untouched and is then sanitized at the current version, which
  // drops fields this build does not understand but keeps the project usable.
  while (version < ADVANCED_SCHEMA_VERSION && MIGRATIONS[version]) {
    document = MIGRATIONS[version](document);
    version = Number(document.schemaVersion) || version + 1;
  }
  return document;
}

function sanitizeAdvancedDocument(input) {
  const source = migrateAdvancedDocument(input);
  const seenNodeIds = new Set();
  const nodes = [];

  for (const candidate of Array.isArray(source.nodes) ? source.nodes.slice(0, MAX_NODES) : []) {
    const node = sanitizeNode(candidate);
    if (!node || seenNodeIds.has(node.id)) continue;
    seenNodeIds.add(node.id);
    nodes.push(node);
  }

  // Group membership can only reference nodes that survived sanitization.
  for (const node of nodes) {
    if (node.type !== "group") continue;
    node.data.memberIds = node.data.memberIds.filter((memberId) => seenNodeIds.has(memberId) && memberId !== node.id);
  }

  const seenEdgeIds = new Set();
  const edges = [];
  for (const candidate of Array.isArray(source.edges) ? source.edges.slice(0, MAX_EDGES) : []) {
    const edge = sanitizeEdge(candidate, seenNodeIds);
    if (!edge || seenEdgeIds.has(edge.id)) continue;
    seenEdgeIds.add(edge.id);
    edges.push(edge);
  }

  let viewport = null;
  if (source.viewport && typeof source.viewport === "object") {
    viewport = {
      x: finiteNumber(source.viewport.x, 0),
      y: finiteNumber(source.viewport.y, 0),
      zoom: finiteNumber(source.viewport.zoom, 1, 0.05, 4),
    };
  }

  const template = shortText(source.template, 24);
  return {
    schemaVersion: ADVANCED_SCHEMA_VERSION,
    template: TEMPLATES.has(template) ? template : "blank",
    viewport,
    nodes,
    edges,
    locked: source.locked === true,
  };
}

function defaultAdvancedDocument() {
  return sanitizeAdvancedDocument(DEFAULT_ADVANCED_DOCUMENT);
}

function node(id, type, position, data = {}, extra = {}) {
  return { id, type, position, data, ...extra };
}

/**
 * Starter graphs for the project-type selector. Templates are ordinary nodes
 * and edges on the shared canvas — a storyboard is a set of group nodes, not a
 * separate editor — so anything the user can build by hand, a template can
 * seed, and nothing downstream special-cases a template id.
 */
const TEMPLATE_BUILDERS = {
  blank() {
    return { nodes: [], edges: [] };
  },
  image() {
    return {
      nodes: [
        node("text-1", "text", { x: 0, y: 0 }, { text: "", mode: "plain" }, { label: "Prompt #1" }),
        node("image-generator-1", "imageGenerator", { x: 520, y: 0 }, { outputs: 1, activeResultIndex: 0 }, { label: "Image Generator #1" }),
      ],
      edges: [
        { id: "e-text-1-image-generator-1", source: "text-1", sourceHandle: "text", target: "image-generator-1", targetHandle: "prompt", dataType: "text" },
      ],
    };
  },
  video() {
    return {
      nodes: [
        node("text-1", "text", { x: 0, y: 0 }, { text: "", mode: "plain" }, { label: "Prompt #1" }),
        node("video-generator-1", "videoGenerator", { x: 520, y: 0 }, { duration: 5, outputs: 1, activeResultIndex: 0 }, { label: "Video Generator #1" }),
      ],
      edges: [
        { id: "e-text-1-video-generator-1", source: "text-1", sourceHandle: "text", target: "video-generator-1", targetHandle: "prompt", dataType: "text" },
      ],
    };
  },
  storyboard() {
    const nodes = [];
    const edges = [];
    const sceneWidth = 1_180;
    for (let scene = 1; scene <= 3; scene += 1) {
      const originX = (scene - 1) * (sceneWidth + 120);
      const textId = `text-scene-${scene}`;
      const generatorId = `image-generator-scene-${scene}`;
      nodes.push(node(`group-scene-${scene}`, "group", { x: originX - 40, y: -90 }, {
        memberIds: [textId, generatorId],
        scene,
      }, { label: `Scene ${scene}`, width: sceneWidth, height: 760 }));
      nodes.push(node(textId, "text", { x: originX, y: 0 }, { text: "", mode: "plain" }, { label: `Scene ${scene} prompt` }));
      nodes.push(node(generatorId, "imageGenerator", { x: originX + 520, y: 0 }, { outputs: 1, activeResultIndex: 0 }, { label: `Scene ${scene} still` }));
      edges.push({ id: `e-${textId}-${generatorId}`, source: textId, sourceHandle: "text", target: generatorId, targetHandle: "prompt", dataType: "text" });
    }
    return { nodes, edges };
  },
};

function templateDocument(templateId) {
  const template = TEMPLATES.has(templateId) ? templateId : "blank";
  const built = TEMPLATE_BUILDERS[template]();
  return sanitizeAdvancedDocument({
    ...DEFAULT_ADVANCED_DOCUMENT,
    template,
    nodes: built.nodes,
    edges: built.edges,
  });
}

module.exports = {
  ADVANCED_SCHEMA_VERSION,
  MAX_NODES,
  MAX_EDGES,
  TEMPLATES,
  defaultAdvancedDocument,
  sanitizeAdvancedDocument,
  migrateAdvancedDocument,
  templateDocument,
};

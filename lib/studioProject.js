const PROJECT_SCHEMA_VERSION = 1;
const MAX_NODES = 250;
const MAX_EDGES = 500;
const MAX_COORDINATE = 1_000_000;

const NODE_TYPES = new Set(["character", "pose", "generate", "result"]);

const DEFAULT_STUDIO_DOCUMENT = Object.freeze({
  schemaVersion: PROJECT_SCHEMA_VERSION,
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
  return String(value || "").trim().slice(0, maxLength);
}

function sanitizeNode(value) {
  if (!value || typeof value !== "object") return null;
  const id = shortText(value.id, 128);
  const kind = shortText(value.kind, 32);
  if (!id || !NODE_TYPES.has(kind)) return null;

  const node = {
    id,
    kind,
    position: {
      x: finiteNumber(value.position?.x, 0),
      y: finiteNumber(value.position?.y, 0),
    },
  };

  const width = finiteNumber(value.width, 0, 0, 4_000);
  const height = finiteNumber(value.height, 0, 0, 4_000);
  if (width > 0) node.width = width;
  if (height > 0) node.height = height;
  if (value.collapsed === true) node.collapsed = true;
  return node;
}

function sanitizeEdge(value, nodeIds) {
  if (!value || typeof value !== "object") return null;
  const id = shortText(value.id, 160);
  const source = shortText(value.source, 128);
  const target = shortText(value.target, 128);
  if (!id || !nodeIds.has(source) || !nodeIds.has(target) || source === target) return null;

  const edge = { id, source, target };
  const sourceHandle = shortText(value.sourceHandle, 64);
  const targetHandle = shortText(value.targetHandle, 64);
  if (sourceHandle) edge.sourceHandle = sourceHandle;
  if (targetHandle) edge.targetHandle = targetHandle;
  return edge;
}

function sanitizeStudioDocument(input) {
  const source = input && typeof input === "object" ? input : DEFAULT_STUDIO_DOCUMENT;
  const seenNodeIds = new Set();
  const nodes = [];

  for (const candidate of Array.isArray(source.nodes) ? source.nodes.slice(0, MAX_NODES) : []) {
    const node = sanitizeNode(candidate);
    if (!node || seenNodeIds.has(node.id)) continue;
    seenNodeIds.add(node.id);
    nodes.push(node);
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
      zoom: finiteNumber(source.viewport.zoom, 1, 0.2, 4),
    };
  }

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    viewport,
    nodes,
    edges,
    locked: source.locked === true,
  };
}

function defaultStudioDocument() {
  return sanitizeStudioDocument(DEFAULT_STUDIO_DOCUMENT);
}

module.exports = {
  PROJECT_SCHEMA_VERSION,
  MAX_NODES,
  MAX_EDGES,
  defaultStudioDocument,
  sanitizeStudioDocument,
};


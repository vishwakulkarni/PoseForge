/**
 * Advanced Studio type system.
 *
 * Everything the canvas knows about a node comes from a registry entry
 * (see ./registry), and everything it knows about a connection comes from the
 * data type on a handle. Neither the canvas nor the persistence layer contains
 * a list of node names, so a new node type is one new file plus one registry
 * entry.
 */
import type { LucideIcon } from 'lucide-react';

/** The four wire formats a handle can carry. A handle's data type decides its
 * icon, its colour, the colour of any edge attached to it, and what it will
 * accept — consistently, on every node. */
export type AdvDataType = 'text' | 'image' | 'video' | 'audio';

export type AdvNodeType = 'text' | 'imageInput' | 'imageGenerator' | 'videoGenerator' | 'group';

export type AdvNodeCategory = 'inputs' | 'generation' | 'media' | 'organization';

export type AdvNodeStatus = 'idle' | 'queued' | 'running' | 'done' | 'error';

export type AdvTemplateId = 'image' | 'video' | 'storyboard' | 'blank';

export interface AdvHandleDef {
  /** Stable id persisted on every edge; never rename one without a migration. */
  id: string;
  dataType: AdvDataType;
  label: string;
  /** How many edges may land on this input. Outputs are always unbounded. */
  maxConnections?: number;
  /** Reject a second edge from a source this handle is already connected to. */
  allowDuplicateSource?: boolean;
  required?: boolean;
}

export interface AdvNodeHandles {
  inputs: AdvHandleDef[];
  outputs: AdvHandleDef[];
}

/* ------------------------------------------------------------------ node data */

export interface AdvTextNodeData {
  text: string;
  mode: 'plain' | 'structured';
}

export interface AdvImageInputNodeData {
  imageUrl?: string;
  fileName?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  imageFit?: 'fit' | 'fill';
}

export interface AdvGeneratorResult {
  imageUrl?: string;
  videoUrl?: string;
  generationId?: string;
  width?: number;
  height?: number;
  error?: string;
}

export interface AdvImageGeneratorNodeData {
  engine?: string;
  model?: string;
  aspectRatio?: string;
  resolution?: string;
  outputs: number;
  status?: AdvNodeStatus;
  error?: string;
  results?: AdvGeneratorResult[];
  activeResultIndex: number;
}

export interface AdvVideoGeneratorNodeData extends AdvImageGeneratorNodeData {
  duration: number;
  sound?: boolean;
}

export interface AdvGroupNodeData {
  memberIds: string[];
  color?: string;
  scene?: number;
}

export type AdvNodeDataMap = {
  text: AdvTextNodeData;
  imageInput: AdvImageInputNodeData;
  imageGenerator: AdvImageGeneratorNodeData;
  videoGenerator: AdvVideoGeneratorNodeData;
  group: AdvGroupNodeData;
};

export type AdvNodeData = AdvNodeDataMap[AdvNodeType];

/* ------------------------------------------------------- persisted document */

export interface AdvDocumentNode<T extends AdvNodeType = AdvNodeType> {
  id: string;
  type: T;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  label?: string;
  collapsed?: boolean;
  data: AdvNodeDataMap[T];
}

export interface AdvDocumentEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  dataType?: AdvDataType;
}

export interface AdvViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface AdvDocument {
  schemaVersion: number;
  template: AdvTemplateId;
  viewport: AdvViewport | null;
  nodes: AdvDocumentNode[];
  edges: AdvDocumentEdge[];
  locked: boolean;
}

/* ------------------------------------------------------------------ API shapes */

export interface AdvProject {
  id: string;
  name: string;
  workspace: 'advanced';
  template: AdvTemplateId;
  schemaVersion: number;
  revision: number;
  document: AdvDocument;
  createdAt: string;
  updatedAt: string;
}

export interface AdvProjectSummary {
  id: string;
  name: string;
  workspace: 'advanced';
  template: AdvTemplateId;
  schemaVersion: number;
  revision: number;
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
  preview: { generatedImageUrl: string | null; loadedImageUrls: string[] };
}

export interface AdvResolutionOption {
  id: string;
  label: string;
  quality: string;
}

export interface AdvImageCapability {
  supported: true;
  textToImage: boolean;
  /** True when the provider has no API parameters for aspect ratio and
   * resolution and receives them as prompt text (the Codex CLI). */
  promptDrivenSettings?: boolean;
  maxImages: number;
  aspectRatios: string[];
  defaultAspectRatio: string;
  resolutions: AdvResolutionOption[];
  defaultResolution: string;
  maxOutputs: number;
}

export interface AdvEngineCapability {
  key: string;
  label: string;
  ready: boolean;
  reason: string | null;
  models: { id: string; label: string; note?: string }[];
  defaultModel: string | null;
  image: AdvImageCapability;
  video: { supported: boolean };
}

export interface AdvAssetUploadResponse {
  assetId: string;
  url: string;
  fileName: string;
  width: number | null;
  height: number | null;
}

export interface AdvNodeRunResponse {
  project: AdvProject;
  results: AdvGeneratorResult[];
}

/* ------------------------------------------------------------------ registry */

/** Everything the canvas needs to render, validate, and persist a node type.
 * `handles` is a function of the node's own data so a node can expose only the
 * inputs its current model actually supports. */
export interface AdvNodeDefinition<T extends AdvNodeType = AdvNodeType> {
  type: T;
  label: string;
  description: string;
  category: AdvNodeCategory;
  icon: LucideIcon;
  /** Shown in the add-node menu; a node hidden there can still exist in a
   * document (for example while its provider phase is still landing). */
  addable: boolean;
  geometry: { width: number; height: number; minWidth: number; minHeight: number; maxWidth: number; maxHeight: number };
  defaultLabel: (index: number) => string;
  defaultData: () => AdvNodeDataMap[T];
  handles: (data: AdvNodeDataMap[T], capability?: AdvEngineCapability) => AdvNodeHandles;
  /** Pre-generation check. Returns null when the node is ready to run. */
  validate?: (data: AdvNodeDataMap[T], resolved: AdvResolvedInputs) => string | null;
  /** True when the node produces output by running a generation. */
  generative?: boolean;
}

export interface AdvResolvedInputs {
  prompt: string;
  imageUrls: string[];
  videoUrls: string[];
  audioUrls: string[];
}

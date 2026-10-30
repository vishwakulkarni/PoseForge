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

export type AdvNodeType = 'text' | 'imageInput' | 'videoInput' | 'audioInput' | 'imageGenerator' | 'videoGenerator' | 'group';

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
  /** Makes this text a workflow input that runs can fill in. */
  inputName?: string;
}

export interface AdvImageInputNodeData {
  imageUrl?: string;
  characterId?: string;
  /** A pose library image, resolved when the workflow runs. */
  poseId?: string;
  /** Makes this image a workflow input that runs can fill in. */
  inputName?: string;
  fileName?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  imageFit?: 'fit' | 'fill';
}

/** Video Input and Audio Input: one uploaded clip, stored as-is. */
export interface AdvMediaInputNodeData {
  mediaUrl?: string;
  fileName?: string;
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
  videoInput: AdvMediaInputNodeData;
  audioInput: AdvMediaInputNodeData;
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
  expandedWidth?: number;
  expandedHeight?: number;
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
  /** Inputs the workflow declares: `{{name}}` placeholders and `inputName` nodes. */
  inputs?: AdvWorkflowInput[];
  /** Runs still in progress on the server, null when idle. */
  activeRun?: AdvActiveRun | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdvWorkflowInput {
  name: string;
  kind: 'text' | 'image';
  nodeIds: string[];
  default: unknown;
}

export interface AdvActiveRun {
  runIds: string[];
  running: string[];
  queued: string[];
}

/** A distinct recipe (nodes, settings, wiring) that has run. */
export interface AdvVersionSummary {
  id: string;
  version: number;
  createdAt: string;
  runCount: number;
  lastRunAt: string | null;
  /** Sum of completed generations' recorded estimates; null when none priced. */
  costUsd: number | null;
  generationCount: number;
  /** Below generationCount when some engines bill through a plan (no price). */
  pricedGenerationCount: number;
}

export interface AdvVersionsResponse {
  /** The version the canvas matches, null when it has changed since its last run. */
  currentVersionId: string | null;
  versions: AdvVersionSummary[];
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
  supported: boolean;
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

export interface AdvVideoModelCapability {
  id: string;
  inputs: Array<'prompt' | 'startFrame' | 'endFrame' | 'reference' | 'referenceVideo' | 'referenceAudio'>;
  durations: number[];
  defaultDuration: number;
  aspectRatios: string[];
  defaultAspectRatio: string;
  resolutions: string[];
  defaultResolution: string;
  sound: boolean;
  /** Reference images the model accepts; one when absent. */
  maxReferences?: number;
  maxReferenceVideos?: number;
  maxReferenceAudios?: number;
  /** Audio alone satisfies the reference requirement (otherwise an image or
   * video is needed too). */
  audioOnlyReferences?: boolean;
}

export type AdvVideoCapability = {
  supported: true;
  maxOutputs: number;
  models: AdvVideoModelCapability[];
} | { supported: false };

export interface AdvEngineCapability {
  key: string;
  label: string;
  ready: boolean;
  reason: string | null;
  models: { id: string; label: string; note?: string }[];
  defaultModel: string | null;
  image: AdvImageCapability;
  video: AdvVideoCapability;
}

export interface AdvAssetUploadResponse {
  assetId: string;
  url: string;
  fileName: string;
  width: number | null;
  height: number | null;
}

export interface AdvMediaUploadResponse {
  assetId: string;
  url: string;
  fileName: string;
  mediaKind: 'video' | 'audio';
  size: number;
}

export interface AdvNodeRunResponse {
  project: AdvProject;
  results: AdvGeneratorResult[];
  runId?: string;
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
  startFrameUrls: string[];
  endFrameUrls: string[];
  referenceImageUrls: string[];
  videoUrls: string[];
  audioUrls: string[];
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import {
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  NodeResizer,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type Viewport,
  useReactFlow,
  useUpdateNodeInternals,
} from '@xyflow/react';
import {
  BrushCleaning,
  Check,
  ChevronDown,
  Image as ImageIcon,
  LockKeyhole,
  Maximize2,
  Menu,
  PersonStanding,
  Plus,
  Redo2,
  Sparkles,
  Trash2,
  Undo2,
  UnlockKeyhole,
  UserRound,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  Generation,
  StudioProject,
  StudioProjectDocument,
  StudioProjectNode,
  StudioProjectNodeAssetType,
  StudioProjectNodeImageFit,
  StudioProjectSummary,
} from '@/lib/api/types';
import type {
  StudioProjectActionState,
  StudioProjectSaveState,
} from '@/lib/studio/project-workspace';

export type CanvasState = 'idle' | 'ready' | 'running' | 'done';

export interface CanvasSubject {
  id: string;
  label: string;
  imageUrl: string | null;
}

export interface CanvasPose {
  label: string;
  imageUrl: string;
}

export interface CanvasPoseSuggestion extends CanvasPose {
  id: string;
  category: string | null;
}

export interface CanvasAsset {
  id: string;
  type: StudioProjectNodeAssetType;
  label: string;
  imageUrl: string;
  meta?: string;
}

export type StudioCanvasEntryMethod = 'click' | 'keyboard' | 'drag';

// These events stay inside the current browser page. PoseForge intentionally
// does not transmit or persist product analytics; consumers can observe this
// typed CustomEvent stream for local diagnostics and opt-in test harnesses.
export type StudioCanvasEventName =
  | 'source_drawer_started'
  | 'source_block_added'
  | 'source_picker_opened'
  | 'source_asset_selected'
  | 'source_upload_started'
  | 'source_upload_succeeded'
  | 'source_validation_failed'
  | 'source_upload_failed';

export interface StudioCanvasEvent {
  name: StudioCanvasEventName;
  timestamp: string;
  projectId: string | null;
  theme: 'light' | 'dark';
  blockCount: number;
  kind?: 'character' | 'pose';
  entryMethod?: StudioCanvasEntryMethod;
  sourceType?: StudioProjectNodeAssetType;
  reason?: string;
  elapsedMs?: number;
}

export interface CanvasPanelProps {
  aspectRatio: string;
  status: CanvasState;
  subjects: CanvasSubject[];
  pose: CanvasPose | null;
  poseSuggestions?: CanvasPoseSuggestion[];
  suggestionsLoading?: boolean;
  selectedSuggestionIds?: string[];
  selectedSubjectId?: string | null;
  generations: Generation[];
  plannedOutputs: number;
  outputPoseLabels?: string[];
  activeIndex: number;
  onSelectSubject?: (id: string) => void;
  onToggleSuggestion?: (id: string) => void;
  onSelectVariant: (index: number) => void;
  onRegenerate: () => void;
  tip: string;
  project?: StudioProject | null;
  projectSaveState?: StudioProjectSaveState;
  onProjectChange?: (document: StudioProjectDocument) => void;
  onRetryProjectSave?: () => void;
  projects?: StudioProjectSummary[];
  projectsLoading?: boolean;
  projectActionState?: StudioProjectActionState;
  projectActionError?: string | null;
  onSwitchProject?: (id: string) => Promise<void>;
  onCreateProject?: (name: string) => Promise<StudioProject>;
  onDeleteProject?: (id: string) => Promise<void>;
  characterAssets?: CanvasAsset[];
  poseAssets?: CanvasAsset[];
  generatedAssets?: CanvasAsset[];
  onUploadAsset?: (kind: 'character' | 'pose', file: File) => Promise<CanvasAsset>;
  mode?: 'normal' | 'advanced';
  engineLabel?: string;
  forgeValidation?: string;
  onStudioEvent?: (event: StudioCanvasEvent) => void;
}

type StudioNodeKind = 'character' | 'pose' | 'generate' | 'result';

interface StudioNodeData extends Record<string, unknown> {
  kind: StudioNodeKind;
  label: string;
  meta: string;
  imageUrl?: string | null;
  aspectRatio?: string;
  status?: CanvasState | Generation['status'];
  errorMessage?: string | null;
  index?: number;
  active?: boolean;
  empty?: boolean;
  poseLabel?: string;
  suggestionId?: string;
  custom?: boolean;
  collapsed?: boolean;
  lastExpandedWidth?: number;
  lastExpandedHeight?: number;
  imageFit?: StudioProjectNodeImageFit;
  labelEdited?: boolean;
  assetType?: StudioProjectNodeAssetType;
  assetId?: string;
  studioMode?: 'normal' | 'advanced';
  engineLabel?: string;
  inputCount?: number;
  outputCount?: number;
  validation?: string;
}

type StudioFlowNode = Node<StudioNodeData, 'poseforge'>;
type PositionMap = Record<string, { x: number; y: number }>;

interface CanvasSnapshot {
  nodes: StudioFlowNode[];
  edges: Edge[];
  viewport: Viewport;
}

interface NodeGeometry {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
}

const NODE_TYPES = { poseforge: StudioNode };
const StudioNodeActionsContext = React.createContext<{
  onToggleSuggestion?: (id: string) => void;
  onSelectVariant: (index: number) => void;
  onRegenerate: () => void;
  locked: boolean;
  onOpenPicker: (id: string) => void;
  onResizeStart: () => void;
  onResizeEnd: () => void;
  onRename: (id: string, label: string) => void;
  onDuplicate: (id: string) => void;
  onResizePreset: (id: string, preset: 'smaller' | 'default' | 'larger') => void;
  onToggleCollapse: (id: string) => void;
  onToggleImageFit: (id: string) => void;
  onDisconnect: (id: string) => void;
  onRemove: (id: string) => void;
}>({
  onSelectVariant: () => {},
  onRegenerate: () => {},
  locked: false,
  onOpenPicker: () => {},
  onResizeStart: () => {},
  onResizeEnd: () => {},
  onRename: () => {},
  onDuplicate: () => {},
  onResizePreset: () => {},
  onToggleCollapse: () => {},
  onToggleImageFit: () => {},
  onDisconnect: () => {},
  onRemove: () => {},
});
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
const FIT_OPTIONS = { padding: 0.16, minZoom: MIN_ZOOM, maxZoom: 1.15, duration: 300 };
const DEFAULT_EDGE_OPTIONS = {
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 18,
    height: 18,
    color: 'var(--pf-canvas-edge)',
  },
  style: {
    stroke: 'var(--pf-canvas-edge)',
    strokeWidth: 2,
  },
};
const EMPTY_SUGGESTIONS: CanvasPoseSuggestion[] = [];
const EMPTY_IDS: string[] = [];
const EMPTY_LABELS: string[] = [];
const EMPTY_ASSETS: CanvasAsset[] = [];
const EMPTY_PROJECTS: StudioProjectSummary[] = [];

function isAssetValidForKind(kind: 'character' | 'pose', asset: CanvasAsset) {
  if (!asset.id || !asset.label || !asset.imageUrl) return false;
  return asset.type === kind || asset.type === 'generation' || asset.type === 'upload';
}

const NODE_GEOMETRY: Record<StudioNodeKind, NodeGeometry> = {
  character: { width: 330, height: 388, minWidth: 220, minHeight: 250, maxWidth: 560, maxHeight: 720 },
  pose: { width: 330, height: 388, minWidth: 220, minHeight: 250, maxWidth: 560, maxHeight: 720 },
  generate: { width: 330, height: 112, minWidth: 280, minHeight: 96, maxWidth: 600, maxHeight: 240 },
  result: { width: 480, height: 538, minWidth: 320, minHeight: 360, maxWidth: 800, maxHeight: 900 },
};

const TYPE_COPY: Record<StudioNodeKind, { label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }> = {
  character: { label: 'Character', icon: UserRound },
  pose: { label: 'Pose', icon: PersonStanding },
  generate: { label: 'Generate', icon: Sparkles },
  result: { label: 'Result', icon: ImageIcon },
};

function nodePositions(nodes: StudioFlowNode[]): PositionMap {
  return Object.fromEntries(nodes.map((node) => [node.id, { ...node.position }]));
}

function samePositions(left: PositionMap, right: PositionMap) {
  const ids = Object.keys(left);
  return ids.length === Object.keys(right).length && ids.every((id) =>
    left[id]?.x === right[id]?.x && left[id]?.y === right[id]?.y,
  );
}

function sameEdges(left: Edge[], right: Edge[]) {
  if (left.length !== right.length) return false;
  const comparable = (edge: Edge) =>
    `${edge.id}:${edge.source}:${edge.sourceHandle ?? ''}:${edge.target}:${edge.targetHandle ?? ''}`;
  const leftValues = left.map(comparable).sort();
  const rightValues = right.map(comparable).sort();
  return leftValues.every((value, index) => value === rightValues[index]);
}

function canvasSnapshot(nodes: StudioFlowNode[], edges: Edge[], viewport: Viewport): CanvasSnapshot {
  return {
    nodes: nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: { ...node.data },
      style: node.style ? { ...node.style } : undefined,
    })),
    edges: edges.map((edge) => ({ ...edge })),
    viewport: { ...viewport },
  };
}

function projectDocument(
  nodes: StudioFlowNode[],
  edges: Edge[],
  viewport: Viewport,
  locked: boolean,
): StudioProjectDocument {
  return {
    schemaVersion: 1,
    viewport: { ...viewport },
    nodes: nodes.map((node) => ({
      id: node.id,
      kind: node.data.kind,
      position: { ...node.position },
      ...(node.data.custom ? { custom: true } : {}),
      ...(typeof node.width === 'number' && node.width > 0 ? { width: node.width } : {}),
      ...(typeof node.height === 'number' && node.height > 0 ? { height: node.height } : {}),
      ...(node.data.collapsed ? { collapsed: true } : {}),
      ...(node.data.lastExpandedWidth ? { lastExpandedWidth: node.data.lastExpandedWidth } : {}),
      ...(node.data.lastExpandedHeight ? { lastExpandedHeight: node.data.lastExpandedHeight } : {}),
      ...(node.data.imageFit ? { imageFit: node.data.imageFit } : {}),
      ...(node.data.label ? { label: node.data.label } : {}),
      ...(node.data.labelEdited ? { labelEdited: true } : {}),
      ...(node.data.meta ? { meta: node.data.meta } : {}),
      ...(node.data.imageUrl ? { imageUrl: node.data.imageUrl } : {}),
      ...(node.data.assetType ? { assetType: node.data.assetType } : {}),
      ...(node.data.assetId ? { assetId: node.data.assetId } : {}),
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
      ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
    })),
    edgeState: 'explicit',
    locked,
  };
}

function nodeSize(node: StudioFlowNode) {
  const defaults = NODE_GEOMETRY[node.data.kind];
  return {
    width: node.width ?? (Number(node.style?.width) || defaults.width),
    height: node.height ?? (Number(node.style?.height) || defaults.height),
  };
}

function configurableNode(
  node: StudioFlowNode,
  saved?: StudioProjectNode,
): StudioFlowNode {
  const defaults = NODE_GEOMETRY[node.data.kind];
  const width = saved?.width ?? node.width ?? (Number(node.style?.width) || defaults.width);
  const height = saved?.height ?? node.height ?? (Number(node.style?.height) || defaults.height);
  return {
    ...node,
    width,
    height,
    style: { ...node.style, width, height },
    data: {
      ...node.data,
      ...(saved?.label ? { label: saved.label } : {}),
      ...(saved?.labelEdited ? { labelEdited: true } : {}),
      ...(saved?.meta ? { meta: saved.meta } : {}),
      ...(saved?.imageUrl ? { imageUrl: saved.imageUrl, empty: false } : {}),
      ...(saved?.assetType ? { assetType: saved.assetType } : {}),
      ...(saved?.assetId ? { assetId: saved.assetId } : {}),
      collapsed: saved?.collapsed ?? node.data.collapsed ?? false,
      imageFit: saved?.imageFit ?? node.data.imageFit ?? 'fill',
      lastExpandedWidth: saved?.lastExpandedWidth ?? width,
      lastExpandedHeight: saved?.lastExpandedHeight ?? height,
    },
  };
}

function savedCustomNode(saved: StudioProjectNode): StudioFlowNode {
  return configurableNode({
    id: saved.id,
    type: 'poseforge',
    position: { ...saved.position },
    data: {
      kind: saved.kind,
      label: saved.label ?? `Untitled ${saved.kind}`,
      meta: saved.meta ?? (saved.assetType ? `${saved.assetType} source` : 'Select an image'),
      imageUrl: saved.imageUrl ?? null,
      empty: !saved.imageUrl,
      custom: true,
      assetType: saved.assetType,
      assetId: saved.assetId,
      imageFit: saved.imageFit ?? 'fill',
      collapsed: saved.collapsed ?? false,
      lastExpandedWidth: saved.lastExpandedWidth,
      lastExpandedHeight: saved.lastExpandedHeight,
    },
  }, saved);
}

function measuredTidyPositions(nodes: StudioFlowNode[]): PositionMap {
  const rows: StudioFlowNode[][] = [
    nodes.filter((node) => node.data.kind === 'character' || node.data.kind === 'pose'),
    nodes.filter((node) => node.data.kind === 'generate'),
    nodes.filter((node) => node.data.kind === 'result'),
  ];
  const gapX = 48;
  const gapY = 110;
  const rowWidths = rows.map((row) => row.reduce(
    (total, node, index) => total + nodeSize(node).width + (index ? gapX : 0),
    0,
  ));
  const canvasWidth = Math.max(...rowWidths, 0);
  const positions: PositionMap = {};
  let y = 0;
  rows.forEach((row, rowIndex) => {
    let x = (canvasWidth - rowWidths[rowIndex]) / 2;
    let rowHeight = 0;
    row.forEach((node) => {
      const size = nodeSize(node);
      positions[node.id] = { x, y };
      x += size.width + gapX;
      rowHeight = Math.max(rowHeight, size.height);
    });
    y += rowHeight + gapY;
  });
  return positions;
}

function styledSavedEdges(
  document: StudioProjectDocument,
  nodes: StudioFlowNode[],
  authoredEdges: Edge[] = [],
): Edge[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const authoredById = new Map(authoredEdges.map((edge) => [edge.id, edge]));
  return document.edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map((edge) => {
      const authored = authoredById.get(edge.id);
      return {
        ...edge,
        ...(authored?.animated ? { animated: true } : {}),
        className: 'poseforge-edge',
      };
    });
}

function StudioHandle({ type, id, position }: { type: 'source' | 'target'; id?: string; position: Position }) {
  return <Handle type={type} id={id} position={position} className="poseforge-handle" />;
}

function StudioNode({ id, data, selected }: NodeProps<StudioFlowNode>) {
  const actions = React.useContext(StudioNodeActionsContext);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [draftLabel, setDraftLabel] = React.useState(data.label);
  const type = TYPE_COPY[data.kind];
  const Icon = type.icon;
  const running = data.status === 'pending' || data.status === 'running';
  const failed = data.status === 'failed';
  const geometry = NODE_GEOMETRY[data.kind];

  return (
    <article
      className={cn(
        'poseforge-node',
        `poseforge-node-${data.kind}`,
        data.active && 'is-active',
        data.empty && 'is-empty',
        running && 'is-running',
        failed && 'is-failed',
        data.collapsed && 'is-collapsed',
      )}
      data-aspect={data.aspectRatio}
      data-image-fit={data.imageFit ?? 'fill'}
    >
      <NodeResizer
        isVisible={Boolean(selected && !actions.locked && !data.collapsed)}
        minWidth={geometry.minWidth}
        minHeight={geometry.minHeight}
        maxWidth={geometry.maxWidth}
        maxHeight={geometry.maxHeight}
        keepAspectRatio={data.kind === 'result'}
        lineClassName="poseforge-resize-line"
        handleClassName="poseforge-resize-handle"
        onResizeStart={actions.onResizeStart}
        onResizeEnd={actions.onResizeEnd}
      />
      {data.kind === 'generate' ? (
        <>
          <StudioHandle type="target" id="character" position={Position.Top} />
          <StudioHandle type="target" id="pose" position={Position.Top} />
        </>
      ) : data.kind === 'result' ? (
        <StudioHandle type="target" position={Position.Top} />
      ) : null}

      <div className="poseforge-node-tab">
        <Icon size={13} strokeWidth={1.8} />
        <span>{type.label}</span>
      </div>

      {data.collapsed ? (
        <div className="poseforge-collapsed-body">
          <Icon size={18} />
          <strong>{data.label}</strong>
          <small>{data.empty ? 'Image required' : data.meta}</small>
        </div>
      ) : data.kind === 'character' || data.kind === 'pose' ? (
        <>
          <button
            type="button"
            className="nodrag poseforge-node-media"
            aria-label={data.imageUrl ? `Replace image for ${data.label}` : `Select image for ${data.label}`}
            onClick={(event) => {
              event.stopPropagation();
              if (!actions.locked) actions.onOpenPicker(id);
            }}
          >
            {data.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob, local storage, and provider URLs
              <img src={data.imageUrl} alt="" draggable={false} decoding="async" />
            ) : (
              <span className="poseforge-node-placeholder" aria-hidden>
                <Icon size={34} strokeWidth={1.25} />
              </span>
            )}
          </button>
          <div className="poseforge-node-label">
            <span>{data.meta}</span>
            <strong>{data.label}</strong>
            {data.suggestionId && actions.onToggleSuggestion ? (
              <button
                type="button"
                className="nodrag poseforge-node-remove"
                aria-label={`Remove suggested pose ${data.label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  actions.onToggleSuggestion?.(data.suggestionId!);
                }}
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        </>
      ) : data.kind === 'generate' ? (
        <div className="poseforge-generate-body">
          <span className="poseforge-node-icon"><Sparkles size={20} strokeWidth={1.7} /></span>
          <span className="poseforge-generate-copy">
            <strong>{data.label}</strong>
            <span
              className="poseforge-forge-summary"
              aria-label={`${data.studioMode ?? 'normal'} mode, ${data.engineLabel ?? 'selected engine'}, ${data.outputCount ?? 1} outputs, ${data.aspectRatio ?? '1:1'}, ${data.inputCount ?? 0} inputs`}
            >
              <i>{data.studioMode === 'advanced' ? 'Advanced' : 'Normal'}</i>
              <i>{data.engineLabel ?? 'Selected engine'}</i>
              <i>{data.outputCount ?? 1} output{data.outputCount === 1 ? '' : 's'}</i>
              <i>{data.aspectRatio ?? '1:1'}</i>
              <i>{data.inputCount ?? 0} input{data.inputCount === 1 ? '' : 's'}</i>
            </span>
            <small>{data.validation ?? data.meta}</small>
          </span>
          <span className={cn('poseforge-ready-dot', data.status)} aria-hidden />
        </div>
      ) : (
        <>
          <button
            type="button"
            className="nodrag poseforge-result-media"
            aria-label={`Select result ${(data.index ?? 0) + 1}`}
            aria-pressed={data.active}
            onClick={(event) => {
              event.stopPropagation();
              actions.onSelectVariant(data.index ?? 0);
            }}
          >
            {data.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- local storage mount
              <img src={data.imageUrl} alt={`Generated result ${(data.index ?? 0) + 1}`} draggable={false} decoding="async" />
            ) : running ? (
              <span className="poseforge-result-state" aria-live="polite">
                <i className="poseforge-spinner" aria-hidden />
                <strong>{data.status === 'pending' ? 'Queued' : 'Forging result'}</strong>
                <small>Preserving identity and pose</small>
              </span>
            ) : failed ? (
              <span className="poseforge-result-state" aria-live="polite">
                <i className="poseforge-failure-mark" aria-hidden>!</i>
                <strong>Generation failed</strong>
                <small>{data.errorMessage ?? 'Review the engine and try again.'}</small>
              </span>
            ) : (
              <span className="poseforge-result-state">
                <ImageIcon size={30} strokeWidth={1.25} />
                <strong>Result will appear here</strong>
                <small>Complete the inputs, then generate</small>
              </span>
            )}
          </button>
          <div className="poseforge-node-label poseforge-result-label">
            <span>{data.poseLabel ? `Pose · ${data.poseLabel}` : data.meta}</span>
            <strong>{data.label}</strong>
          </div>
          {data.active && data.imageUrl ? (
            <div className="nodrag poseforge-result-actions">
              <a href={data.imageUrl} download>Download</a>
              <Link href="/history">History</Link>
              <button type="button" onClick={actions.onRegenerate}>Regenerate</button>
            </div>
          ) : null}
        </>
      )}

      {selected ? (
        <div className="nodrag nopan poseforge-block-menu">
          <button
            type="button"
            className="poseforge-block-menu-trigger"
            aria-label={`Configure ${data.label}`}
            aria-expanded={menuOpen}
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((open) => !open);
            }}
          >
            <Menu size={15} />
          </button>
          {menuOpen ? (
            <div className="poseforge-block-menu-popover" role="menu">
              {renaming ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    actions.onRename(id, draftLabel);
                    setRenaming(false);
                  }}
                >
                  <label htmlFor={`rename-${id}`}>Block name</label>
                  <input
                    id={`rename-${id}`}
                    value={draftLabel}
                    maxLength={120}
                    autoFocus
                    onChange={(event) => setDraftLabel(event.target.value)}
                  />
                  <button type="submit" disabled={!draftLabel.trim()}>Save name</button>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={actions.locked}
                    onClick={() => {
                      setDraftLabel(data.label);
                      setRenaming(true);
                    }}
                  >
                    Rename
                  </button>
                  {(data.kind === 'character' || data.kind === 'pose') ? (
                    <>
                      <button type="button" role="menuitem" disabled={actions.locked} onClick={() => actions.onOpenPicker(id)}>{data.imageUrl ? 'Replace image' : 'Select image'}</button>
                      <button type="button" role="menuitem" disabled={actions.locked} onClick={() => actions.onToggleImageFit(id)}>Image: {data.imageFit === 'fit' ? 'Fit' : 'Fill'}</button>
                    </>
                  ) : null}
                  <button type="button" role="menuitem" disabled={actions.locked} onClick={() => actions.onResizePreset(id, 'smaller')}>Smaller</button>
                  <button type="button" role="menuitem" disabled={actions.locked} onClick={() => actions.onResizePreset(id, 'larger')}>Larger</button>
                  <button type="button" role="menuitem" disabled={actions.locked} onClick={() => actions.onResizePreset(id, 'default')}>Reset size</button>
                  <button type="button" role="menuitem" disabled={actions.locked} onClick={() => actions.onToggleCollapse(id)}>{data.collapsed ? 'Expand' : 'Collapse'}</button>
                  <button type="button" role="menuitem" disabled={actions.locked} onClick={() => actions.onDuplicate(id)}>Duplicate</button>
                  <button type="button" role="menuitem" disabled={actions.locked} onClick={() => actions.onDisconnect(id)}>Disconnect</button>
                  {data.custom ? <button type="button" role="menuitem" disabled={actions.locked} onClick={() => actions.onRemove(id)}>Remove from canvas</button> : null}
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {data.kind !== 'result' ? <StudioHandle type="source" position={Position.Bottom} /> : (
        <StudioHandle type="source" position={Position.Bottom} />
      )}
    </article>
  );
}

function buildFlow(
  props: Pick<CanvasPanelProps,
    'aspectRatio' | 'status' | 'subjects' | 'pose' | 'poseSuggestions' |
    'selectedSuggestionIds' | 'selectedSubjectId' | 'generations' | 'plannedOutputs' |
    'outputPoseLabels' | 'activeIndex' | 'mode' | 'engineLabel' | 'forgeValidation'
  >,
) {
  const {
    aspectRatio,
    status,
    subjects,
    pose,
    poseSuggestions = [],
    selectedSuggestionIds = [],
    selectedSubjectId,
    generations,
    plannedOutputs,
    outputPoseLabels = [],
    activeIndex,
    mode = 'normal',
    engineLabel = 'Selected engine',
    forgeValidation,
  } = props;
  const selectedSuggestions = selectedSuggestionIds.flatMap((id) => {
    const suggestion = poseSuggestions.find((item) => item.id === id);
    return suggestion ? [suggestion] : [];
  });
  const characterInputs = subjects.length ? subjects : [{ id: 'empty', label: 'Add a character', imageUrl: null }];
  const poseInputs: Array<CanvasPoseSuggestion | (CanvasPose & { id: string })> = pose
    ? [{ ...pose, id: 'manual' }]
    : selectedSuggestions.length
      ? selectedSuggestions
      : [{ id: 'empty', label: 'Add a pose', imageUrl: '' }];
  const inputCount = characterInputs.length + poseInputs.length;
  const outputCount = Math.max(generations.length, plannedOutputs, 1);
  const inputSpan = Math.max(330, inputCount * 380 - 50);
  const resultSpan = Math.max(480, outputCount * 530 - 50);
  const flowSpan = Math.max(inputSpan, resultSpan);
  const inputStart = (flowSpan - inputSpan) / 2;
  const resultStart = (flowSpan - resultSpan) / 2;
  const generateX = (flowSpan - 330) / 2;

  const nodes: StudioFlowNode[] = [];
  const edges: Edge[] = [];

  characterInputs.forEach((subject, index) => {
    const id = `character-${subject.id}`;
    nodes.push({
      id,
      type: 'poseforge',
      position: { x: inputStart + index * 380, y: 0 },
      data: {
        kind: 'character',
        label: subject.label,
        meta: subject.imageUrl ? `Identity ${index + 1}` : 'Source required',
        imageUrl: subject.imageUrl,
        empty: !subject.imageUrl,
        active: subject.id === selectedSubjectId,
      },
    });
    edges.push({
      id: `${id}-generate`,
      source: id,
      target: 'generate',
      targetHandle: 'character',
      className: 'poseforge-edge',
    });
  });

  poseInputs.forEach((poseInput, index) => {
    const id = `pose-${poseInput.id}`;
    const x = inputStart + (characterInputs.length + index) * 380;
    const suggestionId = poseInput.id !== 'manual' && poseInput.id !== 'empty' ? poseInput.id : undefined;
    nodes.push({
      id,
      type: 'poseforge',
      position: { x, y: 0 },
      data: {
        kind: 'pose',
        label: poseInput.label,
        meta: suggestionId && 'category' in poseInput && poseInput.category
          ? poseInput.category
          : poseInput.imageUrl ? 'Pose reference' : 'Source required',
        imageUrl: poseInput.imageUrl || null,
        empty: !poseInput.imageUrl,
        suggestionId,
      },
    });
    edges.push({
      id: `${id}-generate`,
      source: id,
      target: 'generate',
      targetHandle: 'pose',
      className: 'poseforge-edge',
    });
  });

  nodes.push({
    id: 'generate',
    type: 'poseforge',
    position: { x: generateX, y: 450 },
    data: {
      kind: 'generate',
      label: status === 'running' ? 'Generating composition' : 'Forge composition',
      meta: `${characterInputs.length} character${characterInputs.length === 1 ? '' : 's'} · ${poseInputs.length} pose${poseInputs.length === 1 ? '' : 's'}`,
      status,
      studioMode: mode,
      engineLabel,
      inputCount,
      outputCount,
      aspectRatio,
      validation: forgeValidation ?? (status === 'ready' ? 'Ready to generate' : status === 'running' ? 'Generation in progress' : 'Add sources to continue'),
    },
  });

  Array.from({ length: outputCount }, (_, index) => {
    const generation = generations[index];
    const running = generation?.status === 'pending' || generation?.status === 'running' || (!generation && status === 'running');
    const id = generation ? `result-${generation.id}` : `result-placeholder-${index}`;
    nodes.push({
      id,
      type: 'poseforge',
      position: { x: resultStart + index * 530, y: 670 },
      data: {
        kind: 'result',
        label: generation?.outputUrl
          ? 'Generated result'
          : generation?.status === 'failed' ? 'Needs attention' : running ? 'In progress' : 'Waiting',
        meta: `Output ${index + 1}`,
        imageUrl: generation?.outputUrl,
        status: generation?.status ?? (running ? 'running' : status),
        errorMessage: generation?.errorMessage,
        index,
        aspectRatio,
        active: index === activeIndex,
        poseLabel: outputPoseLabels[index],
      },
    });
    edges.push({
      id: `generate-${id}`,
      source: 'generate',
      target: id,
      animated: running,
      className: 'poseforge-edge',
    });
  });

  return { nodes: nodes.map((node) => configurableNode(node)), edges };
}

function CanvasControls({
  zoom,
  locked,
  disabled,
  onViewportChange,
  onToggleLock,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onTidy,
}: {
  zoom: number;
  locked: boolean;
  disabled: boolean;
  onViewportChange: (viewport: Viewport) => void;
  onToggleLock: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onTidy: () => void;
}) {
  const { zoomIn, zoomOut, zoomTo, fitView, getViewport } = useReactFlow();
  const runViewportCommand = async (command: Promise<boolean>) => {
    await command;
    onViewportChange(getViewport());
  };

  return (
    <Panel position="bottom-left" className="poseforge-controls nodrag nopan" aria-label="Canvas controls">
      <button type="button" aria-label="Zoom in" title="Zoom in" disabled={disabled} onClick={() => void runViewportCommand(zoomIn())}><ZoomIn size={15} /></button>
      <button type="button" aria-label="Zoom out" title="Zoom out" disabled={disabled} onClick={() => void runViewportCommand(zoomOut())}><ZoomOut size={15} /></button>
      <button
        type="button"
        className="poseforge-zoom-value"
        aria-label={`Reset zoom from ${Math.round(zoom * 100)}%`}
        title="Reset to 100%"
        disabled={disabled}
        onClick={() => void runViewportCommand(zoomTo(1))}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" aria-label="Fit all nodes" title="Fit all nodes" disabled={disabled} onClick={() => void runViewportCommand(fitView(FIT_OPTIONS))}><Maximize2 size={15} /></button>
      <button type="button" aria-label={locked ? 'Unlock canvas' : 'Lock canvas'} title={locked ? 'Unlock canvas' : 'Lock canvas'} disabled={disabled} onClick={onToggleLock}>
        {locked ? <LockKeyhole size={15} /> : <UnlockKeyhole size={15} />}
      </button>
      <button type="button" aria-label="Undo canvas move" title="Undo" disabled={disabled || !canUndo} onClick={onUndo}><Undo2 size={15} /></button>
      <button type="button" aria-label="Redo canvas move" title="Redo" disabled={disabled || !canRedo} onClick={onRedo}><Redo2 size={15} /></button>
      <button type="button" aria-label="Tidy canvas" title="Tidy canvas" disabled={disabled} onClick={onTidy}><BrushCleaning size={15} /></button>
    </Panel>
  );
}

function ProjectSaveStatus({
  state,
  onRetry,
  project,
  projects = EMPTY_PROJECTS,
  projectsLoading = false,
  actionState = 'idle',
  actionError,
  onSwitchProject,
  onCreateProject,
  onDeleteProject,
}: {
  state?: StudioProjectSaveState;
  onRetry?: () => void;
  project?: StudioProject | null;
  projects?: StudioProjectSummary[];
  projectsLoading?: boolean;
  actionState?: StudioProjectActionState;
  actionError?: string | null;
  onSwitchProject?: (id: string) => Promise<void>;
  onCreateProject?: (name: string) => Promise<StudioProject>;
  onDeleteProject?: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [localError, setLocalError] = React.useState<string | null>(null);
  const control = React.useRef<HTMLDivElement>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const busy = actionState !== 'idle';

  React.useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      const container = control.current;
      if (container && !event.composedPath().includes(container)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    // Dismiss after the click completes so pressing the create submit button
    // cannot unmount its form between pointerdown and submit.
    document.addEventListener('click', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('click', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  if (!state && !project) return null;
  const label = state === 'loading'
    ? 'Loading workspace…'
    : state === 'pending'
      ? 'Unsaved changes'
    : state === 'saving'
      ? 'Saving…'
      : state === 'saved'
        ? 'Saved'
        : state === 'conflict'
          ? 'Save conflict'
          : 'Couldn’t save';

  const switchTo = async (id: string) => {
    if (!onSwitchProject || id === project?.id) return;
    setLocalError(null);
    try {
      await onSwitchProject(id);
      setOpen(false);
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : 'The Studio project could not be opened.');
    }
  };

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError('Enter a project name.');
      return;
    }
    if (!onCreateProject) return;
    setLocalError(null);
    try {
      await onCreateProject(trimmed);
      setName('');
      setOpen(false);
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : 'The Studio project could not be created.');
    }
  };

  const remove = async (item: StudioProjectSummary) => {
    if (!onDeleteProject || item.isDefault) return;
    setLocalError(null);
    try {
      await onDeleteProject(item.id);
      setOpen(false);
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : 'The Studio project could not be deleted.');
    }
  };

  return (
    <Panel
      position="top-right"
      className={cn('poseforge-project-control', 'nodrag', 'nopan', state && `is-${state}`)}
    >
      <div ref={control} className="poseforge-project-control-inner">
        <div
          className="poseforge-save-status"
          aria-live="polite"
          aria-label={`Studio project: ${label}`}
        >
          <span aria-hidden />
          <strong>{label}</strong>
          {(state === 'error' || state === 'conflict') && onRetry ? (
            <button type="button" className="nodrag" onClick={onRetry}>Retry</button>
          ) : null}
        </div>
        <button
          ref={trigger}
          type="button"
          className="poseforge-project-trigger"
          aria-label={`Switch Studio project. Current project: ${project?.name ?? 'Loading'}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={!project || (!onSwitchProject && !onCreateProject)}
          onClick={() => {
            setOpen((current) => !current);
            setLocalError(null);
          }}
        >
          <span>{project?.name ?? 'Studio projects'}</span>
          <ChevronDown size={13} aria-hidden />
        </button>
        {open ? (
          <div className="poseforge-project-menu" role="dialog" aria-label="Studio projects">
            <span className="poseforge-project-menu-label">
              Studio projects
            </span>
            <div className="poseforge-project-list">
              {projectsLoading ? (
                <p>Loading projects…</p>
              ) : projects.length ? projects.map((item) => (
                <div className="poseforge-project-item-row" key={item.id}>
                  <button
                    type="button"
                    className="poseforge-project-item"
                    disabled={busy}
                    onClick={() => void switchTo(item.id)}
                  >
                    <span>
                      <strong>{item.name}</strong>
                      <small>Updated {new Date(item.updatedAt).toLocaleDateString()}</small>
                    </span>
                    {item.id === project?.id ? <Check size={14} aria-label="Current project" /> : null}
                  </button>
                  {!item.isDefault && onDeleteProject ? (
                    <button
                      type="button"
                      className="poseforge-project-delete"
                      aria-label={`Delete ${item.name}`}
                      title={`Delete ${item.name}`}
                      disabled={busy}
                      onClick={() => void remove(item)}
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  ) : null}
                </div>
              )) : (
                <p>No Studio projects found.</p>
              )}
            </div>
            <div className="poseforge-project-separator" />
            <form
              className="poseforge-project-create"
              onSubmit={(event) => {
                event.preventDefault();
                void create();
              }}
            >
              <label htmlFor="poseforge-new-project-name">Create new project</label>
              <div>
                <input
                  id="poseforge-new-project-name"
                  value={name}
                  maxLength={100}
                  placeholder="Project name"
                  disabled={busy}
                  onChange={(event) => setName(event.target.value)}
                />
                <button
                  type="submit"
                  disabled={busy || !name.trim()}
                  onClick={(event) => {
                    // Start the action before the document-level outside-click
                    // listener can dismiss and unmount this nonmodal popover.
                    event.preventDefault();
                    event.stopPropagation();
                    void create();
                  }}
                >
                  <Plus size={14} aria-hidden />
                  {actionState === 'creating' ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
            {(localError || actionError) ? (
              <p className="poseforge-project-error" role="alert">{localError ?? actionError}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function DrawerPalette({
  subjects,
  suggestions,
  suggestionsLoading,
  selectedSuggestionIds,
  onToggleSuggestion,
  onViewportChange,
  locked,
  onAddNode,
  onDrawerStart,
  onDrawerEnd,
}: {
  subjects: CanvasSubject[];
  suggestions: CanvasPoseSuggestion[];
  suggestionsLoading: boolean;
  selectedSuggestionIds: string[];
  onToggleSuggestion?: (id: string) => void;
  onViewportChange: (viewport: Viewport) => void;
  locked: boolean;
  onAddNode: (
    kind: 'character' | 'pose',
    asset: CanvasAsset | undefined,
    entryMethod: StudioCanvasEntryMethod,
  ) => void;
  onDrawerStart: (kind: 'character' | 'pose') => void;
  onDrawerEnd: () => void;
}) {
  const { fitView, getViewport } = useReactFlow();

  return (
    <Panel position="bottom-center" className="poseforge-palette nodrag nopan" aria-label="Node palette">
      <div className="poseforge-palette-stack palette-character">
        <span className="poseforge-stack-peeker peeker-one" aria-hidden />
        <span className="poseforge-stack-peeker peeker-two" aria-hidden />
        <button
          type="button"
          className="poseforge-palette-card"
          aria-label="Add character image block"
          draggable={!locked}
          disabled={locked}
          onDragStart={(event) => {
            event.dataTransfer.setData('application/x-poseforge-node', JSON.stringify({ kind: 'character' }));
            event.dataTransfer.effectAllowed = 'copy';
            onDrawerStart('character');
          }}
          onDragEnd={onDrawerEnd}
          onClick={(event) => onAddNode('character', undefined, event.detail === 0 ? 'keyboard' : 'click')}
        >
          <span className="poseforge-palette-pill"><UserRound size={13} />Character</span>
          <strong>{subjects.length ? `${subjects.length} on canvas` : 'Add identity'}</strong>
          <small>Choose or upload a person</small>
        </button>
      </div>

      <div className="poseforge-palette-stack palette-pose">
        <span className="poseforge-stack-peeker peeker-one" aria-hidden />
        <span className="poseforge-stack-peeker peeker-two" aria-hidden />
        <div className="poseforge-palette-card">
          <button
            type="button"
            className="poseforge-palette-open"
            aria-label="Add pose image block"
            disabled={locked}
            draggable={!locked}
            onDragStart={(event) => {
              event.dataTransfer.setData('application/x-poseforge-node', JSON.stringify({ kind: 'pose' }));
              event.dataTransfer.effectAllowed = 'copy';
              onDrawerStart('pose');
            }}
            onDragEnd={onDrawerEnd}
            onClick={(event) => onAddNode('pose', undefined, event.detail === 0 ? 'keyboard' : 'click')}
          >
            <span className="poseforge-palette-pill"><PersonStanding size={13} />Pose</span>
            <strong>{selectedSuggestionIds.length ? `${selectedSuggestionIds.length} selected` : 'Add reference'}</strong>
            <small>{suggestionsLoading ? 'Finding matches…' : 'Drag or click a suggestion'}</small>
          </button>
          {suggestions.length ? (
            <div className="poseforge-palette-items">
              {suggestions.map((suggestion) => {
                const selected = selectedSuggestionIds.includes(suggestion.id);
                return (
                  <button
                    type="button"
                    key={suggestion.id}
                    className={cn('poseforge-palette-item', selected && 'is-selected')}
                    draggable={!locked}
                    disabled={locked}
                    aria-pressed={selected}
                    aria-label={`${selected ? 'Remove' : 'Add'} suggested pose ${suggestion.label}`}
                    onDragStart={(event) => {
                      event.dataTransfer.setData('application/x-poseforge-node', JSON.stringify({
                        kind: 'pose',
                        asset: {
                          id: suggestion.id,
                          type: 'pose',
                          label: suggestion.label,
                          imageUrl: suggestion.imageUrl,
                          meta: suggestion.category ?? 'Suggested pose',
                        },
                      }));
                      event.dataTransfer.effectAllowed = 'copy';
                      onDrawerStart('pose');
                    }}
                    onDragEnd={onDrawerEnd}
                    onClick={() => onToggleSuggestion?.(suggestion.id)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- provider and local storage URLs */}
                    <img src={suggestion.imageUrl} alt="" draggable={false} />
                    <span>{suggestion.label}</span>
                    <i aria-hidden>{selected ? '✓' : '+'}</i>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <div className="poseforge-palette-stack palette-generate">
        <span className="poseforge-stack-peeker peeker-one" aria-hidden />
        <button
          type="button"
          className="poseforge-palette-card"
          aria-label="Focus generate node"
          onClick={() => {
            void fitView({ ...FIT_OPTIONS, nodes: [{ id: 'generate' }], maxZoom: 1.15 })
              .then(() => onViewportChange(getViewport()));
          }}
        >
          <span className="poseforge-palette-pill"><Sparkles size={13} />Generate</span>
          <strong>Compose output</strong>
          <small>Model and direction live at right</small>
        </button>
      </div>
    </Panel>
  );
}

function SourcePicker({
  node,
  assets,
  generatedAssets,
  error,
  uploading,
  canUpload,
  onSelect,
  onUpload,
  onClose,
}: {
  node: StudioFlowNode;
  assets: CanvasAsset[];
  generatedAssets: CanvasAsset[];
  error: string | null;
  uploading: boolean;
  canUpload: boolean;
  onSelect: (asset: CanvasAsset) => void;
  onUpload: (file: File) => void;
  onClose: () => void;
}) {
  const typeLabel = node.data.kind === 'character' ? 'character' : 'pose';
  const closeButton = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    closeButton.current?.focus();
  }, []);

  return (
    <Panel
      position="top-center"
      className="poseforge-source-picker nodrag nopan"
      role="dialog"
      aria-modal="true"
      aria-label={`Select ${typeLabel} image`}
    >
      <div className="poseforge-source-picker-head">
        <div>
          <strong>Select {typeLabel} image</strong>
          <small>The block stays in place when its source changes.</small>
        </div>
        <button ref={closeButton} type="button" aria-label="Close image picker" onClick={onClose}><X size={16} /></button>
      </div>
      <label className={cn('poseforge-source-upload', uploading && 'is-uploading')}>
        <ImageIcon size={18} />
        <span>{uploading ? 'Uploading image…' : 'Upload a new image'}</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          disabled={!canUpload || uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUpload(file);
            event.target.value = '';
          }}
        />
      </label>
      {error ? <p className="poseforge-source-error" role="alert">{error}</p> : null}
      <div className="poseforge-source-picker-scroll">
        <section>
          <h3>{typeLabel === 'character' ? 'Saved characters' : 'Pose library'}</h3>
          <div className="poseforge-source-grid">
            {assets.map((asset) => (
              <button type="button" key={`${asset.type}-${asset.id}`} onClick={() => onSelect(asset)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- local asset routes */}
                <img src={asset.imageUrl} alt="" />
                <span>{asset.label}</span>
              </button>
            ))}
            {!assets.length ? <p>No saved {typeLabel} images yet.</p> : null}
          </div>
        </section>
        {generatedAssets.length ? (
          <section>
            <h3>Generated images</h3>
            <div className="poseforge-source-grid">
              {generatedAssets.map((asset) => (
                <button type="button" key={`generation-${asset.id}`} onClick={() => onSelect(asset)}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- generation storage route */}
                  <img src={asset.imageUrl} alt="" />
                  <span>{asset.label}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </Panel>
  );
}

function SourceNodeInspector({
  node,
  connectionCount,
  locked,
  onClose,
  onOpenPicker,
  onSetImageFit,
  onDisconnect,
  onRemove,
}: {
  node: StudioFlowNode;
  connectionCount: number;
  locked: boolean;
  onClose: () => void;
  onOpenPicker: () => void;
  onSetImageFit: (fit: StudioProjectNodeImageFit) => void;
  onDisconnect: () => void;
  onRemove: () => void;
}) {
  const size = nodeSize(node);
  const typeLabel = node.data.kind === 'character' ? 'Character' : 'Pose';
  const sourceLabel = node.data.assetType === 'generation'
    ? 'Generated history'
    : node.data.assetType === 'upload'
      ? 'Uploaded image'
      : node.data.assetType === 'character'
        ? 'Character library'
        : node.data.assetType === 'pose'
          ? 'Pose library'
          : 'No source selected';
  const locateHref = node.data.assetType === 'generation'
    ? '/history'
    : node.data.assetType === 'character'
      ? '/characters'
      : node.data.assetType === 'pose'
        ? '/poses'
        : node.data.kind === 'character'
          ? '/characters'
          : '/poses';

  return (
    <Panel
      position="top-right"
      className="poseforge-source-inspector nodrag nopan"
      aria-label="Selected image block inspector"
    >
      <div className="poseforge-source-inspector-head">
        <div>
          <span>{typeLabel} block</span>
          <strong>{node.data.label}</strong>
        </div>
        <button type="button" aria-label="Close image block inspector" onClick={onClose}>
          <X size={15} />
        </button>
      </div>

      {node.data.imageUrl ? (
        <div className="poseforge-source-inspector-preview">
          {/* eslint-disable-next-line @next/next/no-img-element -- local asset routes */}
          <img src={node.data.imageUrl} alt={`${node.data.label} preview`} />
        </div>
      ) : (
        <div className="poseforge-source-inspector-empty">Select an image to populate this block.</div>
      )}

      <dl className="poseforge-source-inspector-meta">
        <div><dt>Source</dt><dd>{sourceLabel}</dd></div>
        <div><dt>Details</dt><dd>{node.data.meta}</dd></div>
        <div><dt>Size</dt><dd>{Math.round(size.width)} × {Math.round(size.height)}</dd></div>
        <div><dt>Connections</dt><dd>{connectionCount}</dd></div>
      </dl>

      <div className="poseforge-source-inspector-section">
        <span>Preview mode</span>
        <div className="poseforge-source-fit" role="group" aria-label="Image preview mode">
          {(['fit', 'fill'] as const).map((fit) => (
            <button
              key={fit}
              type="button"
              aria-pressed={(node.data.imageFit ?? 'fill') === fit}
              disabled={locked}
              onClick={() => onSetImageFit(fit)}
            >
              {fit === 'fit' ? 'Fit' : 'Fill'}
            </button>
          ))}
        </div>
      </div>

      <div className="poseforge-source-inspector-actions">
        <button type="button" disabled={locked} onClick={onOpenPicker}>
          {node.data.imageUrl ? 'Replace image' : 'Select image'}
        </button>
        <Link href={locateHref}>Locate asset</Link>
        <button type="button" disabled={locked || connectionCount === 0} onClick={onDisconnect}>
          Disconnect
        </button>
        <button type="button" disabled={locked || !node.data.custom} onClick={onRemove}>
          Remove from canvas
        </button>
      </div>
      {!node.data.custom ? (
        <p className="poseforge-source-inspector-note">Authored sources are removed from the Sources panel.</p>
      ) : null}
    </Panel>
  );
}

function CanvasFlow(props: CanvasPanelProps) {
  const {
    aspectRatio,
    status,
    subjects,
    pose,
    poseSuggestions = EMPTY_SUGGESTIONS,
    suggestionsLoading = false,
    selectedSuggestionIds = EMPTY_IDS,
    selectedSubjectId = null,
    generations,
    plannedOutputs,
    outputPoseLabels = EMPTY_LABELS,
    activeIndex,
    onSelectSubject,
    onToggleSuggestion,
    onSelectVariant,
    onRegenerate,
    characterAssets = EMPTY_ASSETS,
    poseAssets = EMPTY_ASSETS,
    generatedAssets = EMPTY_ASSETS,
    onUploadAsset,
    mode = 'normal',
    engineLabel = 'Selected engine',
    forgeValidation,
    onStudioEvent,
  } = props;
  const flow = React.useMemo(() => buildFlow({
    aspectRatio,
    status,
    subjects,
    pose,
    poseSuggestions,
    selectedSuggestionIds,
    selectedSubjectId,
    generations,
    plannedOutputs,
    outputPoseLabels,
    activeIndex,
    mode,
    engineLabel,
    forgeValidation,
  }), [
    activeIndex,
    aspectRatio,
    generations,
    engineLabel,
    forgeValidation,
    mode,
    outputPoseLabels,
    plannedOutputs,
    pose,
    poseSuggestions,
    selectedSubjectId,
    selectedSuggestionIds,
    status,
    subjects,
  ]);
  const [nodes, setNodes] = React.useState<StudioFlowNode[]>(flow.nodes);
  const [edges, setEdges] = React.useState<Edge[]>(flow.edges);
  const [locked, setLocked] = React.useState(false);
  const [viewport, setViewport] = React.useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [workspaceReady, setWorkspaceReady] = React.useState(!props.onProjectChange);
  const [undoStack, setUndoStack] = React.useState<CanvasSnapshot[]>([]);
  const [redoStack, setRedoStack] = React.useState<CanvasSnapshot[]>([]);
  const [pickerNodeId, setPickerNodeId] = React.useState<string | null>(null);
  const [pickerError, setPickerError] = React.useState<string | null>(null);
  const [uploadingAsset, setUploadingAsset] = React.useState(false);
  const [draggingKind, setDraggingKind] = React.useState<'character' | 'pose' | null>(null);
  const [dragOverCanvas, setDragOverCanvas] = React.useState(false);
  const dragSnapshot = React.useRef<CanvasSnapshot | null>(null);
  const resizeSnapshot = React.useRef<CanvasSnapshot | null>(null);
  const sourceStartedAt = React.useRef(new Map<string, number>());
  const hydratedProject = React.useRef<string | null>(null);
  const hydrationSequence = React.useRef(0);
  const persistenceReady = React.useRef(!props.onProjectChange);
  const nodesRef = React.useRef(nodes);
  const edgesRef = React.useRef(edges);
  const viewportRef = React.useRef(viewport);
  const lockedRef = React.useRef(locked);
  const savedPositionsRef = React.useRef(new Map<string, { x: number; y: number }>());
  const savedEdgesRef = React.useRef<StudioProjectDocument['edges']>([]);
  const hasExplicitEdgeStateRef = React.useRef(false);
  const knownFlowEdgeIdsRef = React.useRef(new Set(flow.edges.map((edge) => edge.id)));
  const suppressedEdgeIdsRef = React.useRef(new Set<string>());
  const {
    fitView,
    getViewport,
    screenToFlowPosition,
    setViewport: setFlowViewport,
  } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const { resolvedTheme } = useTheme();
  const {
    project,
    projectSaveState,
    onProjectChange,
    onRetryProjectSave,
    projects,
    projectsLoading,
    projectActionState,
    projectActionError,
    onSwitchProject,
    onCreateProject,
    onDeleteProject,
  } = props;

  const emitStudioEvent = React.useCallback((
    name: StudioCanvasEventName,
    details: Omit<Partial<StudioCanvasEvent>, 'name' | 'timestamp' | 'projectId' | 'theme' | 'blockCount'> = {},
  ) => {
    const event: StudioCanvasEvent = {
      name,
      timestamp: new Date().toISOString(),
      projectId: project?.id ?? null,
      theme: resolvedTheme === 'dark' ? 'dark' : 'light',
      blockCount: nodesRef.current.length,
      ...details,
    };
    onStudioEvent?.(event);
    window.dispatchEvent(new CustomEvent<StudioCanvasEvent>('poseforge:studio-event', { detail: event }));
  }, [onStudioEvent, project?.id, resolvedTheme]);

  const commitNodes = React.useCallback((nextNodes: StudioFlowNode[]) => {
    nodesRef.current = nextNodes;
    setNodes(nextNodes);
  }, []);

  const commitEdges = React.useCallback((nextEdges: Edge[]) => {
    edgesRef.current = nextEdges;
    setEdges(nextEdges);
  }, []);

  const commitViewport = React.useCallback((nextViewport: Viewport) => {
    viewportRef.current = nextViewport;
    setViewport(nextViewport);
  }, []);

  const commitLocked = React.useCallback((nextLocked: boolean) => {
    lockedRef.current = nextLocked;
    setLocked(nextLocked);
  }, []);

  // Reconcile changing source/result data without resetting user geometry or
  // the camera. Newly materialized nodes take their authored default position;
  // existing nodes retain their current position and selection.
  React.useEffect(() => {
    const currentNodes = nodesRef.current;
    const authoredIds = new Set(flow.nodes.map((node) => node.id));
    const nextAuthoredNodes = flow.nodes.map((next) => {
      const savedPosition = savedPositionsRef.current.get(next.id);
      const positioned = savedPosition ? { ...next, position: { ...savedPosition } } : next;
      const existing = currentNodes.find((node) => node.id === next.id);
      return existing
        ? {
            ...next,
            position: existing.position,
            selected: existing.selected,
            width: existing.width,
            height: existing.height,
            style: existing.style,
            data: {
              ...next.data,
              label: existing.data.labelEdited || existing.data.assetType
                ? existing.data.label
                : next.data.label,
              labelEdited: existing.data.labelEdited,
              ...(existing.data.assetType ? {
                imageUrl: existing.data.imageUrl,
                assetType: existing.data.assetType,
                assetId: existing.data.assetId,
                empty: existing.data.empty,
                meta: existing.data.meta,
              } : {}),
              collapsed: existing.data.collapsed,
              lastExpandedWidth: existing.data.lastExpandedWidth,
              lastExpandedHeight: existing.data.lastExpandedHeight,
              imageFit: existing.data.imageFit,
            },
          }
        : positioned;
    });
    const customNodes = currentNodes.filter((node) => node.data.custom && !authoredIds.has(node.id));
    const nextNodes = [...nextAuthoredNodes, ...customNodes];
    commitNodes(nextNodes);

    const nodeIds = new Set(nextNodes.map((node) => node.id));
    const authoredEdges = new Map(flow.edges.map((edge) => [edge.id, edge]));
    const nextEdges = edgesRef.current
      .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
      .map((edge) => {
        const authored = authoredEdges.get(edge.id);
        return authored
          ? { ...edge, ...authored, selected: edge.selected }
          : edge;
      });
    const nextEdgeIds = new Set(nextEdges.map((edge) => edge.id));

    for (const edge of flow.edges) {
      const isNewAuthoredEdge = !knownFlowEdgeIdsRef.current.has(edge.id);
      const canRestoreDefault = !hasExplicitEdgeStateRef.current || isNewAuthoredEdge;
      if (
        !nextEdgeIds.has(edge.id) &&
        !suppressedEdgeIdsRef.current.has(edge.id) &&
        canRestoreDefault
      ) {
        nextEdges.push(edge);
        nextEdgeIds.add(edge.id);
      }
    }

    for (const edge of savedEdgesRef.current) {
      if (
        nodeIds.has(edge.source) &&
        nodeIds.has(edge.target) &&
        !nextEdgeIds.has(edge.id) &&
        !suppressedEdgeIdsRef.current.has(edge.id)
      ) {
        nextEdges.push({ ...edge, className: 'poseforge-edge' });
        nextEdgeIds.add(edge.id);
      }
    }

    knownFlowEdgeIdsRef.current = new Set(flow.edges.map((edge) => edge.id));
    commitEdges(nextEdges);
  }, [commitEdges, commitNodes, flow.edges, flow.nodes]);

  // A project is hydrated once. Later save responses carry the same project
  // ID and must not replay old geometry over newer optimistic local changes.
  React.useEffect(() => {
    if (!project || hydratedProject.current === project.id) return;
    hydratedProject.current = project.id;
    const sequence = ++hydrationSequence.current;
    persistenceReady.current = false;
    setWorkspaceReady(false);
    const savedPositions = new Map(project.document.nodes.map((node) => [node.id, node.position]));
    savedPositionsRef.current = savedPositions;
    savedEdgesRef.current = project.document.edges;
    const hasSavedGraph = project.document.nodes.length > 0;
    const hasExplicitEdgeState = hasSavedGraph && project.document.edgeState === 'explicit';
    hasExplicitEdgeStateRef.current = hasExplicitEdgeState;
    knownFlowEdgeIdsRef.current = new Set(flow.edges.map((edge) => edge.id));
    const authoredIds = new Set(flow.nodes.map((node) => node.id));
    const savedById = new Map(project.document.nodes.map((node) => [node.id, node]));
    const hydratedNodes = [
      ...flow.nodes.map((node) => {
        const saved = savedById.get(node.id);
        return configurableNode(
          saved ? { ...node, position: { ...saved.position } } : node,
          saved,
        );
      }),
      ...project.document.nodes
        .filter((node) =>
          !authoredIds.has(node.id) &&
          node.custom === true &&
          (node.kind === 'character' || node.kind === 'pose') &&
          /^(character|pose)-block-/.test(node.id),
        )
        .map(savedCustomNode),
    ];
    commitNodes(hydratedNodes);
    const savedEdges = styledSavedEdges(project.document, hydratedNodes, flow.edges);
    // Documents saved before edgeState existed could contain node geometry but
    // an empty edge array. Treat those as incomplete legacy snapshots and
    // restore the authored workflow arrows once. New saves mark their edge
    // array explicit so a deliberate Disconnect remains durable.
    const legacyEdges = Array.from(
      new Map([...flow.edges, ...savedEdges].map((edge) => [edge.id, edge])).values(),
    );
    const hydratedEdges = hasExplicitEdgeState ? savedEdges : legacyEdges;
    suppressedEdgeIdsRef.current = new Set(
      hasExplicitEdgeState
        ? flow.edges
            .filter((edge) => !project.document.edges.some((saved) => saved.id === edge.id))
            .map((edge) => edge.id)
        : [],
    );
    commitEdges(hydratedEdges);
    commitLocked(project.document.locked);
    persistenceReady.current = true;
    setWorkspaceReady(true);

    // Hydration can replace node positions and dimensions before React Flow's
    // first handle measurement completes. Refresh every hydrated node on the
    // next frame so its edge paths and arrow markers exist on the first open,
    // including when a saved viewport skips fitView.
    window.requestAnimationFrame(() => {
      if (sequence !== hydrationSequence.current) return;
      updateNodeInternals(hydratedNodes.map((node) => node.id));
    });

    const hydrateViewport = async () => {
      if (project.document.viewport) {
        commitViewport(project.document.viewport);
        void setFlowViewport(project.document.viewport, { duration: 0 });
      } else {
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        if (sequence !== hydrationSequence.current) return;
        void fitView({ ...FIT_OPTIONS, duration: 0 });
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        if (sequence !== hydrationSequence.current) return;
        commitViewport(getViewport());
      }
    };
    void hydrateViewport();
  }, [
    commitEdges,
    commitLocked,
    commitNodes,
    commitViewport,
    fitView,
    flow.edges,
    flow.nodes,
    getViewport,
    project,
    setFlowViewport,
    updateNodeInternals,
  ]);

  const emitProject = React.useCallback((
    nextNodes: StudioFlowNode[],
    nextEdges: Edge[],
    nextViewport: Viewport,
    nextLocked: boolean,
  ) => {
    if (!persistenceReady.current) return;
    onProjectChange?.(projectDocument(nextNodes, nextEdges, nextViewport, nextLocked));
  }, [onProjectChange]);

  const persistViewport = React.useCallback((nextViewport: Viewport) => {
    commitViewport(nextViewport);
    emitProject(nodesRef.current, edgesRef.current, nextViewport, lockedRef.current);
  }, [commitViewport, emitProject]);

  const commitMutation = React.useCallback((
    nextNodes: StudioFlowNode[],
    nextEdges: Edge[] = edgesRef.current,
    before = canvasSnapshot(nodesRef.current, edgesRef.current, viewportRef.current),
  ) => {
    setUndoStack((history) => [...history.slice(-19), before]);
    setRedoStack([]);
    commitNodes(nextNodes);
    commitEdges(nextEdges);
    emitProject(nextNodes, nextEdges, viewportRef.current, lockedRef.current);
  }, [commitEdges, commitNodes, emitProject]);

  const addImageNode = React.useCallback((
    kind: 'character' | 'pose',
    asset?: CanvasAsset,
    clientPoint?: { x: number; y: number },
    entryMethod: StudioCanvasEntryMethod = 'click',
  ) => {
    if (entryMethod !== 'drag') {
      emitStudioEvent('source_drawer_started', { kind, entryMethod });
    }
    if (!workspaceReady || lockedRef.current) {
      emitStudioEvent('source_validation_failed', {
        kind,
        entryMethod,
        reason: lockedRef.current ? 'canvas_locked' : 'workspace_loading',
      });
      return;
    }
    if (asset && !isAssetValidForKind(kind, asset)) {
      emitStudioEvent('source_validation_failed', {
        kind,
        entryMethod,
        sourceType: asset.type,
        reason: 'asset_type_mismatch',
      });
      return;
    }
    const id = `${kind}-block-${crypto.randomUUID()}`;
    const startedAt = performance.now();
    const geometry = NODE_GEOMETRY[kind];
    let position: { x: number; y: number };
    if (clientPoint) {
      const projected = screenToFlowPosition(clientPoint);
      position = { x: projected.x - geometry.width / 2, y: projected.y - 36 };
    } else {
      const pane = document.querySelector('.canvas-viewport')?.getBoundingClientRect();
      const center = pane
        ? { x: pane.left + pane.width / 2, y: pane.top + pane.height / 2 }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const projected = screenToFlowPosition(center);
      position = { x: projected.x - geometry.width / 2, y: projected.y - geometry.height / 2 };
    }
    const node = configurableNode({
      id,
      type: 'poseforge',
      position,
      selected: true,
      data: {
        kind,
        label: asset?.label ?? `Untitled ${kind}`,
        meta: asset?.meta ?? (asset ? `${asset.type} source` : 'Select an image'),
        imageUrl: asset?.imageUrl ?? null,
        empty: !asset,
        custom: true,
        assetType: asset?.type,
        assetId: asset?.id,
        imageFit: 'fill',
      },
    });
    const currentNodes = nodesRef.current;
    const nextNodes = [
      ...currentNodes.map((current) => ({ ...current, selected: false })),
      node,
    ];
    const generate = currentNodes.find((current) => current.data.kind === 'generate');
    const nextEdges = generate
      ? [
          ...edgesRef.current,
          {
            id: `${id}-${generate.id}`,
            source: id,
            target: generate.id,
            targetHandle: kind,
            className: 'poseforge-edge',
          },
        ]
      : edgesRef.current;
    commitMutation(nextNodes, nextEdges);
    sourceStartedAt.current.set(id, startedAt);
    emitStudioEvent('source_block_added', {
      kind,
      entryMethod,
      ...(asset ? { sourceType: asset.type } : {}),
    });
    setPickerError(null);
    setPickerNodeId(asset ? null : id);
    if (asset) {
      emitStudioEvent('source_asset_selected', {
        kind,
        entryMethod,
        sourceType: asset.type,
        elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
      });
      sourceStartedAt.current.delete(id);
    } else {
      emitStudioEvent('source_picker_opened', { kind, entryMethod });
    }
  }, [commitMutation, emitStudioEvent, screenToFlowPosition, workspaceReady]);

  const updateNode = React.useCallback((
    id: string,
    updater: (node: StudioFlowNode) => StudioFlowNode,
  ) => {
    if (lockedRef.current) return;
    const currentNodes = nodesRef.current;
    const nextNodes = currentNodes.map((node) => node.id === id ? updater(node) : node);
    commitMutation(nextNodes);
  }, [commitMutation]);

  const selectAsset = React.useCallback((id: string, asset: CanvasAsset) => {
    const current = nodesRef.current.find((node) => node.id === id);
    if (!current || (current.data.kind !== 'character' && current.data.kind !== 'pose')) return;
    if (!isAssetValidForKind(current.data.kind, asset)) {
      setPickerError('That source type cannot be used in this block.');
      emitStudioEvent('source_validation_failed', {
        kind: current.data.kind,
        sourceType: asset.type,
        reason: 'asset_type_mismatch',
      });
      return;
    }
    updateNode(id, (node) => ({
      ...node,
      data: {
        ...node.data,
        label: asset.label,
        labelEdited: true,
        meta: asset.meta ?? `${asset.type} source`,
        imageUrl: asset.imageUrl,
        assetType: asset.type,
        assetId: asset.id,
        empty: false,
      },
    }));
    const startedAt = sourceStartedAt.current.get(id);
    emitStudioEvent('source_asset_selected', {
      kind: current.data.kind,
      sourceType: asset.type,
      ...(startedAt == null ? {} : {
        elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
      }),
    });
    sourceStartedAt.current.delete(id);
    setPickerNodeId(null);
    setPickerError(null);
  }, [emitStudioEvent, updateNode]);

  const uploadAsset = React.useCallback(async (file: File) => {
    if (!pickerNodeId || !onUploadAsset) return;
    const node = nodesRef.current.find((item) => item.id === pickerNodeId);
    if (!node || (node.data.kind !== 'character' && node.data.kind !== 'pose')) return;
    if (!file.type.startsWith('image/') && !/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name)) {
      setPickerError('Choose a supported image file.');
      emitStudioEvent('source_validation_failed', {
        kind: node.data.kind,
        reason: 'unsupported_file_type',
      });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setPickerError('Image files must be 25 MB or smaller.');
      emitStudioEvent('source_validation_failed', {
        kind: node.data.kind,
        reason: 'file_too_large',
      });
      return;
    }
    setUploadingAsset(true);
    setPickerError(null);
    emitStudioEvent('source_upload_started', { kind: node.data.kind, sourceType: 'upload' });
    try {
      const asset = await onUploadAsset(node.data.kind, file);
      selectAsset(node.id, asset);
      emitStudioEvent('source_upload_succeeded', {
        kind: node.data.kind,
        sourceType: asset.type,
      });
    } catch (cause) {
      setPickerError(cause instanceof Error ? cause.message : 'The image could not be uploaded.');
      emitStudioEvent('source_upload_failed', {
        kind: node.data.kind,
        sourceType: 'upload',
        reason: 'upload_rejected',
      });
    } finally {
      setUploadingAsset(false);
    }
  }, [emitStudioEvent, onUploadAsset, pickerNodeId, selectAsset]);

  const resizeStart = React.useCallback(() => {
    resizeSnapshot.current = canvasSnapshot(
      nodesRef.current,
      edgesRef.current,
      viewportRef.current,
    );
  }, []);

  const resizeEnd = React.useCallback(() => {
    const before = resizeSnapshot.current;
    resizeSnapshot.current = null;
    if (!before || lockedRef.current) return;
    const nextNodes = nodesRef.current.map((node) => ({
      ...node,
      style: {
        ...node.style,
        ...(node.width ? { width: node.width } : {}),
        ...(node.height ? { height: node.height } : {}),
      },
      data: node.data.collapsed ? node.data : {
        ...node.data,
        lastExpandedWidth: node.width ?? node.data.lastExpandedWidth,
        lastExpandedHeight: node.height ?? node.data.lastExpandedHeight,
      },
    }));
    commitMutation(nextNodes, edgesRef.current, before);
  }, [commitMutation]);

  const renameNode = React.useCallback((id: string, label: string) => {
    const clean = label.trim().slice(0, 120);
    if (!clean) return;
    updateNode(id, (node) => ({
      ...node,
      data: { ...node.data, label: clean, labelEdited: true },
    }));
  }, [updateNode]);

  const resizePreset = React.useCallback((
    id: string,
    preset: 'smaller' | 'default' | 'larger',
  ) => {
    updateNode(id, (node) => {
      const limits = NODE_GEOMETRY[node.data.kind];
      const current = nodeSize(node);
      const factor = preset === 'smaller' ? 0.8 : preset === 'larger' ? 1.2 : 1;
      const width = preset === 'default'
        ? limits.width
        : Math.min(limits.maxWidth, Math.max(limits.minWidth, Math.round(current.width * factor)));
      const height = preset === 'default'
        ? limits.height
        : Math.min(limits.maxHeight, Math.max(limits.minHeight, Math.round(current.height * factor)));
      return {
        ...node,
        width,
        height,
        style: { ...node.style, width, height },
        data: {
          ...node.data,
          collapsed: false,
          lastExpandedWidth: width,
          lastExpandedHeight: height,
        },
      };
    });
  }, [updateNode]);

  const toggleCollapse = React.useCallback((id: string) => {
    updateNode(id, (node) => {
      const size = nodeSize(node);
      const collapsed = !node.data.collapsed;
      const width = collapsed
        ? Math.max(NODE_GEOMETRY[node.data.kind].minWidth, Math.min(size.width, 360))
        : node.data.lastExpandedWidth ?? NODE_GEOMETRY[node.data.kind].width;
      const height = collapsed
        ? 64
        : node.data.lastExpandedHeight ?? NODE_GEOMETRY[node.data.kind].height;
      return {
        ...node,
        width,
        height,
        style: { ...node.style, width, height },
        data: {
          ...node.data,
          collapsed,
          lastExpandedWidth: collapsed ? size.width : width,
          lastExpandedHeight: collapsed ? size.height : height,
        },
      };
    });
  }, [updateNode]);

  const duplicateNode = React.useCallback((id: string) => {
    if (lockedRef.current) return;
    const source = nodesRef.current.find((node) => node.id === id);
    if (!source) return;
    const copyId = `${source.data.kind}-block-${crypto.randomUUID()}`;
    const copy: StudioFlowNode = {
      ...source,
      id: copyId,
      position: { x: source.position.x + 48, y: source.position.y + 48 },
      selected: true,
      data: { ...source.data, label: `${source.data.label} copy`, custom: true },
      style: source.style ? { ...source.style } : undefined,
    };
    const nextNodes = [
      ...nodesRef.current.map((node) => ({ ...node, selected: false })),
      copy,
    ];
    commitMutation(nextNodes);
  }, [commitMutation]);

  const disconnectNode = React.useCallback((id: string) => {
    if (lockedRef.current) return;
    const nextEdges = edgesRef.current.filter((edge) => edge.source !== id && edge.target !== id);
    if (sameEdges(nextEdges, edgesRef.current)) return;
    commitMutation(nodesRef.current, nextEdges);
  }, [commitMutation]);

  const removeNode = React.useCallback((id: string) => {
    if (lockedRef.current) return;
    const nextNodes = nodesRef.current.filter((node) => node.id !== id);
    const nextEdges = edgesRef.current.filter((edge) => edge.source !== id && edge.target !== id);
    commitMutation(nextNodes, nextEdges);
    if (pickerNodeId === id) setPickerNodeId(null);
    sourceStartedAt.current.delete(id);
  }, [commitMutation, pickerNodeId]);

  const nodeActions = React.useMemo(() => ({
    onToggleSuggestion,
    onSelectVariant,
    onRegenerate,
    locked,
    onOpenPicker: (id: string) => {
      const node = nodesRef.current.find((item) => item.id === id);
      if (node && (node.data.kind === 'character' || node.data.kind === 'pose')) {
        emitStudioEvent('source_picker_opened', { kind: node.data.kind });
      }
      setPickerError(null);
      setPickerNodeId(id);
    },
    onResizeStart: resizeStart,
    onResizeEnd: resizeEnd,
    onRename: renameNode,
    onDuplicate: duplicateNode,
    onResizePreset: resizePreset,
    onToggleCollapse: toggleCollapse,
    onToggleImageFit: (id: string) => updateNode(id, (node) => ({
      ...node,
      data: { ...node.data, imageFit: node.data.imageFit === 'fit' ? 'fill' : 'fit' },
    })),
    onDisconnect: disconnectNode,
    onRemove: removeNode,
  }), [
    disconnectNode,
    duplicateNode,
    emitStudioEvent,
    locked,
    onRegenerate,
    onSelectVariant,
    onToggleSuggestion,
    removeNode,
    renameNode,
    resizeEnd,
    resizePreset,
    resizeStart,
    toggleCollapse,
    updateNode,
  ]);

  const tidy = React.useCallback(() => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    const currentViewport = viewportRef.current;
    const currentLocked = lockedRef.current;
    const current = nodePositions(currentNodes);
    const tidyPositions = measuredTidyPositions(currentNodes);
    if (samePositions(current, tidyPositions)) {
      void fitView(FIT_OPTIONS).then(() => persistViewport(getViewport()));
      return;
    }
    setUndoStack((history) => [
      ...history.slice(-19),
      canvasSnapshot(currentNodes, currentEdges, currentViewport),
    ]);
    setRedoStack([]);
    const nextNodes = currentNodes.map((node) => tidyPositions[node.id]
      ? { ...node, position: { ...tidyPositions[node.id] } }
      : node,
    );
    commitNodes(nextNodes);
    emitProject(nextNodes, currentEdges, currentViewport, currentLocked);
    window.requestAnimationFrame(() => {
      void fitView(FIT_OPTIONS).then(() => persistViewport(getViewport()));
    });
  }, [commitNodes, emitProject, fitView, getViewport, persistViewport]);

  const applySnapshot = React.useCallback((snapshot: CanvasSnapshot) => {
    const nextNodes = snapshot.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: { ...node.data },
      style: node.style ? { ...node.style } : undefined,
    }));
    const snapshotEdgeIds = new Set(snapshot.edges.map((edge) => edge.id));
    for (const edgeId of knownFlowEdgeIdsRef.current) {
      if (snapshotEdgeIds.has(edgeId)) suppressedEdgeIdsRef.current.delete(edgeId);
      else suppressedEdgeIdsRef.current.add(edgeId);
    }
    commitNodes(nextNodes);
    commitEdges(snapshot.edges);
    commitViewport(snapshot.viewport);
    void setFlowViewport(snapshot.viewport, { duration: 120 });
    emitProject(nextNodes, snapshot.edges, snapshot.viewport, lockedRef.current);
  }, [commitEdges, commitNodes, commitViewport, emitProject, setFlowViewport]);

  const undo = React.useCallback(() => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setRedoStack((future) => [
      ...future,
      canvasSnapshot(nodesRef.current, edgesRef.current, viewportRef.current),
    ]);
    setUndoStack((history) => history.slice(0, -1));
    applySnapshot(previous);
  }, [applySnapshot, undoStack]);

  const redo = React.useCallback(() => {
    const next = redoStack.at(-1);
    if (!next) return;
    setUndoStack((history) => [
      ...history,
      canvasSnapshot(nodesRef.current, edgesRef.current, viewportRef.current),
    ]);
    setRedoStack((future) => future.slice(0, -1));
    applySnapshot(next);
  }, [applySnapshot, redoStack]);

  const isValidConnection = React.useCallback((connection: Edge | Connection) => {
    const source = nodes.find((node) => node.id === connection.source);
    const target = nodes.find((node) => node.id === connection.target);
    if (!source || !target) return false;
    if (target.data.kind === 'generate') {
      return (connection.targetHandle === 'character' && source.data.kind === 'character') ||
        (connection.targetHandle === 'pose' && source.data.kind === 'pose');
    }
    return target.data.kind === 'result' && source.data.kind === 'generate';
  }, [nodes]);

  const connect = React.useCallback((connection: Connection) => {
    if (!isValidConnection(connection)) return;
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    const currentViewport = viewportRef.current;
    const nextEdges = addEdge({ ...connection, className: 'poseforge-edge' }, currentEdges);
    if (sameEdges(currentEdges, nextEdges)) return;
    setUndoStack((history) => [
      ...history.slice(-19),
      canvasSnapshot(currentNodes, currentEdges, currentViewport),
    ]);
    setRedoStack([]);
    commitEdges(nextEdges);
    emitProject(currentNodes, nextEdges, currentViewport, lockedRef.current);
  }, [commitEdges, emitProject, isValidConnection]);

  const handleNodesChange = React.useCallback((changes: NodeChange<StudioFlowNode>[]) => {
    const nextNodes = applyNodeChanges(changes, nodesRef.current);
    commitNodes(nextNodes);
  }, [commitNodes]);

  const handleEdgesChange = React.useCallback((changes: EdgeChange[]) => {
    const structuralChanges = changes.filter((change) => change.type !== 'select');
    const applicableChanges = lockedRef.current
      ? changes.filter((change) => change.type === 'select')
      : changes;
    if (!applicableChanges.length) return;

    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    const currentViewport = viewportRef.current;
    const nextEdges = applyEdgeChanges(applicableChanges, currentEdges);
    commitEdges(nextEdges);

    if (!structuralChanges.length || sameEdges(currentEdges, nextEdges)) return;
    for (const change of structuralChanges) {
      if (change.type === 'remove') suppressedEdgeIdsRef.current.add(change.id);
      if (change.type === 'add' || change.type === 'replace') {
        suppressedEdgeIdsRef.current.delete(change.item.id);
      }
    }
    setUndoStack((history) => [
      ...history.slice(-19),
      canvasSnapshot(currentNodes, currentEdges, currentViewport),
    ]);
    setRedoStack([]);
    emitProject(currentNodes, nextEdges, currentViewport, lockedRef.current);
  }, [commitEdges, emitProject]);

  const moveFocusedNode = React.useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && pickerNodeId) {
      event.preventDefault();
      setPickerNodeId(null);
      setPickerError(null);
      return;
    }
    if (lockedRef.current || event.altKey || event.metaKey || event.ctrlKey) return;
    const directions: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const direction = directions[event.key];
    if (!direction) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, textarea, select, [contenteditable="true"]')) return;
    const element = target.closest<HTMLElement>('.react-flow__node');
    const id = element?.dataset.id;
    const currentNodes = nodesRef.current;
    if (!id || !currentNodes.some((node) => node.id === id)) return;

    event.preventDefault();
    const distance = event.shiftKey ? 40 : 12;
    const nextNodes = currentNodes.map((node) => node.id === id
      ? {
          ...node,
          position: {
            x: node.position.x + direction.x * distance,
            y: node.position.y + direction.y * distance,
          },
        }
      : node,
    );
    setUndoStack((history) => [
      ...history.slice(-19),
      canvasSnapshot(currentNodes, edgesRef.current, viewportRef.current),
    ]);
    setRedoStack([]);
    commitNodes(nextNodes);
    emitProject(nextNodes, edgesRef.current, viewportRef.current, lockedRef.current);
  }, [commitNodes, emitProject, pickerNodeId]);

  const pickerNode = pickerNodeId
    ? nodes.find((node) => node.id === pickerNodeId) ?? null
    : null;
  const selectedSourceNode = nodes.find((node) =>
    node.selected && (node.data.kind === 'character' || node.data.kind === 'pose'),
  ) ?? null;
  const selectedSourceConnectionCount = selectedSourceNode
    ? edges.filter((edge) => edge.source === selectedSourceNode.id || edge.target === selectedSourceNode.id).length
    : 0;

  const clearSourceSelection = React.useCallback(() => {
    commitNodes(nodesRef.current.map((node) => node.selected ? { ...node, selected: false } : node));
  }, [commitNodes]);

  return (
    <StudioNodeActionsContext.Provider value={nodeActions}>
      <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      colorMode={resolvedTheme === 'dark' ? 'dark' : 'light'}
      nodesDraggable={workspaceReady && !locked}
      nodesConnectable={workspaceReady && !locked}
      elementsSelectable
      panOnDrag={workspaceReady}
      zoomOnScroll={workspaceReady}
      zoomOnPinch={workspaceReady}
      zoomOnDoubleClick={false}
      deleteKeyCode={null}
      selectionKeyCode={null}
      onKeyDown={moveFocusedNode}
      proOptions={{ hideAttribution: true }}
      onNodesChange={handleNodesChange}
      onEdgesChange={handleEdgesChange}
      onConnect={connect}
      isValidConnection={isValidConnection}
      onMove={(_, nextViewport) => {
        viewportRef.current = nextViewport;
        setViewport((current) => current.zoom === nextViewport.zoom ? current : nextViewport);
      }}
      onMoveEnd={(event, nextViewport) => {
        commitViewport(nextViewport);
        // React Flow emits null-event move completions for initialization and
        // imperative viewport helpers. Those are either hydration (never a
        // user mutation) or are persisted explicitly by the initiating control.
        if (!event?.isTrusted) return;
        emitProject(nodesRef.current, edgesRef.current, nextViewport, lockedRef.current);
      }}
      onNodeClick={(_, node) => {
        if (node.data.kind === 'character' && !node.data.custom) {
          const id = node.id.replace(/^character-/, '');
          if (id !== 'empty') onSelectSubject?.(id);
        } else if (node.data.kind === 'result') {
          onSelectVariant(node.data.index ?? 0);
        }
      }}
      onNodeDragStart={() => {
        dragSnapshot.current = canvasSnapshot(
          nodesRef.current,
          edgesRef.current,
          viewportRef.current,
        );
      }}
      onNodeDragStop={(_, movedNode, movedNodes) => {
        const before = dragSnapshot.current;
        dragSnapshot.current = null;
        const movedPositions = new Map(
          [...movedNodes, movedNode].map((node) => [node.id, node.position]),
        );
        const nextNodes = nodesRef.current.map((node) => {
          const position = movedPositions.get(node.id);
          return position ? { ...node, position: { ...position } } : node;
        });
        commitNodes(nextNodes);
        if (!before || samePositions(nodePositions(before.nodes), nodePositions(nextNodes))) return;
        setUndoStack((history) => [...history.slice(-19), before]);
        setRedoStack([]);
        emitProject(
          nextNodes,
          edgesRef.current,
          viewportRef.current,
          lockedRef.current,
        );
      }}
      onDragOver={(event) => {
        if (workspaceReady && !locked && event.dataTransfer.types.includes('application/x-poseforge-node')) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          setDragOverCanvas(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) {
          setDragOverCanvas(false);
        }
      }}
      onDrop={(event) => {
        setDragOverCanvas(false);
        setDraggingKind(null);
        if (!workspaceReady || locked) return;
        const payload = event.dataTransfer.getData('application/x-poseforge-node');
        if (!payload) return;
        event.preventDefault();
        try {
          const parsed = JSON.parse(payload) as { kind?: 'character' | 'pose'; asset?: CanvasAsset };
          if (parsed.kind === 'character' || parsed.kind === 'pose') {
            const point = Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
              ? { x: event.clientX, y: event.clientY }
              : undefined;
            addImageNode(parsed.kind, parsed.asset, point, 'drag');
          }
        } catch {
          emitStudioEvent('source_validation_failed', { reason: 'invalid_drag_payload' });
        }
      }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={12}
        size={1}
        color="var(--pf-canvas-dot)"
      />
      <CanvasControls
        zoom={viewport.zoom}
        locked={locked}
        disabled={!workspaceReady}
        onViewportChange={persistViewport}
        onToggleLock={() => {
          const next = !lockedRef.current;
          commitLocked(next);
          emitProject(nodesRef.current, edgesRef.current, viewportRef.current, next);
        }}
        onUndo={undo}
        onRedo={redo}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onTidy={tidy}
      />
      <ProjectSaveStatus
        state={!workspaceReady && onProjectChange ? 'loading' : projectSaveState}
        onRetry={onRetryProjectSave}
        project={project}
        projects={projects}
        projectsLoading={projectsLoading}
        actionState={projectActionState}
        actionError={projectActionError}
        onSwitchProject={onSwitchProject}
        onCreateProject={onCreateProject}
        onDeleteProject={onDeleteProject}
      />
      {draggingKind ? (
        <Panel
          position="top-center"
          className={cn('poseforge-drop-hint nodrag nopan', dragOverCanvas && 'is-valid')}
          aria-live="polite"
        >
          {dragOverCanvas ? 'Release to add' : 'Drag onto the canvas'} {draggingKind} block
        </Panel>
      ) : null}
      {selectedSourceNode && !pickerNodeId ? (
        <SourceNodeInspector
          node={selectedSourceNode}
          connectionCount={selectedSourceConnectionCount}
          locked={locked}
          onClose={clearSourceSelection}
          onOpenPicker={() => {
            emitStudioEvent('source_picker_opened', { kind: selectedSourceNode.data.kind as 'character' | 'pose' });
            setPickerError(null);
            setPickerNodeId(selectedSourceNode.id);
          }}
          onSetImageFit={(fit) => {
            if ((selectedSourceNode.data.imageFit ?? 'fill') === fit) return;
            updateNode(selectedSourceNode.id, (node) => ({
              ...node,
              data: { ...node.data, imageFit: fit },
            }));
          }}
          onDisconnect={() => disconnectNode(selectedSourceNode.id)}
          onRemove={() => removeNode(selectedSourceNode.id)}
        />
      ) : null}
      <DrawerPalette
        subjects={subjects}
        suggestions={poseSuggestions}
        suggestionsLoading={suggestionsLoading}
        selectedSuggestionIds={selectedSuggestionIds}
        onToggleSuggestion={onToggleSuggestion}
        onViewportChange={persistViewport}
        locked={locked || !workspaceReady}
        onAddNode={(kind, asset, entryMethod) => addImageNode(kind, asset, undefined, entryMethod)}
        onDrawerStart={(kind) => {
          setDraggingKind(kind);
          setDragOverCanvas(false);
          emitStudioEvent('source_drawer_started', { kind, entryMethod: 'drag' });
        }}
        onDrawerEnd={() => {
          setDraggingKind(null);
          setDragOverCanvas(false);
        }}
      />
      {pickerNode && (pickerNode.data.kind === 'character' || pickerNode.data.kind === 'pose') ? (
        <SourcePicker
          node={pickerNode}
          assets={pickerNode.data.kind === 'character' ? characterAssets : poseAssets}
          generatedAssets={generatedAssets}
          error={pickerError}
          uploading={uploadingAsset}
          canUpload={Boolean(onUploadAsset)}
          onSelect={(asset) => selectAsset(pickerNode.id, asset)}
          onUpload={(file) => void uploadAsset(file)}
          onClose={() => {
            setPickerNodeId(null);
            setPickerError(null);
          }}
        />
      ) : null}
      </ReactFlow>
    </StudioNodeActionsContext.Provider>
  );
}

export function CanvasPanel(props: CanvasPanelProps) {
  return (
    <section className="canvas-panel" aria-label="Composition canvas">
      <div className="canvas-viewport">
        <ReactFlowProvider>
          <CanvasFlow {...props} />
        </ReactFlowProvider>
      </div>
      <div className="canvas-footer">
        <div className="canvas-tip">
          <kbd>Tip</kbd>
          <span>{props.tip}</span>
        </div>
        <span className="canvas-navigation-hint">Drag to pan · Scroll to zoom · Drop a pose</span>
        {props.status === 'running' ? <div className="canvas-progress" aria-hidden><span /></div> : null}
      </div>
    </section>
  );
}

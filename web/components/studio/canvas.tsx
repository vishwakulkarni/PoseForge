'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import {
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
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
} from '@xyflow/react';
import {
  BrushCleaning,
  Image as ImageIcon,
  LockKeyhole,
  Maximize2,
  PersonStanding,
  Redo2,
  Sparkles,
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
} from '@/lib/api/types';
import type { StudioProjectSaveState } from '@/lib/studio/project-workspace';

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
  onOpenSources?: () => void;
  onSelectSubject?: (id: string) => void;
  onToggleSuggestion?: (id: string) => void;
  onSelectVariant: (index: number) => void;
  onRegenerate: () => void;
  tip: string;
  project?: StudioProject | null;
  projectSaveState?: StudioProjectSaveState;
  onProjectChange?: (document: StudioProjectDocument) => void;
  onRetryProjectSave?: () => void;
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
}

type StudioFlowNode = Node<StudioNodeData, 'poseforge'>;
type PositionMap = Record<string, { x: number; y: number }>;

interface CanvasSnapshot {
  positions: PositionMap;
  edges: Edge[];
  viewport: Viewport;
}

const NODE_TYPES = { poseforge: StudioNode };
const StudioNodeActionsContext = React.createContext<{
  onToggleSuggestion?: (id: string) => void;
  onSelectVariant: (index: number) => void;
  onRegenerate: () => void;
}>({
  onSelectVariant: () => {},
  onRegenerate: () => {},
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
    positions: nodePositions(nodes),
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
      ...(typeof node.width === 'number' && node.width > 0 ? { width: node.width } : {}),
      ...(typeof node.height === 'number' && node.height > 0 ? { height: node.height } : {}),
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
      ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
    })),
    locked,
  };
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

function StudioNode({ data }: NodeProps<StudioFlowNode>) {
  const actions = React.useContext(StudioNodeActionsContext);
  const type = TYPE_COPY[data.kind];
  const Icon = type.icon;
  const running = data.status === 'pending' || data.status === 'running';
  const failed = data.status === 'failed';

  return (
    <article
      className={cn(
        'poseforge-node',
        `poseforge-node-${data.kind}`,
        data.active && 'is-active',
        data.empty && 'is-empty',
        running && 'is-running',
        failed && 'is-failed',
      )}
      data-aspect={data.aspectRatio}
    >
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

      {data.kind === 'character' || data.kind === 'pose' ? (
        <>
          <div className="poseforge-node-media">
            {data.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob, local storage, and provider URLs
              <img src={data.imageUrl} alt="" draggable={false} decoding="async" />
            ) : (
              <span className="poseforge-node-placeholder" aria-hidden>
                <Icon size={34} strokeWidth={1.25} />
              </span>
            )}
          </div>
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
          <span>
            <strong>{data.label}</strong>
            <small>{data.meta}</small>
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
    'outputPoseLabels' | 'activeIndex'
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

  return { nodes, edges };
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
}: {
  state?: StudioProjectSaveState;
  onRetry?: () => void;
}) {
  if (!state) return null;
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

  return (
    <Panel
      position="top-right"
      className={cn('poseforge-save-status', 'nodrag', 'nopan', `is-${state}`)}
      aria-live="polite"
      aria-label={`Studio project: ${label}`}
    >
      <span aria-hidden />
      <strong>{label}</strong>
      {(state === 'error' || state === 'conflict') && onRetry ? (
        <button type="button" className="nodrag" onClick={onRetry}>Retry</button>
      ) : null}
    </Panel>
  );
}

function DrawerPalette({
  subjects,
  suggestions,
  suggestionsLoading,
  selectedSuggestionIds,
  onOpenSources,
  onToggleSuggestion,
  onViewportChange,
}: {
  subjects: CanvasSubject[];
  suggestions: CanvasPoseSuggestion[];
  suggestionsLoading: boolean;
  selectedSuggestionIds: string[];
  onOpenSources?: () => void;
  onToggleSuggestion?: (id: string) => void;
  onViewportChange: (viewport: Viewport) => void;
}) {
  const { fitView, getViewport } = useReactFlow();

  return (
    <Panel position="bottom-center" className="poseforge-palette nodrag nopan" aria-label="Node palette">
      <div className="poseforge-palette-stack palette-character">
        <span className="poseforge-stack-peeker peeker-one" aria-hidden />
        <span className="poseforge-stack-peeker peeker-two" aria-hidden />
        <button type="button" className="poseforge-palette-card" aria-label="Open character sources" onClick={onOpenSources}>
          <span className="poseforge-palette-pill"><UserRound size={13} />Character</span>
          <strong>{subjects.length ? `${subjects.length} on canvas` : 'Add identity'}</strong>
          <small>Choose or upload a person</small>
        </button>
      </div>

      <div className="poseforge-palette-stack palette-pose">
        <span className="poseforge-stack-peeker peeker-one" aria-hidden />
        <span className="poseforge-stack-peeker peeker-two" aria-hidden />
        <div className="poseforge-palette-card">
          <button type="button" className="poseforge-palette-open" aria-label="Open pose sources" onClick={onOpenSources}>
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
                    draggable
                    aria-pressed={selected}
                    aria-label={`${selected ? 'Remove' : 'Add'} suggested pose ${suggestion.label}`}
                    onDragStart={(event) => {
                      event.dataTransfer.setData('application/x-poseforge-pose', suggestion.id);
                      event.dataTransfer.effectAllowed = 'copy';
                    }}
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
    onOpenSources,
    onSelectSubject,
    onToggleSuggestion,
    onSelectVariant,
    onRegenerate,
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
  }), [
    activeIndex,
    aspectRatio,
    generations,
    outputPoseLabels,
    plannedOutputs,
    pose,
    poseSuggestions,
    selectedSubjectId,
    selectedSuggestionIds,
    status,
    subjects,
  ]);
  const nodeActions = React.useMemo(() => ({
    onToggleSuggestion,
    onSelectVariant,
    onRegenerate,
  }), [onRegenerate, onSelectVariant, onToggleSuggestion]);
  const [nodes, setNodes] = React.useState<StudioFlowNode[]>(flow.nodes);
  const [edges, setEdges] = React.useState<Edge[]>(flow.edges);
  const [locked, setLocked] = React.useState(false);
  const [viewport, setViewport] = React.useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [workspaceReady, setWorkspaceReady] = React.useState(!props.onProjectChange);
  const [undoStack, setUndoStack] = React.useState<CanvasSnapshot[]>([]);
  const [redoStack, setRedoStack] = React.useState<CanvasSnapshot[]>([]);
  const dragSnapshot = React.useRef<CanvasSnapshot | null>(null);
  const hydratedProject = React.useRef<string | null>(null);
  const hydrationSequence = React.useRef(0);
  const persistenceReady = React.useRef(!props.onProjectChange);
  const nodesRef = React.useRef(nodes);
  const edgesRef = React.useRef(edges);
  const viewportRef = React.useRef(viewport);
  const lockedRef = React.useRef(locked);
  const savedPositionsRef = React.useRef(new Map<string, { x: number; y: number }>());
  const savedEdgesRef = React.useRef<StudioProjectDocument['edges']>([]);
  const hasSavedGraphRef = React.useRef(false);
  const knownFlowEdgeIdsRef = React.useRef(new Set(flow.edges.map((edge) => edge.id)));
  const suppressedEdgeIdsRef = React.useRef(new Set<string>());
  const { fitView, getViewport, setViewport: setFlowViewport } = useReactFlow();
  const { resolvedTheme } = useTheme();
  const {
    project,
    projectSaveState,
    onProjectChange,
    onRetryProjectSave,
  } = props;

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
    const nextNodes = flow.nodes.map((next) => {
      const savedPosition = savedPositionsRef.current.get(next.id);
      const positioned = savedPosition ? { ...next, position: { ...savedPosition } } : next;
      const existing = currentNodes.find((node) => node.id === next.id);
      return existing
        ? { ...next, position: existing.position, selected: existing.selected }
        : positioned;
    });
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
      const canRestoreDefault = !hasSavedGraphRef.current || isNewAuthoredEdge;
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
    hasSavedGraphRef.current = project.document.nodes.length > 0;
    knownFlowEdgeIdsRef.current = new Set(flow.edges.map((edge) => edge.id));
    const hydratedNodes = flow.nodes.map((node) => {
      const saved = savedPositions.get(node.id);
      return saved ? { ...node, position: { ...saved } } : node;
    });
    commitNodes(hydratedNodes);
    const savedEdges = styledSavedEdges(project.document, hydratedNodes, flow.edges);
    const hydratedEdges = hasSavedGraphRef.current ? savedEdges : flow.edges;
    suppressedEdgeIdsRef.current = new Set(
      hasSavedGraphRef.current
        ? flow.edges
            .filter((edge) => !project.document.edges.some((saved) => saved.id === edge.id))
            .map((edge) => edge.id)
        : [],
    );
    commitEdges(hydratedEdges);
    commitLocked(project.document.locked);
    persistenceReady.current = true;
    setWorkspaceReady(true);

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

  const tidy = React.useCallback(() => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    const currentViewport = viewportRef.current;
    const currentLocked = lockedRef.current;
    const current = nodePositions(currentNodes);
    const tidyPositions = nodePositions(flow.nodes);
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
  }, [commitNodes, emitProject, fitView, flow.nodes, getViewport, persistViewport]);

  const applySnapshot = React.useCallback((snapshot: CanvasSnapshot) => {
    const nextNodes = nodesRef.current.map((node) => snapshot.positions[node.id]
      ? { ...node, position: { ...snapshot.positions[node.id] } }
      : node,
    );
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
  }, [commitNodes, emitProject]);

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
        if (node.data.kind === 'character') {
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
        if (!before || samePositions(before.positions, nodePositions(nextNodes))) return;
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
        if (workspaceReady && !locked && event.dataTransfer.types.includes('application/x-poseforge-pose')) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(event) => {
        if (!workspaceReady || locked) return;
        const suggestionId = event.dataTransfer.getData('application/x-poseforge-pose');
        if (!suggestionId || selectedSuggestionIds.includes(suggestionId)) return;
        event.preventDefault();
        onToggleSuggestion?.(suggestionId);
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
      />
      <DrawerPalette
        subjects={subjects}
        suggestions={poseSuggestions}
        suggestionsLoading={suggestionsLoading}
        selectedSuggestionIds={selectedSuggestionIds}
        onOpenSources={onOpenSources}
        onToggleSuggestion={onToggleSuggestion}
        onViewportChange={persistViewport}
      />
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

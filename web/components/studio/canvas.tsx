'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import {
  Background,
  BackgroundVariant,
  Handle,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type Viewport,
  useEdgesState,
  useNodesState,
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
import type { Generation } from '@/lib/api/types';

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
  onRemoveSuggestion?: () => void;
  onSelectResult?: () => void;
  onRegenerate?: () => void;
}

type StudioFlowNode = Node<StudioNodeData, 'poseforge'>;
type PositionMap = Record<string, { x: number; y: number }>;

const NODE_TYPES = { poseforge: StudioNode };
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
const FIT_OPTIONS = { padding: 0.16, minZoom: MIN_ZOOM, maxZoom: 1.15, duration: 300 };
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

function StudioHandle({ type, id, position }: { type: 'source' | 'target'; id?: string; position: Position }) {
  return <Handle type={type} id={id} position={position} className="poseforge-handle" />;
}

function StudioNode({ data }: NodeProps<StudioFlowNode>) {
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
            {data.suggestionId && data.onRemoveSuggestion ? (
              <button
                type="button"
                className="nodrag poseforge-node-remove"
                aria-label={`Remove suggested pose ${data.label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  data.onRemoveSuggestion?.();
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
              data.onSelectResult?.();
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
              <button type="button" onClick={() => data.onRegenerate?.()}>Regenerate</button>
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
    'outputPoseLabels' | 'activeIndex' | 'onToggleSuggestion' | 'onSelectVariant' | 'onRegenerate'
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
    onToggleSuggestion,
    onSelectVariant,
    onRegenerate,
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
      type: 'bezier',
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
        onRemoveSuggestion: suggestionId ? () => onToggleSuggestion?.(suggestionId) : undefined,
      },
    });
    edges.push({
      id: `${id}-generate`,
      source: id,
      target: 'generate',
      targetHandle: 'pose',
      type: 'bezier',
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
        onSelectResult: () => onSelectVariant(index),
        onRegenerate,
      },
    });
    edges.push({
      id: `generate-${id}`,
      source: 'generate',
      target: id,
      type: 'bezier',
      animated: running,
      className: 'poseforge-edge',
    });
  });

  return { nodes, edges };
}

function CanvasControls({
  zoom,
  locked,
  onToggleLock,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onTidy,
}: {
  zoom: number;
  locked: boolean;
  onToggleLock: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onTidy: () => void;
}) {
  const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow();

  return (
    <Panel position="bottom-left" className="poseforge-controls" aria-label="Canvas controls">
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => void zoomIn()}><ZoomIn size={15} /></button>
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => void zoomOut()}><ZoomOut size={15} /></button>
      <button
        type="button"
        className="poseforge-zoom-value"
        aria-label={`Reset zoom from ${Math.round(zoom * 100)}%`}
        title="Reset to 100%"
        onClick={() => void zoomTo(1)}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" aria-label="Fit all nodes" title="Fit all nodes" onClick={() => void fitView(FIT_OPTIONS)}><Maximize2 size={15} /></button>
      <button type="button" aria-label={locked ? 'Unlock canvas' : 'Lock canvas'} title={locked ? 'Unlock canvas' : 'Lock canvas'} onClick={onToggleLock}>
        {locked ? <LockKeyhole size={15} /> : <UnlockKeyhole size={15} />}
      </button>
      <button type="button" aria-label="Undo canvas move" title="Undo" disabled={!canUndo} onClick={onUndo}><Undo2 size={15} /></button>
      <button type="button" aria-label="Redo canvas move" title="Redo" disabled={!canRedo} onClick={onRedo}><Redo2 size={15} /></button>
      <button type="button" aria-label="Tidy canvas" title="Tidy canvas" onClick={onTidy}><BrushCleaning size={15} /></button>
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
}: {
  subjects: CanvasSubject[];
  suggestions: CanvasPoseSuggestion[];
  suggestionsLoading: boolean;
  selectedSuggestionIds: string[];
  onOpenSources?: () => void;
  onToggleSuggestion?: (id: string) => void;
}) {
  const { fitView } = useReactFlow();

  return (
    <Panel position="bottom-center" className="poseforge-palette" aria-label="Node palette">
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
          onClick={() => void fitView({ ...FIT_OPTIONS, nodes: [{ id: 'generate' }], maxZoom: 1.15 })}
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
    onToggleSuggestion,
    onSelectVariant,
    onRegenerate,
  }), [
    activeIndex,
    aspectRatio,
    generations,
    onRegenerate,
    onSelectVariant,
    onToggleSuggestion,
    outputPoseLabels,
    plannedOutputs,
    pose,
    poseSuggestions,
    selectedSubjectId,
    selectedSuggestionIds,
    status,
    subjects,
  ]);
  const [nodes, setNodes, onNodesChange] = useNodesState<StudioFlowNode>(flow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flow.edges);
  const [locked, setLocked] = React.useState(false);
  const [viewport, setViewport] = React.useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [undoStack, setUndoStack] = React.useState<PositionMap[]>([]);
  const [redoStack, setRedoStack] = React.useState<PositionMap[]>([]);
  const dragSnapshot = React.useRef<PositionMap | null>(null);
  const { fitView } = useReactFlow();
  const { resolvedTheme } = useTheme();

  React.useEffect(() => {
    setNodes((current) => flow.nodes.map((next) => {
      const existing = current.find((node) => node.id === next.id);
      return existing ? { ...next, position: existing.position, selected: existing.selected } : next;
    }));
    setEdges(flow.edges);
    const frame = window.requestAnimationFrame(() => void fitView(FIT_OPTIONS));
    return () => window.cancelAnimationFrame(frame);
  }, [fitView, flow.edges, flow.nodes, setEdges, setNodes]);

  const applyPositions = React.useCallback((positions: PositionMap) => {
    setNodes((current) => current.map((node) => positions[node.id]
      ? { ...node, position: { ...positions[node.id] } }
      : node,
    ));
  }, [setNodes]);

  const tidy = React.useCallback(() => {
    const current = nodePositions(nodes);
    const tidyPositions = nodePositions(flow.nodes);
    if (samePositions(current, tidyPositions)) {
      void fitView(FIT_OPTIONS);
      return;
    }
    setUndoStack((history) => [...history.slice(-19), current]);
    setRedoStack([]);
    applyPositions(tidyPositions);
    window.requestAnimationFrame(() => void fitView(FIT_OPTIONS));
  }, [applyPositions, fitView, flow.nodes, nodes]);

  const undo = React.useCallback(() => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setRedoStack((future) => [...future, nodePositions(nodes)]);
    setUndoStack((history) => history.slice(0, -1));
    applyPositions(previous);
  }, [applyPositions, nodes, undoStack]);

  const redo = React.useCallback(() => {
    const next = redoStack.at(-1);
    if (!next) return;
    setUndoStack((history) => [...history, nodePositions(nodes)]);
    setRedoStack((future) => future.slice(0, -1));
    applyPositions(next);
  }, [applyPositions, nodes, redoStack]);

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

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      fitView
      fitViewOptions={FIT_OPTIONS}
      colorMode={resolvedTheme === 'dark' ? 'dark' : 'light'}
      nodesDraggable={!locked}
      nodesConnectable={!locked}
      elementsSelectable={!locked}
      panOnDrag={!locked}
      zoomOnScroll={!locked}
      zoomOnPinch={!locked}
      zoomOnDoubleClick={false}
      deleteKeyCode={null}
      selectionKeyCode={null}
      proOptions={{ hideAttribution: true }}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={(connection) => setEdges((current) => addEdge({ ...connection, className: 'poseforge-edge' }, current))}
      isValidConnection={isValidConnection}
      onMove={(_, nextViewport) => setViewport(nextViewport)}
      onNodeClick={(_, node) => {
        if (node.data.kind === 'character') {
          const id = node.id.replace(/^character-/, '');
          if (id !== 'empty') onSelectSubject?.(id);
        } else if (node.data.kind === 'result') {
          node.data.onSelectResult?.();
        }
      }}
      onNodeDragStart={() => {
        dragSnapshot.current = nodePositions(nodes);
      }}
      onNodeDragStop={() => {
        const before = dragSnapshot.current;
        dragSnapshot.current = null;
        if (!before || samePositions(before, nodePositions(nodes))) return;
        setUndoStack((history) => [...history.slice(-19), before]);
        setRedoStack([]);
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('application/x-poseforge-pose')) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(event) => {
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
        onToggleLock={() => setLocked((current) => !current)}
        onUndo={undo}
        onRedo={redo}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onTidy={tidy}
      />
      <DrawerPalette
        subjects={subjects}
        suggestions={poseSuggestions}
        suggestionsLoading={suggestionsLoading}
        selectedSuggestionIds={selectedSuggestionIds}
        onOpenSources={onOpenSources}
        onToggleSuggestion={onToggleSuggestion}
      />
    </ReactFlow>
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

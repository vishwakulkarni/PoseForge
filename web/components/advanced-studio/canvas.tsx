'use client';

import * as React from 'react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore,
  type Connection,
  type Edge,
  type EdgeChange,
  type FinalConnectionState,
  type NodeChange,
  type Viewport,
} from '@xyflow/react';
import { useTheme } from 'next-themes';
import { X } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { api } from '@/lib/api/client';
import { nodeDefinition, nodeTypesAcceptingInput } from '@/lib/advanced-studio/registry';
import { connectionProblem, edgeDataType, type GraphNodeLike } from '@/lib/advanced-studio/validation';
import { resolveInputs } from '@/lib/advanced-studio/resolve-inputs';
import { snapToNeighbours, upstreamOf, type SnapGuide } from '@/lib/advanced-studio/canvas-focus';
import {
  INTERNAL_CLIPBOARD_MARK,
  frameAround,
  mediaKindOf,
  splitTextBlocks,
} from '@/lib/advanced-studio/canvas-input';
import {
  documentToFlow,
  flowToDocument,
  nextLabelIndex,
  type AdvFlowEdge,
  type AdvFlowNode,
} from '@/lib/advanced-studio/document';
import type {
  AdvDataType,
  AdvEngineCapability,
  AdvNodeType,
  AdvProject,
} from '@/lib/advanced-studio/types';
import type { CharacterSummary, HiggsfieldEstimate, HiggsfieldEstimateRequest } from '@/lib/api/types';
import { AdvNodeActionsContext, type AdvNodeActions } from './node-context';
import { AdvNodeShell } from './node-shell';
import { AddNodeMenu } from './add-node-menu';
import { AdvToolbar } from './toolbar';
import { AdvCuttableEdge } from './cuttable-edge';
import { AdvSelectionToolbar } from './selection-toolbar';
import { AdvCanvasControls, type AdvCanvasTool } from './canvas-controls';
import { ShortcutsDialog } from './shortcuts-dialog';
import type { AdvSaveState } from '@/lib/advanced-studio/use-advanced-workspace';

/** One shell handles every node type; the registry decides what it renders.
 * Declared at module scope so React Flow never sees a new object identity. */
const NODE_TYPES = {
  text: AdvNodeShell,
  imageInput: AdvNodeShell,
  videoInput: AdvNodeShell,
  audioInput: AdvNodeShell,
  imageGenerator: AdvNodeShell,
  videoGenerator: AdvNodeShell,
  group: AdvNodeShell,
} as const;

const EDGE_TYPES = { adv: AdvCuttableEdge } as const;
const DEFAULT_EDGE_OPTIONS = { type: 'adv' } as const;

const HISTORY_LIMIT = 30;
const PASTE_OFFSET = 36;
/** Snap distance in screen pixels; converted to flow units by the zoom. */
const SNAP_THRESHOLD_PX = 6;
const FOCUS_CLASS = /\s*adv-focus-\w+/g;

/** Replaces any focus classes on `base` with `add`. The derived nodes and edges
 * handed to React Flow are what `flow.getNodes()` returns, so history and copy
 * snapshots can carry stale focus classes that must never accumulate. */
function withFocusClasses(base: string | undefined, add: string[]): string | undefined {
  const cleaned = (base ?? '').replace(FOCUS_CLASS, '').trim();
  const next = [cleaned, ...add].filter(Boolean).join(' ');
  return next || undefined;
}

interface CanvasProps {
  project: AdvProject;
  capabilities: AdvEngineCapability[];
  characters?: CharacterSummary[];
  saveState: AdvSaveState;
  onSave: (document: ReturnType<typeof flowToDocument>, name?: string) => void;
  onRetry: () => void;
  onRunNode: (nodeId: string) => Promise<AdvProject | null>;
  onEstimateCost?: (request: HiggsfieldEstimateRequest) => Promise<HiggsfieldEstimate | null>;
}

interface HistoryEntry {
  nodes: AdvFlowNode[];
  edges: AdvFlowEdge[];
}

const noEstimate = async () => null;

function AdvCanvasInner({
  project, capabilities, characters = [], saveState, onSave, onRetry, onRunNode, onEstimateCost = noEstimate,
}: CanvasProps) {
  const flow = useReactFlow<AdvFlowNode, AdvFlowEdge>();
  const { resolvedTheme } = useTheme();
  const toast = useToast();
  const [nodes, setNodes, onNodesChange] = useNodesState<AdvFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<AdvFlowEdge>([]);
  const [name, setName] = React.useState(project.name);
  const [addMenu, setAddMenu] = React.useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null);
  const [addMenuDocked, setAddMenuDocked] = React.useState(false);
  // Set when the add-node menu was opened by dropping a dragged connection on
  // empty canvas, so picking a type both creates the node and completes the
  // connection instead of leaving it disconnected.
  const [pendingConnection, setPendingConnection] = React.useState<{
    nodeId: string;
    handleId: string;
    dataType: AdvDataType;
  } | null>(null);
  const [minimap, setMinimap] = React.useState(false);
  const [tool, setTool] = React.useState<AdvCanvasTool>('select');
  const [spacePanning, setSpacePanning] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [locked, setLocked] = React.useState(project.document.locked);
  const [zoomPercent, setZoomPercent] = React.useState(100);
  const [runningNodeIds, setRunningNodeIds] = React.useState<Set<string>>(() => new Set());
  const [preview, setPreview] = React.useState<{ url: string; mediaKind: 'image' | 'video' } | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<{ id: string; label: string; members: number } | null>(null);
  const [snapGuides, setSnapGuides] = React.useState<SnapGuide[]>([]);
  const [arranging, setArranging] = React.useState(false);
  const arrangeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // The scene a dragged node would join if dropped now; drives the preview ring.
  const [dropGroupId, setDropGroupId] = React.useState<string | null>(null);
  const boxSelecting = useStore((state) => state.userSelectionActive);

  const viewportRef = React.useRef<Viewport | null>(null);
  // Hydration is tracked in state, not a ref: the save effect must not run
  // until the commit in which the hydrated nodes are actually applied, or it
  // would persist the empty pre-hydration graph over a real project.
  const [hydratedId, setHydratedId] = React.useState<string | null>(null);
  const undoRef = React.useRef<HistoryEntry[]>([]);
  const redoRef = React.useRef<HistoryEntry[]>([]);
  const clipboardRef = React.useRef<HistoryEntry | null>(null);
  const groupPositionsRef = React.useRef<Map<string, { x: number; y: number }>>(new Map());
  // Last snapped position of the node being dragged. React Flow's drop change
  // carries the raw pointer position, so the snap has to be re-applied there.
  const snapTargetRef = React.useRef<{ id: string; x: number; y: number } | null>(null);
  // Tagged with the project id so switching projects invalidates the depth
  // without the hydration effect having to write state.
  const [historyDepth, setHistoryDepth] = React.useState({ id: '', undo: 0, redo: 0 });
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  const capabilityMap = React.useMemo(
    () => new Map(capabilities.map((engine) => [engine.key, engine])),
    [capabilities],
  );

  /* ------------------------------------------------------------- hydration */

  // Hydrate during render rather than in an effect: React applies this in the
  // same commit, so the save effect below never observes the empty graph that
  // precedes hydration (which would persist an empty document over the real
  // project). https://react.dev/reference/react/useState#storing-information-from-previous-renders
  if (hydratedId !== project.id) {
    const hydrated = documentToFlow(project.document);
    setNodes(hydrated.nodes);
    setEdges(hydrated.edges);
    setName(project.name);
    setLocked(project.document.locked);
    setHydratedId(project.id);
  }

  // Viewport restoration is a side effect on an external system (the React Flow
  // instance) and has to wait until the hydrated nodes are measured.
  React.useEffect(() => {
    if (hydratedId !== project.id) return;
    // Undo history belongs to the project that was open; clear it here, where
    // refs may be written, rather than during render.
    undoRef.current = [];
    redoRef.current = [];
    viewportRef.current = project.document.viewport;
    const frame = requestAnimationFrame(() => {
      if (project.document.viewport) {
        flow.setViewport(project.document.viewport, { duration: 0 });
        setZoomPercent(Math.round(project.document.viewport.zoom * 100));
      } else {
        flow.fitView({ padding: 0.2, duration: 0 });
        setZoomPercent(Math.round(flow.getZoom() * 100));
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [flow, hydratedId, project.document.viewport, project.id]);

  /* ------------------------------------------------------- focus styling */

  // Selecting nodes spotlights everything that feeds them and dims the rest.
  // Derived at render so the classes never enter the saved document, and
  // suspended during box-select where the selection changes every frame.
  const selectedKey = nodes.filter((node) => node.selected).map((node) => node.id).join('|');
  const focus = React.useMemo(() => {
    const selectedIds = new Set(selectedKey ? selectedKey.split('|') : []);
    const spotlight = !boxSelecting && [...selectedIds].some((id) => flow.getNode(id)?.type !== 'group');
    return spotlight ? { selectedIds, ...upstreamOf(selectedIds, edges) } : null;
  }, [boxSelecting, edges, flow, selectedKey]);

  const displayNodes = React.useMemo(() => nodes.map((node) => {
    const classes: string[] = [];
    if (focus && node.type !== 'group' && !focus.selectedIds.has(node.id)) {
      classes.push(focus.nodeIds.has(node.id) ? 'adv-focus-upstream' : 'adv-focus-dim');
    }
    if (node.id === dropGroupId) classes.push('adv-focus-drop');
    const className = withFocusClasses(node.className, classes);
    return className === node.className ? node : { ...node, className };
  }), [dropGroupId, focus, nodes]);

  const displayEdges = React.useMemo(() => edges.map((edge) => {
    const dim = focus && !focus.edgeIds.has(edge.id)
      && !(focus.selectedIds.has(edge.source) && focus.selectedIds.has(edge.target));
    const className = withFocusClasses(edge.className, dim ? ['adv-focus-dim'] : []);
    return className === edge.className ? edge : { ...edge, className };
  }), [edges, focus]);

  /* ------------------------------------------------------------ persistence */

  const persist = React.useCallback((
    nextNodes: AdvFlowNode[],
    nextEdges: AdvFlowEdge[],
    nextName = name,
  ) => {
    onSave(
      flowToDocument(nextNodes, nextEdges, viewportRef.current, project.document.template, locked),
      nextName,
    );
  }, [locked, name, onSave, project.document.template]);

  // Persisting from an effect (rather than from each mutation) means every
  // path — drag, resize, connect, undo, paste — is saved without each one
  // remembering to call save. It is deliberately keyed on the graph alone:
  // depending on `persist` would re-run whenever the parent hands down a new
  // callback identity, which turns each save's response into another save.
  const persistRef = React.useRef(persist);
  React.useEffect(() => { persistRef.current = persist; });
  React.useEffect(() => {
    if (hydratedId !== project.id) return;
    persistRef.current(nodes, edges);
  }, [edges, hydratedId, nodes, project.id]);

  /* --------------------------------------------------------------- history */

  const pushHistory = React.useCallback(() => {
    undoRef.current = [...undoRef.current, { nodes: flow.getNodes(), edges: flow.getEdges() }].slice(-HISTORY_LIMIT);
    redoRef.current = [];
    setHistoryDepth({ id: project.id, undo: undoRef.current.length, redo: 0 });
  }, [flow, project.id]);

  const undo = React.useCallback(() => {
    const previous = undoRef.current[undoRef.current.length - 1];
    if (!previous) return;
    undoRef.current = undoRef.current.slice(0, -1);
    redoRef.current = [...redoRef.current, { nodes: flow.getNodes(), edges: flow.getEdges() }].slice(-HISTORY_LIMIT);
    setNodes(previous.nodes);
    setEdges(previous.edges);
    setHistoryDepth({ id: project.id, undo: undoRef.current.length, redo: redoRef.current.length });
  }, [flow, project.id, setEdges, setNodes]);

  const redo = React.useCallback(() => {
    const next = redoRef.current[redoRef.current.length - 1];
    if (!next) return;
    redoRef.current = redoRef.current.slice(0, -1);
    undoRef.current = [...undoRef.current, { nodes: flow.getNodes(), edges: flow.getEdges() }].slice(-HISTORY_LIMIT);
    setNodes(next.nodes);
    setEdges(next.edges);
    setHistoryDepth({ id: project.id, undo: undoRef.current.length, redo: redoRef.current.length });
  }, [flow, project.id, setEdges, setNodes]);

  /* ------------------------------------------------------ node mutations */

  const graphNodes = React.useCallback((): GraphNodeLike[] =>
    flow.getNodes().map((node) => ({
      id: node.id,
      type: (node.type ?? 'text') as AdvNodeType,
      data: node.data,
    })), [flow]);

  const applyNodeData = React.useCallback((id: string, patch: Record<string, unknown>) => {
    setNodes((current) => current.map((node) => (
      node.id === id ? { ...node, data: { ...node.data, ...patch } } : node
    )));
  }, [setNodes]);

  const updateNodeData = React.useCallback((id: string, patch: Record<string, unknown>) => {
    pushHistory();
    applyNodeData(id, patch);
  }, [applyNodeData, pushHistory]);

  const renameNode = React.useCallback((id: string, label: string) => {
    pushHistory();
    applyNodeData(id, { label });
  }, [applyNodeData, pushHistory]);

  const addNode = React.useCallback((type: AdvNodeType, position: { x: number; y: number }) => {
    pushHistory();
    const definition = nodeDefinition(type);
    const id = `${type}-${crypto.randomUUID().slice(0, 8)}`;
    setNodes((current) => {
      const label = definition.defaultLabel(nextLabelIndex(current, type));
      const created: AdvFlowNode = {
        id,
        type,
        position,
        width: definition.geometry.width,
        height: definition.geometry.height,
        zIndex: type === 'group' ? -1 : 0,
        selected: true,
        data: { ...definition.defaultData(), label },
      } as AdvFlowNode;
      return [...current.map((node) => ({ ...node, selected: false })), created];
    });
    return id;
  }, [pushHistory, setNodes]);

  const removeNode = React.useCallback((id: string) => {
    const node = flow.getNode(id);
    const members = node?.type === 'group' ? ((node.data as { memberIds?: string[] }).memberIds?.length ?? 0) : 0;
    if (members > 0) {
      setPendingDelete({ id, label: node?.data.label ?? 'this group', members });
      return;
    }
    pushHistory();
    setNodes((current) => current
      .filter((item) => item.id !== id)
      .map((item) => (item.type === 'group'
        ? { ...item, data: { ...item.data, memberIds: ((item.data as { memberIds?: string[] }).memberIds ?? []).filter((memberId) => memberId !== id) } }
        : item)));
    setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id));
  }, [flow, pushHistory, setEdges, setNodes]);

  const duplicateNode = React.useCallback((id: string) => {
    const node = flow.getNode(id);
    if (!node) return;
    pushHistory();
    const type = (node.type ?? 'text') as AdvNodeType;
    const definition = nodeDefinition(type);
    setNodes((current) => {
      const copy: AdvFlowNode = {
        ...node,
        id: `${type}-${crypto.randomUUID().slice(0, 8)}`,
        position: { x: node.position.x + PASTE_OFFSET, y: node.position.y + PASTE_OFFSET },
        selected: true,
        data: {
          ...node.data,
          label: definition.defaultLabel(nextLabelIndex(current, type)),
          // A duplicate starts clean: results belong to the run that made them.
          ...(definition.generative ? { results: [], activeResultIndex: 0, status: 'idle', error: undefined } : {}),
          ...(type === 'group' ? { memberIds: [] } : {}),
        },
      } as AdvFlowNode;
      return [...current.map((item) => ({ ...item, selected: false })), copy];
    });
  }, [flow, pushHistory, setNodes]);

  const disconnectNode = React.useCallback((id: string) => {
    if (!flow.getEdges().some((edge) => edge.source === id || edge.target === id)) return;
    pushHistory();
    setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id));
  }, [flow, pushHistory, setEdges]);

  const resizeNode = React.useCallback((id: string, preset: 'smaller' | 'default' | 'larger') => {
    const source = flow.getNode(id);
    if (!source) return;
    const type = (source.type ?? 'text') as AdvNodeType;
    const limits = nodeDefinition(type).geometry;
    const currentWidth = source.width ?? limits.width;
    const currentHeight = source.height ?? limits.height;
    const factor = preset === 'smaller' ? 0.8 : preset === 'larger' ? 1.2 : 1;
    const width = preset === 'default'
      ? limits.width
      : Math.min(limits.maxWidth, Math.max(limits.minWidth, Math.round(currentWidth * factor)));
    const height = preset === 'default'
      ? limits.height
      : Math.min(limits.maxHeight, Math.max(limits.minHeight, Math.round(currentHeight * factor)));
    pushHistory();
    setNodes((current) => current.map((node) => node.id === id ? {
      ...node,
      width,
      height,
      style: { ...node.style, width, height },
      data: { ...node.data, collapsed: false, expandedWidth: width, expandedHeight: height },
    } : node));
  }, [flow, pushHistory, setNodes]);

  const toggleNodeCollapse = React.useCallback((id: string) => {
    const source = flow.getNode(id);
    if (!source || source.type === 'group') return;
    const type = (source.type ?? 'text') as AdvNodeType;
    const limits = nodeDefinition(type).geometry;
    const collapsed = source.data.collapsed === true;
    const currentWidth = source.width ?? limits.width;
    const currentHeight = source.height ?? limits.height;
    const width = collapsed
      ? Number(source.data.expandedWidth) || limits.width
      : Math.max(limits.minWidth, Math.min(currentWidth, 360));
    const height = collapsed ? Number(source.data.expandedHeight) || limits.height : 68;
    pushHistory();
    setNodes((current) => current.map((node) => node.id === id ? {
      ...node,
      width,
      height,
      style: { ...node.style, width, height },
      data: {
        ...node.data,
        collapsed: !collapsed,
        ...(!collapsed ? { expandedWidth: currentWidth, expandedHeight: currentHeight } : {}),
      },
    } : node));
  }, [flow, pushHistory, setNodes]);

  const toggleImageFit = React.useCallback((id: string) => {
    const source = flow.getNode(id);
    if (source?.type !== 'imageInput') return;
    updateNodeData(id, { imageFit: source.data.imageFit === 'fit' ? 'fill' : 'fit' });
  }, [flow, updateNodeData]);

  const connectionCountFor = React.useCallback((id: string) => (
    flow.getEdges().filter((edge) => edge.source === id || edge.target === id).length
  ), [flow]);

  /* ---------------------------------------------------------- connections */

  const onConnect = React.useCallback((connection: Connection) => {
    const problem = connectionProblem(connection, graphNodes(), flow.getEdges(), capabilityMap);
    if (problem) {
      toast.error(problem);
      return;
    }
    pushHistory();
    const dataType = edgeDataType(graphNodes(), connection, capabilityMap);
    setEdges((current) => addEdge({
      ...connection,
      id: `e-${connection.source}-${connection.sourceHandle ?? 'out'}-${connection.target}-${connection.targetHandle ?? 'in'}`,
      data: { dataType },
      className: `adv-edge adv-edge-${dataType}`,
    }, current));
  }, [capabilityMap, flow, graphNodes, pushHistory, setEdges, toast]);

  const isValidConnection = React.useCallback((connection: Connection | Edge) => (
    connectionProblem(
      {
        source: connection.source,
        sourceHandle: connection.sourceHandle ?? null,
        target: connection.target,
        targetHandle: connection.targetHandle ?? null,
      },
      graphNodes(),
      flow.getEdges(),
      capabilityMap,
    ) === null
  ), [capabilityMap, flow, graphNodes]);

  // While dragging a connection, mark the pane with the dragged type so CSS can
  // highlight compatible handles and mute the rest.
  const onConnectStart = React.useCallback((_event: unknown, params: { nodeId: string | null; handleId: string | null; handleType: string | null }) => {
    const node = params.nodeId ? flow.getNode(params.nodeId) : null;
    if (!node) return;
    const definition = nodeDefinition((node.type ?? 'text') as AdvNodeType);
    // Generic over every node type; see node-shell for the same boundary.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handles = definition.handles(node.data as any, capabilityMap.get((node.data as { engine?: string }).engine ?? ''));
    const list = params.handleType === 'source' ? handles.outputs : handles.inputs;
    const handle = list.find((item) => item.id === params.handleId) ?? list[0];
    if (handle) wrapperRef.current?.setAttribute('data-connecting-type', handle.dataType);
  }, [capabilityMap, flow]);

  // Dropping a dragged connection on empty canvas creates a node instead of
  // just cancelling. From an unconnected *input* the target type is implied
  // by its data type (text -> Prompt, image -> Image), so the node is created
  // and wired immediately. From an *output*, several node types could be a
  // legal target, so the add-node menu opens (filtered to compatible types)
  // and the connection completes once one is chosen.
  const onConnectEnd = React.useCallback((event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    wrapperRef.current?.removeAttribute('data-connecting-type');
    if (locked || state.toNode || !state.fromNode || !state.fromHandle) return;
    const point = 'changedTouches' in event ? event.changedTouches[0] : event;
    if (!point) return;
    const bounds = wrapperRef.current?.getBoundingClientRect();
    const flowPosition = flow.screenToFlowPosition({ x: point.clientX, y: point.clientY });
    const fromNode = state.fromNode;
    const fromHandle = state.fromHandle;
    const definition = nodeDefinition((fromNode.type ?? 'text') as AdvNodeType);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handles = definition.handles(fromNode.data as any, capabilityMap.get((fromNode.data as { engine?: string }).engine ?? ''));

    if (fromHandle.type === 'target') {
      const handle = handles.inputs.find((item) => item.id === fromHandle.id) ?? handles.inputs[0];
      const inputNodeFor: Record<AdvDataType, AdvNodeType> = { text: 'text', image: 'imageInput', video: 'videoInput', audio: 'audioInput' };
      const newType: AdvNodeType | null = handle ? inputNodeFor[handle.dataType] : null;
      if (!handle || !newType) return;
      const geometry = nodeDefinition(newType).geometry;
      pushHistory();
      const newId = `${newType}-${crypto.randomUUID().slice(0, 8)}`;
      const newDefinition = nodeDefinition(newType);
      const label = newDefinition.defaultLabel(nextLabelIndex(flow.getNodes(), newType));
      const outputHandleId = newDefinition.handles(newDefinition.defaultData(), undefined).outputs[0]?.id;
      setNodes((current) => [
        ...current.map((item) => ({ ...item, selected: false })),
        {
          id: newId,
          type: newType,
          position: { x: flowPosition.x - geometry.width - 64, y: flowPosition.y - geometry.height / 2 },
          width: geometry.width,
          height: geometry.height,
          selected: true,
          data: { ...newDefinition.defaultData(), label },
        } as AdvFlowNode,
      ]);
      if (outputHandleId) {
        setEdges((current) => addEdge({
          source: newId,
          sourceHandle: outputHandleId,
          target: fromNode.id,
          targetHandle: fromHandle.id,
          id: `e-${newId}-${outputHandleId}-${fromNode.id}-${fromHandle.id}`,
          data: { dataType: handle.dataType },
          className: `adv-edge adv-edge-${handle.dataType}`,
        }, current));
      }
      return;
    }

    const handle = handles.outputs.find((item) => item.id === fromHandle.id) ?? handles.outputs[0];
    if (!handle) return;
    setAddMenuDocked(false);
    setPendingConnection({ nodeId: fromNode.id, handleId: handle.id, dataType: handle.dataType });
    setAddMenu({
      x: point.clientX - (bounds?.left ?? 0),
      y: point.clientY - (bounds?.top ?? 0),
      flowX: flowPosition.x,
      flowY: flowPosition.y,
    });
  }, [capabilityMap, flow, locked, pushHistory, setEdges, setNodes]);

  /* --------------------------------------------------- group drag handling */

  /** Aligns a single dragged node to its neighbours and records the guide
   * lines. Multi-node drags and group frames are left alone: snapping each
   * node independently would break their relative layout. */
  const snapDraggedNode = React.useCallback((changes: NodeChange<AdvFlowNode>[]): NodeChange<AdvFlowNode>[] => {
    const clearGuides = () => setSnapGuides((current) => (current.length ? [] : current));
    const dropped = changes.find((change) => change.type === 'position' && change.dragging === false);
    if (dropped?.type === 'position') {
      const target = snapTargetRef.current;
      snapTargetRef.current = null;
      clearGuides();
      return target && target.id === dropped.id
        ? changes.map((change) => (change === dropped ? { ...dropped, position: { x: target.x, y: target.y } } : change))
        : changes;
    }
    const dragging = changes.filter((change) => change.type === 'position' && change.dragging && change.position);
    if (!dragging.length) return changes;
    const change = dragging[0];
    const node = change.type === 'position' ? flow.getNode(change.id) : undefined;
    if (dragging.length > 1 || change.type !== 'position' || !change.position || !node || node.type === 'group') {
      snapTargetRef.current = null;
      clearGuides();
      return changes;
    }
    const rectOf = (item: AdvFlowNode, x: number, y: number) => ({
      x,
      y,
      width: item.measured?.width ?? item.width ?? 0,
      height: item.measured?.height ?? item.height ?? 0,
    });
    const others = flow.getNodes()
      .filter((item) => item.id !== node.id && item.type !== 'group')
      .map((item) => rectOf(item, item.position.x, item.position.y));
    const snapped = snapToNeighbours(
      rectOf(node, change.position.x, change.position.y),
      others,
      SNAP_THRESHOLD_PX / flow.getZoom(),
    );
    snapTargetRef.current = snapped.guides.length ? { id: node.id, x: snapped.x, y: snapped.y } : null;
    setSnapGuides(snapped.guides);
    return changes.map((item) => (item === change ? { ...change, position: { x: snapped.x, y: snapped.y } } : item));
  }, [flow]);

  /** Groups are frames, not React Flow parents: moving one applies the same
   * delta to its members so relative positions are preserved without the
   * clipping that parenting would introduce. */
  const handleNodesChange = React.useCallback((incoming: NodeChange<AdvFlowNode>[]) => {
    const changes = snapDraggedNode(incoming);
    const extra: NodeChange<AdvFlowNode>[] = [];
    for (const change of changes) {
      if (change.type !== 'position' || !change.position) continue;
      const node = flow.getNode(change.id);
      if (node?.type !== 'group') continue;
      const previous = groupPositionsRef.current.get(change.id) ?? node.position;
      const dx = change.position.x - previous.x;
      const dy = change.position.y - previous.y;
      groupPositionsRef.current.set(change.id, { ...change.position });
      if (!dx && !dy) continue;
      const memberIds = (node.data as { memberIds?: string[] }).memberIds ?? [];
      for (const memberId of memberIds) {
        const member = flow.getNode(memberId);
        if (!member) continue;
        extra.push({
          id: memberId,
          type: 'position',
          position: { x: member.position.x + dx, y: member.position.y + dy },
          dragging: change.dragging,
        });
      }
    }
    onNodesChange(extra.length ? [...changes, ...extra] : changes);
  }, [flow, onNodesChange, snapDraggedNode]);

  const handleEdgesChange = React.useCallback((changes: EdgeChange<AdvFlowEdge>[]) => {
    if (changes.some((change) => change.type === 'remove')) pushHistory();
    onEdgesChange(changes);
  }, [onEdgesChange, pushHistory]);

  const onNodeDragStart = React.useCallback((_event: unknown, node: AdvFlowNode) => {
    pushHistory();
    if (node.type === 'group') groupPositionsRef.current.set(node.id, { ...node.position });
  }, [pushHistory]);

  /** Previews the scene a dragged node would join, using the same containment
   * test as the drop, so the highlight never disagrees with the result. */
  const onNodeDrag = React.useCallback((_event: unknown, node: AdvFlowNode) => {
    if (node.type === 'group') return;
    const target = flow.getNodes().find((candidate) => candidate.type === 'group' && contains(candidate, node));
    setDropGroupId(target?.id ?? null);
  }, [flow]);

  /** Membership is recomputed on drop from geometry, so a node joins a scene by
   * being dragged into it and leaves by being dragged out. */
  const onNodeDragStop = React.useCallback(() => {
    groupPositionsRef.current.clear();
    setDropGroupId(null);
    setNodes((current) => {
      const groups = current.filter((node) => node.type === 'group');
      if (!groups.length) return current;
      return current.map((node) => {
        if (node.type !== 'group') return node;
        const memberIds = current
          .filter((candidate) => candidate.id !== node.id && candidate.type !== 'group')
          .filter((candidate) => contains(node, candidate))
          .map((candidate) => candidate.id);
        const existing = (node.data as { memberIds?: string[] }).memberIds ?? [];
        if (existing.length === memberIds.length && existing.every((id, index) => id === memberIds[index])) return node;
        return { ...node, data: { ...node.data, memberIds } };
      });
    });
  }, [setNodes]);

  /* -------------------------------------------------------------- actions */

  const uploadImage = React.useCallback(async (id: string, file: File) => {
    const asset = await api.advancedStudio.uploadAsset(project.id, file);
    pushHistory();
    applyNodeData(id, {
      imageUrl: asset.url,
      characterId: undefined,
      fileName: asset.fileName,
      naturalWidth: asset.width ?? undefined,
      naturalHeight: asset.height ?? undefined,
    });
  }, [applyNodeData, project.id, pushHistory]);

  const clearImage = React.useCallback((id: string) => {
    pushHistory();
    applyNodeData(id, {
      imageUrl: undefined,
      characterId: undefined,
      fileName: undefined,
      naturalWidth: undefined,
      naturalHeight: undefined,
    });
  }, [applyNodeData, pushHistory]);

  const uploadMedia = React.useCallback(async (id: string, file: File) => {
    const asset = await api.advancedStudio.uploadMedia(project.id, file);
    pushHistory();
    applyNodeData(id, { mediaUrl: asset.url, fileName: asset.fileName });
  }, [applyNodeData, project.id, pushHistory]);

  const clearMedia = React.useCallback((id: string) => {
    pushHistory();
    applyNodeData(id, { mediaUrl: undefined, fileName: undefined });
  }, [applyNodeData, pushHistory]);

  const selectCharacter = React.useCallback((id: string, character: CharacterSummary) => {
    if (!character.primaryPhotoUrl) return;
    pushHistory();
    applyNodeData(id, {
      imageUrl: character.primaryPhotoUrl,
      characterId: character.id,
      fileName: character.name,
      naturalWidth: undefined,
      naturalHeight: undefined,
    });
  }, [applyNodeData, pushHistory]);

  const generate = React.useCallback(async (id: string) => {
    // Client-side half of the double-submit guard; the server refuses a second
    // concurrent run for the same node as well.
    if (runningNodeIds.has(id)) return;
    setRunningNodeIds((current) => new Set(current).add(id));
    // The spinner comes from `runningNodeIds`, which is local UI state — the
    // transient running status is deliberately NOT written into the document.
    // Writing it would queue an autosave during the generation, and the server
    // would then be racing its own client for the project's revision.
    if ((flow.getNode(id)?.data as { status?: string } | undefined)?.status === 'error') {
      applyNodeData(id, { status: 'idle', error: undefined });
    }
    try {
      const updated = await onRunNode(id);
      const node = updated?.document.nodes.find((item) => item.id === id);
      // Adopt the server's version of this node (results, status, metadata).
      // If the run returned nothing to adopt, clear the running state anyway so
      // the node never sticks on a spinner.
      applyNodeData(id, node ? (node.data as Record<string, unknown>) : { status: 'idle' });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'That generation failed.';
      applyNodeData(id, { status: 'error', error: message });
      toast.error(message);
    } finally {
      setRunningNodeIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }, [applyNodeData, flow, onRunNode, runningNodeIds, toast]);

  const resolveInputsFor = React.useCallback((id: string) => resolveInputs(
    id,
    flow.getNodes().map((node) => ({ id: node.id, type: (node.type ?? 'text') as AdvNodeType, data: node.data })),
    flow.getEdges().map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? undefined,
      targetHandle: edge.targetHandle ?? undefined,
    })),
  ), [flow]);

  const actions = React.useMemo<AdvNodeActions>(() => ({
    locked,
    projectId: project.id,
    capabilities,
    capabilityFor: (engine?: string) => (engine ? capabilityMap.get(engine) : undefined),
    runningNodeIds,
    characters,
    updateNodeData,
    renameNode,
    duplicateNode,
    removeNode,
    disconnectNode,
    resizeNode,
    toggleNodeCollapse,
    toggleImageFit,
    connectionCountFor,
    beginResize: pushHistory,
    generate: (id: string) => { void generate(id); },
    uploadImage,
    selectCharacter,
    clearImage,
    uploadMedia,
    clearMedia,
    openPreview: (url, mediaKind = 'image') => setPreview({ url, mediaKind }),
    resolveInputsFor,
    estimateCost: onEstimateCost,
  }), [
    capabilities, capabilityMap, characters, clearImage, clearMedia, connectionCountFor, disconnectNode, duplicateNode, generate, locked,
    onEstimateCost, project.id, pushHistory, removeNode, renameNode, resizeNode, resolveInputsFor, runningNodeIds, selectCharacter,
    toggleImageFit, toggleNodeCollapse, updateNodeData, uploadImage, uploadMedia,
  ]);

  /* ------------------------------------------------------------- shortcuts */

  /** Marks the OS clipboard as holding copied nodes so the paste handler can
   * tell them from text copied elsewhere. Best effort: without clipboard
   * access the paste simply falls back to the internal buffer. */
  const markClipboard = React.useCallback(() => {
    try {
      void navigator.clipboard?.writeText(INTERNAL_CLIPBOARD_MARK).catch(() => undefined);
    } catch {
      // Clipboard access can be refused; nothing depends on it.
    }
  }, []);

  const copySelection = React.useCallback(() => {
    const selected = flow.getNodes().filter((node) => node.selected);
    if (!selected.length) return;
    const ids = new Set(selected.map((node) => node.id));
    clipboardRef.current = {
      nodes: selected,
      edges: flow.getEdges().filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
    };
  }, [flow]);

  const pasteSelection = React.useCallback(() => {
    const clipboard = clipboardRef.current;
    if (!clipboard?.nodes.length) return;
    pushHistory();
    const idMap = new Map(clipboard.nodes.map((node) => [node.id, `${node.type}-${crypto.randomUUID().slice(0, 8)}`]));
    setNodes((current) => [
      ...current.map((node) => ({ ...node, selected: false })),
      ...clipboard.nodes.map((node) => ({
        ...node,
        id: idMap.get(node.id)!,
        position: { x: node.position.x + PASTE_OFFSET, y: node.position.y + PASTE_OFFSET },
        selected: true,
        data: {
          ...node.data,
          ...(node.type === 'group'
            ? { memberIds: ((node.data as { memberIds?: string[] }).memberIds ?? []).map((id) => idMap.get(id) ?? id) }
            : {}),
        },
      }) as AdvFlowNode),
    ]);
    setEdges((current) => [
      ...current,
      ...clipboard.edges.map((edge) => ({
        ...edge,
        id: `e-${idMap.get(edge.source)}-${idMap.get(edge.target)}-${crypto.randomUUID().slice(0, 6)}`,
        source: idMap.get(edge.source)!,
        target: idMap.get(edge.target)!,
      })),
    ]);
  }, [pushHistory, setEdges, setNodes]);

  const deleteSelection = React.useCallback(() => {
    const selectedNodes = flow.getNodes().filter((node) => node.selected);
    const selectedEdges = flow.getEdges().filter((edge) => edge.selected);
    if (!selectedNodes.length && !selectedEdges.length) return;
    const groupWithMembers = selectedNodes.find((node) =>
      node.type === 'group' && ((node.data as { memberIds?: string[] }).memberIds?.length ?? 0) > 0);
    if (groupWithMembers) {
      setPendingDelete({
        id: groupWithMembers.id,
        label: groupWithMembers.data.label,
        members: (groupWithMembers.data as { memberIds?: string[] }).memberIds?.length ?? 0,
      });
      return;
    }
    pushHistory();
    const nodeIds = new Set(selectedNodes.map((node) => node.id));
    const edgeIds = new Set(selectedEdges.map((edge) => edge.id));
    setNodes((current) => current.filter((node) => !nodeIds.has(node.id)));
    setEdges((current) => current.filter((edge) =>
      !edgeIds.has(edge.id) && !nodeIds.has(edge.source) && !nodeIds.has(edge.target)));
  }, [flow, pushHistory, setEdges, setNodes]);

  /** Packs nodes into a grid around the centre they already occupy, so an
   * arrange never throws the workflow somewhere the user has to hunt for. */
  const arrangeNodes = React.useCallback(() => {
    const all = flow.getNodes();
    const target = all.filter((node) => node.selected && node.type !== 'group');
    const subject = target.length > 1 ? target : all.filter((node) => node.type !== 'group');
    if (subject.length < 2) return;

    pushHistory();
    const gap = 48;
    const columnWidth = Math.max(...subject.map((node) => node.width ?? 320)) + gap;
    const rowHeight = Math.max(...subject.map((node) => node.height ?? 320)) + gap;
    const columns = Math.ceil(Math.sqrt(subject.length));
    const ordered = [...subject].sort((a, b) => (a.position.y - b.position.y) || (a.position.x - b.position.x));
    const centerX = subject.reduce((sum, node) => sum + node.position.x, 0) / subject.length;
    const centerY = subject.reduce((sum, node) => sum + node.position.y, 0) / subject.length;
    const rows = Math.ceil(ordered.length / columns);
    const originX = centerX - ((columns - 1) * columnWidth) / 2;
    const originY = centerY - ((rows - 1) * rowHeight) / 2;

    const positions = new Map(ordered.map((node, index) => [node.id, {
      x: Math.round(originX + (index % columns) * columnWidth),
      y: Math.round(originY + Math.floor(index / columns) * rowHeight),
    }]));
    // Nodes glide to their new cells; the class only lives for the animation so
    // ordinary drags stay immediate.
    if (arrangeTimerRef.current) clearTimeout(arrangeTimerRef.current);
    setArranging(true);
    arrangeTimerRef.current = setTimeout(() => setArranging(false), 420);
    setNodes((current) => current.map((node) => (
      positions.has(node.id) ? { ...node, position: positions.get(node.id)! } : node
    )));
  }, [flow, pushHistory, setNodes]);

  React.useEffect(() => () => {
    if (arrangeTimerRef.current) clearTimeout(arrangeTimerRef.current);
  }, []);

  /** Wraps the selected nodes in a new group frame. */
  const groupSelection = React.useCallback(() => {
    const members = flow.getNodes().filter((node) => node.selected && node.type !== 'group');
    if (members.length < 2) return;
    pushHistory();
    const definition = nodeDefinition('group');
    const frame = frameAround(
      members.map((node) => ({
        x: node.position.x,
        y: node.position.y,
        width: node.measured?.width ?? node.width ?? 0,
        height: node.measured?.height ?? node.height ?? 0,
      })),
      48,
      56,
    );
    setNodes((current) => {
      const created = {
        id: `group-${crypto.randomUUID().slice(0, 8)}`,
        type: 'group',
        position: { x: frame.x, y: frame.y },
        width: frame.width,
        height: frame.height,
        zIndex: -1,
        selected: false,
        data: {
          ...definition.defaultData(),
          label: definition.defaultLabel(nextLabelIndex(current, 'group')),
          memberIds: members.map((node) => node.id),
        },
      } as AdvFlowNode;
      return [created, ...current];
    });
  }, [flow, pushHistory, setNodes]);

  const canArrange = React.useMemo(
    () => nodes.filter((node) => node.type !== 'group').length > 1,
    [nodes],
  );

  const selectAll = React.useCallback(() => {
    setNodes((current) => current.map((node) => ({ ...node, selected: true })));
  }, [setNodes]);

  const clearSelection = React.useCallback(() => {
    setNodes((current) => (current.some((node) => node.selected)
      ? current.map((node) => ({ ...node, selected: false }))
      : current));
    setEdges((current) => (current.some((edge) => edge.selected)
      ? current.map((edge) => ({ ...edge, selected: false }))
      : current));
  }, [setEdges, setNodes]);

  /** Arrow-key nudge for the current selection. */
  const nudgeSelection = React.useCallback((dx: number, dy: number) => {
    const selected = flow.getNodes().filter((node) => node.selected);
    if (!selected.length) return;
    pushHistory();
    const ids = new Set(selected.map((node) => node.id));
    setNodes((current) => current.map((node) => (
      ids.has(node.id) ? { ...node, position: { x: node.position.x + dx, y: node.position.y + dy } } : node
    )));
  }, [flow, pushHistory, setNodes]);

  const toggleLock = React.useCallback(() => {
    setLocked((current) => {
      const next = !current;
      // Persist immediately: the lock is a deliberate action, not an edit that
      // should sit in the debounce window.
      onSave(flowToDocument(flow.getNodes(), flow.getEdges(), viewportRef.current, project.document.template, next), name);
      return next;
    });
  }, [flow, name, onSave, project.document.template]);

  const syncViewport = React.useCallback(() => {
    // React Flow's viewport transitions are animated; read the value back once
    // the animation has had a frame to apply.
    requestAnimationFrame(() => {
      const viewport = flow.getViewport();
      viewportRef.current = viewport;
      setZoomPercent(Math.round(viewport.zoom * 100));
    });
  }, [flow]);

  const openAddMenuDocked = React.useCallback(() => {
    if (locked) return;
    const bounds = wrapperRef.current?.getBoundingClientRect();
    const center = flow.screenToFlowPosition({
      x: (bounds?.left ?? 0) + (bounds?.width ?? 800) / 2,
      y: (bounds?.top ?? 0) + (bounds?.height ?? 600) / 2,
    });
    setAddMenuDocked(true);
    setAddMenu({ x: 0, y: 0, flowX: center.x, flowY: center.y });
  }, [flow, locked]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      const meta = event.metaKey || event.ctrlKey;

      // Escape is the one binding that works while typing: it is how you get
      // back out of a prompt editor and close whatever is open.
      if (event.key === 'Escape') {
        setAddMenu(null);
        setPreview(null);
        if (typing) (target as HTMLElement | null)?.blur();
        else clearSelection();
        return;
      }
      if (typing) return;

      // View — always available, including while the canvas is locked.
      if (meta && (event.key === '=' || event.key === '+')) { event.preventDefault(); void flow.zoomIn({ duration: 150 }); syncViewport(); return; }
      if (meta && event.key === '-') { event.preventDefault(); void flow.zoomOut({ duration: 150 }); syncViewport(); return; }
      if (meta && event.key === '0') { event.preventDefault(); void flow.zoomTo(1, { duration: 150 }); syncViewport(); return; }
      if (event.key === '1' && event.shiftKey) { event.preventDefault(); void flow.fitView({ padding: 0.2, duration: 200 }); syncViewport(); return; }
      if (event.key === '?' || (event.key === '/' && event.shiftKey)) { event.preventDefault(); setShortcutsOpen(true); return; }

      // Tools.
      if (event.key === 'v' && !meta) { setTool('select'); return; }
      if (event.key === 'h' && !meta) { setTool('hand'); return; }
      if (event.key === 'l' && !meta) { toggleLock(); return; }
      if (event.key === ' ' && !spacePanning) { setSpacePanning(true); return; }

      // Selection and history.
      if (meta && event.key.toLowerCase() === 'a') { event.preventDefault(); selectAll(); return; }
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if (meta && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
      if (meta && event.key.toLowerCase() === 'c') { copySelection(); markClipboard(); return; }

      // Everything below edits the graph, so it stops at the lock.
      if (locked) return;

      if (meta && event.key.toLowerCase() === 'x') {
        event.preventDefault();
        copySelection();
        markClipboard();
        deleteSelection();
        return;
      }
      if (meta && event.key.toLowerCase() === 'd') { event.preventDefault(); copySelection(); pasteSelection(); return; }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelection(); return; }
      if (event.key === 'A' && event.shiftKey && !meta) { event.preventDefault(); arrangeNodes(); return; }
      if (event.key === 'a' && !meta) { event.preventDefault(); openAddMenuDocked(); return; }
      if (event.key.startsWith('Arrow')) {
        const step = event.shiftKey ? 40 : 10;
        const delta = {
          ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0],
        }[event.key];
        if (delta) {
          event.preventDefault();
          nudgeSelection(delta[0], delta[1]);
        }
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ') setSpacePanning(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [
    arrangeNodes, clearSelection, copySelection, deleteSelection, flow, locked, markClipboard, nudgeSelection,
    openAddMenuDocked, pasteSelection, redo, selectAll, spacePanning, syncViewport, toggleLock, undo,
  ]);

  /* ------------------------------------------------------------- rendering */

  const openAddMenuAt = React.useCallback((clientX: number, clientY: number) => {
    const bounds = wrapperRef.current?.getBoundingClientRect();
    const position = flow.screenToFlowPosition({ x: clientX, y: clientY });
    setAddMenuDocked(false);
    setAddMenu({
      x: clientX - (bounds?.left ?? 0),
      y: clientY - (bounds?.top ?? 0),
      flowX: position.x,
      flowY: position.y,
    });
  }, [flow]);

  const centerOfViewport = React.useCallback(() => {
    const bounds = wrapperRef.current?.getBoundingClientRect();
    return flow.screenToFlowPosition({
      x: (bounds?.left ?? 0) + (bounds?.width ?? 800) / 2,
      y: (bounds?.top ?? 0) + (bounds?.height ?? 600) / 2,
    });
  }, [flow]);

  /* ------------------------------------------------- paste and file drop */

  /** Creates input nodes for files from the OS (paste or drop), centred on
   * `origin` and fanned out so several never stack exactly. */
  const addMediaFiles = React.useCallback((files: File[], origin: { x: number; y: number }) => {
    const accepted = files.flatMap((file) => {
      const kind = mediaKindOf(file);
      return kind ? [{ file, kind }] : [];
    });
    if (accepted.length < files.length) {
      toast.error(`${files.length - accepted.length} file${files.length - accepted.length === 1 ? ' was' : 's were'} skipped: only images, video and audio can be added.`);
    }
    accepted.forEach(({ file, kind }, index) => {
      const type: AdvNodeType = kind === 'image' ? 'imageInput' : kind === 'video' ? 'videoInput' : 'audioInput';
      const { width, height } = nodeDefinition(type).geometry;
      const id = addNode(type, {
        x: origin.x - width / 2 + index * PASTE_OFFSET,
        y: origin.y - height / 2 + index * PASTE_OFFSET,
      });
      const upload = kind === 'image' ? uploadImage(id, file) : uploadMedia(id, file);
      upload.catch((cause) => toast.error(cause instanceof Error ? cause.message : `That ${kind} could not be added.`));
    });
  }, [addNode, toast, uploadImage, uploadMedia]);

  /** One prompt node per blank-line-separated block of pasted text. */
  const addTextBlocks = React.useCallback((text: string, origin: { x: number; y: number }) => {
    const { blocks, dropped } = splitTextBlocks(text);
    const { width, height } = nodeDefinition('text').geometry;
    blocks.forEach((block, index) => {
      const id = addNode('text', {
        x: origin.x - width / 2 + index * PASTE_OFFSET,
        y: origin.y - height / 2 + index * PASTE_OFFSET,
      });
      applyNodeData(id, { text: block });
    });
    if (dropped) toast.error(`Added the first ${blocks.length} blocks; ${dropped} more were skipped.`);
  }, [addNode, applyNodeData, toast]);

  // Native paste, not a Cmd+V keydown: the event carries the OS clipboard, so
  // copied nodes, copied text and copied images all arrive through one path.
  // A paste while focus is inside a node (a prompt editor, an image dropzone)
  // belongs to that node.
  React.useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const typing = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.isContentEditable;
      if (locked || typing || active?.closest('.adv-node')) return;
      const data = event.clipboardData;
      const files = [...(data?.files ?? [])];
      const text = data?.getData('text/plain') ?? '';
      event.preventDefault();
      if (text === INTERNAL_CLIPBOARD_MARK) pasteSelection();
      else if (files.length) addMediaFiles(files, centerOfViewport());
      else if (text.trim()) addTextBlocks(text, centerOfViewport());
      else pasteSelection();
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [addMediaFiles, addTextBlocks, centerOfViewport, locked, pasteSelection]);

  return (
    <div className="adv-shell">
      <AdvToolbar
        name={name}
        saveState={saveState}
        onRename={(nextName) => {
          setName(nextName);
          persist(flow.getNodes(), flow.getEdges(), nextName);
        }}
        onRetry={onRetry}
        onAddNode={openAddMenuDocked}
        locked={locked}
        minimap={minimap}
        onToggleMinimap={() => setMinimap((current) => !current)}
        onShowShortcuts={() => setShortcutsOpen(true)}
      />

      <div
        className="adv-canvas"
        ref={wrapperRef}
        data-tool={spacePanning ? 'hand' : tool}
        data-locked={locked ? 'true' : undefined}
        data-arranging={arranging ? 'true' : undefined}
        onDragOver={(event) => {
          if (!locked && event.dataTransfer.types.includes('Files')) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }
        }}
        // A node's own dropzone handles (and cancels) drops onto it; only drops
        // on bare canvas or non-dropzone nodes create new nodes.
        onDrop={(event) => {
          if (locked || event.defaultPrevented) return;
          const files = [...event.dataTransfer.files];
          if (!files.length) return;
          event.preventDefault();
          addMediaFiles(files, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
        }}
        // Bound on the wrapper rather than React Flow's pane so a right-click
        // anywhere that is not a node opens the picker, including the gaps
        // between a group frame and its members.
        onContextMenu={(event) => {
          if ((event.target as HTMLElement).closest('.adv-node')) return;
          event.preventDefault();
          if (!locked) openAddMenuAt(event.clientX, event.clientY);
        }}
      >
        <AdvNodeActionsContext.Provider value={actions}>
        <ReactFlow<AdvFlowNode, AdvFlowEdge>
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          isValidConnection={isValidConnection}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onMoveEnd={(_event, viewport) => {
            viewportRef.current = viewport;
            setZoomPercent(Math.round(viewport.zoom * 100));
            persist(flow.getNodes(), flow.getEdges());
          }}
          onPaneClick={() => setAddMenu(null)}
          colorMode={resolvedTheme === 'dark' ? 'dark' : 'light'}
          minZoom={0.1}
          maxZoom={3}
          panOnScroll
          // The hand tool (or a held space bar) pans with a left drag; the
          // select tool keeps left-drag for box selection and pans with the
          // middle or right button, which is what a trackpad user expects.
          selectionOnDrag={tool === 'select' && !spacePanning}
          panOnDrag={tool === 'hand' || spacePanning ? [0, 1, 2] : [1, 2]}
          zoomOnDoubleClick={false}
          deleteKeyCode={null}
          multiSelectionKeyCode="Shift"
          proOptions={{ hideAttribution: true }}
          edgesReconnectable={!locked}
          nodesDraggable={!locked}
          nodesConnectable={!locked}
          elementsSelectable
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1.4} color="var(--pf-adv-dot)" />
          <AdvCanvasControls
            tool={tool}
            onToolChange={setTool}
            zoom={zoomPercent / 100}
            onViewportChange={syncViewport}
            locked={locked}
            onToggleLock={toggleLock}
            onUndo={undo}
            onRedo={redo}
            canUndo={historyDepth.id === project.id && historyDepth.undo > 0}
            canRedo={historyDepth.id === project.id && historyDepth.redo > 0}
            onArrange={arrangeNodes}
            canArrange={canArrange}
            onAddNode={openAddMenuDocked}
            onShowShortcuts={() => setShortcutsOpen(true)}
          />
          {minimap ? <MiniMap pannable zoomable className="adv-minimap" /> : null}
          <AdvSelectionToolbar
            nodes={nodes}
            disabled={locked}
            onArrange={arrangeNodes}
            onGroup={groupSelection}
            onDuplicate={() => { copySelection(); pasteSelection(); }}
            onDelete={deleteSelection}
          />
          {snapGuides.length ? (
            <ViewportPortal>
              {snapGuides.map((guide) => (
                <div
                  key={guide.axis}
                  className={`adv-snap-guide adv-snap-guide-${guide.axis}`}
                  style={guide.axis === 'x' ? { left: guide.position } : { top: guide.position }}
                  aria-hidden
                />
              ))}
            </ViewportPortal>
          ) : null}
        </ReactFlow>
        </AdvNodeActionsContext.Provider>

        <AddNodeMenu
          key={addMenu ? 'add-menu-open' : 'add-menu-closed'}
          open={Boolean(addMenu)}
          anchor={addMenuDocked || !addMenu ? null : { x: addMenu.x, y: addMenu.y }}
          restrictToTypes={pendingConnection ? nodeTypesAcceptingInput(pendingConnection.dataType) : null}
          onClose={() => { setAddMenu(null); setPendingConnection(null); }}
          onSelect={(type) => {
            const position = addMenuDocked ? centerOfViewport() : { x: addMenu!.flowX, y: addMenu!.flowY };
            const newId = addNode(type, position);
            if (pendingConnection) {
              const newHandles = nodeDefinition(type).handles(nodeDefinition(type).defaultData(), undefined);
              const targetHandle = newHandles.inputs.find((input) => input.dataType === pendingConnection.dataType);
              if (targetHandle) {
                setEdges((current) => addEdge({
                  source: pendingConnection.nodeId,
                  sourceHandle: pendingConnection.handleId,
                  target: newId,
                  targetHandle: targetHandle.id,
                  id: `e-${pendingConnection.nodeId}-${pendingConnection.handleId}-${newId}-${targetHandle.id}`,
                  data: { dataType: pendingConnection.dataType },
                  className: `adv-edge adv-edge-${pendingConnection.dataType}`,
                }, current));
              }
            }
            setAddMenu(null);
            setPendingConnection(null);
          }}
        />

        {nodes.length === 0 ? (
          <div className="adv-empty-canvas">
            <p>This canvas is empty.</p>
            <button type="button" className="adv-toolbar-button" onClick={openAddMenuDocked}>
              Add your first node
            </button>
            <small>Right-click anywhere on the canvas, or press A.</small>
          </div>
        ) : null}
      </div>

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        title={`Delete ${pendingDelete?.label ?? 'group'}?`}
        description={`This group contains ${pendingDelete?.members ?? 0} node${pendingDelete?.members === 1 ? '' : 's'}. The frame is removed; the nodes inside stay on the canvas.`}
        confirmLabel="Delete group"
        destructive
        onConfirm={() => {
          const id = pendingDelete?.id;
          setPendingDelete(null);
          if (!id) return;
          pushHistory();
          setNodes((current) => current.filter((node) => node.id !== id));
          setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id));
        }}
      />

      {preview ? (
        <div
          className="adv-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={preview.mediaKind === 'video' ? 'Video preview' : 'Image preview'}
          tabIndex={-1}
          onClick={() => setPreview(null)}
          onKeyDown={(event) => { if (event.key === 'Escape') setPreview(null); }}
        >
          <div className="adv-lightbox-media" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="adv-lightbox-close" aria-label="Close preview" onClick={() => setPreview(null)}>
              <X aria-hidden size={18} />
            </button>
            {preview.mediaKind === 'video' ? (
              <video src={preview.url} controls autoPlay playsInline>
                Your browser does not support video playback.
              </video>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- local /storage asset
              <img src={preview.url} alt="Full-size preview" />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Geometric containment used for group membership. */
function contains(group: AdvFlowNode, node: AdvFlowNode) {
  const gw = group.width ?? 0;
  const gh = group.height ?? 0;
  const centerX = node.position.x + (node.width ?? 0) / 2;
  const centerY = node.position.y + (node.height ?? 0) / 2;
  return centerX >= group.position.x
    && centerX <= group.position.x + gw
    && centerY >= group.position.y
    && centerY <= group.position.y + gh;
}

export function AdvCanvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <AdvCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

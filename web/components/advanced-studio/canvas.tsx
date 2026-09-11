'use client';

import * as React from 'react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type Viewport,
} from '@xyflow/react';
import { useTheme } from 'next-themes';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { api } from '@/lib/api/client';
import { nodeDefinition } from '@/lib/advanced-studio/registry';
import { connectionProblem, edgeDataType, type GraphNodeLike } from '@/lib/advanced-studio/validation';
import { resolveInputs } from '@/lib/advanced-studio/resolve-inputs';
import {
  documentToFlow,
  flowToDocument,
  nextLabelIndex,
  type AdvFlowEdge,
  type AdvFlowNode,
} from '@/lib/advanced-studio/document';
import type {
  AdvEngineCapability,
  AdvNodeType,
  AdvProject,
} from '@/lib/advanced-studio/types';
import { AdvNodeActionsContext, type AdvNodeActions } from './node-context';
import { AdvNodeShell } from './node-shell';
import { AddNodeMenu } from './add-node-menu';
import { AdvToolbar } from './toolbar';
import { AdvCanvasControls, type AdvCanvasTool } from './canvas-controls';
import { ShortcutsDialog } from './shortcuts-dialog';
import type { AdvSaveState } from '@/lib/advanced-studio/use-advanced-workspace';

/** One shell handles every node type; the registry decides what it renders.
 * Declared at module scope so React Flow never sees a new object identity. */
const NODE_TYPES = {
  text: AdvNodeShell,
  imageInput: AdvNodeShell,
  imageGenerator: AdvNodeShell,
  videoGenerator: AdvNodeShell,
  group: AdvNodeShell,
} as const;

const HISTORY_LIMIT = 30;
const PASTE_OFFSET = 36;

interface CanvasProps {
  project: AdvProject;
  capabilities: AdvEngineCapability[];
  saveState: AdvSaveState;
  onSave: (document: ReturnType<typeof flowToDocument>, name?: string) => void;
  onRetry: () => void;
  onRunNode: (nodeId: string) => Promise<AdvProject | null>;
}

interface HistoryEntry {
  nodes: AdvFlowNode[];
  edges: AdvFlowEdge[];
}

function AdvCanvasInner({ project, capabilities, saveState, onSave, onRetry, onRunNode }: CanvasProps) {
  const flow = useReactFlow<AdvFlowNode, AdvFlowEdge>();
  const { resolvedTheme } = useTheme();
  const toast = useToast();
  const [nodes, setNodes, onNodesChange] = useNodesState<AdvFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<AdvFlowEdge>([]);
  const [name, setName] = React.useState(project.name);
  const [addMenu, setAddMenu] = React.useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null);
  const [addMenuDocked, setAddMenuDocked] = React.useState(false);
  const [minimap, setMinimap] = React.useState(false);
  const [tool, setTool] = React.useState<AdvCanvasTool>('select');
  const [spacePanning, setSpacePanning] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [locked, setLocked] = React.useState(project.document.locked);
  const [zoomPercent, setZoomPercent] = React.useState(100);
  const [runningNodeIds, setRunningNodeIds] = React.useState<Set<string>>(() => new Set());
  const [preview, setPreview] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<{ id: string; label: string; members: number } | null>(null);

  const viewportRef = React.useRef<Viewport | null>(null);
  // Hydration is tracked in state, not a ref: the save effect must not run
  // until the commit in which the hydrated nodes are actually applied, or it
  // would persist the empty pre-hydration graph over a real project.
  const [hydratedId, setHydratedId] = React.useState<string | null>(null);
  const undoRef = React.useRef<HistoryEntry[]>([]);
  const redoRef = React.useRef<HistoryEntry[]>([]);
  const clipboardRef = React.useRef<HistoryEntry | null>(null);
  const groupPositionsRef = React.useRef<Map<string, { x: number; y: number }>>(new Map());
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

  const updateNodeData = React.useCallback((id: string, patch: Record<string, unknown>) => {
    setNodes((current) => current.map((node) => (
      node.id === id ? { ...node, data: { ...node.data, ...patch } } : node
    )));
  }, [setNodes]);

  const renameNode = React.useCallback((id: string, label: string) => {
    pushHistory();
    updateNodeData(id, { label });
  }, [pushHistory, updateNodeData]);

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

  const onConnectEnd = React.useCallback(() => {
    wrapperRef.current?.removeAttribute('data-connecting-type');
  }, []);

  /* --------------------------------------------------- group drag handling */

  /** Groups are frames, not React Flow parents: moving one applies the same
   * delta to its members so relative positions are preserved without the
   * clipping that parenting would introduce. */
  const handleNodesChange = React.useCallback((changes: NodeChange<AdvFlowNode>[]) => {
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
  }, [flow, onNodesChange]);

  const handleEdgesChange = React.useCallback((changes: EdgeChange<AdvFlowEdge>[]) => {
    if (changes.some((change) => change.type === 'remove')) pushHistory();
    onEdgesChange(changes);
  }, [onEdgesChange, pushHistory]);

  const onNodeDragStart = React.useCallback((_event: unknown, node: AdvFlowNode) => {
    pushHistory();
    if (node.type === 'group') groupPositionsRef.current.set(node.id, { ...node.position });
  }, [pushHistory]);

  /** Membership is recomputed on drop from geometry, so a node joins a scene by
   * being dragged into it and leaves by being dragged out. */
  const onNodeDragStop = React.useCallback(() => {
    groupPositionsRef.current.clear();
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
    updateNodeData(id, {
      imageUrl: asset.url,
      fileName: asset.fileName,
      naturalWidth: asset.width ?? undefined,
      naturalHeight: asset.height ?? undefined,
    });
  }, [project.id, pushHistory, updateNodeData]);

  const clearImage = React.useCallback((id: string) => {
    pushHistory();
    updateNodeData(id, { imageUrl: undefined, fileName: undefined, naturalWidth: undefined, naturalHeight: undefined });
  }, [pushHistory, updateNodeData]);

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
      updateNodeData(id, { status: 'idle', error: undefined });
    }
    try {
      const updated = await onRunNode(id);
      const node = updated?.document.nodes.find((item) => item.id === id);
      // Adopt the server's version of this node (results, status, metadata).
      // If the run returned nothing to adopt, clear the running state anyway so
      // the node never sticks on a spinner.
      updateNodeData(id, node ? (node.data as Record<string, unknown>) : { status: 'idle' });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'That generation failed.';
      updateNodeData(id, { status: 'error', error: message });
      toast.error(message);
    } finally {
      setRunningNodeIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }, [flow, onRunNode, runningNodeIds, toast, updateNodeData]);

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
    updateNodeData,
    renameNode,
    duplicateNode,
    removeNode,
    generate: (id: string) => { void generate(id); },
    uploadImage,
    clearImage,
    openPreview: setPreview,
    resolveInputsFor,
  }), [
    capabilities, capabilityMap, clearImage, duplicateNode, generate, locked,
    project.id, removeNode, renameNode, resolveInputsFor, runningNodeIds, updateNodeData, uploadImage,
  ]);

  /* ------------------------------------------------------------- shortcuts */

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
    const selected = flow.getNodes().filter((node) => node.selected);
    if (!selected.length) return;
    const groupWithMembers = selected.find((node) =>
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
    const ids = new Set(selected.map((node) => node.id));
    setNodes((current) => current.filter((node) => !ids.has(node.id)));
    setEdges((current) => current.filter((edge) => !ids.has(edge.source) && !ids.has(edge.target)));
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
    setNodes((current) => current.map((node) => (
      positions.has(node.id) ? { ...node, position: positions.get(node.id)! } : node
    )));
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
      if (meta && event.key.toLowerCase() === 'c') { copySelection(); return; }

      // Everything below edits the graph, so it stops at the lock.
      if (locked) return;

      if (meta && event.key.toLowerCase() === 'v') { pasteSelection(); return; }
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
    arrangeNodes, clearSelection, copySelection, deleteSelection, flow, locked, nudgeSelection,
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
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          isValidConnection={isValidConnection}
          onNodeDragStart={onNodeDragStart}
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
        </ReactFlow>
        </AdvNodeActionsContext.Provider>

        <AddNodeMenu
          key={addMenu ? 'add-menu-open' : 'add-menu-closed'}
          open={Boolean(addMenu)}
          anchor={addMenuDocked || !addMenu ? null : { x: addMenu.x, y: addMenu.y }}
          onClose={() => setAddMenu(null)}
          onSelect={(type) => {
            const position = addMenuDocked ? centerOfViewport() : { x: addMenu!.flowX, y: addMenu!.flowY };
            addNode(type, position);
            setAddMenu(null);
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
          aria-label="Image preview"
          tabIndex={-1}
          onClick={() => setPreview(null)}
          onKeyDown={(event) => { if (event.key === 'Escape') setPreview(null); }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- local /storage asset */}
          <img src={preview} alt="Generated result" />
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

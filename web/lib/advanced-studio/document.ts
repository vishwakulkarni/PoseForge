/**
 * Conversion between the persisted document and React Flow's node/edge model.
 *
 * The document is the contract with the server (lib/advancedStudioProject.js
 * sanitizes the same shape), so nothing React-Flow-specific — selection,
 * measured sizes, drag state — is ever written to it.
 */
import type { Edge, Node, Viewport } from '@xyflow/react';
import type {
  AdvDocument,
  AdvDocumentEdge,
  AdvDocumentNode,
  AdvNodeData,
  AdvNodeType,
  AdvTemplateId,
} from './types';
import { isAdvNodeType, nodeDefinition } from './registry';

export const ADV_SCHEMA_VERSION = 2;

/** React Flow node data: the persisted node data plus its display label.
 * React Flow constrains node data to Record<string, unknown>; the intersection
 * satisfies that while keeping every named field type-checked at call sites. */
export type AdvFlowNodeData = AdvNodeData & {
  label: string;
  collapsed?: boolean;
  expandedWidth?: number;
  expandedHeight?: number;
} & Record<string, unknown>;
export type AdvFlowNode = Node<AdvFlowNodeData, AdvNodeType>;
export type AdvFlowEdge = Edge;

export function emptyDocument(template: AdvTemplateId = 'blank'): AdvDocument {
  return { schemaVersion: ADV_SCHEMA_VERSION, template, viewport: null, nodes: [], edges: [], locked: false };
}

export function documentToFlow(document: AdvDocument): { nodes: AdvFlowNode[]; edges: AdvFlowEdge[] } {
  const nodes: AdvFlowNode[] = [];
  for (const node of document.nodes ?? []) {
    if (!isAdvNodeType(node.type)) continue;
    const definition = nodeDefinition(node.type);
    nodes.push({
      id: node.id,
      type: node.type,
      position: node.position,
      width: node.width ?? definition.geometry.width,
      height: node.height ?? definition.geometry.height,
      // Groups sit behind their members so a frame never swallows a click
      // meant for a node inside it.
      zIndex: node.type === 'group' ? -1 : 0,
      data: {
        ...(node.data as AdvNodeData),
        label: node.label ?? definition.defaultLabel(1),
        ...(node.collapsed ? { collapsed: true } : {}),
        ...(node.expandedWidth ? { expandedWidth: node.expandedWidth } : {}),
        ...(node.expandedHeight ? { expandedHeight: node.expandedHeight } : {}),
      } as AdvFlowNodeData,
    });
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: AdvFlowEdge[] = (document.edges ?? [])
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
      data: { dataType: edge.dataType ?? 'text' },
      className: `adv-edge adv-edge-${edge.dataType ?? 'text'}`,
    }));

  return { nodes, edges };
}

export function flowToDocument(
  nodes: AdvFlowNode[],
  edges: AdvFlowEdge[],
  viewport: Viewport | null,
  template: AdvTemplateId,
  locked = false,
): AdvDocument {
  const documentNodes: AdvDocumentNode[] = nodes.map((node) => {
    const { label, collapsed, expandedWidth, expandedHeight, ...data } = node.data;
    const type = (node.type ?? 'text') as AdvNodeType;
    const definition = nodeDefinition(type);
    return {
      id: node.id,
      type,
      position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
      width: Math.round(node.width ?? definition.geometry.width),
      height: Math.round(node.height ?? definition.geometry.height),
      label,
      ...(collapsed === true ? { collapsed: true } : {}),
      ...(typeof expandedWidth === 'number' ? { expandedWidth: Math.round(expandedWidth) } : {}),
      ...(typeof expandedHeight === 'number' ? { expandedHeight: Math.round(expandedHeight) } : {}),
      data: data as AdvNodeData,
    };
  });

  const documentEdges: AdvDocumentEdge[] = edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
    ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
    dataType: (edge.data?.dataType as AdvDocumentEdge['dataType']) ?? 'text',
  }));

  return {
    schemaVersion: ADV_SCHEMA_VERSION,
    template,
    viewport: viewport ? { x: Math.round(viewport.x), y: Math.round(viewport.y), zoom: Number(viewport.zoom.toFixed(3)) } : null,
    nodes: documentNodes,
    edges: documentEdges,
    locked,
  };
}

/** Stable key used to skip saves that would not change anything on the server.
 *
 * Canonical (key-sorted) rather than a plain JSON.stringify: the server's
 * sanitizer rebuilds each node with its own property order, so a positional
 * stringify would report every acknowledged save as "changed" and autosave
 * would loop forever at the debounce interval. */
export function documentKey(document: AdvDocument): string {
  return canonical(document);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Next free "#n" suffix for a node type, so labels stay predictable after
 * deletions without renumbering existing nodes. */
export function nextLabelIndex(nodes: AdvFlowNode[], type: AdvNodeType): number {
  const definition = nodeDefinition(type);
  let index = 1;
  const labels = new Set(nodes.filter((node) => node.type === type).map((node) => node.data.label));
  while (labels.has(definition.defaultLabel(index))) index += 1;
  return index;
}

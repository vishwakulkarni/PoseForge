/**
 * Typed connection rules.
 *
 * Every rule is derived from the registry's handle definitions, so the canvas
 * never contains a per-node-type conditional and a new node type is validated
 * the moment it is registered. `connectionProblem` returns a short, plain
 * explanation the UI can show in a toast; `null` means the connection is legal.
 */
import type { AdvDataType, AdvHandleDef, AdvNodeType } from './types';
import { acceptsDataType } from './data-types';
import { nodeDefinition } from './registry';
import type { AdvEngineCapability, AdvNodeData } from './types';

export interface ConnectionCandidate {
  source: string | null;
  sourceHandle: string | null;
  target: string | null;
  targetHandle: string | null;
}

/** Edge shape shared by the persisted document and React Flow, whose handle
 * fields are `string | null` rather than optional. */
export interface EdgeLike {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface GraphNodeLike {
  id: string;
  type: AdvNodeType;
  data: AdvNodeData;
}

function handlesFor(node: GraphNodeLike, capability?: AdvEngineCapability) {
  const definition = nodeDefinition(node.type);
  // The registry narrows node data per node type; this call site is generic
  // over all of them, so the cast is the erasure boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return definition.handles(node.data as any, capability);
}

export function outputHandle(
  node: GraphNodeLike,
  handleId: string | null,
  capability?: AdvEngineCapability,
): AdvHandleDef | null {
  const { outputs } = handlesFor(node, capability);
  if (!outputs.length) return null;
  return outputs.find((handle) => handle.id === handleId) ?? (handleId ? null : outputs[0]);
}

export function inputHandle(
  node: GraphNodeLike,
  handleId: string | null,
  capability?: AdvEngineCapability,
): AdvHandleDef | null {
  const { inputs } = handlesFor(node, capability);
  if (!inputs.length) return null;
  return inputs.find((handle) => handle.id === handleId) ?? (handleId ? null : inputs[0]);
}

export function edgeDataType(
  nodes: GraphNodeLike[],
  edge: EdgeLike,
  capabilities?: Map<string, AdvEngineCapability>,
): AdvDataType {
  const target = nodes.find((node) => node.id === edge.target);
  const source = nodes.find((node) => node.id === edge.source);
  const targetHandle = target ? inputHandle(target, edge.targetHandle ?? null, capabilityFor(target, capabilities)) : null;
  if (targetHandle) return targetHandle.dataType;
  const sourceHandle = source ? outputHandle(source, edge.sourceHandle ?? null, capabilityFor(source, capabilities)) : null;
  return sourceHandle?.dataType ?? 'text';
}

function capabilityFor(node: GraphNodeLike, capabilities?: Map<string, AdvEngineCapability>) {
  const engine = (node.data as { engine?: string }).engine;
  return engine ? capabilities?.get(engine) : undefined;
}

/**
 * Returns a human explanation when a connection must be rejected, or null when
 * it is allowed. Checks, in order: self-connection, that both handles exist,
 * that the types are compatible, that the input has room, and that a duplicate
 * source is permitted.
 */
export function connectionProblem(
  candidate: ConnectionCandidate,
  nodes: GraphNodeLike[],
  edges: EdgeLike[],
  capabilities?: Map<string, AdvEngineCapability>,
): string | null {
  const { source, target } = candidate;
  if (!source || !target) return 'Drag onto a node input to connect it.';
  if (source === target) return 'A node cannot connect to itself.';

  const sourceNode = nodes.find((node) => node.id === source);
  const targetNode = nodes.find((node) => node.id === target);
  if (!sourceNode || !targetNode) return 'That node is no longer on the canvas.';

  const from = outputHandle(sourceNode, candidate.sourceHandle, capabilityFor(sourceNode, capabilities));
  const to = inputHandle(targetNode, candidate.targetHandle, capabilityFor(targetNode, capabilities));
  if (!from) return `${nodeDefinition(sourceNode.type).label} has no output to connect.`;
  if (!to) return `${nodeDefinition(targetNode.type).label} has no matching input.`;

  if (!acceptsDataType(to.dataType, from.dataType)) {
    return `${to.label} accepts ${to.dataType}, not ${from.dataType}.`;
  }

  const existing = edges.filter((edge) => edge.target === target && (edge.targetHandle ?? null) === (candidate.targetHandle ?? to.id));
  if (to.maxConnections != null && existing.length >= to.maxConnections) {
    return to.maxConnections === 1
      ? `${to.label} accepts one connection. Disconnect the current one first.`
      : `${to.label} accepts at most ${to.maxConnections} connections.`;
  }
  if (to.allowDuplicateSource === false && existing.some((edge) => edge.source === source)) {
    return `${nodeDefinition(sourceNode.type).label} is already connected to ${to.label}.`;
  }
  return null;
}

export function isValidAdvConnection(
  candidate: ConnectionCandidate,
  nodes: GraphNodeLike[],
  edges: EdgeLike[],
  capabilities?: Map<string, AdvEngineCapability>,
): boolean {
  return connectionProblem(candidate, nodes, edges, capabilities) === null;
}

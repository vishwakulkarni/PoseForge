/**
 * Walks a node's incoming edges and buckets connected outputs by the input
 * they land on. Mirrors the server-side resolver in
 * lib/advancedNodes/resolve.js so the node can validate and preview what the
 * server will receive. A List offers its first item here: the canvas previews
 * one iteration, the server runs them all.
 */
import type { AdvGeneratorResult, AdvNodeData, AdvNodeType, AdvResolvedInputs } from './types';
import type { EdgeLike } from './validation';

/** Accepts both the persisted node shape and React Flow's node data, which is
 * the same object seen through a looser index signature. */
export interface ResolvableNode {
  id: string;
  type: AdvNodeType;
  data: AdvNodeData | Record<string, unknown>;
}

const BULLET = /^\s*(?:[-*•]|\d{1,3}[.)])\s+/;

function fields(node: ResolvableNode): Record<string, unknown> {
  return node.data as Record<string, unknown>;
}

function activeResult(data: Record<string, unknown>): AdvGeneratorResult | undefined {
  const results = (data.results as AdvGeneratorResult[] | undefined) ?? [];
  if (!results.length) return undefined;
  const index = Number(data.activeResultIndex ?? results.length - 1);
  return results[index] ?? results[results.length - 1];
}

/** A List's items: one per line, bullets and numbering dropped. Same rule as
 * the server's list node. */
export function listItems(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.replace(BULLET, '').trim()).filter(Boolean);
}

/** The public URL a node offers on its output handle, if any. */
export function nodeOutputUrl(node: ResolvableNode, dataType: 'image' | 'video' | 'audio'): string | undefined {
  if (node.type === 'imageInput') return dataType === 'image' ? (fields(node).imageUrl as string | undefined) : undefined;
  if (node.type === 'videoInput' || node.type === 'audioInput') {
    return node.type === `${dataType}Input` ? (fields(node).mediaUrl as string | undefined) : undefined;
  }
  if (dataType === 'audio') return undefined;
  const result = activeResult(fields(node));
  if (!result) return undefined;
  return dataType === 'image' ? result.imageUrl : result.videoUrl;
}

/** The text a node offers downstream, if any. */
export function nodeOutputText(
  node: ResolvableNode,
  nodes: ResolvableNode[],
  edges: EdgeLike[],
  visiting: Set<string> = new Set(),
): string | undefined {
  if (node.type === 'text') return (fields(node).text as string | undefined) || undefined;
  if (node.type === 'llmText') return activeResult(fields(node))?.text;
  if (node.type !== 'list' || visiting.has(node.id)) return undefined;
  visiting.add(node.id);
  const byId = new Map(nodes.map((entry) => [entry.id, entry]));
  const connected = edges
    .filter((edge) => edge.target === node.id && edge.targetHandle === 'text')
    .map((edge) => byId.get(edge.source))
    .map((source) => (source ? nodeOutputText(source, nodes, edges, visiting) : undefined))
    .filter((text): text is string => Boolean(text));
  const items = connected.length ? connected.flatMap(listItems) : listItems(String(fields(node).text ?? ''));
  return items[0];
}

export function resolveInputs(
  nodeId: string,
  nodes: ResolvableNode[],
  edges: EdgeLike[],
): AdvResolvedInputs {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const prompts: string[] = [];
  const texts: string[] = [];
  const imageUrls: string[] = [];
  const startFrameUrls: string[] = [];
  const endFrameUrls: string[] = [];
  const referenceImageUrls: string[] = [];
  const videoUrls: string[] = [];
  const audioUrls: string[] = [];

  for (const edge of edges) {
    if (edge.target !== nodeId) continue;
    const source = byId.get(edge.source);
    if (!source) continue;
    const handle = edge.targetHandle ?? '';
    if (handle === 'prompt' || handle === 'text') {
      const text = nodeOutputText(source, nodes, edges);
      if (text?.trim()) (handle === 'prompt' ? prompts : texts).push(text);
      continue;
    }
    if (handle === 'image' || handle === 'startFrame' || handle === 'endFrame' || handle === 'reference') {
      const url = nodeOutputUrl(source, 'image');
      if (url) {
        imageUrls.push(url);
        if (handle === 'startFrame') startFrameUrls.push(url);
        else if (handle === 'endFrame') endFrameUrls.push(url);
        else if (handle === 'reference') referenceImageUrls.push(url);
      }
      continue;
    }
    if (handle === 'video' || handle === 'referenceVideo') {
      const url = nodeOutputUrl(source, 'video');
      if (url) videoUrls.push(url);
      continue;
    }
    if (handle === 'referenceAudio') {
      const url = nodeOutputUrl(source, 'audio');
      if (url) audioUrls.push(url);
    }
  }

  return { prompt: prompts.join('\n\n'), texts, imageUrls, startFrameUrls, endFrameUrls, referenceImageUrls, videoUrls, audioUrls };
}

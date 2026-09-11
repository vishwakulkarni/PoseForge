/**
 * Walks a node's incoming edges and buckets connected outputs by the data type
 * of the input they land on. Mirrors the server-side resolver in
 * routes/advanced-studio-projects.js so the node can validate and preview
 * exactly what the server will receive.
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

function fields(node: ResolvableNode): Record<string, unknown> {
  return node.data as Record<string, unknown>;
}

function activeResult(data: Record<string, unknown>): AdvGeneratorResult | undefined {
  const results = (data.results as AdvGeneratorResult[] | undefined) ?? [];
  if (!results.length) return undefined;
  const index = Number(data.activeResultIndex ?? results.length - 1);
  return results[index] ?? results[results.length - 1];
}

/** The public URL a node offers on its output handle, if any. */
export function nodeOutputUrl(node: ResolvableNode, dataType: 'image' | 'video'): string | undefined {
  if (node.type === 'imageInput') return dataType === 'image' ? (fields(node).imageUrl as string | undefined) : undefined;
  const result = activeResult(fields(node));
  if (!result) return undefined;
  return dataType === 'image' ? result.imageUrl : result.videoUrl;
}

export function resolveInputs(
  nodeId: string,
  nodes: ResolvableNode[],
  edges: EdgeLike[],
): AdvResolvedInputs {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const prompts: string[] = [];
  const imageUrls: string[] = [];
  const videoUrls: string[] = [];
  const audioUrls: string[] = [];

  for (const edge of edges) {
    if (edge.target !== nodeId) continue;
    const source = byId.get(edge.source);
    if (!source) continue;
    const handle = edge.targetHandle ?? '';
    if (handle === 'prompt') {
      const text = fields(source).text as string | undefined;
      if (text?.trim()) prompts.push(text);
      continue;
    }
    if (handle === 'image' || handle === 'startFrame' || handle === 'endFrame' || handle === 'reference') {
      const url = nodeOutputUrl(source, 'image');
      if (url) imageUrls.push(url);
      continue;
    }
    if (handle === 'video') {
      const url = nodeOutputUrl(source, 'video');
      if (url) videoUrls.push(url);
    }
  }

  return { prompt: prompts.join('\n\n'), imageUrls, videoUrls, audioUrls };
}

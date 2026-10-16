import type { AdvDocument, AdvDocumentEdge, AdvDocumentNode } from './types';

/**
 * Adds an Image Input node holding `image` to a starter document and wires it
 * into the first image generator's reference-image input. A document with no
 * image generator (a blank canvas) just gains the unconnected node.
 */
export function withReferenceImage(
  document: AdvDocument,
  image: { url: string; name: string },
): AdvDocument {
  const id = 'image-input-reference';
  const generator = document.nodes.find((node) => node.type === 'imageGenerator');
  const below = Math.max(0, ...document.nodes.map((node) => node.position.y + (node.height ?? 320)));
  const node: AdvDocumentNode = {
    id,
    type: 'imageInput',
    position: { x: 0, y: below + 40 },
    label: image.name,
    data: { imageUrl: image.url, fileName: image.name, imageFit: 'fill' },
  };
  const edges: AdvDocumentEdge[] = generator
    ? [{
        id: `e-${id}-${generator.id}`,
        source: id,
        sourceHandle: 'image',
        target: generator.id,
        targetHandle: 'image',
        dataType: 'image',
      }]
    : [];
  return { ...document, nodes: [...document.nodes, node], edges: [...document.edges, ...edges] };
}

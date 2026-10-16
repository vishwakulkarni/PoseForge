import { describe, expect, it } from 'vitest';
import { withReferenceImage } from '@/lib/advanced-studio/seed';
import type { AdvDocument } from '@/lib/advanced-studio/types';

function document(overrides: Partial<AdvDocument> = {}): AdvDocument {
  return {
    schemaVersion: 2,
    template: 'image',
    viewport: null,
    locked: false,
    nodes: [
      { id: 'text-1', type: 'text', position: { x: 0, y: 0 }, data: { text: '', mode: 'plain' } },
      { id: 'gen-1', type: 'imageGenerator', position: { x: 520, y: 0 }, data: { outputs: 1, activeResultIndex: 0 } },
    ],
    edges: [],
    ...overrides,
  };
}

describe('withReferenceImage', () => {
  const image = { url: '/storage/poses/seated.png', name: 'Seated pose' };

  it('adds an image node below the existing nodes and wires it to the generator', () => {
    const result = withReferenceImage(document(), image);
    const added = result.nodes.find((node) => node.type === 'imageInput');
    expect(added).toMatchObject({ label: 'Seated pose', data: { imageUrl: image.url, fileName: image.name } });
    expect(added!.position.y).toBeGreaterThan(0);
    expect(result.edges).toEqual([
      expect.objectContaining({ source: added!.id, sourceHandle: 'image', target: 'gen-1', targetHandle: 'image', dataType: 'image' }),
    ]);
  });

  it('adds only the node when there is no image generator', () => {
    const result = withReferenceImage(document({ nodes: [], template: 'blank' }), image);
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toEqual([]);
  });

  it('does not mutate the source document', () => {
    const source = document();
    withReferenceImage(source, image);
    expect(source.nodes).toHaveLength(2);
  });
});

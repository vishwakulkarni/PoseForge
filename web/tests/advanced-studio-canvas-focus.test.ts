import { describe, expect, it } from 'vitest';
import { snapToNeighbours, upstreamOf } from '@/lib/advanced-studio/canvas-focus';

describe('upstreamOf', () => {
  const edges = [
    { id: 'e1', source: 'a', target: 'c' },
    { id: 'e2', source: 'b', target: 'c' },
    { id: 'e3', source: 'c', target: 'd' },
    { id: 'e4', source: 'c', target: 'e' },
  ];

  it('collects transitive ancestors and the edges that reach them', () => {
    const result = upstreamOf(new Set(['d']), edges);
    expect([...result.nodeIds].sort()).toEqual(['a', 'b', 'c']);
    expect([...result.edgeIds].sort()).toEqual(['e1', 'e2', 'e3']);
  });

  it('ignores siblings and downstream nodes', () => {
    const result = upstreamOf(new Set(['c']), edges);
    expect(result.nodeIds.has('d')).toBe(false);
    expect(result.nodeIds.has('e')).toBe(false);
  });

  it('returns nothing for an empty selection or a source node', () => {
    expect(upstreamOf(new Set(), edges).nodeIds.size).toBe(0);
    expect(upstreamOf(new Set(['a']), edges).nodeIds.size).toBe(0);
  });

  it('terminates on cycles', () => {
    const cyclic = [
      { id: 'x', source: 'a', target: 'b' },
      { id: 'y', source: 'b', target: 'a' },
    ];
    expect([...upstreamOf(new Set(['a']), cyclic).nodeIds]).toEqual(['b']);
  });
});

describe('snapToNeighbours', () => {
  const other = { x: 100, y: 100, width: 200, height: 100 };

  it('snaps a near edge and reports the guide', () => {
    const result = snapToNeighbours({ x: 104, y: 400, width: 50, height: 50 }, [other], 6);
    expect(result.x).toBe(100);
    expect(result.y).toBe(400);
    expect(result.guides).toEqual([{ axis: 'x', position: 100 }]);
  });

  it('snaps centres on both axes', () => {
    const result = snapToNeighbours({ x: 175, y: 128, width: 50, height: 44 }, [other], 6);
    expect(result.x).toBe(175);
    expect(result.y).toBe(128);
    expect(result.guides.map((guide) => guide.axis).sort()).toEqual(['x', 'y']);
  });

  it('leaves the position alone beyond the threshold', () => {
    const result = snapToNeighbours({ x: 20, y: 20, width: 50, height: 50 }, [other], 6);
    expect(result).toEqual({ x: 20, y: 20, guides: [] });
  });
});

/**
 * Pure geometry and graph helpers behind the canvas's "focus" behaviours:
 * highlighting everything upstream of a selection, and snapping a dragged node
 * to its neighbours. Kept free of React so they are unit-testable.
 */

interface EdgeLike {
  id: string;
  source: string;
  target: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapGuide {
  axis: 'x' | 'y';
  /** Flow-space coordinate of the guide line. */
  position: number;
}

/** Every node and edge that feeds (directly or transitively) into `selectedIds`. */
export function upstreamOf(selectedIds: ReadonlySet<string>, edges: readonly EdgeLike[]) {
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  if (!selectedIds.size) return { nodeIds, edgeIds };
  const incoming = new Map<string, EdgeLike[]>();
  for (const edge of edges) {
    const list = incoming.get(edge.target);
    if (list) list.push(edge);
    else incoming.set(edge.target, [edge]);
  }
  const queue = [...selectedIds];
  while (queue.length) {
    const id = queue.pop()!;
    for (const edge of incoming.get(id) ?? []) {
      edgeIds.add(edge.id);
      if (selectedIds.has(edge.source) || nodeIds.has(edge.source)) continue;
      nodeIds.add(edge.source);
      queue.push(edge.source);
    }
  }
  return { nodeIds, edgeIds };
}

/**
 * Snaps `moving` so its edges or centre line up with any of `others` within
 * `threshold` flow units, per axis. Returns the adjusted position and the
 * guide lines to draw (empty when nothing snapped).
 */
export function snapToNeighbours(
  moving: Rect,
  others: readonly Rect[],
  threshold: number,
): { x: number; y: number; guides: SnapGuide[] } {
  const axisSnap = (start: number, size: number, targets: number[][]) => {
    const anchors = [start, start + size / 2, start + size];
    let best: { delta: number; guide: number } | null = null;
    for (const targetSet of targets) {
      for (const target of targetSet) {
        for (const anchor of anchors) {
          const delta = target - anchor;
          if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
            best = { delta, guide: target };
          }
        }
      }
    }
    return best;
  };

  const snapX = axisSnap(moving.x, moving.width, others.map((o) => [o.x, o.x + o.width / 2, o.x + o.width]));
  const snapY = axisSnap(moving.y, moving.height, others.map((o) => [o.y, o.y + o.height / 2, o.y + o.height]));
  const guides: SnapGuide[] = [];
  if (snapX) guides.push({ axis: 'x', position: snapX.guide });
  if (snapY) guides.push({ axis: 'y', position: snapY.guide });
  return {
    x: moving.x + (snapX?.delta ?? 0),
    y: moving.y + (snapY?.delta ?? 0),
    guides,
  };
}

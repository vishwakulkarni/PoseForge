'use client';

import * as React from 'react';
import { ViewportPortal, useStore } from '@xyflow/react';
import { Copy, Frame, LayoutGrid, Trash2 } from 'lucide-react';
import type { AdvFlowNode } from '@/lib/advanced-studio/document';

/** Floating actions above a multi-node selection. A single node has its own
 * menu, and the bar steps aside while a drag is in progress so it never trails
 * the pointer. It lives in flow space and counter-scales by the zoom so it
 * stays a constant size on screen. */
export function AdvSelectionToolbar({
  nodes,
  disabled,
  onArrange,
  onGroup,
  onDuplicate,
  onDelete,
}: {
  nodes: AdvFlowNode[];
  disabled: boolean;
  onArrange: () => void;
  onGroup: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const zoom = useStore((state) => state.transform[2]);
  const selected = nodes.filter((node) => node.selected && node.type !== 'group');
  if (disabled || selected.length < 2 || selected.some((node) => node.dragging)) return null;

  const left = Math.min(...selected.map((node) => node.position.x));
  const right = Math.max(...selected.map((node) => node.position.x + (node.measured?.width ?? node.width ?? 0)));
  const top = Math.min(...selected.map((node) => node.position.y));

  return (
    <ViewportPortal>
      <div
        className="adv-selection-toolbar nodrag nopan"
        role="toolbar"
        aria-label={`${selected.length} nodes selected`}
        style={{
          transform: `translate(${(left + right) / 2}px, ${top}px) translate(-50%, -100%) translateY(-12px) scale(${1 / zoom})`,
        }}
      >
        <span className="adv-selection-count">{selected.length} selected</span>
        <button type="button" title="Arrange in a grid" aria-label="Arrange in a grid" onClick={onArrange}>
          <LayoutGrid aria-hidden size={15} />
        </button>
        <button type="button" title="Group selection" aria-label="Group selection" onClick={onGroup}>
          <Frame aria-hidden size={15} />
        </button>
        <button type="button" title="Duplicate selection" aria-label="Duplicate selection" onClick={onDuplicate}>
          <Copy aria-hidden size={15} />
        </button>
        <button type="button" className="is-destructive" title="Delete selection" aria-label="Delete selection" onClick={onDelete}>
          <Trash2 aria-hidden size={15} />
        </button>
      </div>
    </ViewportPortal>
  );
}

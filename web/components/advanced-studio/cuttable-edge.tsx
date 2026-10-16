'use client';

import * as React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  useStore,
  type EdgeProps,
} from '@xyflow/react';
import { Scissors } from 'lucide-react';

/** Bezier edge that shows a scissors button on hover to cut the connection.
 * The button sits at the edge's midpoint and stays visible while the pointer
 * is over it, so it can actually be reached. Cutting goes through React Flow's
 * own deletion so history and autosave see an ordinary edge removal. */
export function AdvCuttableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  selected,
}: EdgeProps) {
  const flow = useReactFlow();
  const editable = useStore((state) => state.nodesConnectable);
  const [hovered, setHovered] = React.useState(false);
  const [path, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  });
  const visible = editable && (hovered || selected);

  return (
    <g onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={24} />
      {visible ? (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="adv-edge-cut nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            aria-label="Cut connection"
            title="Cut connection"
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            onClick={(event) => {
              event.stopPropagation();
              void flow.deleteElements({ edges: [{ id }] });
            }}
          >
            <Scissors aria-hidden size={13} />
          </button>
        </EdgeLabelRenderer>
      ) : null}
    </g>
  );
}

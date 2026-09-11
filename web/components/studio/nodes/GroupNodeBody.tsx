'use client';

import * as React from 'react';
import type { StudioNodeBodyProps } from './types';

/** Renders `group` nodes — a visual frame for organizing other nodes on
 * the canvas. This is a lightweight, purely-visual frame (no automatic
 * parent/child movement, unlike React Flow's native group/extent nodes) —
 * provides a visual group frame without logical grouping behavior. */
export function GroupNodeBody({ id, data, actions }: StudioNodeBodyProps) {
  return (
    <div className="nodrag nopan poseforge-group-body">
      <input
        className="poseforge-group-label-input"
        value={data.label}
        disabled={actions.locked}
        placeholder="Group"
        maxLength={120}
        onChange={(event) => actions.onRename(id, event.target.value)}
      />
    </div>
  );
}

'use client';

import * as React from 'react';
import type { StudioNodeBodyProps } from './types';

/** Renders `note` nodes — a free-floating sticky note, unconnected to the
 * pipeline graph. */
export function NoteNodeBody({ id, data, actions }: StudioNodeBodyProps) {
  return (
    <div className="poseforge-note-body">
      <textarea
        className="nodrag"
        placeholder="Jot a note…"
        maxLength={2000}
        value={data.text ?? ''}
        disabled={actions.locked}
        onChange={(event) => actions.onEditText(id, event.target.value)}
      />
    </div>
  );
}

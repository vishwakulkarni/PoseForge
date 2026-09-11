'use client';

import * as React from 'react';
import type { StudioNodeBodyProps } from './types';

/** Renders `prompt` nodes — free-text prompt authored by the user and fed
 * into a connected `generate` node. */
export function PromptNodeBody({ id, data, actions }: StudioNodeBodyProps) {
  return (
    <div className="poseforge-prompt-body">
      <textarea
        className="nodrag"
        placeholder="Describe the scene, framing, or mood…"
        maxLength={2000}
        value={data.text ?? ''}
        disabled={actions.locked}
        onChange={(event) => actions.onEditText(id, event.target.value)}
      />
    </div>
  );
}

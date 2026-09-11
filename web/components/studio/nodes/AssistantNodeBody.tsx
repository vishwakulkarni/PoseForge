'use client';

import * as React from 'react';
import type { StudioNodeBodyProps } from './types';

/** Renders `assistant` nodes — an instruction box that calls a prompt-
 * assistant engine to refine connected prompt text. */
export function AssistantNodeBody({ id, data, actions, isRunningNode }: StudioNodeBodyProps) {
  return (
    <div className="poseforge-assistant-body">
      <textarea
        className="nodrag"
        placeholder="Tell the assistant what to improve about the prompt…"
        maxLength={2000}
        value={data.instruction ?? ''}
        disabled={actions.locked}
        onChange={(event) => actions.onEditInstruction(id, event.target.value)}
      />
      <button
        type="button"
        className="nodrag poseforge-node-run"
        disabled={actions.locked || isRunningNode || !data.instruction?.trim() || !data.nodeEngine}
        onClick={(event) => {
          event.stopPropagation();
          actions.onAssist(id);
        }}
      >
        {isRunningNode ? 'Improving…' : 'Improve with AI'}
      </button>
      {data.outputText ? (
        <p className="poseforge-assistant-output" title={data.outputText}>{data.outputText}</p>
      ) : null}
    </div>
  );
}

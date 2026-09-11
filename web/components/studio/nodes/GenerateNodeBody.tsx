'use client';

import * as React from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StudioNodeBodyProps } from './types';

/** Renders `generate` nodes — a compact chainable pipeline block summarizing
 * its mode/engine/output settings, with an inline Run action for custom
 * (graph-mode) generate nodes. */
export function GenerateNodeBody({ id, data, actions, isRunningNode }: StudioNodeBodyProps) {
  return (
    <div className="poseforge-generate-body">
      <span className="poseforge-node-icon"><Sparkles size={20} strokeWidth={1.7} /></span>
      <span className="poseforge-generate-copy">
        <strong>{data.label}</strong>
        <span
          className="poseforge-forge-summary"
          aria-label={`${data.studioMode ?? 'normal'} mode, ${data.engineLabel ?? 'selected engine'}, ${data.outputCount ?? 1} outputs, ${data.aspectRatio ?? '1:1'}, ${data.inputCount ?? 0} inputs`}
        >
          <i>{data.studioMode === 'advanced' ? 'Advanced' : 'Normal'}</i>
          <i>{data.engineLabel ?? 'Selected engine'}</i>
          <i>{data.outputCount ?? 1} output{data.outputCount === 1 ? '' : 's'}</i>
          <i>{data.aspectRatio ?? '1:1'}</i>
          <i>{data.inputCount ?? 0} input{data.inputCount === 1 ? '' : 's'}</i>
        </span>
        <small>{data.validation ?? data.meta}</small>
      </span>
      <span className={cn('poseforge-ready-dot', data.status, data.pipelineStatus)} aria-hidden />
      {data.custom && actions.onRunNode ? (
        <button
          type="button"
          className="nodrag poseforge-node-run"
          disabled={actions.locked || isRunningNode}
          onClick={(event) => {
            event.stopPropagation();
            actions.onRunNode(id);
          }}
        >
          {isRunningNode ? 'Running…' : 'Run'}
        </button>
      ) : null}
    </div>
  );
}

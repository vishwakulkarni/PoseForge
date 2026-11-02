'use client';

import * as React from 'react';
import { AlertCircle, Copy, Loader2, Wand2 } from 'lucide-react';
import { llmTextNodeDefinition } from '@/lib/advanced-studio/registry/llm-text-node';
import type { AdvLlmTextNodeData } from '@/lib/advanced-studio/types';
import type { AdvNodeBodyProps } from '../node-context';
import { PillMenu, withUnavailableOption, type PillOption } from '../pill-menu';
import { DraftTextarea, FallbackPill, RunFooter } from './node-parts';

const MAX_INSTRUCTION = 20_000;

/** Instruction in, text out. The output feeds prompts, lists and captions. */
export const LlmTextNodeBody = React.memo(function LlmTextNodeBody({
  id,
  data,
  actions,
}: AdvNodeBodyProps<AdvLlmTextNodeData>) {
  const running = actions.runningNodeIds.has(id) || data.status === 'running' || data.status === 'queued';
  const results = data.results ?? [];
  const active = results[Math.min(Math.max(data.activeResultIndex ?? 0, 0), Math.max(results.length - 1, 0))];
  const resolved = actions.resolveInputsFor(id);
  const capability = actions.capabilityFor(data.engine);

  const options = React.useMemo<PillOption<string>[]>(
    () => withUnavailableOption(
      actions.capabilities.filter((engine) => engine.text?.supported).map((engine) => ({
        value: engine.key,
        label: engine.label,
        note: engine.ready ? undefined : engine.reason ?? 'Not configured',
        disabled: !engine.ready,
      })),
      data.engine,
      data.engine ?? '',
    ),
    [actions.capabilities, data.engine],
  );

  const blockedReason = llmTextNodeDefinition.validate?.(data, resolved)
    ?? (capability && !capability.ready && !data.fallbacks?.length ? capability.reason ?? `${capability.label} is not configured.` : null);

  return (
    <div className="adv-node-body adv-generator-body">
      <DraftTextarea
        value={data.instruction ?? ''}
        onCommit={(instruction) => actions.updateNodeData(id, { instruction })}
        label={`${data.label} instruction`}
        placeholder={'Write 5 short hooks about {{topic}}, one per line.'}
        maxLength={MAX_INSTRUCTION}
        readOnly={actions.locked}
        className="adv-llm-instruction"
      />
      <div className="adv-llm-output nowheel" aria-live="polite">
        {running ? (
          <span className="adv-state"><Loader2 aria-hidden className="adv-spin" size={18} /> Writing…</span>
        ) : active?.text ? (
          <p className="adv-llm-text">{active.text}</p>
        ) : data.status === 'error' ? (
          <span className="adv-state is-error"><AlertCircle aria-hidden size={18} /> {data.error ?? 'Writing failed'}</span>
        ) : (
          <span className="adv-state"><Wand2 aria-hidden size={18} /> The written text appears here</span>
        )}
      </div>
      <div className="adv-controls nodrag nopan">
        <PillMenu
          label="Text model"
          value={data.engine}
          options={options}
          onChange={(engine) => actions.updateNodeData(id, { engine, error: undefined })}
          disabled={actions.locked}
          placeholder="Choose a model"
          className="adv-pill-wide"
        />
        <FallbackPill id={id} kind="text" engine={data.engine} fallbacks={data.fallbacks} actions={actions} />
      </div>
      <RunFooter id={id} status={data.status} actions={actions} blockedReason={blockedReason} label="Write">
        {active?.text ? (
          <button
            type="button"
            className="adv-icon-button"
            title="Copy text"
            aria-label="Copy text"
            onClick={() => { void navigator.clipboard?.writeText(active.text ?? ''); }}
          >
            <Copy aria-hidden size={14} />
          </button>
        ) : null}
      </RunFooter>
    </div>
  );
});

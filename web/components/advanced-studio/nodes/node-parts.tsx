'use client';

import * as React from 'react';
import { Loader2, Play, Shuffle } from 'lucide-react';
import type { AdvFallback, AdvNodeStatus } from '@/lib/advanced-studio/types';
import type { AdvNodeActions } from '../node-context';
import { PillMenu, type PillOption } from '../pill-menu';
import { cn } from '@/lib/utils';

/**
 * A textarea that keeps its draft locally and pushes it to the graph on a
 * short debounce, so typing re-renders one node rather than the canvas — the
 * same contract as the prompt editor in TextNodeBody.
 */
export function DraftTextarea({
  value,
  onCommit,
  label,
  placeholder,
  maxLength,
  readOnly,
  className,
}: {
  value: string;
  onCommit: (value: string) => void;
  label: string;
  placeholder?: string;
  maxLength: number;
  readOnly?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = React.useState(value);
  const committedRef = React.useRef(value);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adopt external changes (undo, a run's write-back) without clobbering
  // what the user is typing.
  React.useEffect(() => {
    if (value === committedRef.current) return;
    committedRef.current = value;
    setDraft(value);
  }, [value]);

  React.useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const commit = (next: string) => {
    committedRef.current = next;
    onCommit(next);
  };

  return (
    <textarea
      className={cn('adv-textarea nodrag nopan nowheel', className)}
      value={draft}
      maxLength={maxLength}
      readOnly={readOnly}
      aria-label={label}
      placeholder={placeholder}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => commit(next), 250);
      }}
      onBlur={() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (draft !== committedRef.current) commit(draft);
      }}
    />
  );
}

/** Blocking reason, then the Run button, for every node that runs. */
export function RunFooter({
  id,
  status,
  actions,
  blockedReason,
  label,
  children,
}: {
  id: string;
  status?: AdvNodeStatus;
  actions: AdvNodeActions;
  blockedReason: string | null;
  label: string;
  children?: React.ReactNode;
}) {
  const running = actions.runningNodeIds.has(id) || status === 'running' || status === 'queued';
  return (
    <>
      {blockedReason ? <p className="adv-inline-error" role="status">{blockedReason}</p> : null}
      <div className="adv-generator-footer nodrag nopan">
        <span className="adv-icon-row">{children}</span>
        <button
          type="button"
          className="adv-generate-button"
          disabled={actions.locked || running || Boolean(blockedReason)}
          onClick={() => actions.generate(id)}
        >
          {running ? <Loader2 aria-hidden className="adv-spin" size={14} /> : <Play aria-hidden size={14} />}
          {status === 'error' ? 'Retry' : label}
        </button>
      </div>
    </>
  );
}

/**
 * The model a node falls back to when its own is not set up or fails. The
 * canvas offers one; a workflow written by an agent can list up to three,
 * and the pill then shows the first.
 */
export function FallbackPill({
  id,
  kind,
  engine,
  model,
  fallbacks,
  actions,
}: {
  id: string;
  kind: 'image' | 'video' | 'text';
  engine?: string;
  model?: string;
  fallbacks?: AdvFallback[];
  actions: AdvNodeActions;
}) {
  const own = `${engine ?? ''}::${model ?? ''}`;
  const options = React.useMemo<PillOption<string>[]>(() => {
    const choices = actions.capabilities.flatMap((capability) => {
      if (kind === 'text') {
        return capability.text?.supported ? [{ value: `${capability.key}::`, label: capability.label, disabled: !capability.ready }] : [];
      }
      const supported = kind === 'image' ? capability.image.supported : capability.video.supported;
      if (!supported) return [];
      const models = capability.models.length ? capability.models : [{ id: capability.key, label: capability.label }];
      return models.map((entry) => ({
        value: `${capability.key}::${entry.id}`,
        label: entry.label,
        group: entry.label === capability.label ? undefined : capability.label,
        note: capability.ready ? undefined : capability.reason ?? 'Not configured',
        disabled: !capability.ready,
      }));
    }).filter((option) => option.value !== own && !(kind === 'text' && option.value === `${engine}::`));
    return [{ value: '', label: 'No fallback' }, ...choices];
  }, [actions.capabilities, engine, kind, own]);

  const first = fallbacks?.[0];
  const value = first ? `${first.engine}::${first.model ?? ''}` : '';
  return (
    <PillMenu
      label="Fallback model"
      value={value}
      options={options.some((option) => option.value === value) ? options : [...options, { value, label: first?.model ?? first?.engine ?? '', disabled: true }]}
      icon={<Shuffle aria-hidden size={12} />}
      onChange={(next) => {
        if (!next) {
          actions.updateNodeData(id, { fallbacks: undefined });
          return;
        }
        const separator = next.indexOf('::');
        const fallbackModel = next.slice(separator + 2);
        const chosen: AdvFallback = { engine: next.slice(0, separator), ...(fallbackModel ? { model: fallbackModel } : {}) };
        actions.updateNodeData(id, { fallbacks: [chosen, ...(fallbacks ?? []).slice(1)] });
      }}
      disabled={actions.locked}
      className="adv-pill-wide"
    />
  );
}

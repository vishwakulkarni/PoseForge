'use client';

import * as React from 'react';
import { TEXT_NODE_MAX_LENGTH } from '@/lib/advanced-studio/registry/text-node';
import type { AdvTextNodeData } from '@/lib/advanced-studio/types';
import type { AdvNodeBodyProps } from '../node-context';
import { cn } from '@/lib/utils';

/**
 * Prompt editor.
 *
 * Keeps the draft in local state and pushes it to the graph on a short
 * debounce, so typing never re-renders the rest of the canvas and autosave
 * still captures every keystroke's end state.
 */
export const TextNodeBody = React.memo(function TextNodeBody({
  id,
  data,
  actions,
}: AdvNodeBodyProps<AdvTextNodeData>) {
  const [draft, setDraft] = React.useState(data.text ?? '');
  const committedRef = React.useRef(data.text ?? '');
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adopt external changes (undo, paste of a duplicated node) without
  // clobbering what the user is currently typing.
  React.useEffect(() => {
    if ((data.text ?? '') === committedRef.current) return;
    committedRef.current = data.text ?? '';
    setDraft(data.text ?? '');
  }, [data.text]);

  React.useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const commit = React.useCallback((value: string) => {
    committedRef.current = value;
    actions.updateNodeData(id, { text: value });
  }, [actions, id]);

  const onChange = (value: string) => {
    setDraft(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => commit(value), 250);
  };

  const structured = data.mode === 'structured';
  const invalid = structured && draft.trim().length > 0 && !isParseable(draft);

  return (
    <div className="adv-node-body adv-text-body">
      <div className="adv-text-toolbar nodrag nopan">
        <div className="adv-toggle-group" role="group" aria-label="Prompt format">
          <button
            type="button"
            className={cn('adv-toggle', !structured && 'is-active')}
            aria-pressed={!structured}
            disabled={actions.locked}
            onClick={() => actions.updateNodeData(id, { mode: 'plain' })}
          >
            Text
          </button>
          <button
            type="button"
            className={cn('adv-toggle', structured && 'is-active')}
            aria-pressed={structured}
            disabled={actions.locked}
            onClick={() => actions.updateNodeData(id, { mode: 'structured' })}
          >
            JSON/YAML
          </button>
        </div>
      </div>
      <textarea
        className={cn('adv-textarea nodrag nopan', invalid && 'is-invalid')}
        value={draft}
        maxLength={TEXT_NODE_MAX_LENGTH}
        readOnly={actions.locked}
        spellCheck={!structured}
        aria-label={`${data.label} text`}
        aria-invalid={invalid || undefined}
        placeholder={structured ? '{\n  "subject": ""\n}' : 'Describe what you want to generate…'}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          if (timerRef.current) clearTimeout(timerRef.current);
          commit(draft);
        }}
      />
      <div className="adv-text-footer">
        {invalid ? <span className="adv-inline-error">Not valid JSON or YAML yet</span> : <span />}
        <span className="adv-counter">{draft.length.toLocaleString()}/{TEXT_NODE_MAX_LENGTH.toLocaleString()}</span>
      </div>
    </div>
  );
});

/** Structured mode is a convenience, not a contract: the prompt is still sent
 * as text, so this only drives the inline "not valid yet" hint. */
function isParseable(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      return false;
    }
  }
  // Anything indentation-based is treated as YAML and accepted; a full YAML
  // parser is not worth shipping for a hint.
  return true;
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Keyboard,
  Loader2,
  LockKeyhole,
  Map as MapIcon,
  Plus,
} from 'lucide-react';
import type { AdvSaveState } from '@/lib/advanced-studio/use-advanced-workspace';
import { cn } from '@/lib/utils';

const SAVE_COPY: Record<AdvSaveState, string> = {
  loading: 'Loading…',
  pending: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'All changes saved',
  error: 'Save failed',
  conflict: 'Changed in another tab',
};

/**
 * Project chrome: identity, save state, and the two things that are not canvas
 * operations. Zoom, undo/redo, tools, lock and arrange live in the on-canvas
 * control cluster, where the guided Studio keeps them too — one home each,
 * rather than the same action in two places.
 */
export function AdvToolbar({
  name,
  saveState,
  onRename,
  onRetry,
  onAddNode,
  locked,
  minimap,
  onToggleMinimap,
  onShowShortcuts,
}: {
  name: string;
  saveState: AdvSaveState;
  onRename: (name: string) => void;
  onRetry: () => void;
  onAddNode: () => void;
  locked: boolean;
  minimap: boolean;
  onToggleMinimap: () => void;
  onShowShortcuts: () => void;
}) {
  const [draft, setDraft] = React.useState(name);
  // Adjust during render rather than in an effect: renaming elsewhere (or
  // loading a different project) should replace the draft without an extra
  // render pass. https://react.dev/learn/you-might-not-need-an-effect
  const [lastName, setLastName] = React.useState(name);
  if (name !== lastName) {
    setLastName(name);
    setDraft(name);
  }

  return (
    <div className="adv-toolbar">
      <div className="adv-toolbar-left">
        <Link className="adv-icon-button" href="/studio-advanced" aria-label="Back to Advanced Studio projects" title="All projects">
          <ArrowLeft aria-hidden size={16} />
        </Link>
        <input
          className="adv-title-input"
          value={draft}
          maxLength={100}
          aria-label="Project name"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => onRename(draft.trim() || name)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') setDraft(name);
          }}
        />
        <span className={cn('adv-save-status', `is-${saveState}`)} role="status">
          {saveState === 'saving' || saveState === 'loading' ? <Loader2 aria-hidden className="adv-spin" size={13} /> : null}
          {saveState === 'saved' ? <Check aria-hidden size={13} /> : null}
          {saveState === 'error' || saveState === 'conflict' ? <CircleAlert aria-hidden size={13} /> : null}
          {SAVE_COPY[saveState]}
          {saveState === 'error' || saveState === 'conflict' ? (
            <button type="button" className="adv-link-button" onClick={onRetry}>Retry</button>
          ) : null}
        </span>
        {locked ? (
          <span className="adv-lock-badge" role="status">
            <LockKeyhole aria-hidden size={12} /> Locked
          </span>
        ) : null}
      </div>

      <div className="adv-toolbar-right">
        <button type="button" className="adv-toolbar-button" onClick={onAddNode} disabled={locked} aria-label="Add node" title="Add node (A)">
          <Plus aria-hidden size={15} /> Add node
        </button>
        <span className="adv-toolbar-divider" aria-hidden />
        <button
          type="button"
          className={cn('adv-icon-button', minimap && 'is-active')}
          onClick={onToggleMinimap}
          aria-pressed={minimap}
          aria-label="Toggle minimap"
          title="Toggle minimap"
        >
          <MapIcon aria-hidden size={15} />
        </button>
        <button
          type="button"
          className="adv-icon-button"
          onClick={onShowShortcuts}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
        >
          <Keyboard aria-hidden size={15} />
        </button>
      </div>
    </div>
  );
}

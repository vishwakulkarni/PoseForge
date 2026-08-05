'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { EngineInfo } from '@/lib/api/types';
import type { StudioMode } from '@/lib/studio/reducer';

export interface GenerationDockProps {
  engines: EngineInfo[];
  engine: string;
  onEngineChange: (engine: string) => void;
  mode: StudioMode;
  summary: string;
  hint: string;
  usage: string;
  status: string | null;
  statusIsError: boolean;
  canGenerate: boolean;
  submitting: boolean;
}

function EngineIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v4m0 10v4M3 12h4m10 0h4M5.6 5.6l2.8 2.8m7.2 7.2 2.8 2.8m0-12.8-2.8 2.8m-7.2 7.2-2.8 2.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function GenerationDock({
  engines,
  engine,
  onEngineChange,
  mode,
  summary,
  hint,
  usage,
  status,
  statusIsError,
  canGenerate,
  submitting,
}: GenerationDockProps) {
  const selected = engines.find((item) => item.key === engine);
  const ready = Boolean(selected?.ready);

  return (
    <div className="generation-dock">
      <div className="engine-control">
        <span className="engine-icon">
          <EngineIcon />
        </span>
        <div>
          <label htmlFor="engine">Generation engine</label>
          <select
            id="engine"
            value={engine}
            onChange={(event) => onEngineChange(event.target.value)}
          >
            {engines.length ? (
              engines.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))
            ) : (
              <option value="">Loading…</option>
            )}
          </select>
        </div>
        <span className={cn('engine-state', ready && 'ready')}>
          <i />
          {engines.length ? (ready ? 'Ready' : 'Not ready') : 'Checking'}
        </span>
      </div>

      <div className="generate-summary">
        <strong>{summary}</strong>
        <span>{hint}</span>
        <small className="dock-usage">{usage}</small>
        <p className={cn('dock-status', statusIsError && 'error')} aria-live="polite">
          {status}
        </p>
      </div>

      <button type="submit" className="generate-button" disabled={!canGenerate || submitting}>
        <span className="generate-button-copy">
          <small>{mode === 'advanced' ? 'Advanced transformation' : 'Guided transformation'}</small>
          <strong>{submitting ? 'Queueing…' : 'Generate transformation'}</strong>
        </span>
        <span className="generate-arrow">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M5 12h14m-6-6 6 6-6 6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
    </div>
  );
}

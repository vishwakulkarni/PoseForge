'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { Generation } from '@/lib/api/types';
import type { StudioMode } from '@/lib/studio/reducer';

export type CanvasState = 'idle' | 'ready' | 'running' | 'done';

const STATUS_LABEL: Record<CanvasState, string> = {
  idle: 'Ready to compose',
  ready: 'Composition ready',
  running: 'Generation in progress',
  done: 'Generation complete',
};

export interface CanvasPanelProps {
  mode: StudioMode;
  onModeChange: (mode: StudioMode) => void;
  aspectRatio: string;
  status: CanvasState;
  /** Overrides the derived status copy, e.g. "Upload pose collage". */
  statusLabel?: string;
  posePreviewUrl: string | null;
  subjectPreviews: string[];
  subjectCount: number;
  hasPose: boolean;
  generations: Generation[];
  activeIndex: number;
  onSelectVariant: (index: number) => void;
  onRegenerate: () => void;
  tip: string;
}

const BLANK_POSE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600'%3E%3Crect width='100%25' height='100%25' fill='%23e9ebef'/%3E%3C/svg%3E";

export function CanvasPanel({
  mode,
  onModeChange,
  aspectRatio,
  status,
  statusLabel,
  posePreviewUrl,
  subjectPreviews,
  subjectCount,
  hasPose,
  generations,
  activeIndex,
  onSelectVariant,
  onRegenerate,
  tip,
}: CanvasPanelProps) {
  const hasSources = subjectCount > 0 || hasPose;
  const active = generations[activeIndex] ?? generations.find((item) => item.outputUrl);
  const anyOutput = generations.some((item) => item.outputUrl);
  const showLoader = status === 'running' && !anyOutput;
  const allFailed = generations.length > 0 && generations.every((item) => item.status === 'failed');

  return (
    <section className="canvas-panel" aria-label="Composition canvas">
      <div className="canvas-toolbar">
        <div className="canvas-status">
          <span
            className={cn(
              'canvas-status-dot',
              status === 'running' && 'running',
              (status === 'ready' || status === 'done') && 'ready',
            )}
          />
          <span aria-live="polite">{statusLabel ?? STATUS_LABEL[status]}</span>
        </div>

        <div className="mode-switch" role="group" aria-label="Studio experience level">
          <button
            type="button"
            className={cn(mode === 'normal' && 'active')}
            aria-pressed={mode === 'normal'}
            onClick={() => onModeChange('normal')}
          >
            Normal
          </button>
          <button
            type="button"
            className={cn(mode === 'advanced' && 'active')}
            aria-pressed={mode === 'advanced'}
            onClick={() => onModeChange('advanced')}
          >
            Advanced <span className="pro-dot" aria-hidden />
          </button>
        </div>

        <div className="canvas-tools">
          <span className="canvas-meta">{aspectRatio}</span>
          <button type="button" className="canvas-tool" title="Fit canvas" aria-label="Fit canvas">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="canvas-viewport">
        <div className="canvas-artboard" data-aspect={aspectRatio}>
          {!hasSources && !generations.length ? (
            <div className="canvas-empty">
              <div className="canvas-orbit" aria-hidden>
                <span />
                <span />
                <span />
                <div className="orbit-mark" />
              </div>
              <h3>Build your composition</h3>
              <p>
                Add a subject and pose reference. Your source preview will assemble here before
                generation.
              </p>
            </div>
          ) : null}

          {hasSources && !generations.length ? (
            <div className="source-composition">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob and local storage URLs */}
              <img
                className="composition-pose"
                src={posePreviewUrl || BLANK_POSE}
                alt="Selected pose reference"
              />
              <div className="composition-wash" />
              <div className="composition-subjects">
                {subjectPreviews.map((url, index) => (
                  <div className="composition-subject" key={index}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- blob and local storage URLs */}
                    <img src={url} alt="" />
                  </div>
                ))}
              </div>
              <div className="composition-caption">
                <span>Source composition</span>
                <strong>
                  {subjectCount} subject{subjectCount === 1 ? '' : 's'} ·{' '}
                  {hasPose ? 'pose ready' : 'add pose'}
                </strong>
              </div>
            </div>
          ) : null}

          {showLoader ? (
            <div className="generation-stage">
              <div className="studio-loader">
                {/* eslint-disable-next-line @next/next/no-img-element -- static asset, no optimisation needed */}
                <img src="/images/mascot-painter-dog.svg" alt="" />
                <div className="loader-ring" />
                <strong>Forging your composition</strong>
                <span>Preserving identity, pose, and direction</span>
              </div>
            </div>
          ) : null}

          {!showLoader && allFailed ? (
            <div className="generation-stage">
              <div className="generation-error">
                <span>Generation stopped</span>
                <strong>No variation completed successfully.</strong>
                <p>
                  {generations[0]?.errorMessage ??
                    'Review the selected engine and try again.'}
                </p>
                <Link href="/history">Open generation history →</Link>
              </div>
            </div>
          ) : null}

          {!showLoader && active?.outputUrl ? (
            <div className="generation-stage">
              {/* eslint-disable-next-line @next/next/no-img-element -- local storage mount */}
              <img src={active.outputUrl} alt="Generated transformation" />
              <div className="result-overlay">
                <span>Variation {activeIndex + 1}</span>
                <div>
                  <a href={active.outputUrl} download>
                    Download
                  </a>
                  <Link href="/history">History</Link>
                  <button type="button" onClick={onRegenerate}>
                    Regenerate
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {generations.length > 1 ? (
        <div className="variant-tray" role="group" aria-label="Generated variations">
          {generations.map((generation, index) => (
            <button
              key={generation.id}
              type="button"
              className={cn('variant-thumb', index === activeIndex && 'active')}
              aria-pressed={index === activeIndex}
              aria-label={`Variation ${index + 1}`}
              onClick={() => onSelectVariant(index)}
            >
              {generation.outputUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- local storage mount
                <img src={generation.outputUrl} alt="" />
              ) : (
                <span>{generation.status === 'failed' ? 'Failed' : '…'}</span>
              )}
            </button>
          ))}
        </div>
      ) : null}

      <div className="canvas-footer">
        <div className="canvas-tip">
          <kbd>Tip</kbd>
          <span>{tip}</span>
        </div>
        {status === 'running' ? (
          <div className="canvas-progress" aria-hidden>
            <span />
          </div>
        ) : null}
      </div>
    </section>
  );
}

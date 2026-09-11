'use client';

import * as React from 'react';
import Link from 'next/link';
import { Image as ImageIcon } from 'lucide-react';
import type { StudioNodeBodyProps } from './types';

/** Renders `result` nodes — a generated-image slot: pending/failed/empty
 * states, plus download/history/regenerate actions once it's the active,
 * completed result. */
export function ResultNodeBody({ id: _id, data, actions, running, failed }: StudioNodeBodyProps) {
  return (
    <>
      <button
        type="button"
        className="poseforge-result-media"
        aria-label={data.imageUrl
          ? `Open generated result ${(data.index ?? 0) + 1} preview`
          : `Select result ${(data.index ?? 0) + 1}`}
        aria-pressed={data.active}
        aria-haspopup={data.imageUrl ? 'dialog' : undefined}
        onClick={(event) => {
          event.stopPropagation();
          actions.onSelectVariant(data.index ?? 0);
          if (data.imageUrl) {
            actions.onPreviewResult({
              imageUrl: data.imageUrl,
              index: data.index ?? 0,
              poseLabel: data.poseLabel,
            });
          }
        }}
      >
        {data.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local storage mount
          <img src={data.imageUrl} alt={`Generated result ${(data.index ?? 0) + 1}`} draggable={false} decoding="async" />
        ) : running ? (
          <span className="poseforge-result-state" aria-live="polite">
            <i className="poseforge-spinner" aria-hidden />
            <strong>{data.status === 'pending' ? 'Queued' : 'Forging result'}</strong>
            <small>Preserving identity and pose</small>
          </span>
        ) : failed ? (
          <span className="poseforge-result-state" aria-live="polite">
            <i className="poseforge-failure-mark" aria-hidden>!</i>
            <strong>Generation failed</strong>
            <small>{data.errorMessage ?? 'Review the engine and try again.'}</small>
          </span>
        ) : (
          <span className="poseforge-result-state">
            <ImageIcon size={30} strokeWidth={1.25} />
            <strong>Result will appear here</strong>
            <small>Complete the inputs, then generate</small>
          </span>
        )}
      </button>
      <div className="poseforge-node-label poseforge-result-label">
        <span>{data.poseLabel ? `Pose · ${data.poseLabel}` : data.meta}</span>
        <strong>{data.label}</strong>
      </div>
      {data.active && data.imageUrl ? (
        <div className="nodrag poseforge-result-actions">
          <a href={data.imageUrl} download>Download</a>
          <Link href="/history">History</Link>
          <button type="button" onClick={actions.onRegenerate}>Regenerate</button>
        </div>
      ) : null}
    </>
  );
}

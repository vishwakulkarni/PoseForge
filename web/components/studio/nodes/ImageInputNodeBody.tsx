'use client';

import * as React from 'react';
import { ClipboardPaste, Trash2, X } from 'lucide-react';
import type { StudioNodeBodyProps } from './types';

/** Renders `character` and `pose` nodes — image-source blocks the user
 * fills by picking an asset or pasting from the clipboard. Mirrors
 * Image input node body. */
export function ImageInputNodeBody({ id, data, actions, Icon }: StudioNodeBodyProps) {
  return (
    <>
      <button
        type="button"
        className="nodrag poseforge-node-media"
        aria-label={data.imageUrl ? `Replace image for ${data.label}` : `Select image for ${data.label}`}
        title="Choose an image or paste one from the clipboard"
        onClick={(event) => {
          event.stopPropagation();
          if (!actions.locked) actions.onOpenPicker(id);
        }}
      >
        {data.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob, local storage, and provider URLs
          <img src={data.imageUrl} alt="" draggable={false} decoding="async" />
        ) : (
          <span className="poseforge-node-placeholder" aria-hidden>
            <Icon size={34} strokeWidth={1.25} />
          </span>
        )}
        <span
          className="poseforge-node-paste-hint"
          role="img"
          aria-label={`Paste image available for ${data.label}`}
        >
          <ClipboardPaste size={13} strokeWidth={1.9} aria-hidden />
          <span>Paste</span>
        </span>
      </button>
      <div className="poseforge-node-label">
        <span>{data.meta}</span>
        <strong>{data.label}</strong>
        {data.suggestionId && actions.onToggleSuggestion ? (
          <button
            type="button"
            className="nodrag poseforge-node-remove"
            aria-label={`Remove suggested pose ${data.label}`}
            onClick={(event) => {
              event.stopPropagation();
              actions.onToggleSuggestion?.(data.suggestionId!);
            }}
          >
            <X size={14} />
          </button>
        ) : data.imageUrl ? (
          <button
            type="button"
            className="nodrag poseforge-node-remove"
            aria-label={`Delete ${data.kind} ${data.label}`}
            title={`Delete ${data.kind}`}
            disabled={actions.locked}
            onClick={(event) => {
              event.stopPropagation();
              actions.onRemove(id);
            }}
          >
            <Trash2 size={14} />
          </button>
        ) : null}
      </div>
    </>
  );
}

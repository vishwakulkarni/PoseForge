'use client';

import * as React from 'react';
import { AudioLines, Film, Loader2, Maximize, Repeat2, Trash2, Upload } from 'lucide-react';
import type { AdvMediaInputNodeData } from '@/lib/advanced-studio/types';
import type { AdvNodeBodyProps } from '../node-context';
import { cn } from '@/lib/utils';

const ACCEPT = {
  video: 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v',
  audio: 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac',
};

/**
 * Video input and audio input.
 *
 * One clip per node, dropped or picked from disk. Like the image input, the
 * upload is stored by PoseForge and the node keeps only the returned URL.
 */
export const MediaInputNodeBody = React.memo(function MediaInputNodeBody({
  id,
  type,
  data,
  actions,
}: AdvNodeBodyProps<AdvMediaInputNodeData>) {
  const kind = type === 'audioInput' ? 'audio' : 'video';
  const noun = kind === 'audio' ? 'audio clip' : 'video';
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const accept = React.useCallback(async (file: File | null | undefined) => {
    if (!file || actions.locked) return;
    if (!file.type.startsWith(`${kind}/`)) {
      setError(`That file is not ${kind === 'audio' ? 'an audio clip' : 'a video'}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await actions.uploadMedia(id, file);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `That ${noun} could not be added.`);
    } finally {
      setBusy(false);
    }
  }, [actions, id, kind, noun]);

  const choose = () => {
    if (!actions.locked && !busy) inputRef.current?.click();
  };

  return (
    <div className="adv-node-body adv-image-body">
      <div
        tabIndex={0}
        role="button"
        aria-label={data.mediaUrl ? `${data.label}: ${noun} preview` : `${data.label}: choose a ${noun}`}
        className={cn('adv-dropzone nodrag nopan', !data.mediaUrl && 'is-empty')}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void accept(event.dataTransfer.files?.[0]);
        }}
        onClick={() => {
          if (!data.mediaUrl) choose();
        }}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && !data.mediaUrl) {
            event.preventDefault();
            choose();
          }
        }}
      >
        {busy ? (
          <span className="adv-state"><Loader2 aria-hidden className="adv-spin" size={18} /> Uploading {noun}…</span>
        ) : data.mediaUrl && kind === 'video' ? (
          <video src={data.mediaUrl} className="adv-image-preview" data-fit="fit" controls playsInline preload="metadata" />
        ) : data.mediaUrl ? (
          <span className="adv-state">
            <AudioLines aria-hidden size={18} />
            <audio src={data.mediaUrl} controls preload="metadata" />
          </span>
        ) : (
          <span className="adv-state">
            {kind === 'audio' ? <AudioLines aria-hidden size={18} /> : <Film aria-hidden size={18} />}
            <Upload aria-hidden size={14} /> Drop or choose a {noun}
          </span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT[kind]}
          className="adv-visually-hidden"
          tabIndex={-1}
          onChange={(event) => {
            void accept(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>

      {error ? <p className="adv-inline-error" role="alert">{error}</p> : null}

      <div className="adv-image-footer nodrag nopan">
        <span className="adv-meta" title={data.fileName}>
          {data.mediaUrl ? data.fileName ?? `${kind === 'audio' ? 'Audio' : 'Video'} ready` : `No ${noun} yet`}
        </span>
        <span className="adv-icon-row">
          {data.mediaUrl ? (
            <>
              {kind === 'video' ? (
                <button
                  type="button"
                  className="adv-icon-button"
                  title="Open full size"
                  aria-label="Open full size"
                  onClick={() => actions.openPreview(data.mediaUrl!, 'video')}
                >
                  <Maximize aria-hidden size={14} />
                </button>
              ) : null}
              <button
                type="button"
                className="adv-icon-button"
                title={`Replace ${noun}`}
                aria-label={`Replace ${noun}`}
                disabled={actions.locked || busy}
                onClick={choose}
              >
                <Repeat2 aria-hidden size={14} />
              </button>
              <button
                type="button"
                className="adv-icon-button"
                title={`Remove ${noun}`}
                aria-label={`Remove ${noun}`}
                disabled={actions.locked}
                onClick={() => actions.clearMedia(id)}
              >
                <Trash2 aria-hidden size={14} />
              </button>
            </>
          ) : null}
        </span>
      </div>
    </div>
  );
});

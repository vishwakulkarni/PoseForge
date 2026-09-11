'use client';

import * as React from 'react';
import { Download, ImageOff, Loader2, Repeat2, Trash2, Upload } from 'lucide-react';
import type { AdvImageInputNodeData } from '@/lib/advanced-studio/types';
import type { AdvNodeBodyProps } from '../node-context';
import { cn } from '@/lib/utils';

/**
 * Image input.
 *
 * Accepts drag-and-drop, a file picker, and a clipboard paste while focused.
 * The upload goes through PoseForge's existing media layer and the node keeps
 * only the returned URL, so there is no second media store and no base64 in
 * the saved document.
 */
export const ImageInputNodeBody = React.memo(function ImageInputNodeBody({
  id,
  data,
  actions,
}: AdvNodeBodyProps<AdvImageInputNodeData>) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [brokenUrl, setBrokenUrl] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dropRef = React.useRef<HTMLDivElement>(null);

  const accept = React.useCallback(async (file: File | null | undefined) => {
    if (!file || actions.locked) return;
    setBusy(true);
    setError(null);
    setBrokenUrl(null);
    try {
      await actions.uploadImage(id, file);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That image could not be added.');
    } finally {
      setBusy(false);
    }
  }, [actions, id]);

  // Paste only applies while this node has focus, so two image nodes on the
  // canvas never both consume the same clipboard event.
  React.useEffect(() => {
    const element = dropRef.current;
    if (!element) return;
    const onPaste = (event: ClipboardEvent) => {
      if (!element.contains(document.activeElement)) return;
      const file = [...(event.clipboardData?.items ?? [])]
        .find((item) => item.type.startsWith('image/'))
        ?.getAsFile();
      if (file) {
        event.preventDefault();
        void accept(file);
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [accept]);

  const failed = Boolean(data.imageUrl && brokenUrl === data.imageUrl);

  return (
    <div className="adv-node-body adv-image-body">
      <div
        ref={dropRef}
        tabIndex={0}
        role="button"
        aria-label={data.imageUrl ? `${data.label}: replace image` : `${data.label}: add an image`}
        className={cn('adv-dropzone nodrag nopan', !data.imageUrl && 'is-empty', failed && 'is-failed')}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void accept(event.dataTransfer.files?.[0]);
        }}
        onClick={() => !actions.locked && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!actions.locked) inputRef.current?.click();
          }
        }}
      >
        {busy ? (
          <span className="adv-state"><Loader2 aria-hidden className="adv-spin" size={18} /> Adding image…</span>
        ) : failed ? (
          <span className="adv-state"><ImageOff aria-hidden size={18} /> This image is missing</span>
        ) : data.imageUrl ? (
          // Local-first storage serves these from /storage; the Next image
          // loader adds no value and would proxy a file already on disk.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.imageUrl}
            alt={data.fileName ? `${data.fileName}` : 'Connected image'}
            className="adv-image-preview"
            data-fit={data.imageFit ?? 'fill'}
            onError={() => setBrokenUrl(data.imageUrl ?? null)}
          />
        ) : (
          <span className="adv-state"><Upload aria-hidden size={18} /> Drop an image, paste, or click to browse</span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
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
        <span className="adv-meta">
          {data.naturalWidth && data.naturalHeight
            ? `${data.naturalWidth} × ${data.naturalHeight}`
            : data.imageUrl ? 'Image ready' : 'No image yet'}
        </span>
        <span className="adv-icon-row">
          {data.imageUrl ? (
            <>
              <button
                type="button"
                className="adv-icon-button"
                title="Open full size"
                aria-label="Open full size"
                onClick={() => actions.openPreview(data.imageUrl!)}
              >
                <Download aria-hidden size={14} />
              </button>
              <button
                type="button"
                className="adv-icon-button"
                title="Replace image"
                aria-label="Replace image"
                disabled={actions.locked}
                onClick={() => inputRef.current?.click()}
              >
                <Repeat2 aria-hidden size={14} />
              </button>
              <button
                type="button"
                className="adv-icon-button"
                title="Remove image"
                aria-label="Remove image"
                disabled={actions.locked}
                onClick={() => actions.clearImage(id)}
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

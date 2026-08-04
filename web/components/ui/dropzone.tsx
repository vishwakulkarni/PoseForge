'use client';

import * as React from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api/client';

export interface DropzoneProps {
  /** Object URL of the current preview, or null when empty. */
  previewUrl: string | null;
  onFileSelected: (file: File) => void;
  onClear?: () => void;
  label?: string;
  hint?: string;
  accept?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  /** Announced to screen readers; defaults to `label`. */
  'aria-label'?: string;
}

/**
 * File input with drag-and-drop, keyboard activation and HEIC-aware preview.
 *
 * The legacy implementation had two bugs this fixes:
 *   1. Object URLs were never revoked, leaking blobs on every re-pick.
 *   2. Drag-enter/leave used a boolean, so dragging over a child element
 *      fired leave and flickered the highlight. We count depth instead.
 */
export function Dropzone({
  previewUrl,
  onFileSelected,
  onClear,
  label = 'Add a photo',
  hint = 'JPG, PNG, HEIC or HEIF · 25MB max',
  accept = 'image/*,.heic,.heif',
  disabled,
  className,
  id,
  'aria-label': ariaLabel,
}: DropzoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dragDepth = React.useRef(0);
  const [dragActive, setDragActive] = React.useState(false);

  const handleFiles = React.useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onFileSelected(file);
    },
    [onFileSelected],
  );

  return (
    <div
      className={cn(
        'group relative grid min-h-[150px] place-items-center gap-2 overflow-hidden',
        'rounded-[15px] border border-dashed border-[var(--pf-border-strong)]',
        'bg-[var(--pf-surface-muted)] text-center transition-[border-color,background-color] duration-150',
        !disabled && 'cursor-pointer hover:border-[var(--pf-accent)] hover:bg-[var(--pf-accent-soft)]',
        dragActive && 'border-[var(--pf-accent)] bg-[var(--pf-accent-soft)]',
        previewUrl && 'border-solid p-0',
        !previewUrl && 'p-5',
        disabled && 'opacity-50',
        className,
      )}
      onDragEnter={(event) => {
        event.preventDefault();
        if (disabled) return;
        dragDepth.current += 1;
        setDragActive(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragActive(false);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragActive(false);
        if (disabled) return;
        handleFiles(event.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        aria-label={ariaLabel ?? label}
        className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        onChange={(event) => {
          handleFiles(event.target.files);
          // Reset so picking the same file twice still fires onChange.
          event.target.value = '';
        }}
      />

      {previewUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- blob: URLs cannot go through next/image */}
          <img
            src={previewUrl}
            alt=""
            className="pointer-events-none absolute inset-0 size-full object-cover"
          />
          {onClear ? (
            <button
              type="button"
              aria-label="Remove photo"
              onClick={(event) => {
                event.stopPropagation();
                onClear();
              }}
              className={cn(
                'absolute right-2 top-2 z-10 grid size-7 place-items-center rounded-lg',
                'bg-[rgba(0,0,0,0.6)] text-white opacity-0 transition-opacity',
                'group-hover:opacity-100 focus-visible:opacity-100',
              )}
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </>
      ) : (
        <div className="pointer-events-none flex flex-col items-center gap-2">
          <span className="grid size-[38px] place-items-center rounded-[12px] border border-[var(--pf-border)] bg-[var(--pf-surface)] text-[var(--pf-text-secondary)]">
            <ImagePlus className="size-4" />
          </span>
          <span className="text-[12px] font-bold">{label}</span>
          <span className="max-w-[220px] text-[10px] leading-[1.4] text-[var(--pf-text-tertiary)]">
            {hint}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Owns an image preview object URL for a picked File, converting HEIC via the
 * server when needed, and revoking the previous URL on every change and on
 * unmount so blobs do not accumulate.
 */
export function useImagePreview() {
  const [file, setFile] = React.useState<File | null>(null);
  const [url, setUrl] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const currentUrl = React.useRef<string | null>(null);

  const revoke = React.useCallback(() => {
    if (currentUrl.current) {
      URL.revokeObjectURL(currentUrl.current);
      currentUrl.current = null;
    }
  }, []);

  React.useEffect(() => revoke, [revoke]);

  const select = React.useCallback(
    async (next: File) => {
      setError(null);
      setPending(true);
      try {
        const nextUrl = await api.media.previewUrl(next);
        revoke();
        currentUrl.current = nextUrl;
        setUrl(nextUrl);
        setFile(next);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'That image could not be previewed.');
      } finally {
        setPending(false);
      }
    },
    [revoke],
  );

  const clear = React.useCallback(() => {
    revoke();
    setUrl(null);
    setFile(null);
    setError(null);
  }, [revoke]);

  return { file, url, pending, error, select, clear };
}

export function DropzoneBusy() {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-[var(--pf-surface)]/70">
      <Loader2 className="size-5 animate-spin text-[var(--pf-accent)]" />
    </div>
  );
}

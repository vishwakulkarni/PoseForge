'use client';

import * as React from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { cn } from '@/lib/utils';
import { buttonVariants } from './button';
import { Loader2 } from 'lucide-react';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
}

/**
 * Destructive-action confirmation built on Radix AlertDialog.
 *
 * AlertDialog (not Dialog) is the correct primitive here: it traps focus on
 * the cancel action by default and uses role="alertdialog", so screen readers
 * announce the consequence rather than treating it as an ordinary panel.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  loading,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          className={cn(
            'fixed inset-0 z-[300] bg-[rgba(9,11,15,0.55)] backdrop-blur-[12px]',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
          )}
        />
        <AlertDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-[301] w-[calc(100vw-48px)] max-w-[440px]',
            '-translate-x-1/2 -translate-y-1/2 rounded-[22px] p-6',
            'border border-[var(--pf-border)] bg-[var(--pf-surface)] shadow-[var(--pf-shadow-lg)]',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          )}
        >
          <AlertDialog.Title className="text-[18px] font-bold">{title}</AlertDialog.Title>
          {description ? (
            <AlertDialog.Description className="mt-2 text-[13px] leading-relaxed text-[var(--pf-text-secondary)]">
              {description}
            </AlertDialog.Description>
          ) : null}

          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel
              className={cn(buttonVariants({ variant: 'ghost', size: 'md' }))}
              disabled={loading}
            >
              {cancelLabel}
            </AlertDialog.Cancel>
            <button
              type="button"
              disabled={loading}
              aria-busy={loading || undefined}
              onClick={() => void onConfirm()}
              className={cn(
                buttonVariants({ variant: destructive ? 'danger' : 'primary', size: 'md' }),
              )}
            >
              {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {confirmLabel}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

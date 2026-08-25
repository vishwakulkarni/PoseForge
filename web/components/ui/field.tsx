'use client';

import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

const CONTROL_CLASS = [
  'w-full rounded-[11px] border border-[var(--pf-border)] bg-[var(--pf-surface-muted)]',
  'px-3 py-[11px] text-[13px] leading-[1.4] text-[var(--pf-text-primary)]',
  'outline-none transition-[border-color,box-shadow,background-color] duration-150',
  'placeholder:text-[var(--pf-text-tertiary)]',
  'focus:border-[color-mix(in_srgb,var(--pf-accent)_65%,var(--pf-border))]',
  'focus:bg-[var(--pf-surface)] focus:shadow-[0_0_0_3px_var(--pf-accent-soft)]',
  'disabled:opacity-50 disabled:cursor-not-allowed',
  'aria-[invalid=true]:border-[var(--pf-error)] aria-[invalid=true]:shadow-[0_0_0_3px_var(--pf-error-bg)]',
].join(' ');

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(CONTROL_CLASS, className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea ref={ref} className={cn(CONTROL_CLASS, 'min-h-[88px] resize-y', className)} {...props} />
  );
});

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return <select ref={ref} className={cn(CONTROL_CLASS, className)} {...props} />;
  },
);

export const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(function Label({ className, ...props }, ref) {
  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(
        'flex justify-between gap-3 text-[11px] font-bold tracking-[0.02em] text-[var(--pf-text-secondary)]',
        className,
      )}
      {...props}
    />
  );
});

export interface FieldProps {
  label?: React.ReactNode;
  /** Right-aligned content in the label row — e.g. a live value readout. */
  labelAside?: React.ReactNode;
  help?: React.ReactNode;
  error?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Wraps a control with an accessible label, help text and error message.
 * Errors are announced politely so screen-reader users hear validation
 * failures without losing focus context.
 */
export function Field({
  label,
  labelAside,
  help,
  error,
  htmlFor,
  className,
  children,
}: FieldProps) {
  const helpId = htmlFor ? `${htmlFor}-help` : undefined;
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;

  return (
    <div className={cn('flex flex-col gap-[7px]', className)}>
      {label ? (
        <Label htmlFor={htmlFor}>
          <span>{label}</span>
          {labelAside ? (
            <span className="font-[750] text-[var(--pf-text-tertiary)] pf-numeric">{labelAside}</span>
          ) : null}
        </Label>
      ) : null}

      {children}

      {help && !error ? (
        <p id={helpId} className="text-[10px] leading-[1.45] text-[var(--pf-text-tertiary)]">
          {help}
        </p>
      ) : null}

      {error ? (
        <p
          id={errorId}
          role="alert"
          aria-live="polite"
          className="text-[10px] leading-[1.45] font-semibold text-[var(--pf-error)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { CONTROL_CLASS };

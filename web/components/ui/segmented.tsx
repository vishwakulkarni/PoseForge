'use client';

import * as React from 'react';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Optional accessible description when the label alone is ambiguous. */
  title?: string;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  size?: 'sm' | 'md';
  'aria-label': string;
  className?: string;
}

/**
 * The pill-style segmented control used across the metrics dashboard
 * (Session/Historical, Daily/Weekly/Monthly, Tokens/Cost).
 *
 * Built on Radix ToggleGroup so arrow-key roving focus works out of the box.
 * Deselection is suppressed — a segmented control must always have exactly
 * one active value, and Radix would otherwise allow toggling the active item
 * off, leaving the view in an undefined state.
 */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  size = 'md',
  className,
  'aria-label': ariaLabel,
}: SegmentedProps<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(next as T);
      }}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-[var(--pf-border)]',
        'bg-[var(--pf-surface-muted)] p-1',
        className,
      )}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          title={option.title}
          className={cn(
            'rounded-full font-[650] text-[var(--pf-text-secondary)] cursor-pointer',
            'transition-[background-color,color,box-shadow] duration-150',
            'hover:not-disabled:text-[var(--pf-text-primary)]',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            'data-[state=on]:bg-[var(--pf-surface)] data-[state=on]:text-[var(--pf-text-primary)]',
            'data-[state=on]:shadow-[var(--pf-shadow-xs)]',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--pf-accent)]',
            size === 'sm' ? 'px-3 py-1.5 text-[11px]' : 'px-4 py-2 text-[12px]',
          )}
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

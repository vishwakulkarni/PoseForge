'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Small form primitives matching the Studio workbench's dense visual language.
 *
 * These are deliberately separate from components/ui: the workbench uses much
 * tighter typography and spacing than the rest of the app, and forcing the
 * general-purpose components to accommodate both would blur their defaults.
 */

export function StudioLabel({
  htmlFor,
  children,
  aside,
  className,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn('studio-field-label', className)}>
      <span>{children}</span>
      {aside != null ? <strong>{aside}</strong> : null}
    </label>
  );
}

export const StudioSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function StudioSelect({ className, ...props }, ref) {
  return <select ref={ref} className={cn('studio-select', className)} {...props} />;
});

export const StudioInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function StudioInput({ className, ...props }, ref) {
  return <input ref={ref} className={cn('studio-input', className)} {...props} />;
});

export const StudioTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function StudioTextarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn('studio-textarea', className)} {...props} />;
});

/** Labelled slider with an optional low/high axis caption. */
export function RangeField({
  id,
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  axis,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  axis?: [string, string];
}) {
  return (
    <div>
      <StudioLabel htmlFor={id} aside={value}>
        {label}
      </StudioLabel>
      <input
        id={id}
        type="range"
        className="studio-range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {axis ? (
        <div className="range-axis">
          <span>{axis[0]}</span>
          <span>{axis[1]}</span>
        </div>
      ) : null}
    </div>
  );
}

/** A labelled <select> built from a value/label option list. */
export function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <StudioLabel htmlFor={id}>{label}</StudioLabel>
      <StudioSelect id={id} value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </StudioSelect>
    </div>
  );
}

/** Checkbox row with a bold title and a smaller explanatory line. */
export function ToggleRow({
  id,
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
    </label>
  );
}

/** Collapsible inspector section, matching the legacy <details> groups. */
export function ControlGroup({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="control-group" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </summary>
      <div className="control-body">{children}</div>
    </details>
  );
}

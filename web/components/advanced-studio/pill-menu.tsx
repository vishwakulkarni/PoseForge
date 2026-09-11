'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PillOption<T extends string> {
  value: T;
  label: string;
  note?: string;
  group?: string;
  disabled?: boolean;
}

/**
 * Compact control used for every in-node selector (model, aspect ratio,
 * resolution, …). Keyboard accessible, closes on Escape or outside click, and
 * renders its list in place so it can never be clipped by the node frame.
 */
export function PillMenu<T extends string>({
  value,
  options,
  onChange,
  label,
  icon,
  disabled,
  className,
  placeholder = 'Select',
}: {
  value: T | undefined;
  options: PillOption<T>[];
  onChange: (value: T) => void;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const groups = React.useMemo(() => {
    const map = new Map<string, PillOption<T>[]>();
    for (const option of options) {
      const key = option.group ?? '';
      const list = map.get(key) ?? [];
      list.push(option);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [options]);

  return (
    <div className={cn('adv-pill-wrap nodrag nopan', className)} ref={containerRef}>
      <button
        type="button"
        className="adv-pill"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled || !options.length}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        {icon}
        <span className="adv-pill-label">{selected?.label ?? placeholder}</span>
        <ChevronDown aria-hidden size={13} className={cn('adv-pill-chevron', open && 'is-open')} />
      </button>
      {open ? (
        <div className="adv-pill-menu" role="listbox" aria-label={label}>
          {groups.map(([group, groupOptions]) => (
            <React.Fragment key={group || 'ungrouped'}>
              {group ? <p className="adv-pill-group">{group}</p> : null}
              {groupOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  className={cn('adv-pill-option', option.value === value && 'is-selected')}
                  disabled={option.disabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span>{option.label}</span>
                  {option.note ? <small>{option.note}</small> : null}
                </button>
              ))}
            </React.Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
}

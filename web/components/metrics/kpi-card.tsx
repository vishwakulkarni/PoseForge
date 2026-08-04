'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/feedback';
import { Tooltip } from '@/components/ui/controls';
import { Info } from 'lucide-react';

const valueVariants = cva('font-[var(--font-display)] leading-none tracking-[-0.03em] pf-numeric', {
  variants: {
    tone: {
      default: 'text-[var(--pf-text-primary)]',
      accent: 'text-[var(--pf-accent)]',
      success: 'text-[var(--pf-success)]',
      warning: 'text-[var(--pf-warning)]',
      error: 'text-[var(--pf-error)]',
    },
    size: {
      md: 'text-[30px]',
      lg: 'text-[38px]',
    },
  },
  defaultVariants: { tone: 'default', size: 'lg' },
});

export interface KpiCardProps extends VariantProps<typeof valueVariants> {
  label: string;
  value: React.ReactNode;
  caption?: React.ReactNode;
  /** Explains how the number is derived. Surfaced via an info affordance. */
  hint?: string;
  loading?: boolean;
  className?: string;
}

export function KpiCard({
  label,
  value,
  caption,
  hint,
  tone,
  size,
  loading,
  className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-[16px] border border-[var(--pf-border)]',
        'bg-[var(--pf-surface)] p-5',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-[750] uppercase leading-[1.4] tracking-[0.12em] text-[var(--pf-text-tertiary)]">
          {label}
        </span>
        {hint ? (
          <Tooltip content={hint}>
            <button
              type="button"
              aria-label={`How ${label} is calculated`}
              className="shrink-0 text-[var(--pf-text-tertiary)] transition-colors hover:text-[var(--pf-text-secondary)]"
            >
              <Info className="size-3.5" />
            </button>
          </Tooltip>
        ) : null}
      </div>

      {loading ? (
        <Skeleton className="h-[38px] w-3/4" />
      ) : (
        <span className={valueVariants({ tone, size })}>{value}</span>
      )}

      {caption ? (
        <span className="text-[11px] leading-[1.45] text-[var(--pf-text-tertiary)]">{caption}</span>
      ) : null}
    </div>
  );
}

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import type { GenerationStatus } from '@/lib/api/types';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 min-h-6 px-2.5 py-1 rounded-full text-[10px] font-[750] tracking-[0.02em]',
  {
    variants: {
      variant: {
        neutral: 'bg-[var(--pf-surface-muted)] text-[var(--pf-text-secondary)]',
        ok: 'bg-[var(--pf-success-bg)] text-[var(--pf-success)]',
        error: 'bg-[var(--pf-error-bg)] text-[var(--pf-error)]',
        warning: 'bg-[var(--pf-warning-bg)] text-[var(--pf-warning)]',
        running: 'bg-[var(--pf-accent-soft)] text-[var(--pf-accent)]',
        outline: 'border border-[var(--pf-border-strong)] text-[var(--pf-text-secondary)]',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
  /** Adds a pulse to the dot — used for in-flight generation states. */
  pulse?: boolean;
}

export function Badge({ className, variant, dot, pulse, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot ? (
        <span
          aria-hidden
          className={cn('size-1.5 rounded-full bg-current', pulse && 'animate-pulse')}
        />
      ) : null}
      {children}
    </span>
  );
}

const STATUS_VARIANT: Record<GenerationStatus, NonNullable<BadgeProps['variant']>> = {
  pending: 'neutral',
  running: 'running',
  completed: 'ok',
  failed: 'error',
};

const STATUS_LABEL: Record<GenerationStatus, string> = {
  pending: 'Queued',
  running: 'Generating',
  completed: 'Done',
  failed: 'Failed',
};

export function StatusBadge({ status, className }: { status: GenerationStatus; className?: string }) {
  const inFlight = status === 'pending' || status === 'running';
  return (
    <Badge variant={STATUS_VARIANT[status]} dot pulse={inFlight} className={className}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export { badgeVariants };

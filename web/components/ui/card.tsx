import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const cardVariants = cva('bg-[var(--pf-surface)] border border-[var(--pf-border)]', {
  variants: {
    variant: {
      raised: 'rounded-[22px] shadow-[var(--pf-shadow-sm)]',
      flat: 'rounded-[16px]',
      inset: 'rounded-[16px] bg-[var(--pf-surface-muted)]',
    },
    padding: {
      none: '',
      sm: 'p-4',
      md: 'p-5',
      lg: 'p-6',
    },
    interactive: {
      true: 'transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[var(--pf-border-strong)] hover:shadow-[var(--pf-shadow-md)]',
    },
  },
  defaultVariants: { variant: 'raised', padding: 'md' },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, variant, padding, interactive, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(cardVariants({ variant, padding, interactive }), className)}
      {...props}
    />
  );
});

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start justify-between gap-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-[17px] font-bold', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('text-[13px] leading-relaxed text-[var(--pf-text-secondary)]', className)}
      {...props}
    />
  );
}

/** The uppercase micro-label used above panels throughout the app. */
export function PanelTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'mb-4 text-[11px] font-[750] uppercase tracking-[0.1em] text-[var(--pf-text-tertiary)]',
        className,
      )}
      {...props}
    />
  );
}

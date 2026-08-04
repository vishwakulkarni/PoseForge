'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'rounded-[12px] border border-transparent font-bold leading-none',
    'transition-[transform,box-shadow,background-color,border-color,opacity] duration-150',
    'ease-[cubic-bezier(0.22,1,0.36,1)]',
    'cursor-pointer select-none',
    'hover:not-disabled:-translate-y-px active:not-disabled:scale-[0.98]',
    'disabled:opacity-45 disabled:cursor-not-allowed disabled:translate-y-0',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-accent)]',
    '[&_svg]:shrink-0 [&_svg]:pointer-events-none',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--pf-accent)] text-[var(--pf-accent-contrast)] shadow-[0_8px_22px_var(--pf-accent-glow)] hover:not-disabled:bg-[var(--pf-accent-hover)]',
        secondary:
          'bg-[var(--pf-surface)] text-[var(--pf-text-primary)] border-[var(--pf-border-strong)] hover:not-disabled:bg-[var(--pf-surface-raised)]',
        ghost:
          'text-[var(--pf-text-secondary)] hover:not-disabled:text-[var(--pf-text-primary)] hover:not-disabled:bg-[var(--pf-surface-muted)]',
        danger:
          'bg-[var(--pf-error-bg)] text-[var(--pf-error)] hover:not-disabled:brightness-95',
        inverse:
          'bg-[var(--pf-text-primary)] text-[var(--pf-bg)] hover:not-disabled:opacity-90',
      },
      size: {
        sm: 'min-h-[34px] px-3 py-2 text-xs rounded-[10px] [&_svg]:size-3.5',
        md: 'min-h-[42px] px-[18px] py-2.5 text-[13px] [&_svg]:size-4',
        lg: 'min-h-[50px] px-6 py-3.5 text-sm rounded-[14px] [&_svg]:size-4',
        icon: 'size-[38px] p-0 rounded-[12px] border-[var(--pf-border)] bg-[var(--pf-surface)] [&_svg]:size-4',
      },
      block: {
        true: 'w-full',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Renders a spinner and blocks interaction. Width stays stable to avoid layout shift. */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, asChild = false, loading = false, disabled, children, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button';

  // `asChild` forwards to an arbitrary element, so the spinner wrapper would
  // break Slot's single-child requirement. Loading is only honoured on real buttons.
  if (asChild) {
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, block }), className)}
        {...props}
      >
        {children}
      </Comp>
    );
  }

  return (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});

export { buttonVariants };

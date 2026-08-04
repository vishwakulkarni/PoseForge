'use client';

import * as React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

/** Shimmering placeholder. Always give it an explicit height via className. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative overflow-hidden rounded-[14px] bg-[var(--pf-surface-muted)]',
        'after:absolute after:inset-0 after:-translate-x-full',
        'after:bg-gradient-to-r after:from-transparent after:via-[color-mix(in_srgb,var(--pf-surface)_70%,transparent)] after:to-transparent',
        'after:animate-[pf-shimmer_1.5s_infinite]',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Announces loading state to assistive tech while showing skeletons visually.
 * Without this, screen readers hear nothing at all during a fetch.
 */
export function LoadingRegion({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-16 text-center',
        className,
      )}
    >
      {icon ? (
        <div className="grid size-12 place-items-center rounded-[16px] border border-[var(--pf-border)] bg-[var(--pf-surface-muted)] text-[var(--pf-text-tertiary)]">
          {icon}
        </div>
      ) : null}
      <p className="text-[15px] font-bold text-[var(--pf-text-primary)]">{title}</p>
      {description ? (
        <p className="max-w-[420px] text-[13px] leading-relaxed text-[var(--pf-text-tertiary)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-[16px]',
        'border border-[var(--pf-error)]/25 bg-[var(--pf-error-bg)] px-6 py-10 text-center',
        className,
      )}
    >
      <AlertTriangle className="size-5 text-[var(--pf-error)]" />
      <p className="text-[14px] font-bold text-[var(--pf-text-primary)]">{title}</p>
      {message ? (
        <p className="max-w-[460px] text-[12px] leading-relaxed text-[var(--pf-text-secondary)]">
          {message}
        </p>
      ) : null}
      {onRetry ? (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          <RefreshCw />
          Try again
        </Button>
      ) : null}
    </div>
  );
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time crashes so one broken panel cannot blank the page.
 * The legacy app had no equivalent — a single thrown error left users with a
 * half-rendered screen and no indication anything had failed.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: (error: Error, reset: () => void) => React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[PoseForge] render error', error, info.componentStack);
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return <ErrorState message={error.message} onRetry={this.reset} />;
  }
}

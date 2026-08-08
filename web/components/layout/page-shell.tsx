import * as React from 'react';
import { cn } from '@/lib/utils';
import { SiteFooter, SiteNav } from './site-nav';

export interface PageShellProps {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Full-bleed pages (the landing page) skip the standard header block. */
  bare?: boolean;
  className?: string;
}

/**
 * Standard page chrome: nav, header block, main landmark, footer.
 *
 * Centralising this fixes an accessibility gap in the legacy markup, where
 * only some pages wrapped content in <main> and none had a skip link.
 */
export function PageShell({
  eyebrow,
  title,
  description,
  actions,
  children,
  bare,
  className,
}: PageShellProps) {
  return (
    <>
      <SiteNav />
      <main id="main" className={cn(bare ? undefined : 'pf-container', className)}>
        {bare ? null : (
          <header className="flex flex-col items-start justify-between gap-1 pb-1 pt-2 md:flex-row md:items-end">
            <div className="max-w-[680px]">
              {eyebrow ? <span className="pf-eyebrow">{eyebrow}</span> : null}
              <h1 className="mt-2.5 text-[clamp(34px,5vw,52px)] leading-[1.04]">{title}</h1>
              {description ? (
                <p className="mt-3 max-w-[620px] text-[16px] leading-relaxed text-[var(--pf-text-secondary)]">
                  {description}
                </p>
              ) : null}
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </header>
        )}
        {children}
      </main>
      <SiteFooter />
    </>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Moon, Sun, X } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export const NAV_ITEMS = [
  { label: 'Studio', href: '/studio' },
  { label: 'Characters', href: '/characters' },
  { label: 'Poses', href: '/poses' },
  { label: 'History', href: '/history' },
  { label: 'Metrics', href: '/metrics' },
  { label: 'Docs', href: '/docs' },
  { label: 'Settings', href: '/settings' },
] as const;

const GITHUB_PAGES_NAV_ITEMS = [
  { label: 'Home', href: '/' },
  { label: 'Docs', href: '/docs' },
] as const;
const IS_GITHUB_PAGES = process.env.NEXT_PUBLIC_GITHUB_PAGES === 'true';
const INSTALL_URL = 'https://github.com/vishwakulkarni/PoseForge#quickstart';

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      size="icon"
      variant="secondary"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      // The label depends on resolvedTheme, which is undefined during SSR.
      // suppressHydrationWarning keeps the attribute mismatch from warning
      // while still giving the correct label once next-themes resolves.
      suppressHydrationWarning
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {/*
        Both icons are rendered and toggled by CSS on the `dark` class that
        next-themes writes to <html> before paint. This avoids the usual
        mount-guard effect (and its flash of the wrong icon) entirely.
      */}
      <Moon className="dark:hidden" />
      <Sun className="hidden dark:block" />
    </Button>
  );
}

function BrandMark() {
  return (
    <span
      aria-hidden
      className="relative grid size-[30px] place-items-center overflow-hidden rounded-[10px] bg-gradient-to-br from-[#8f87ff] to-[#5248ed] text-white shadow-[0_7px_18px_var(--pf-accent-glow)]"
    >
      <span className="absolute h-5 w-[13px] rotate-[18deg] rounded-[8px_8px_10px_10px] border-2 border-white/90" />
    </span>
  );
}

export function SiteNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const navItems = IS_GITHUB_PAGES ? GITHUB_PAGES_NAV_ITEMS : NAV_ITEMS;

  const isActive = React.useCallback(
    (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href)),
    [pathname],
  );

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-[var(--pf-surface)] focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:shadow-[var(--pf-shadow-md)]"
      >
        Skip to content
      </a>

      <nav
        className="sticky top-0 z-[100] h-[var(--pf-nav-h)] border-b border-[var(--pf-border)] bg-[color-mix(in_srgb,var(--pf-bg)_82%,transparent)] backdrop-blur-[18px] backdrop-saturate-150"
        aria-label="Primary"
      >
        <div className="pf-container pf-site-nav-grid grid h-full grid-cols-[1fr_auto] items-center gap-4 xl:gap-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 justify-self-start font-[var(--font-display)] text-[15px] font-[750] tracking-[-0.025em]"
          >
            <BrandMark />
            <span>PoseForge</span>
          </Link>

          <ul className="pf-primary-nav items-center gap-0.5 justify-self-center rounded-full border border-[var(--pf-border)] bg-[var(--pf-surface-muted)] p-1 xl:gap-1">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={cn(
                    'block rounded-full px-2.5 py-2 text-[11px] font-[650] transition-colors duration-150 xl:px-3 xl:text-[12px]',
                    isActive(item.href)
                      ? 'bg-[var(--pf-surface)] text-[var(--pf-text-primary)] shadow-[var(--pf-shadow-xs)]'
                      : 'text-[var(--pf-text-secondary)] hover:text-[var(--pf-text-primary)]',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2 justify-self-end">
            <ThemeToggle />
            <Button asChild variant="inverse" size="sm" className="pf-desktop-cta">
              {IS_GITHUB_PAGES ? (
                <a href={INSTALL_URL}>Install PoseForge</a>
              ) : (
                <Link href="/studio">Open Studio</Link>
              )}
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="pf-mobile-nav-toggle"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
              onClick={() => setMobileOpen((open) => !open)}
            >
              {mobileOpen ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
      </nav>

      {mobileOpen ? (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="pf-mobile-nav-panel fixed inset-x-3 top-[calc(var(--pf-nav-h)+8px)] z-[99] rounded-[16px] border border-[var(--pf-border)] bg-[var(--pf-surface)] p-2.5 shadow-[var(--pf-shadow-lg)]"
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              // Closing here rather than in a pathname effect: navigating to
              // the page you are already on still needs to dismiss the drawer,
              // and an effect keyed on pathname would not fire in that case.
              onClick={() => setMobileOpen(false)}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={cn(
                'block rounded-[10px] px-3.5 py-3 text-sm font-[650] transition-colors',
                isActive(item.href)
                  ? 'bg-[var(--pf-surface-muted)] text-[var(--pf-text-primary)]'
                  : 'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-surface-muted)] hover:text-[var(--pf-text-primary)]',
              )}
            >
              {item.label}
            </Link>
          ))}
          {IS_GITHUB_PAGES ? (
            <a
              href={INSTALL_URL}
              onClick={() => setMobileOpen(false)}
              className="mt-1 block rounded-[10px] bg-[var(--pf-text-primary)] px-3.5 py-3 text-sm font-[700] text-[var(--pf-bg)]"
            >
              Install PoseForge
            </a>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-[var(--pf-border)] py-7 text-[11px] text-[var(--pf-text-tertiary)]">
      <div className="pf-container flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <p>PoseForge — your local-first home photo studio.</p>
        <p>Light by default · Dark when you want it · Apache 2.0</p>
      </div>
    </footer>
  );
}

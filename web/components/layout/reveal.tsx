'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Scroll-triggered fade-and-rise, replacing the legacy `.reveal` +
 * IntersectionObserver pair in base.js.
 *
 * Two behaviours the original lacked:
 *   - Content is visible by default and only hidden once we know the observer
 *     will run, so JS failures or bots never leave a blank page.
 *   - `prefers-reduced-motion` short-circuits the animation entirely.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'section' | 'li' | 'article';
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(true);
  const [armed, setArmed] = React.useState(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || !('IntersectionObserver' in window)) return;

    // Only hide once we are certain the observer can reveal it again.
    setArmed(true);
    setVisible(false);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<never>}
      style={armed ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn(
        armed && 'transition-[opacity,transform] duration-[550ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
        armed && !visible && 'translate-y-[18px] opacity-0',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

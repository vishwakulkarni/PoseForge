'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Scroll-triggered fade-and-rise, replacing the legacy `.reveal` +
 * IntersectionObserver pair in base.js.
 *
 * The hidden start state lives in CSS (`.pf-reveal`, see globals.css) rather
 * than in React state. That gives three things the original lacked:
 *
 *   - Content is visible when JS is unavailable, instead of a blank page.
 *   - `prefers-reduced-motion` is honoured by the media query alone, with no
 *     client-side branching.
 *   - No setState during an effect — the only state update comes from the
 *     IntersectionObserver callback, which is the pattern effects are for.
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
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (!('IntersectionObserver' in window)) {
      // No observer: reveal on the next frame so nothing stays hidden.
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }

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
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn('pf-reveal', visible && 'pf-reveal-in', className)}
    >
      {children}
    </Tag>
  );
}

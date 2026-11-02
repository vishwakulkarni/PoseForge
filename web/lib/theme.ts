'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';

const subscribeNever = () => () => {};

/**
 * `useTheme()`, but `resolvedTheme` stays undefined until hydration finishes.
 *
 * next-themes resolves the theme on the client's first render while the server
 * renders without one. React keeps the server's attributes on a hydration
 * mismatch, so reading the theme during hydration leaves stale labels and
 * classes (a "Switch to dark theme" toggle on a dark page) until the next
 * unrelated re-render.
 */
export function useHydratedTheme() {
  const { resolvedTheme, setTheme } = useTheme();
  const hydrated = React.useSyncExternalStore(subscribeNever, () => true, () => false);
  return { resolvedTheme: hydrated ? resolvedTheme : undefined, setTheme };
}

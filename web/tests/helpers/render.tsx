import * as React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/controls';
import { ToastProvider } from '@/components/ui/toast';

/**
 * A QueryClient tuned for tests: no retries (so a mocked 500 fails fast and
 * the assertion is about the error state, not a 30s backoff) and no caching
 * between tests.
 */
export function makeTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(
  ui: React.ReactElement,
  options: RenderOptions & { queryClient?: QueryClient } = {},
) {
  const { queryClient = makeTestQueryClient(), ...renderOptions } = options;

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ToastProvider>{children}</ToastProvider>
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper, ...renderOptions }) };
}

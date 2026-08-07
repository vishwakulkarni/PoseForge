import * as React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { useCreateGeneration } from '@/lib/api/hooks';
import { makeTestQueryClient } from './helpers/render';
import { server } from './helpers/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('generation mutations', () => {
  it('refreshes stored poses after generating with an uploaded pose photo', async () => {
    server.use(
      http.post('/api/generations', () =>
        HttpResponse.json(
          { id: 'generation-1', generationIds: ['generation-1'], batchId: null, status: 'pending' },
          { status: 202 },
        ),
      ),
    );
    const queryClient = makeTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCreateGeneration(), { wrapper });
    const form = new FormData();
    form.append('posePhoto', new File(['pose'], 'pose.png', { type: 'image/png' }));

    await act(async () => {
      await result.current.mutateAsync(form);
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pose-references'] });
  });
});

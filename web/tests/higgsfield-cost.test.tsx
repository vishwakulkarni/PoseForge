import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useHiggsfieldCost } from '@/components/advanced-studio/nodes/higgsfield-cost';
import type { HiggsfieldEstimate, HiggsfieldEstimateRequest } from '@/lib/api/types';

const request: HiggsfieldEstimateRequest = { engine: 'higgsfield', model: 'xai/grok-imagine-image-2.0', quality: 'high' };

function estimate(overrides: Partial<HiggsfieldEstimate> = {}): HiggsfieldEstimate {
  return {
    estimatedCostUsd: 0.298,
    estimatedCredits: 4.76,
    pricingSource: 'higgsfield-estimate',
    pricingNote: '',
    blockedReason: null,
    ...overrides,
  };
}

describe('useHiggsfieldCost', () => {
  it('does not price a node that cannot run yet', () => {
    const estimateCost = vi.fn();
    const { result } = renderHook(() => useHiggsfieldCost(estimateCost, null));
    expect(result.current).toEqual({ hint: null, blockedReason: null });
    expect(estimateCost).not.toHaveBeenCalled();
  });

  it('shows the quoted price scaled by the number of outputs', async () => {
    const estimateCost = vi.fn().mockResolvedValue(estimate());
    const { result } = renderHook(() => useHiggsfieldCost(estimateCost, request, 2));
    expect(result.current.hint).toBe('Estimating cost…');
    await waitFor(() => expect(result.current.hint).toBe('Est. $0.60 · 9.52 credits for 2 · charged only on success'));
    expect(estimateCost).toHaveBeenCalledWith(request);
  });

  it('marks published-rate prices as approximate', async () => {
    const estimateCost = vi.fn().mockResolvedValue(estimate({ estimatedCostUsd: 4.622, estimatedCredits: null, pricingSource: 'published-rate' }));
    const { result } = renderHook(() => useHiggsfieldCost(estimateCost, request));
    await waitFor(() => expect(result.current.hint).toBe('Est. ≈ $4.62 · charged only on success'));
  });

  it('blocks the run when a spending limit would refuse it', async () => {
    const estimateCost = vi.fn().mockResolvedValue(estimate({ blockedReason: 'Above your $2.00 per-generation limit.' }));
    const { result } = renderHook(() => useHiggsfieldCost(estimateCost, request));
    await waitFor(() => expect(result.current).toEqual({ hint: null, blockedReason: 'Above your $2.00 per-generation limit.' }));
  });

  it('blocks the run with the provider error when pricing fails', async () => {
    const estimateCost = vi.fn().mockRejectedValue(new Error('Higgsfield rejected the credentials.'));
    const { result } = renderHook(() => useHiggsfieldCost(estimateCost, request));
    await waitFor(() => expect(result.current.blockedReason).toBe('Higgsfield rejected the credentials.'));
  });

  it('does not refetch for an equal request on rerender', async () => {
    const estimateCost = vi.fn().mockResolvedValue(estimate());
    const { result, rerender } = renderHook(({ input }) => useHiggsfieldCost(estimateCost, input), { initialProps: { input: request } });
    await waitFor(() => expect(result.current.hint).toMatch(/^Est\./));
    rerender({ input: { ...request } });
    expect(estimateCost).toHaveBeenCalledTimes(1);
  });
});

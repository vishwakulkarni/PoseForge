'use client';

import * as React from 'react';
import type { HiggsfieldEstimate, HiggsfieldEstimateRequest } from '@/lib/api/types';
import type { AdvNodeActions } from '../node-context';

export const HIGGSFIELD_ENGINES = new Set(['higgsfield', 'higgsfield-video']);

type Quote =
  | { key: string; estimate: HiggsfieldEstimate | null }
  | { key: string; error: string };

/**
 * Pre-run price for a Higgsfield generator node, from Higgsfield's free
 * estimate endpoint. `blockedReason` is set when the Settings spending limits
 * would refuse the run, so the node can disable Generate up front; the server
 * enforces the same limits regardless. Pass `null` while the node is not
 * runnable yet.
 */
export function useHiggsfieldCost(
  estimateCost: AdvNodeActions['estimateCost'],
  request: HiggsfieldEstimateRequest | null,
  runs = 1,
) {
  // Keyed by content so a fresh-but-equal request object does not refetch.
  // A stored quote for a different key means the current one is in flight.
  const key = request ? JSON.stringify(request) : null;
  const [quote, setQuote] = React.useState<Quote | null>(null);

  React.useEffect(() => {
    if (!key) return;
    let current = true;
    estimateCost(JSON.parse(key) as HiggsfieldEstimateRequest).then(
      (estimate) => { if (current) setQuote({ key, estimate }); },
      (cause: unknown) => {
        if (current) setQuote({ key, error: cause instanceof Error ? cause.message : 'Could not price this run.' });
      },
    );
    return () => { current = false; };
  }, [estimateCost, key]);

  if (!key) return { hint: null, blockedReason: null };
  if (quote?.key !== key) return { hint: 'Estimating cost…', blockedReason: null };
  if ('error' in quote) return { hint: null, blockedReason: quote.error };
  const { estimate } = quote;
  if (!estimate) return { hint: null, blockedReason: null };
  if (estimate.blockedReason) return { hint: null, blockedReason: estimate.blockedReason };
  if (estimate.estimatedCostUsd == null) return { hint: 'Price unavailable · charged only on success', blockedReason: null };
  const approx = estimate.pricingSource === 'published-rate' ? '≈ ' : '';
  const credits = estimate.estimatedCredits != null ? ` · ${round(estimate.estimatedCredits * runs)} credits` : '';
  const count = runs > 1 ? ` for ${runs}` : '';
  return {
    hint: `Est. ${approx}$${(estimate.estimatedCostUsd * runs).toFixed(2)}${credits}${count} · charged only on success`,
    blockedReason: null,
  };
}

const round = (value: number) => Math.round(value * 100) / 100;

export function HiggsfieldCostHint({ hint }: { hint: string | null }) {
  return hint ? <p className="adv-node-note" role="status">{hint}</p> : null;
}

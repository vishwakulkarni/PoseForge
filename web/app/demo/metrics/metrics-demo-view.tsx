'use client';

import type { AccountLimitWindow, MetricsResponse } from '@/lib/api/types';
import snapshot from '@/lib/demo/metrics-snapshot.json';
import { MetricsView } from '../../metrics/metrics-view';

/** Windows in the stored sample have no reset time; place one a while ahead of "now". */
function withReset(window: AccountLimitWindow | null, now: number): AccountLimitWindow | null {
  if (!window) return null;
  const minutes = (window.windowDurationMins ?? 0) * 0.4;
  return { ...window, resetsAt: new Date(now + minutes * 60_000).toISOString() };
}

/** The sample snapshot stamped with the current time so "Updated" and "Resets in" read naturally. */
function currentSnapshot(): MetricsResponse {
  const sample = snapshot as unknown as MetricsResponse;
  const now = Date.now();
  return {
    ...sample,
    generatedAt: new Date(now).toISOString(),
    codexLimits: {
      ...sample.codexLimits,
      fiveHour: withReset(sample.codexLimits.fiveHour, now),
      weekly: withReset(sample.codexLimits.weekly, now),
    },
    antigravityLimits: {
      ...sample.antigravityLimits,
      groups: sample.antigravityLimits.groups.map((group) => ({
        ...group,
        fiveHour: withReset(group.fiveHour, now),
        weekly: withReset(group.weekly, now),
      })),
    },
  };
}

const SNAPSHOT = currentSnapshot();

/** The real Metrics dashboard rendering a fixed sample snapshot, with no backend. */
export function MetricsDemoView() {
  return <MetricsView snapshot={SNAPSHOT} />;
}

'use client';

import * as React from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { useMetrics } from '@/lib/api/hooks';
import type { AccountLimitWindow, MetricsBucket, MetricsScope } from '@/lib/api/types';
import {
  cn,
  downloadBlob,
  formatCompact,
  formatCurrency,
  formatDuration,
  formatPercent,
  relativeTime,
  toCsv,
} from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Segmented } from '@/components/ui/segmented';
import { Separator } from '@/components/ui/controls';
import { ErrorState, LoadingRegion, Skeleton } from '@/components/ui/feedback';
import { KpiCard } from '@/components/metrics/kpi-card';
import { ChartLegend, TrendChart, type TrendMeasure } from '@/components/metrics/trend-chart';
import { EngineTable } from '@/components/metrics/engine-table';

const SCOPE_OPTIONS = [
  { value: 'session' as const, label: 'Session', title: 'Only runs since the server started' },
  { value: 'historical' as const, label: 'Historical', title: 'Every run ever recorded' },
];

const BUCKET_OPTIONS = [
  { value: 'daily' as const, label: 'Daily' },
  { value: 'weekly' as const, label: 'Weekly' },
  { value: 'monthly' as const, label: 'Monthly' },
  { value: 'runs' as const, label: 'Per run' },
];

const MEASURE_OPTIONS = [
  { value: 'tokens' as const, label: 'Tokens' },
  { value: 'cost' as const, label: 'Cost' },
];

const HEALTH_TONE = {
  healthy: { variant: 'ok' as const, label: 'Healthy' },
  degraded: { variant: 'warning' as const, label: 'Degraded' },
  down: { variant: 'error' as const, label: 'Down' },
};

function resetLabel(resetsAt: string | null) {
  if (!resetsAt) return 'Reset time unavailable';
  const remainingMs = new Date(resetsAt).getTime() - Date.now();
  if (!Number.isFinite(remainingMs)) return 'Reset time unavailable';
  if (remainingMs <= 0) return 'Resetting now';
  const minutes = Math.ceil(remainingMs / 60000);
  if (minutes < 60) return `Resets in ${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return `Resets in ${hours}h`;
  return `Resets in ${Math.ceil(hours / 24)}d`;
}

function AccountLimitCard({
  label,
  window,
  provider,
}: {
  label: string;
  window: AccountLimitWindow | null;
  provider: string;
}) {
  const used = window?.usedPercent ?? 0;
  const tone = used >= 90 ? 'bg-[var(--pf-error)]' : used >= 75 ? 'bg-[var(--pf-warning)]' : 'bg-[var(--pf-accent)]';

  return (
    <div className="rounded-[14px] border border-[var(--pf-border)] bg-[var(--pf-surface-muted)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--pf-text-tertiary)]">
            {label}
          </p>
          <p className="mt-1 text-[24px] font-bold tracking-[-0.04em] pf-numeric">
            {window ? `${window.remainingPercent}% left` : '—'}
          </p>
        </div>
        {window ? <Badge variant={used >= 90 ? 'error' : used >= 75 ? 'warning' : 'ok'}>{used}% used</Badge> : null}
      </div>
      <div
        role="progressbar"
        aria-label={`${label} ${provider} usage`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={window ? used : undefined}
        className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--pf-border)]"
      >
        <div className={cn('h-full rounded-full transition-[width]', tone)} style={{ width: `${used}%` }} />
      </div>
      <p className="mt-2 text-[11px] text-[var(--pf-text-secondary)]">
        {window ? resetLabel(window.resetsAt) : 'This window was not reported by Codex.'}
      </p>
    </div>
  );
}

export function MetricsView() {
  const [scope, setScope] = React.useState<MetricsScope>('historical');
  const [bucket, setBucket] = React.useState<MetricsBucket>('daily');
  const [measure, setMeasure] = React.useState<TrendMeasure>('tokens');

  const { data, isLoading, isFetching, error, refetch } = useMetrics(scope);

  // Colour assignment is driven by a stable, sorted engine list so a series
  // does not change colour when a new engine appears mid-session.
  const engineOrder = React.useMemo(() => {
    if (!data) return [];
    return [...new Set(data.engines.map((row) => row.engine))].sort();
  }, [data]);

  const points = data?.series[bucket] ?? [];

  const exportJson = () => {
    if (!data) return;
    downloadBlob(
      JSON.stringify(data, null, 2),
      `poseforge-metrics-${scope}-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json',
    );
  };

  const exportCsv = () => {
    if (!data) return;
    const rows = data.engines.map((row) => ({
      engine: row.engine,
      model: row.model ?? '',
      runs: row.runs,
      completed: row.completed,
      failed: row.failed,
      success_rate: row.successRate ?? '',
      tokens: row.tokens,
      cost_usd: row.costUsd,
      avg_latency_ms: row.avgLatencyMs ?? '',
      p95_latency_ms: row.p95LatencyMs ?? '',
      share: row.share,
    }));
    downloadBlob(
      toCsv(rows),
      `poseforge-metrics-${scope}-${new Date().toISOString().slice(0, 10)}.csv`,
      'text/csv',
    );
  };

  if (error) {
    return (
      <ErrorState
        title="Could not load metrics"
        message={error instanceof Error ? error.message : undefined}
        onRetry={() => refetch()}
      />
    );
  }

  const totals = data?.totals;
  const health = data?.health;
  const healthTone = health ? HEALTH_TONE[health.status] : null;

  return (
    <div className="flex flex-col gap-6">
      {/* ----------------------------------------------------------- header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            aria-label="Metrics time scope"
            value={scope}
            onValueChange={setScope}
            options={SCOPE_OPTIONS}
            size="sm"
          />

          {healthTone && health ? (
            <Badge variant={healthTone.variant} dot pulse={health.status !== 'healthy'}>
              {healthTone.label} · {health.detail}
            </Badge>
          ) : (
            <Skeleton className="h-6 w-40 rounded-full" />
          )}

          {health && health.queueDepth > 0 ? (
            <Badge variant="running" dot pulse>
              {health.queueDepth} queued
            </Badge>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <span
            className="text-[11px] text-[var(--pf-text-tertiary)] pf-numeric"
            aria-live="polite"
          >
            {data ? `Updated ${relativeTime(data.generatedAt)}` : 'Loading…'}
          </span>
          <Button
            size="icon"
            variant="secondary"
            onClick={() => refetch()}
            aria-label="Refresh metrics"
            title="Refresh metrics"
          >
            <RefreshCw className={cn(isFetching && 'animate-spin')} />
          </Button>
          <Button size="sm" variant="secondary" onClick={exportJson} disabled={!data}>
            <Download />
            JSON
          </Button>
          <Button size="sm" variant="secondary" onClick={exportCsv} disabled={!data}>
            <Download />
            CSV
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------- KPI cards */}
      <LoadingRegion label="Loading key metrics">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <KpiCard
            label="Lifetime spend"
            tone="accent"
            loading={isLoading}
            value={formatCurrency(totals?.totalCostUsd)}
            caption={
              totals?.avgCostPerRun != null
                ? `${formatCurrency(totals.avgCostPerRun)} per run`
                : 'No runs yet'
            }
            hint="Provider-reported cost where available, otherwise PoseForge's pre-run estimate. Local ComfyUI runs contribute $0."
          />
          <KpiCard
            label="Tokens used"
            loading={isLoading}
            value={formatCompact(totals?.totalTokens)}
            caption={
              totals
                ? `${formatCompact(totals.inputTokens)} in · ${formatCompact(totals.outputTokens)} out`
                : undefined
            }
            hint="Sum of input and output tokens across every run in scope."
          />
          <KpiCard
            label="Active days"
            loading={isLoading}
            value={totals?.activeDays ?? 0}
            caption={
              totals?.firstRunAt && totals?.lastRunAt
                ? `${new Date(totals.firstRunAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })} to ${new Date(totals.lastRunAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}`
                : 'No activity recorded'
            }
            hint="Distinct calendar days with at least one generation. Averages below divide by this, not by elapsed days."
          />
          <KpiCard
            label="Avg tokens / day"
            loading={isLoading}
            value={formatCompact(totals?.avgTokensPerDay)}
            caption={`${formatCompact(totals?.avgTokensPerWeek)} per active week`}
            hint="Total tokens divided by active days, so idle stretches do not dilute the average."
          />
          <KpiCard
            label="Success rate"
            loading={isLoading}
            tone={
              totals?.successRate == null
                ? 'default'
                : totals.successRate >= 0.9
                  ? 'success'
                  : totals.successRate >= 0.6
                    ? 'warning'
                    : 'error'
            }
            value={formatPercent(totals?.successRate, 0)}
            caption={
              totals
                ? `${totals.completedRuns} done · ${totals.failedRuns} failed${
                    totals.inFlightRuns ? ` · ${totals.inFlightRuns} in flight` : ''
                  }`
                : undefined
            }
            hint="Completed divided by completed plus failed. Queued and running work is excluded so pending jobs never drag the rate down."
          />
        </div>
      </LoadingRegion>

      {/* ---------------------------------------------- Codex account limits */}
      <section className="rounded-[16px] border border-[var(--pf-border)] bg-[var(--pf-surface)] p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold">Codex account limits</h2>
            <p className="mt-1 text-[12px] text-[var(--pf-text-secondary)]">
              Live allowance from the Codex CLI account signed in on this machine.
            </p>
          </div>
          {data?.codexLimits.available ? (
            <Badge variant="ok" dot>
              {data.codexLimits.planType ? `${data.codexLimits.planType} plan` : 'Connected'}
            </Badge>
          ) : data ? (
            <Badge variant="warning">Unavailable</Badge>
          ) : (
            <Skeleton className="h-6 w-24 rounded-full" />
          )}
        </div>

        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : data?.codexLimits.available ? (
          <div className="grid gap-3 md:grid-cols-2">
            <AccountLimitCard label="5-hour window" window={data.codexLimits.fiveHour} provider="Codex" />
            <AccountLimitCard label="Weekly limit" window={data.codexLimits.weekly} provider="Codex" />
          </div>
        ) : (
          <p className="rounded-[12px] bg-[var(--pf-surface-muted)] px-4 py-3 text-[12px] text-[var(--pf-text-secondary)]">
            {data?.codexLimits.reason || 'Codex usage limits are unavailable.'}
          </p>
        )}
      </section>

      {/* ---------------------------------------- Antigravity account limits */}
      <section className="rounded-[16px] border border-[var(--pf-border)] bg-[var(--pf-surface)] p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold">Antigravity account limits</h2>
            <p className="mt-1 text-[12px] text-[var(--pf-text-secondary)]">
              Live quota from the Antigravity CLI account signed in on this machine.
            </p>
          </div>
          {data?.antigravityLimits.available ? (
            <Badge variant="ok" dot>Connected</Badge>
          ) : data ? (
            <Badge variant="warning">Unavailable</Badge>
          ) : (
            <Skeleton className="h-6 w-24 rounded-full" />
          )}
        </div>

        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : data?.antigravityLimits.available ? (
          <div className="flex flex-col gap-4">
            {data.antigravityLimits.groups.map((group) => (
              <div key={group.name} className="rounded-[14px] border border-[var(--pf-border)] p-4">
                <div className="mb-3">
                  <h3 className="text-[13px] font-bold">{group.name}</h3>
                  {group.description ? (
                    <p className="mt-0.5 text-[11px] text-[var(--pf-text-tertiary)]">{group.description}</p>
                  ) : null}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <AccountLimitCard label="5-hour window" window={group.fiveHour} provider={`Antigravity ${group.name}`} />
                  <AccountLimitCard label="Weekly limit" window={group.weekly} provider={`Antigravity ${group.name}`} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-[12px] bg-[var(--pf-surface-muted)] px-4 py-3 text-[12px] text-[var(--pf-text-secondary)]">
            {data?.antigravityLimits.reason || 'Antigravity quota limits are unavailable.'}
          </p>
        )}
      </section>

      {/* ------------------------------------------- latency + quality row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          size="md"
          label="Median latency"
          loading={isLoading}
          value={formatDuration(totals?.latencyMs.p50)}
          caption={`p95 ${formatDuration(totals?.latencyMs.p95)}`}
          hint="Engine wall-clock time from start to completion, excluding time spent waiting in the queue."
        />
        <KpiCard
          size="md"
          label="Median queue wait"
          loading={isLoading}
          value={formatDuration(totals?.queueWaitMs.p50)}
          caption={`p95 ${formatDuration(totals?.queueWaitMs.p95)}`}
          hint="Time between a run being accepted and the engine picking it up. Rises when the queue is saturated."
        />
        <KpiCard
          size="md"
          label="Metered usage"
          loading={isLoading}
          value={formatPercent(totals?.actualUsageShare, 0)}
          caption="Share with provider-reported usage"
          hint="Portion of runs where the engine returned real token counts. The remainder uses PoseForge's estimate, so cost is approximate."
        />
        <KpiCard
          size="md"
          label="Library"
          loading={isLoading}
          value={data ? data.library.characters : 0}
          caption={
            data
              ? `${data.library.poseReferences} poses · ${data.library.recipes} recipes`
              : undefined
          }
          hint="Saved characters, pose references and Advanced-mode recipes on this machine."
        />
      </div>

      {/* ------------------------------------------------- chart + table */}
      <div className="grid gap-3 xl:grid-cols-[1.6fr_1fr]">
        <section className="rounded-[16px] border border-[var(--pf-border)] bg-[var(--pf-surface)] p-5">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[15px] font-bold">Cumulative usage</h2>
              <p className="mt-1 text-[12px] text-[var(--pf-text-secondary)]">
                {points.length
                  ? `${points.length} ${bucket === 'runs' ? 'runs' : `${bucket} points`}, accrued over time`
                  : 'Nothing recorded in this scope yet'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                aria-label="Chart granularity"
                value={bucket}
                onValueChange={setBucket}
                options={BUCKET_OPTIONS}
                size="sm"
              />
              <Segmented
                aria-label="Chart measure"
                value={measure}
                onValueChange={setMeasure}
                options={MEASURE_OPTIONS}
                size="sm"
              />
            </div>
          </div>

          {isLoading ? (
            <Skeleton className="h-[340px] w-full" />
          ) : (
            <TrendChart
              points={points}
              measure={measure}
              bucket={bucket}
              engines={engineOrder}
            />
          )}

          {engineOrder.length ? (
            <>
              <Separator className="my-4" />
              <ChartLegend engines={engineOrder} className="flex flex-wrap gap-x-5 gap-y-2" />
            </>
          ) : null}
        </section>

        <section className="rounded-[16px] border border-[var(--pf-border)] bg-[var(--pf-surface)] p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-bold">Per-engine breakdown</h2>
            <span className="text-[11px] text-[var(--pf-text-tertiary)]">
              {scope === 'session' ? 'This session' : 'All time'}
            </span>
          </div>

          {isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-11 w-full" />
              ))}
            </div>
          ) : (
            <EngineTable rows={data?.engines ?? []} engineOrder={engineOrder} />
          )}
        </section>
      </div>

      {/* --------------------------------------------------------- failures */}
      {data?.failures.length ? (
        <section className="rounded-[16px] border border-[var(--pf-border)] bg-[var(--pf-surface)] p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-bold">Recurring failures</h2>
            <span className="text-[11px] text-[var(--pf-text-tertiary)]">
              Grouped by normalised message
            </span>
          </div>
          <ul className="flex flex-col divide-y divide-[var(--pf-border)]">
            {data.failures.map((failure) => (
              <li
                key={failure.reason}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-mono text-[12px] text-[var(--pf-text-primary)]">
                    {failure.reason}
                  </span>
                  <span className="text-[10px] text-[var(--pf-text-tertiary)]">
                    {failure.engines.join(', ')} · last seen {relativeTime(failure.lastSeenAt)}
                  </span>
                </div>
                <Badge variant="error">
                  {failure.count} {failure.count === 1 ? 'time' : 'times'}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

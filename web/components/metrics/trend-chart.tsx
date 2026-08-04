'use client';

import * as React from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MetricsBucket, MetricsSeriesPoint } from '@/lib/api/types';
import { formatCompact, formatCurrency, seriesColor } from '@/lib/utils';
import { EmptyState } from '@/components/ui/feedback';
import { LineChart as LineChartIcon } from 'lucide-react';

export type TrendMeasure = 'tokens' | 'cost';

interface TrendChartProps {
  points: MetricsSeriesPoint[];
  measure: TrendMeasure;
  bucket: MetricsBucket;
  engines: string[];
  height?: number;
}

/** Bucket keys are ISO-ish; render them the way each granularity reads best. */
function formatBucketLabel(bucket: string, granularity: MetricsBucket): string {
  if (granularity === 'runs') {
    const [iso] = bucket.split('::');
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric' });
  }
  if (granularity === 'monthly') {
    const date = new Date(`${bucket}-01T00:00:00Z`);
    return Number.isNaN(date.getTime())
      ? bucket
      : date.toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  const date = new Date(`${bucket}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return bucket;
  const label = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return granularity === 'weekly' ? `w/c ${label}` : label;
}

export function TrendChart({ points, measure, bucket, engines, height = 340 }: TrendChartProps) {
  const data = React.useMemo(
    () =>
      points.map((point) => {
        const row: Record<string, string | number> = {
          bucket: point.bucket,
          label: formatBucketLabel(point.bucket, bucket),
        };
        for (const engine of engines) {
          row[engine] = point[measure][engine] ?? 0;
        }
        row.all = point[measure].all ?? 0;
        return row;
      }),
    [points, measure, bucket, engines],
  );

  const format = React.useCallback(
    (value: number) => (measure === 'cost' ? formatCurrency(value) : formatCompact(value)),
    [measure],
  );

  if (!data.length) {
    return (
      <EmptyState
        icon={<LineChartIcon className="size-5" />}
        title="No runs recorded yet"
        description="Generate an image in Studio and this chart will start filling in."
      />
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          {engines.map((engine, index) => (
            <linearGradient key={engine} id={`fill-${engine}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={seriesColor(index)} stopOpacity={0.18} />
              <stop offset="100%" stopColor={seriesColor(index)} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>

        <CartesianGrid stroke="var(--pf-border)" strokeDasharray="3 3" vertical={false} />

        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--pf-text-tertiary)', fontSize: 11 }}
          axisLine={{ stroke: 'var(--pf-border)' }}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={{ fill: 'var(--pf-text-tertiary)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={64}
          tickFormatter={(value: number) => format(value)}
        />

        <RechartsTooltip
          cursor={{ stroke: 'var(--pf-border-strong)', strokeWidth: 1 }}
          contentStyle={{
            background: 'var(--pf-surface)',
            border: '1px solid var(--pf-border)',
            borderRadius: 12,
            boxShadow: 'var(--pf-shadow-md)',
            fontSize: 12,
          }}
          labelStyle={{ color: 'var(--pf-text-secondary)', fontWeight: 700, marginBottom: 4 }}
          formatter={(value, name) => [format(Number(value)), String(name)]}
        />

        {engines.map((engine, index) => (
          <React.Fragment key={engine}>
            <Area
              type="monotone"
              dataKey={engine}
              stroke="none"
              fill={`url(#fill-${engine})`}
              isAnimationActive={false}
              // The area is decoration under the line; the Line below owns the
              // legend and tooltip entry so values are not listed twice.
              tooltipType="none"
              legendType="none"
            />
            <Line
              type="monotone"
              dataKey={engine}
              stroke={seriesColor(index)}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </React.Fragment>
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function ChartLegend({
  engines,
  className,
}: {
  engines: string[];
  className?: string;
}) {
  return (
    <ul className={className}>
      {engines.map((engine, index) => (
        <li key={engine} className="flex items-center gap-2 text-[12px] text-[var(--pf-text-secondary)]">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: seriesColor(index) }}
          />
          <span className="font-mono">{engine}</span>
        </li>
      ))}
    </ul>
  );
}

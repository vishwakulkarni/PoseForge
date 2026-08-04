'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { MetricsEngineRow } from '@/lib/api/types';
import {
  cn,
  formatCompact,
  formatCurrency,
  formatDuration,
  formatPercent,
  seriesColor,
} from '@/lib/utils';
import { EmptyState } from '@/components/ui/feedback';

type SortKey = 'runs' | 'tokens' | 'costUsd' | 'avgLatencyMs' | 'successRate';

const COLUMNS: Array<{
  key: SortKey | 'engine';
  label: string;
  align: 'left' | 'right';
  sortable: boolean;
}> = [
  { key: 'engine', label: 'Engine / model', align: 'left', sortable: false },
  { key: 'runs', label: 'Runs', align: 'right', sortable: true },
  { key: 'tokens', label: 'Tokens', align: 'right', sortable: true },
  { key: 'costUsd', label: 'Cost', align: 'right', sortable: true },
  { key: 'avgLatencyMs', label: 'Avg latency', align: 'right', sortable: true },
  { key: 'successRate', label: 'Success', align: 'right', sortable: true },
];

export function EngineTable({
  rows,
  engineOrder,
  className,
}: {
  rows: MetricsEngineRow[];
  /** Drives the colour swatch so table and chart agree. */
  engineOrder: string[];
  className?: string;
}) {
  const [sortKey, setSortKey] = React.useState<SortKey>('costUsd');
  const [direction, setDirection] = React.useState<'asc' | 'desc'>('desc');

  const sorted = React.useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];
      // Nulls (no measured latency, no terminal runs) always sort last.
      if (left == null && right == null) return 0;
      if (left == null) return 1;
      if (right == null) return -1;
      return direction === 'desc' ? Number(right) - Number(left) : Number(left) - Number(right);
    });
    return copy;
  }, [rows, sortKey, direction]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setDirection((current) => (current === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setDirection('desc');
    }
  };

  if (!rows.length) {
    return (
      <EmptyState
        title="No engine activity"
        description="Once you generate something, per-engine cost and latency show up here."
      />
    );
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-[12px]">
        <caption className="sr-only">
          Per-engine breakdown of runs, token usage, cost, latency and success rate
        </caption>
        <thead>
          <tr className="border-b border-[var(--pf-border)]">
            {COLUMNS.map((column) => {
              const isActive = column.sortable && column.key === sortKey;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    isActive ? (direction === 'desc' ? 'descending' : 'ascending') : undefined
                  }
                  className={cn(
                    'py-2.5 text-[10px] font-[750] uppercase tracking-[0.1em] text-[var(--pf-text-tertiary)]',
                    column.align === 'right' ? 'text-right' : 'text-left',
                  )}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key as SortKey)}
                      className={cn(
                        'inline-flex items-center gap-1 transition-colors hover:text-[var(--pf-text-primary)]',
                        isActive && 'text-[var(--pf-text-primary)]',
                      )}
                    >
                      {column.label}
                      {isActive ? (
                        direction === 'desc' ? (
                          <ArrowDown className="size-3" />
                        ) : (
                          <ArrowUp className="size-3" />
                        )
                      ) : null}
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const colorIndex = Math.max(0, engineOrder.indexOf(row.engine));
            return (
              <tr
                key={`${row.engine}-${row.model ?? 'default'}`}
                className="border-b border-[var(--pf-border)] last:border-0"
              >
                <td className="py-3 pr-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: seriesColor(colorIndex) }}
                    />
                    <div className="flex min-w-0 flex-col">
                      <span className="font-mono text-[12px] font-medium text-[var(--pf-text-primary)]">
                        {row.engine}
                      </span>
                      {row.model ? (
                        <span className="truncate font-mono text-[10px] text-[var(--pf-text-tertiary)]">
                          {row.model}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="py-3 text-right pf-numeric text-[var(--pf-text-secondary)]">
                  {row.runs}
                  {row.failed > 0 ? (
                    <span className="ml-1.5 text-[10px] text-[var(--pf-error)]">
                      ({row.failed} failed)
                    </span>
                  ) : null}
                </td>
                <td className="py-3 text-right pf-numeric text-[var(--pf-text-secondary)]">
                  {formatCompact(row.tokens)}
                </td>
                <td className="py-3 text-right pf-numeric font-semibold text-[var(--pf-accent)]">
                  {formatCurrency(row.costUsd)}
                </td>
                <td className="py-3 text-right pf-numeric text-[var(--pf-text-secondary)]">
                  {formatDuration(row.avgLatencyMs)}
                </td>
                <td
                  className={cn(
                    'py-3 text-right pf-numeric font-semibold',
                    row.successRate == null
                      ? 'text-[var(--pf-text-tertiary)]'
                      : row.successRate >= 0.9
                        ? 'text-[var(--pf-success)]'
                        : row.successRate >= 0.6
                          ? 'text-[var(--pf-warning)]'
                          : 'text-[var(--pf-error)]',
                  )}
                >
                  {formatPercent(row.successRate, 0)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

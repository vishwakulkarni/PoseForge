import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Compact number formatting matching the metrics dashboard reference (10.2M, 306.5k). */
export function formatCompact(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(digits)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(digits)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(digits)}k`;
  return String(Math.round(value));
}

/**
 * Currency formatting that keeps small values legible. Sub-cent generation
 * costs are common, so we widen precision rather than rounding to $0.00.
 */
export function formatCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs === 0) return '$0';
  if (abs < 0.01) return `$${value.toPrecision(2)}`;
  if (abs < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

/** Duration in ms -> human readable. Used for latency columns. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  // Floor, not round: "1m ago" should mean a full minute has elapsed.
  // Rounding made anything over 30s read as "1m ago" — a bug inherited from
  // the legacy base.js helper.
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function isHeicFile(file: File | null | undefined): boolean {
  if (!file) return false;
  return /\.hei[cf]$/i.test(file.name ?? '') || /hei[cf]/i.test(file.type ?? '');
}

/** Stable colour assignment so a given engine keeps its series colour across renders. */
const SERIES_TOKENS = [
  'var(--pf-series-1)',
  'var(--pf-series-2)',
  'var(--pf-series-3)',
  'var(--pf-series-4)',
  'var(--pf-series-5)',
  'var(--pf-series-6)',
];

export function seriesColor(index: number): string {
  return SERIES_TOKENS[index % SERIES_TOKENS.length];
}

export function downloadBlob(content: BlobPart, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Minimal CSV writer with correct quoting — used by the metrics export. */
export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const str = value == null ? '' : String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(',')),
  ].join('\n');
}

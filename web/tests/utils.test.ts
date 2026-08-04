import { describe, expect, it } from 'vitest';
import {
  cn,
  formatCompact,
  formatCurrency,
  formatDuration,
  formatPercent,
  isHeicFile,
  relativeTime,
  seriesColor,
  toCsv,
} from '@/lib/utils';

describe('cn', () => {
  it('lets later Tailwind classes win over earlier conflicting ones', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('drops falsy values', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b');
  });
});

describe('formatCompact', () => {
  it('matches the dashboard reference notation', () => {
    expect(formatCompact(10_200_000)).toBe('10.2M');
    expect(formatCompact(306_500)).toBe('306.5k');
    expect(formatCompact(5_400)).toBe('5.4k');
    expect(formatCompact(999)).toBe('999');
    expect(formatCompact(1_600_000_000)).toBe('1.6B');
  });

  it('renders an em dash for missing values rather than 0', () => {
    expect(formatCompact(null)).toBe('—');
    expect(formatCompact(undefined)).toBe('—');
    expect(formatCompact(Number.NaN)).toBe('—');
    // A real zero is still a measurement.
    expect(formatCompact(0)).toBe('0');
  });

  it('handles negatives', () => {
    expect(formatCompact(-2_500)).toBe('-2.5k');
  });
});

describe('formatCurrency', () => {
  it('widens precision for sub-cent costs instead of showing $0.00', () => {
    expect(formatCurrency(0.000123)).toBe('$0.00012');
    expect(formatCurrency(0.04)).toBe('$0.040');
    expect(formatCurrency(31.234)).toBe('$31.23');
  });

  it('distinguishes zero from unknown', () => {
    expect(formatCurrency(0)).toBe('$0');
    expect(formatCurrency(null)).toBe('—');
    expect(formatCurrency(undefined)).toBe('—');
  });
});

describe('formatPercent', () => {
  it('scales fractions and respects precision', () => {
    expect(formatPercent(0.9234, 1)).toBe('92.3%');
    expect(formatPercent(1, 0)).toBe('100%');
    expect(formatPercent(0, 0)).toBe('0%');
  });

  it('returns an em dash for null', () => {
    expect(formatPercent(null)).toBe('—');
  });
});

describe('formatDuration', () => {
  it('picks a sensible unit', () => {
    expect(formatDuration(450)).toBe('450ms');
    expect(formatDuration(4_500)).toBe('4.5s');
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(125_000)).toBe('2m 5s');
  });

  it('rejects null and negative durations', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(-5)).toBe('—');
  });
});

describe('relativeTime', () => {
  it('describes recent timestamps in relative terms', () => {
    const now = Date.now();
    expect(relativeTime(new Date(now - 30_000).toISOString())).toBe('just now');
    expect(relativeTime(new Date(now - 5 * 60_000).toISOString())).toBe('5m ago');
    expect(relativeTime(new Date(now - 3 * 3_600_000).toISOString())).toBe('3h ago');
    expect(relativeTime(new Date(now - 2 * 86_400_000).toISOString())).toBe('2d ago');
  });

  it('returns an empty string for missing or invalid input', () => {
    expect(relativeTime(null)).toBe('');
    expect(relativeTime('not a date')).toBe('');
  });
});

describe('isHeicFile', () => {
  it('detects HEIC by extension and by MIME type', () => {
    expect(isHeicFile(new File([], 'a.HEIC'))).toBe(true);
    expect(isHeicFile(new File([], 'a.heif'))).toBe(true);
    expect(isHeicFile(new File([], 'a', { type: 'image/heic' }))).toBe(true);
    expect(isHeicFile(new File([], 'a.png', { type: 'image/png' }))).toBe(false);
    expect(isHeicFile(null)).toBe(false);
  });
});

describe('seriesColor', () => {
  it('is stable per index and wraps around', () => {
    expect(seriesColor(0)).toBe(seriesColor(0));
    expect(seriesColor(0)).not.toBe(seriesColor(1));
    expect(seriesColor(6)).toBe(seriesColor(0));
  });
});

describe('toCsv', () => {
  it('emits a header row followed by values', () => {
    expect(toCsv([{ a: 1, b: 2 }])).toBe('a,b\n1,2');
  });

  it('quotes fields containing commas, quotes or newlines', () => {
    const csv = toCsv([{ note: 'a,b', quote: 'say "hi"', multi: 'x\ny' }]);
    expect(csv).toContain('"a,b"');
    expect(csv).toContain('"say ""hi"""');
    expect(csv).toContain('"x\ny"');
  });

  it('renders null and undefined as empty cells', () => {
    expect(toCsv([{ a: null, b: undefined }])).toBe('a,b\n,');
  });

  it('returns an empty string for no rows', () => {
    expect(toCsv([])).toBe('');
  });
});

import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { MetricsResponse } from '@/lib/api/types';

export const metricsFixture: MetricsResponse = {
  scope: 'historical',
  generatedAt: new Date().toISOString(),
  sessionStartedAt: new Date().toISOString(),
  health: {
    status: 'healthy',
    readyEngines: 3,
    totalEngines: 3,
    queueDepth: 0,
    detail: '3/3 engines ready',
  },
  totals: {
    totalRuns: 12,
    completedRuns: 10,
    failedRuns: 2,
    inFlightRuns: 0,
    successRate: 0.8333,
    totalTokens: 10_200_000,
    inputTokens: 6_000_000,
    outputTokens: 4_200_000,
    totalCostUsd: 31.23,
    activeDays: 8,
    firstRunAt: '2026-06-27T10:00:00.000Z',
    lastRunAt: '2026-08-04T10:00:00.000Z',
    avgTokensPerDay: 1_275_000,
    avgTokensPerWeek: 1_700_000,
    avgCostPerDay: 3.9,
    avgCostPerRun: 2.6,
    latencyMs: { p50: 42_000, p95: 118_000, max: 190_000 },
    queueWaitMs: { p50: 900, p95: 4_200, max: 8_000 },
    actualUsageShare: 0.5,
  },
  series: {
    daily: [
      {
        bucket: '2026-08-03',
        tokens: { codex: 4_000_000, gemini: 2_000_000, all: 6_000_000 },
        cost: { codex: 10, gemini: 8, all: 18 },
        runs: { codex: 5, gemini: 3, all: 8 },
      },
      {
        bucket: '2026-08-04',
        tokens: { codex: 6_400_000, gemini: 3_800_000, all: 10_200_000 },
        cost: { codex: 18.5, gemini: 12.73, all: 31.23 },
        runs: { codex: 7, gemini: 5, all: 12 },
      },
    ],
    weekly: [],
    monthly: [],
    runs: [],
  },
  engines: [
    {
      engine: 'codex',
      model: null,
      runs: 7,
      completed: 6,
      failed: 1,
      successRate: 0.857,
      tokens: 6_400_000,
      costUsd: 18.5,
      avgLatencyMs: 38_000,
      p95LatencyMs: 96_000,
      share: 0.583,
    },
    {
      engine: 'gemini',
      model: 'gemini-3-pro-image',
      runs: 5,
      completed: 4,
      failed: 1,
      successRate: 0.8,
      tokens: 3_800_000,
      costUsd: 12.73,
      avgLatencyMs: 51_000,
      p95LatencyMs: 120_000,
      share: 0.417,
    },
  ],
  failures: [
    {
      reason: 'Timed out after <n>ms',
      count: 2,
      engines: ['codex'],
      lastSeenAt: '2026-08-04T09:00:00.000Z',
    },
  ],
  library: {
    characters: 4,
    poseReferences: 26,
    customPoseReferences: 6,
    recipes: 2,
    mostUsedCharacter: { id: 'c1', name: 'Anika', runs: 9 },
    mostUsedPose: { id: 'p1', title: 'Arms crossed', runs: 5 },
  },
};

export const charactersFixture = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Anika',
    createdAt: '2026-08-01T10:00:00.000Z',
    primaryPhotoUrl: '/storage/characters/a.png',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Ravi',
    createdAt: '2026-08-02T10:00:00.000Z',
    primaryPhotoUrl: '/storage/characters/b.png',
  },
];

export const handlers = [
  http.get('/api/metrics', () => HttpResponse.json(metricsFixture)),
  http.get('/api/characters', () => HttpResponse.json({ characters: charactersFixture })),
  http.get('/api/pose-references', () => HttpResponse.json({ poseReferences: [] })),
  http.get('/api/engines', () =>
    HttpResponse.json({
      engines: [
        { key: 'codex', label: 'Codex CLI', ready: true, models: [] },
        { key: 'gemini', label: 'Gemini', ready: false, reason: 'No API key', models: [] },
      ],
      defaultEngine: 'codex',
    }),
  ),
  http.get('/api/presets', () => HttpResponse.json({ presets: [] })),
  http.get('/api/recipes', () => HttpResponse.json({ recipes: [] })),
  http.get('/api/generations', () =>
    HttpResponse.json({ generations: [], nextCursor: null }),
  ),
];

export const server = setupServer(...handlers);

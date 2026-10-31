import { STATIC_DEMO } from '../demo-mode';
import type { AccountLimitWindow, MetricsResponse } from './types';

export { STATIC_DEMO };

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const DEMO_READ_ONLY_MESSAGE =
  'This is a read-only demo with sample data. Install PoseForge to create, edit and generate.';

/**
 * Only metrics (scope) and presets (type) answer differently per query string; every other
 * path, including list filters and cost estimates, shares one fixture (mirrors the capture script).
 */
const QUERY_AWARE = /^\/api\/(metrics|presets)\?/;

/** `/api/metrics?scope=historical` -> `<base>/demo-api/metrics@scope=historical.json`. */
function fixtureUrl(apiPath: string) {
  const key = QUERY_AWARE.test(apiPath) ? apiPath : apiPath.split('?')[0];
  return `${BASE_PATH}/demo-api/${key.replace(/^\/api\//, '').replace('?', '@')}.json`;
}

/** Windows in the stored sample have no reset time; place one a while ahead of "now". */
function withReset(window: AccountLimitWindow | null, now: number): AccountLimitWindow | null {
  if (!window) return null;
  const minutes = (window.windowDurationMins ?? 0) * 0.4;
  return { ...window, resetsAt: new Date(now + minutes * 60_000).toISOString() };
}

/** Stamps the sample metrics with the current time so "Updated" and "Resets in" read naturally. */
function freshMetrics(body: MetricsResponse): MetricsResponse {
  const now = Date.now();
  return {
    ...body,
    generatedAt: new Date(now).toISOString(),
    codexLimits: {
      ...body.codexLimits,
      fiveHour: withReset(body.codexLimits.fiveHour, now),
      weekly: withReset(body.codexLimits.weekly, now),
    },
  };
}

/** Autosave of an open project: the canvas saves whenever it re-fits or moves its viewport. */
const PROJECT_SAVE = /^\/api\/(studio-projects|advanced-studio-projects)\/[^/]+$/;

export function isDemoAutosave(apiPath: string, method: string) {
  return method === 'PUT' && PROJECT_SAVE.test(apiPath);
}

/**
 * Acknowledges an autosave without persisting it: echoes the saved document back at the next
 * revision, which is what the editor compares against, so it settles instead of retrying.
 * Edits therefore live only in the open page.
 */
export async function demoAutosave<T>(apiPath: string, body: unknown): Promise<T | null> {
  const current = await readDemoFixture<Record<string, unknown>>(apiPath);
  if (!current) return null;
  const sent = JSON.parse(typeof body === 'string' ? body : '{}') as {
    expectedRevision?: number;
    document?: unknown;
    name?: string;
  };
  return {
    ...current,
    ...(sent.document ? { document: sent.document } : {}),
    ...(sent.name ? { name: sent.name } : {}),
    revision: (sent.expectedRevision ?? 0) + 1,
  } as T;
}

/**
 * The demo's stand-in for a GET against the local API: reads the captured fixture for `apiPath`
 * and prefixes media URLs with the site's base path. Resolves null when none exists.
 */
export async function readDemoFixture<T>(apiPath: string): Promise<T | null> {
  const response = await fetch(fixtureUrl(apiPath));
  if (!response.ok) return null;
  const text = (await response.text())
    .replaceAll('"/demo-media/', `"${BASE_PATH}/demo-media/`)
    .replaceAll('"/demo/', `"${BASE_PATH}/demo/`);
  const body = JSON.parse(text);
  return (apiPath.startsWith('/api/metrics') ? freshMetrics(body as MetricsResponse) : body) as T;
}

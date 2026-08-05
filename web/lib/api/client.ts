import type {
  CharacterDetail,
  CharacterSummary,
  EnginesResponse,
  Generation,
  GenerationAccepted,
  GenerationListResponse,
  GenerationStatus,
  MetricsResponse,
  MetricsScope,
  PassportAccepted,
  PassportConfig,
  PoseReference,
  Preset,
  Recipe,
  Settings,
  UsageEstimate,
} from './types';

/**
 * Thrown for every non-2xx API response. Carries the status so callers can
 * branch on 404/409 without string-matching messages — something the legacy
 * `api()` helper made impossible.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }

  get isNotFound() {
    return this.status === 404;
  }

  get isConflict() {
    return this.status === 409;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...init?.headers,
      },
    });
  } catch (cause) {
    // Network-level failure: the Express server is most likely not running.
    throw new ApiError(
      'Could not reach PoseForge. Restart it with npm run dev and try again.',
      0,
      cause,
    );
  }

  if (response.status === 204) return undefined as T;

  let body: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const message =
      (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : null) ?? `Request failed (${response.status}).`;
    throw new ApiError(message, response.status, body);
  }

  return body as T;
}

function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : '';
}

export const api = {
  characters: {
    list: () =>
      request<{ characters: CharacterSummary[] }>('/api/characters').then((r) => r.characters),
    get: (id: string) => request<CharacterDetail>(`/api/characters/${id}`),
    create: (form: FormData) =>
      request<{ id: string; name: string; primaryPhotoUrl: string }>('/api/characters', {
        method: 'POST',
        body: form,
      }),
    addPhoto: (id: string, form: FormData) =>
      request<{ id: string; url: string; isPrimary: boolean }>(`/api/characters/${id}/photos`, {
        method: 'POST',
        body: form,
      }),
    remove: (id: string) => request<void>(`/api/characters/${id}`, { method: 'DELETE' }),
  },

  presets: {
    list: (type?: 'background' | 'style') =>
      request<{ presets: Preset[] }>(`/api/presets${query({ type })}`).then((r) => r.presets),
    create: (input: { type: 'background' | 'style'; name: string; promptFragment: string }) =>
      request<Preset>('/api/presets', { method: 'POST', body: JSON.stringify(input) }),
  },

  engines: {
    list: () => request<EnginesResponse>('/api/engines'),
  },

  poseReferences: {
    list: (filters: { category?: string; tag?: string } = {}) =>
      request<{ poseReferences: PoseReference[] }>(`/api/pose-references${query(filters)}`).then(
        (r) => r.poseReferences,
      ),
    create: (form: FormData) =>
      request<PoseReference>('/api/pose-references', { method: 'POST', body: form }),
    remove: (id: string) => request<void>(`/api/pose-references/${id}`, { method: 'DELETE' }),
  },

  generations: {
    list: (filters: {
      limit?: number;
      characterId?: string;
      status?: GenerationStatus;
      cursor?: string;
    } = {}) => request<GenerationListResponse>(`/api/generations${query(filters)}`),
    get: (id: string) => request<Generation>(`/api/generations/${id}`),
    create: (form: FormData) =>
      request<GenerationAccepted>('/api/generations', { method: 'POST', body: form }),
    remove: (id: string) => request<void>(`/api/generations/${id}`, { method: 'DELETE' }),
    estimate: (params: {
      engine?: string;
      model?: string;
      quality?: string;
      aspectRatio?: string;
      subjects?: number;
      variants?: number;
      promptChars?: number;
    }) => request<UsageEstimate>(`/api/generations/estimate${query(params)}`),
  },

  recipes: {
    list: () => request<{ recipes: Recipe[] }>('/api/recipes').then((r) => r.recipes),
    create: (input: { name: string; settings: unknown; characterCount: number }) =>
      request<Recipe>('/api/recipes', { method: 'POST', body: JSON.stringify(input) }),
    remove: (id: string) => request<void>(`/api/recipes/${id}`, { method: 'DELETE' }),
  },

  settings: {
    get: () => request<Settings>('/api/settings'),
    update: (patch: Record<string, unknown>) =>
      request<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(patch) }),
  },

  passport: {
    config: () => request<PassportConfig>('/api/passport/config'),
    create: (form: FormData) =>
      request<PassportAccepted>('/api/passport', { method: 'POST', body: form }),
  },

  metrics: {
    get: (scope: MetricsScope = 'historical') =>
      request<MetricsResponse>(`/api/metrics${query({ scope })}`),
  },

  media: {
    /**
     * HEIC/HEIF files cannot be rendered by browsers. The server converts them
     * to PNG for preview. Non-HEIC files short-circuit to an object URL.
     */
    previewUrl: async (file: File, { fullResolution = false }: { fullResolution?: boolean } = {}): Promise<string> => {
      const isHeic =
        /\.hei[cf]$/i.test(file.name ?? '') || /hei[cf]/i.test(file.type ?? '');
      if (!isHeic) return URL.createObjectURL(file);

      const form = new FormData();
      form.append('image', file);
      const response = await fetch(`/api/media/preview${fullResolution ? '?fullResolution=true' : ''}`, {
        method: 'POST',
        body: form,
      });
      if (!response.ok) {
        let message = 'This HEIC image could not be previewed.';
        try {
          message = ((await response.json()) as { error?: string }).error ?? message;
        } catch {
          /* response had no JSON body */
        }
        throw new ApiError(message, response.status, null);
      }
      return URL.createObjectURL(await response.blob());
    },
  },
};

export type Api = typeof api;

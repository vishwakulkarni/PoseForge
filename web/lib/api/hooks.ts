'use client';

import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { api, ApiError } from './client';
import type { AdvProjectSummary, AdvTemplateId } from '../advanced-studio/types';
import type {
  EngineKey,
  Generation,
  GenerationStatus,
  MetricsScope,
  Preset,
  StudioProjectSummary,
} from './types';

/**
 * Central query-key registry. Keeping them here (rather than inline strings)
 * makes invalidation after mutations exhaustive and greppable.
 */
export const queryKeys = {
  characters: ['characters'] as const,
  character: (id: string) => ['characters', id] as const,
  presets: (type?: string) => ['presets', type ?? 'all'] as const,
  engines: ['engines'] as const,
  poseReferences: (filters?: Record<string, string | undefined>) =>
    ['pose-references', filters ?? {}] as const,
  poseSuggestions: (subjectCount: number, seed: string) =>
    ['pose-suggestions', subjectCount, seed] as const,
  generations: (filters?: Record<string, unknown>) => ['generations', filters ?? {}] as const,
  generation: (id: string) => ['generations', id] as const,
  studioProjects: ['studio-projects'] as const,
  studioProjectDefault: ['studio-projects', 'default'] as const,
  studioProject: (id: string) => ['studio-projects', id] as const,
  advancedProjects: ['advanced-studio-projects'] as const,
  advancedProject: (id: string) => ['advanced-studio-projects', id] as const,
  advancedCapabilities: ['advanced-studio-capabilities'] as const,
  recipes: ['recipes'] as const,
  settings: ['settings'] as const,
  metrics: (scope: MetricsScope) => ['metrics', scope] as const,
};

/* ------------------------------------------------------------- Characters */

export function useCharacters() {
  return useQuery({
    queryKey: queryKeys.characters,
    queryFn: api.characters.list,
    refetchInterval: (query) => query.state.data?.some((character) =>
      character.angleProfile?.status === 'pending' || character.angleProfile?.status === 'running'
    ) ? 2_500 : false,
  });
}

export function useCharacter(id: string | null) {
  return useQuery({
    queryKey: queryKeys.character(id ?? ''),
    queryFn: () => api.characters.get(id!),
    enabled: Boolean(id),
  });
}

export function useCreateCharacter() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) => api.characters.create(form),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.characters }),
  });
}

export function useUpdateCharacter() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.characters.update(id, { name }),
    onSuccess: (character) => {
      client.invalidateQueries({ queryKey: queryKeys.characters });
      client.invalidateQueries({ queryKey: queryKeys.character(character.id) });
      client.invalidateQueries({ queryKey: ['generations'] });
      client.invalidateQueries({ queryKey: ['metrics'] });
    },
  });
}

export function useGenerateCharacterAngles() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, engine }: { id: string; engine: EngineKey }) =>
      api.characters.generateAngles(id, engine),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.characters }),
  });
}

export function useDeleteCharacter() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.characters.remove(id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: queryKeys.characters });
      // Generations embed character names, so their cache is stale too.
      client.invalidateQueries({ queryKey: ['generations'] });
    },
  });
}

/* ---------------------------------------------------------------- Presets */

export function usePresets(type?: 'background' | 'style') {
  return useQuery({
    queryKey: queryKeys.presets(type),
    queryFn: () => api.presets.list(type),
    // Presets are effectively static within a session.
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreatePreset() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.presets.create,
    onSuccess: (preset: Preset) => {
      client.invalidateQueries({ queryKey: queryKeys.presets(preset.type) });
      client.invalidateQueries({ queryKey: queryKeys.presets() });
    },
  });
}

/* ---------------------------------------------------------------- Engines */

export function useEngines() {
  return useQuery({
    queryKey: queryKeys.engines,
    queryFn: api.engines.list,
    // Engine readiness depends on external CLIs/keys and can change while the
    // page is open, so re-check on focus rather than caching indefinitely.
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}

/* -------------------------------------------------------- Pose references */

export function usePoseReferences(filters: { category?: string; tag?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.poseReferences(filters),
    queryFn: () => api.poseReferences.list(filters),
  });
}

export function usePoseSuggestions(subjectCount: number, seed: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.poseSuggestions(subjectCount, seed ?? ''),
    queryFn: () => api.poseReferences.suggestions({ subjectCount, seed: seed ?? '', limit: 5 }),
    enabled: enabled && Boolean(seed) && subjectCount > 0,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreatePoseReference() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) => api.poseReferences.create(form),
    onSuccess: () => client.invalidateQueries({ queryKey: ['pose-references'] }),
  });
}

export function useDeletePoseReference() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.poseReferences.remove(id),
    onSuccess: () => client.invalidateQueries({ queryKey: ['pose-references'] }),
  });
}

/* ------------------------------------------------------------ Generations */

export function useGenerations(
  filters: { limit?: number; characterId?: string; status?: GenerationStatus } = {},
  options?: Partial<UseQueryOptions<Awaited<ReturnType<typeof api.generations.list>>>>,
) {
  return useQuery({
    queryKey: queryKeys.generations(filters),
    queryFn: () => api.generations.list(filters),
    ...options,
  });
}

const IN_FLIGHT: GenerationStatus[] = ['pending', 'running'];

/**
 * Polls a single generation until it reaches a terminal state.
 *
 * Poll interval backs off as the run gets older: image generation commonly
 * takes 30s–5min, and hammering the API every second for the whole duration
 * was a real cost in the legacy implementation.
 */
export function useGenerationPolling(id: string | null) {
  return useQuery({
    queryKey: queryKeys.generation(id ?? ''),
    queryFn: () => api.generations.get(id!),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const data = query.state.data as Generation | undefined;
      if (!data || !IN_FLIGHT.includes(data.status)) return false;
      const startedAt = new Date(data.createdAt).getTime();
      const elapsed = Date.now() - startedAt;
      if (elapsed < 15_000) return 1_000;
      if (elapsed < 60_000) return 2_500;
      return 5_000;
    },
    // A failed poll should not wipe the last known state from the screen.
    placeholderData: (previous) => previous,
    retry: (failureCount, error) =>
      error instanceof ApiError && error.isNotFound ? false : failureCount < 3,
  });
}

/**
 * Polls a batch of generations until every one reaches a terminal state.
 *
 * Studio can queue up to six variants at once; useQueries keeps one cache
 * entry per generation so a completed variant stops polling independently of
 * its slower siblings.
 */
export function useGenerationsPolling(ids: string[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.generation(id),
      queryFn: () => api.generations.get(id),
      refetchInterval: (query: { state: { data?: Generation } }) => {
        const data = query.state.data;
        if (!data || !IN_FLIGHT.includes(data.status)) return false as const;
        const elapsed = Date.now() - new Date(data.createdAt).getTime();
        if (elapsed < 15_000) return 1_000;
        if (elapsed < 60_000) return 2_500;
        return 5_000;
      },
      retry: (failureCount: number, error: unknown) =>
        error instanceof ApiError && error.isNotFound ? false : failureCount < 3,
    })),
    // `combine` is memoized by TanStack Query against the individual query
    // results, so the returned object stays referentially stable between
    // polls that did not change anything.
    combine: (results) => {
      const generations = results
        .map((result) => result.data)
        .filter((item): item is Generation => Boolean(item));

      return {
        generations,
        settled:
          generations.length === ids.length &&
          generations.every((item) => !IN_FLIGHT.includes(item.status)),
        completed: generations.filter((item) => item.status === 'completed').length,
        failed: generations.filter((item) => item.status === 'failed').length,
      };
    },
  });
}

export function useCreateGeneration() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) => api.generations.create(form),
    onSuccess: (_result, form) => {
      client.invalidateQueries({ queryKey: ['generations'] });
      client.invalidateQueries({ queryKey: ['metrics'] });
      // The generations endpoint automatically stores a freshly uploaded pose
      // in the reusable pose library. Refresh that cache so Studio and the
      // library expose the saved image immediately, without requiring reload.
      if (form.has('posePhoto')) {
        client.invalidateQueries({ queryKey: ['pose-references'] });
      }
    },
  });
}

export function useDeleteGeneration() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.generations.remove(id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['generations'] });
      client.invalidateQueries({ queryKey: ['metrics'] });
    },
  });
}

export function useUsageEstimate(params: Parameters<typeof api.generations.estimate>[0], enabled = true) {
  return useQuery({
    queryKey: ['estimate', params],
    queryFn: () => api.generations.estimate(params),
    enabled,
    staleTime: 60 * 1000,
  });
}

/* ---------------------------------------------------------------- Recipes */

export function useRecipes() {
  return useQuery({ queryKey: queryKeys.recipes, queryFn: api.recipes.list });
}

export function useCreateRecipe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.recipes.create,
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.recipes }),
  });
}

export function useDeleteRecipe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.recipes.remove(id),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.recipes }),
  });
}

/* ------------------------------------------------------ Studio projects */

export function useStudioProjects() {
  return useQuery({
    queryKey: queryKeys.studioProjects,
    queryFn: api.studioProjects.list,
    staleTime: 30_000,
  });
}

export function useDefaultStudioProject(enabled = true) {
  return useQuery({
    queryKey: queryKeys.studioProjectDefault,
    queryFn: api.studioProjects.getDefault,
    enabled,
    staleTime: Infinity,
    // A generation can finish after its workflow page unmounts. Always read
    // the persisted document again when the workflow is opened so an old
    // in-memory snapshot cannot hide the completed output.
    refetchOnMount: 'always',
    retry: (failureCount, error) =>
      error instanceof ApiError && error.isNotFound ? false : failureCount < 3,
  });
}

export function useStudioProject(id: string | null) {
  return useQuery({
    queryKey: queryKeys.studioProject(id ?? ''),
    queryFn: () => api.studioProjects.get(id!),
    enabled: Boolean(id),
    staleTime: Infinity,
    refetchOnMount: 'always',
    retry: (failureCount, error) =>
      error instanceof ApiError && error.isNotFound ? false : failureCount < 3,
  });
}

/** Creates a Studio project from the dashboard, without the autosave machinery. */
export function useCreateStudioProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.studioProjects.create({ name }),
    onSuccess: (project) => {
      client.setQueryData(queryKeys.studioProject(project.id), project);
      client.setQueryData<StudioProjectSummary[]>(queryKeys.studioProjects, (current) =>
        current ? [project, ...current] : [project],
      );
    },
  });
}

/** Deletes a non-default Studio project from the dashboard. */
export function useDeleteStudioProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.studioProjects.remove(id),
    onSuccess: (_data, id) => {
      client.removeQueries({ queryKey: queryKeys.studioProject(id), exact: true });
      client.setQueryData<StudioProjectSummary[]>(queryKeys.studioProjects, (current) =>
        current?.filter((item) => item.id !== id) ?? [],
      );
    },
  });
}

/** Runs every generate node in the project's pipeline (parallel where independent). */
export function useRunStudioProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.studioProjects.run(id),
    onSuccess: (response) => {
      client.setQueryData(queryKeys.studioProject(response.project.id), response.project);
    },
  });
}

/** Runs a single generate node; its inputs must already be resolvable. */
export function useRunStudioNode() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, nodeId }: { id: string; nodeId: string }) => api.studioProjects.runNode(id, nodeId),
    onSuccess: (response) => {
      client.setQueryData(queryKeys.studioProject(response.project.id), response.project);
    },
  });
}

/** Calls an assistant node's engine to refine prompt text from an instruction. */
export function useAssistStudioPrompt() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, nodeId, instruction, engine }: { id: string; nodeId: string; instruction: string; engine: string }) =>
      api.studioProjects.assist(id, nodeId, { instruction, engine }),
    onSuccess: (response) => {
      client.setQueryData(queryKeys.studioProject(response.project.id), response.project);
    },
  });
}

/* --------------------------------------------------------------- Settings */

export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: api.settings.get });
}

export function useUpdateSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.settings.update,
    onSuccess: (settings) => {
      client.setQueryData(queryKeys.settings, settings);
      // Changing keys/endpoints can flip an engine's readiness.
      client.invalidateQueries({ queryKey: queryKeys.engines });
    },
  });
}

/* --------------------------------------------------------------- Passport */

export function usePassportConfig() {
  return useQuery({
    queryKey: ['passport-config'],
    queryFn: api.passport.config,
    // Guidance profiles are baked into the server build.
    staleTime: Infinity,
  });
}

export function useCreatePassportPhoto() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) => api.passport.create(form),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['generations'] });
      client.invalidateQueries({ queryKey: ['metrics'] });
    },
  });
}

/* ---------------------------------------------------------------- Metrics */

export function useMetrics(scope: MetricsScope, refreshMs = 30_000) {
  return useQuery({
    queryKey: queryKeys.metrics(scope),
    queryFn: () => api.metrics.get(scope),
    // The server prefetches CLI limits in the background. Poll briefly only
    // while that first snapshot is pending, then return to the normal cadence.
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.codexLimits.loading || data?.antigravityLimits.loading ? 1_000 : refreshMs;
    },
    placeholderData: (previous) => previous,
  });
}


/* ------------------------------------------------- Advanced Studio projects */

/** Model and capability catalog for generator nodes. Cached for the session:
 * it only changes when the user edits API keys in Settings. */
export function useAdvancedCapabilities() {
  return useQuery({
    queryKey: queryKeys.advancedCapabilities,
    queryFn: api.advancedStudio.capabilities,
    staleTime: 5 * 60_000,
  });
}

export function useAdvancedProjects() {
  return useQuery({
    queryKey: queryKeys.advancedProjects,
    queryFn: api.advancedStudio.list,
    staleTime: 30_000,
  });
}

export function useAdvancedProject(id: string | null) {
  return useQuery({
    queryKey: queryKeys.advancedProject(id ?? ''),
    queryFn: () => api.advancedStudio.get(id!),
    enabled: Boolean(id),
    staleTime: Infinity,
    refetchOnMount: 'always',
    retry: (failureCount, error) =>
      error instanceof ApiError && error.isNotFound ? false : failureCount < 3,
  });
}

export function useCreateAdvancedProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; template: AdvTemplateId }) => api.advancedStudio.create(input),
    onSuccess: (project) => {
      client.setQueryData(queryKeys.advancedProject(project.id), project);
      client.invalidateQueries({ queryKey: queryKeys.advancedProjects });
    },
  });
}

export function useDeleteAdvancedProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.advancedStudio.remove(id),
    onSuccess: (_data, id) => {
      client.removeQueries({ queryKey: queryKeys.advancedProject(id), exact: true });
      client.setQueryData<AdvProjectSummary[]>(queryKeys.advancedProjects, (current) =>
        current?.filter((item) => item.id !== id) ?? [],
      );
    },
  });
}

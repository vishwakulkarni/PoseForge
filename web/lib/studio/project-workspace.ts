'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api/client';
import {
  queryKeys,
  useDefaultStudioProject,
  useStudioProject,
  useStudioProjects,
} from '@/lib/api/hooks';
import type {
  StudioProject,
  StudioProjectDocument,
  StudioProjectSummary,
} from '@/lib/api/types';

export type StudioProjectSaveState =
  | 'loading'
  | 'pending'
  | 'saved'
  | 'saving'
  | 'error'
  | 'conflict';

export const STUDIO_PROJECT_SAVE_DELAY_MS = 5_000;
const ACTIVE_STUDIO_PROJECT_KEY = 'poseforge:active-studio-project';

export type StudioProjectActionState = 'idle' | 'creating' | 'switching' | 'deleting';

interface StudioProjectWorkspaceOptions {
  saveDelayMs?: number;
}

function documentKey(document: StudioProjectDocument | null) {
  return document ? JSON.stringify(document) : null;
}

function activeProjectStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function readActiveProjectId() {
  try {
    return activeProjectStorage()?.getItem(ACTIVE_STUDIO_PROJECT_KEY) ?? null;
  } catch {
    return null;
  }
}

function storeActiveProjectId(id: string) {
  try {
    activeProjectStorage()?.setItem(ACTIVE_STUDIO_PROJECT_KEY, id);
  } catch {
    // A privacy setting or full storage quota must not turn a successful API
    // operation into a failed project switch/create action.
  }
}

function clearActiveProjectId() {
  try {
    activeProjectStorage()?.removeItem(ACTIVE_STUDIO_PROJECT_KEY);
  } catch {
    // The default project fallback still works when persistence is unavailable.
  }
}

/**
 * Waits for a quiet editing window, then serializes project saves so every
 * optimistic revision is based on the last acknowledged server revision.
 * Canvas gestures coalesce into one snapshot instead of rerendering the graph
 * around an API response for every pan, zoom, or drag frame.
 */
export function useStudioProjectWorkspace({
  saveDelayMs = STUDIO_PROJECT_SAVE_DELAY_MS,
}: StudioProjectWorkspaceOptions = {}) {
  const [activeProjectId, setActiveProjectId] = React.useState<string | null>(readActiveProjectId);
  const selectedQuery = useStudioProject(activeProjectId);
  const selectedProjectMissing = selectedQuery.error instanceof ApiError && selectedQuery.error.isNotFound;
  const defaultQuery = useDefaultStudioProject(!activeProjectId || selectedProjectMissing);
  const projectsQuery = useStudioProjects();
  const query = activeProjectId && !selectedProjectMissing ? selectedQuery : defaultQuery;
  const queryClient = useQueryClient();
  const [saveState, setSaveState] = React.useState<StudioProjectSaveState>('saved');
  const [projectActionState, setProjectActionState] = React.useState<StudioProjectActionState>('idle');
  const [projectActionError, setProjectActionError] = React.useState<string | null>(null);
  const revisionRef = React.useRef(0);
  const projectIdRef = React.useRef<string | null>(null);
  const pendingRef = React.useRef<StudioProjectDocument | null>(null);
  const failedRef = React.useRef<StudioProjectDocument | null>(null);
  const activeRef = React.useRef<StudioProjectDocument | null>(null);
  const acknowledgedKeyRef = React.useRef<string | null>(null);
  const savingRef = React.useRef(false);
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastChangeAtRef = React.useRef(0);
  const flushRef = React.useRef<() => Promise<void>>(async () => {});
  const savingPromiseRef = React.useRef<Promise<void> | null>(null);

  const clearSaveTimer = React.useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
  }, []);

  const scheduleFlush = React.useCallback(() => {
    clearSaveTimer();
    const elapsed = Date.now() - lastChangeAtRef.current;
    const remaining = Math.max(0, saveDelayMs - elapsed);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void flushRef.current();
    }, remaining);
  }, [clearSaveTimer, saveDelayMs]);

  const cacheProject = React.useCallback((project: StudioProject) => {
    queryClient.setQueryData(queryKeys.studioProject(project.id), project);
    if (project.isDefault) queryClient.setQueryData(queryKeys.studioProjectDefault, project);
    const summary: StudioProjectSummary = {
      id: project.id,
      name: project.name,
      schemaVersion: project.schemaVersion,
      revision: project.revision,
      isDefault: project.isDefault,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
    queryClient.setQueryData<StudioProjectSummary[]>(queryKeys.studioProjects, (current) => {
      if (!current) return [summary];
      const exists = current.some((item) => item.id === summary.id);
      return exists
        ? current.map((item) => item.id === summary.id ? summary : item)
        : [summary, ...current];
    });
  }, [queryClient]);

  const flush = React.useCallback(async () => {
    if (savingRef.current) {
      await savingPromiseRef.current;
      if (pendingRef.current) await flushRef.current();
      return;
    }
    const projectId = projectIdRef.current;
    const document = pendingRef.current;
    if (!projectId || !document) return;

    clearSaveTimer();
    pendingRef.current = null;
    activeRef.current = document;
    savingRef.current = true;
    setSaveState('saving');
    const operation = (async () => {
      try {
        const saved = await api.studioProjects.update(projectId, {
          expectedRevision: revisionRef.current,
          document,
        });
        revisionRef.current = saved.revision;
        acknowledgedKeyRef.current = documentKey(saved.document);
        failedRef.current = null;
        cacheProject(saved);
        setSaveState(pendingRef.current ? 'pending' : 'saved');
      } catch (cause) {
        failedRef.current = document;
        setSaveState(cause instanceof ApiError && cause.isConflict ? 'conflict' : 'error');
      } finally {
        activeRef.current = null;
        savingRef.current = false;
        if (pendingRef.current) scheduleFlush();
      }
    })();
    savingPromiseRef.current = operation;
    await operation;
    if (savingPromiseRef.current === operation) savingPromiseRef.current = null;
  }, [cacheProject, clearSaveTimer, scheduleFlush]);

  React.useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  React.useEffect(() => {
    if (query.data) {
      const changedProject = projectIdRef.current !== null && projectIdRef.current !== query.data.id;
      projectIdRef.current = query.data.id;
      revisionRef.current = changedProject ? query.data.revision : Math.max(revisionRef.current, query.data.revision);
      acknowledgedKeyRef.current = documentKey(query.data.document);
      if (changedProject) {
        pendingRef.current = null;
        failedRef.current = null;
        activeRef.current = null;
        setSaveState('saved');
      }
      if (pendingRef.current) scheduleFlush();
    }
  }, [query.data, scheduleFlush]);

  React.useEffect(() => {
    if (!activeProjectId || !selectedProjectMissing) return;
    clearActiveProjectId();
  }, [activeProjectId, selectedProjectMissing]);

  React.useEffect(() => clearSaveTimer, [clearSaveTimer]);

  const save = React.useCallback((document: StudioProjectDocument) => {
    const key = documentKey(document);
    if (
      key === documentKey(pendingRef.current) ||
      key === documentKey(activeRef.current) ||
      (!savingRef.current && !failedRef.current && key === acknowledgedKeyRef.current)
    ) {
      return;
    }
    pendingRef.current = document;
    failedRef.current = null;
    lastChangeAtRef.current = Date.now();
    setSaveState('pending');
    scheduleFlush();
  }, [scheduleFlush]);

  const retry = React.useCallback(async () => {
    if (!failedRef.current && !pendingRef.current) {
      await query.refetch();
      return;
    }
    if (saveState === 'conflict') {
      const refreshed = await query.refetch();
      if (!refreshed.data) return;
      revisionRef.current = refreshed.data.revision;
    }
    // A new local edit may arrive while conflict refresh is in flight. Always
    // retry the newest intent instead of replaying the stale document captured
    // when the Retry button was pressed.
    const document = pendingRef.current ?? failedRef.current;
    if (!document) return;
    failedRef.current = null;
    pendingRef.current = document;
    lastChangeAtRef.current = Date.now() - saveDelayMs;
    clearSaveTimer();
    await flushRef.current();
  }, [clearSaveTimer, query, saveDelayMs, saveState]);

  const flushBeforeProjectChange = React.useCallback(async () => {
    clearSaveTimer();
    while (savingRef.current || pendingRef.current) {
      await flushRef.current();
      if (failedRef.current) break;
    }
    if (failedRef.current) {
      throw new Error('Save the current project successfully before switching projects.');
    }
  }, [clearSaveTimer]);

  const activateProject = React.useCallback((project: StudioProject) => {
    cacheProject(project);
    projectIdRef.current = project.id;
    revisionRef.current = project.revision;
    acknowledgedKeyRef.current = documentKey(project.document);
    pendingRef.current = null;
    failedRef.current = null;
    activeRef.current = null;
    storeActiveProjectId(project.id);
    setActiveProjectId(project.id);
    setSaveState('saved');
  }, [cacheProject]);

  const switchProject = React.useCallback(async (id: string) => {
    if (!id || id === projectIdRef.current) return;
    setProjectActionState('switching');
    setProjectActionError(null);
    try {
      await flushBeforeProjectChange();
      const project = await queryClient.fetchQuery({
        queryKey: queryKeys.studioProject(id),
        queryFn: () => api.studioProjects.get(id),
        staleTime: Infinity,
      });
      activateProject(project);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The Studio project could not be opened.';
      setProjectActionError(message);
      throw cause;
    } finally {
      setProjectActionState('idle');
    }
  }, [activateProject, flushBeforeProjectChange, queryClient]);

  const createProject = React.useCallback(async (name: string) => {
    const trimmedName = name.trim().slice(0, 100);
    if (!trimmedName) throw new Error('Enter a project name.');
    setProjectActionState('creating');
    setProjectActionError(null);
    try {
      await flushBeforeProjectChange();
      await queryClient.cancelQueries({ queryKey: queryKeys.studioProjects, exact: true });
      const project = await api.studioProjects.create({ name: trimmedName });
      activateProject(project);
      return project;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The Studio project could not be created.';
      setProjectActionError(message);
      throw cause;
    } finally {
      setProjectActionState('idle');
    }
  }, [activateProject, flushBeforeProjectChange, queryClient]);

  const deleteProject = React.useCallback(async (id: string) => {
    if (!id) throw new Error('A Studio project is required.');
    if (id === projectIdRef.current) {
      // The active project can be deleted, but the protected default must be
      // the next workspace. The server remains the authority for that rule.
      const active = query.data;
      if (active?.isDefault) throw new Error('The My Studio project cannot be deleted.');
    }
    setProjectActionState('deleting');
    setProjectActionError(null);
    try {
      await flushBeforeProjectChange();
      await api.studioProjects.remove(id);
      queryClient.removeQueries({ queryKey: queryKeys.studioProject(id), exact: true });
      queryClient.setQueryData<StudioProjectSummary[]>(queryKeys.studioProjects, (current) =>
        current?.filter((item) => item.id !== id) ?? [],
      );
      if (id === projectIdRef.current) {
        const fallback = await queryClient.fetchQuery({
          queryKey: queryKeys.studioProjectDefault,
          queryFn: api.studioProjects.getDefault,
          staleTime: Infinity,
        });
        activateProject(fallback);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The Studio project could not be deleted.';
      setProjectActionError(message);
      throw cause;
    } finally {
      setProjectActionState('idle');
    }
  }, [activateProject, flushBeforeProjectChange, query.data, queryClient]);

  return {
    project: query.data ?? null,
    saveState: query.error instanceof ApiError && query.error.isNotFound
      ? undefined
      : query.data
        ? saveState
        : query.isError
          ? 'error'
          : 'loading',
    save,
    retry,
    error: query.error,
    projects: projectsQuery.data ?? [],
    projectsLoading: projectsQuery.isLoading,
    projectActionState,
    projectActionError: projectActionError ?? (selectedProjectMissing
      ? 'The selected Studio project no longer exists. Opened the default project instead.'
      : null),
    switchProject,
    createProject,
    deleteProject,
  };
}

'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api/client';
import { queryKeys, useDefaultStudioProject } from '@/lib/api/hooks';
import type { StudioProjectDocument } from '@/lib/api/types';

export type StudioProjectSaveState =
  | 'loading'
  | 'pending'
  | 'saved'
  | 'saving'
  | 'error'
  | 'conflict';

export const STUDIO_PROJECT_SAVE_DELAY_MS = 5_000;

interface StudioProjectWorkspaceOptions {
  saveDelayMs?: number;
}

function documentKey(document: StudioProjectDocument | null) {
  return document ? JSON.stringify(document) : null;
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
  const query = useDefaultStudioProject();
  const queryClient = useQueryClient();
  const [saveState, setSaveState] = React.useState<StudioProjectSaveState>('saved');
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

  const flush = React.useCallback(async () => {
    const projectId = projectIdRef.current;
    const document = pendingRef.current;
    if (!projectId || !document || savingRef.current) return;

    clearSaveTimer();
    pendingRef.current = null;
    activeRef.current = document;
    savingRef.current = true;
    setSaveState('saving');
    try {
      const saved = await api.studioProjects.update(projectId, {
        expectedRevision: revisionRef.current,
        document,
      });
      revisionRef.current = saved.revision;
      acknowledgedKeyRef.current = documentKey(saved.document);
      failedRef.current = null;
      queryClient.setQueryData(queryKeys.studioProjectDefault, saved);
      queryClient.setQueryData(queryKeys.studioProject(saved.id), saved);
      setSaveState(pendingRef.current ? 'pending' : 'saved');
    } catch (cause) {
      failedRef.current = document;
      setSaveState(cause instanceof ApiError && cause.isConflict ? 'conflict' : 'error');
    } finally {
      activeRef.current = null;
      savingRef.current = false;
      if (pendingRef.current) scheduleFlush();
    }
  }, [clearSaveTimer, queryClient, scheduleFlush]);

  React.useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  React.useEffect(() => {
    if (query.data) {
      const changedProject = projectIdRef.current !== null && projectIdRef.current !== query.data.id;
      projectIdRef.current = query.data.id;
      revisionRef.current = changedProject
        ? query.data.revision
        : Math.max(revisionRef.current, query.data.revision);
      acknowledgedKeyRef.current = documentKey(query.data.document);
      if (pendingRef.current) scheduleFlush();
    }
  }, [query.data, scheduleFlush]);

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
  };
}

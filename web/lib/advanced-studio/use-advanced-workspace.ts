'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api/client';
import { queryKeys, useAdvancedProject } from '@/lib/api/hooks';
import { documentKey } from './document';
import type { AdvDocument, AdvProject } from './types';

export type AdvSaveState = 'loading' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';

export const ADV_SAVE_DELAY_MS = 1_500;

const RUN_OUTPUT_FIELDS = ['status', 'error', 'results', 'activeResultIndex'] as const;

/** Merge only fields owned by the server-side generation mutation into a
 * locally newer canvas snapshot. This preserves edits made while a long run
 * is in flight without allowing that snapshot to erase the completed result. */
export function mergeServerRunOutputs(local: AdvDocument, server: AdvDocument): AdvDocument {
  const serverNodes = new Map(server.nodes.map((node) => [node.id, node]));
  return {
    ...local,
    nodes: local.nodes.map((node) => {
      const serverNode = serverNodes.get(node.id);
      if (!serverNode || (node.type !== 'imageGenerator' && node.type !== 'videoGenerator')) return node;
      const data = { ...node.data } as Record<string, unknown>;
      const serverData = serverNode.data as Record<string, unknown>;
      for (const field of RUN_OUTPUT_FIELDS) {
        if (serverData[field] === undefined) delete data[field];
        else data[field] = serverData[field];
      }
      return { ...node, data } as typeof node;
    }),
  };
}

/**
 * Autosave for one Advanced Studio project.
 *
 * Follows the same contract as the guided Studio's workspace hook — debounce a
 * quiet window, serialize saves so each one is based on the last acknowledged
 * revision, surface a 409 as a recoverable `conflict` — but is scoped to the
 * Advanced Studio endpoints. Continuous gestures (dragging, typing, zooming)
 * coalesce into one request instead of one per frame.
 */
export function useAdvancedWorkspace(projectId: string, saveDelayMs = ADV_SAVE_DELAY_MS) {
  const query = useAdvancedProject(projectId);
  const queryClient = useQueryClient();
  const [saveState, setSaveState] = React.useState<AdvSaveState>('loading');

  const revisionRef = React.useRef(0);
  const pendingRef = React.useRef<AdvDocument | null>(null);
  const activeRef = React.useRef<AdvDocument | null>(null);
  const failedRef = React.useRef<AdvDocument | null>(null);
  const acknowledgedKeyRef = React.useRef<string | null>(null);
  const savingRef = React.useRef(false);
  const savingPromiseRef = React.useRef<Promise<void> | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastChangeAtRef = React.useRef(0);
  const flushRef = React.useRef<() => Promise<void>>(async () => {});
  const nameRef = React.useRef<string | undefined>(undefined);
  const acknowledgedNameRef = React.useRef<string | undefined>(undefined);
  const adoptedRunDocumentRef = React.useRef<AdvDocument | null>(null);

  const clearTimer = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const schedule = React.useCallback(() => {
    clearTimer();
    const remaining = Math.max(0, saveDelayMs - (Date.now() - lastChangeAtRef.current));
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flushRef.current();
    }, remaining);
  }, [clearTimer, saveDelayMs]);

  const cacheProject = React.useCallback((project: AdvProject) => {
    queryClient.setQueryData(queryKeys.advancedProject(project.id), project);
    // `exact` matters: the list key is a prefix of the project key, so a
    // non-exact invalidation would also refetch the project we just saved.
    queryClient.invalidateQueries({ queryKey: queryKeys.advancedProjects, exact: true });
  }, [queryClient]);

  const flush = React.useCallback(async () => {
    if (savingRef.current) {
      await savingPromiseRef.current;
      if (pendingRef.current) await flushRef.current();
      return;
    }
    const document = pendingRef.current;
    if (!document) return;

    clearTimer();
    pendingRef.current = null;
    activeRef.current = document;
    savingRef.current = true;
    setSaveState('saving');
    const operation = (async () => {
      try {
        const saved = await api.advancedStudio.update(projectId, {
          expectedRevision: revisionRef.current,
          document,
          ...(nameRef.current ? { name: nameRef.current } : {}),
        });
        revisionRef.current = saved.revision;
        acknowledgedKeyRef.current = documentKey(saved.document);
        acknowledgedNameRef.current = saved.name;
        failedRef.current = null;
        cacheProject(saved);
        setSaveState(pendingRef.current ? 'pending' : 'saved');
      } catch (cause) {
        failedRef.current = adoptedRunDocumentRef.current
          ? mergeServerRunOutputs(document, adoptedRunDocumentRef.current)
          : document;
        setSaveState(cause instanceof ApiError && cause.isConflict ? 'conflict' : 'error');
      } finally {
        activeRef.current = null;
        savingRef.current = false;
        if (pendingRef.current) schedule();
      }
    })();
    savingPromiseRef.current = operation;
    await operation;
    if (savingPromiseRef.current === operation) savingPromiseRef.current = null;
  }, [cacheProject, clearTimer, projectId, schedule]);

  React.useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  React.useEffect(() => {
    if (!query.data) return;
    revisionRef.current = Math.max(revisionRef.current, query.data.revision);
    acknowledgedKeyRef.current = documentKey(query.data.document);
    nameRef.current = query.data.name;
    acknowledgedNameRef.current = query.data.name;
  }, [query.data]);

  React.useEffect(() => clearTimer, [clearTimer]);

  // A tab close or navigation mid-debounce would otherwise drop the last edit.
  React.useEffect(() => {
    const flushNow = () => {
      if (pendingRef.current) void flushRef.current();
    };
    window.addEventListener('pagehide', flushNow);
    document.addEventListener('visibilitychange', flushNow);
    return () => {
      window.removeEventListener('pagehide', flushNow);
      document.removeEventListener('visibilitychange', flushNow);
    };
  }, []);

  const save = React.useCallback((next: AdvDocument, name?: string) => {
    if (name) nameRef.current = name;
    // A rename is a change; the same name arriving with every autosave is not.
    const renamed = Boolean(name) && name !== acknowledgedNameRef.current;
    const key = documentKey(next);
    const unchanged =
      key === (pendingRef.current ? documentKey(pendingRef.current) : null) ||
      key === (activeRef.current ? documentKey(activeRef.current) : null) ||
      (!savingRef.current && !failedRef.current && !renamed && key === acknowledgedKeyRef.current);
    if (unchanged) return;
    pendingRef.current = next;
    failedRef.current = null;
    lastChangeAtRef.current = Date.now();
    setSaveState('pending');
    schedule();
  }, [schedule]);

  const retry = React.useCallback(async () => {
    if (saveState === 'conflict') {
      const refreshed = await query.refetch();
      if (!refreshed.data) return;
      revisionRef.current = refreshed.data.revision;
    }
    const document = pendingRef.current ?? failedRef.current;
    if (!document) {
      await query.refetch();
      return;
    }
    failedRef.current = null;
    pendingRef.current = document;
    lastChangeAtRef.current = Date.now() - saveDelayMs;
    clearTimer();
    await flushRef.current();
  }, [clearTimer, query, saveDelayMs, saveState]);

  /** Drains any queued save before an action that reads server state (running
   * a node), so the server never generates from a stale graph. */
  const flushNow = React.useCallback(async () => {
    clearTimer();
    while (savingRef.current || pendingRef.current) {
      await flushRef.current();
      if (failedRef.current) break;
    }
  }, [clearTimer]);

  /** Adopts the revision returned by a server-side mutation (a node run) so
   * the next autosave is not treated as a stale writer. */
  const adoptProject = React.useCallback((project: AdvProject) => {
    adoptedRunDocumentRef.current = project.document;
    if (pendingRef.current) {
      pendingRef.current = mergeServerRunOutputs(pendingRef.current, project.document);
    }
    if (failedRef.current) {
      failedRef.current = mergeServerRunOutputs(failedRef.current, project.document);
    }
    revisionRef.current = project.revision;
    acknowledgedKeyRef.current = documentKey(project.document);
    acknowledgedNameRef.current = project.name;
    cacheProject(project);
  }, [cacheProject]);

  return {
    project: query.data ?? null,
    isLoading: query.isLoading,
    projectMissing: query.error instanceof ApiError && query.error.isNotFound,
    // 'loading' is derived, not stored: once the project has arrived the
    // initial state is simply "saved".
    saveState: saveState === 'loading' && query.data ? 'saved' : saveState,
    save,
    retry,
    flushNow,
    adoptProject,
  };
}

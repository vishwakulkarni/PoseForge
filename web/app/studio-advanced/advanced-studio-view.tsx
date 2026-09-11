'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { useAdvancedCapabilities } from '@/lib/api/hooks';
import { useAdvancedWorkspace } from '@/lib/advanced-studio/use-advanced-workspace';
import type { AdvDocument, AdvProject } from '@/lib/advanced-studio/types';
import { AdvCanvas } from '@/components/advanced-studio/canvas';
import { ErrorState, LoadingRegion, Skeleton } from '@/components/ui/feedback';

/**
 * Advanced Studio workbench.
 *
 * Deliberately thin: it owns project loading, autosave wiring and the
 * server-side node run, and hands everything else to the canvas. There are no
 * permanent side panels — the canvas fills the surface below the nav.
 */
export function AdvancedStudioView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const workspace = useAdvancedWorkspace(projectId);
  const capabilities = useAdvancedCapabilities();

  React.useEffect(() => {
    if (workspace.projectMissing) router.replace('/studio-advanced');
  }, [router, workspace.projectMissing]);

  // Destructured so these callbacks keep a stable identity across renders —
  // the canvas treats a new `onSave` as a reason to re-run its save effect.
  const { flushNow, adoptProject, save: saveDocument, retry } = workspace;

  const runNode = React.useCallback(async (nodeId: string): Promise<AdvProject | null> => {
    // Drain any queued autosave first: the server generates from the stored
    // document, so a debounced edit must land before the run starts.
    await flushNow();
    const response = await api.advancedStudio.runNode(projectId, nodeId);
    adoptProject(response.project);
    return response.project;
  }, [adoptProject, flushNow, projectId]);

  const save = React.useCallback((document: AdvDocument, name?: string) => {
    saveDocument(document, name);
  }, [saveDocument]);

  if (workspace.isLoading) {
    return (
      <LoadingRegion label="Loading workflow" className="flex-1">
        <Skeleton className="h-[calc(100vh-var(--pf-nav-h))]" />
      </LoadingRegion>
    );
  }

  if (!workspace.project) {
    return (
      <ErrorState
        title="This workflow could not be opened"
        message="It may have been deleted in another tab."
        onRetry={() => router.push('/studio-advanced')}
      />
    );
  }

  return (
    <AdvCanvas
      project={workspace.project}
      capabilities={capabilities.data ?? []}
      saveState={workspace.saveState}
      onSave={save}
      onRetry={() => { void retry(); }}
      onRunNode={runNode}
    />
  );
}

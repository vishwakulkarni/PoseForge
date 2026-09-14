'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clapperboard, FileStack, LayoutGrid, Plus, Sparkles, Trash2 } from 'lucide-react';
import {
  useAdvancedProjects,
  useCreateAdvancedProject,
  useDeleteAdvancedProject,
} from '@/lib/api/hooks';
import type { AdvProjectSummary, AdvTemplateId } from '@/lib/advanced-studio/types';
import { relativeTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from '@/components/ui/feedback';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { NewProjectDialog } from './new-project-dialog';

const TEMPLATE_ICON: Record<AdvTemplateId, typeof Sparkles> = {
  image: Sparkles,
  video: Clapperboard,
  storyboard: FileStack,
  blank: LayoutGrid,
};

const TEMPLATE_LABEL: Record<AdvTemplateId, string> = {
  image: 'Image',
  video: 'Video',
  storyboard: 'Storyboard',
  blank: 'Blank',
};

function ProjectPreview({ project }: { project: AdvProjectSummary }) {
  const generated = project.preview?.generatedImageUrl;
  const loaded = project.preview?.loadedImageUrls ?? [];
  const Icon = TEMPLATE_ICON[project.template] ?? LayoutGrid;

  if (generated) {
    // eslint-disable-next-line @next/next/no-img-element -- served by the local storage mount
    return <img src={generated} alt="Latest generated result" className="h-full w-full object-cover" />;
  }
  if (loaded.length) {
    return (
      <div className="flex h-full w-full gap-1.5 p-2" aria-label={`${loaded.length} project images`}>
        {loaded.map((imageUrl) => (
          // eslint-disable-next-line @next/next/no-img-element -- served by the local storage mount
          <img key={imageUrl} src={imageUrl} alt="Workflow input" className="min-w-0 flex-1 rounded-[10px] object-cover" />
        ))}
      </div>
    );
  }
  return <Icon className="size-7" />;
}

/**
 * Advanced Studio project gallery.
 *
 * Lists only Advanced Studio workflows — the API is workspace-scoped, so a
 * guided Studio project can never appear here (and vice versa).
 */
export function AdvancedProjectsView() {
  const router = useRouter();
  const toast = useToast();
  const projects = useAdvancedProjects();
  const create = useCreateAdvancedProject();
  const remove = useDeleteAdvancedProject();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<AdvProjectSummary | null>(null);

  const onCreate = async (input: { name: string; template: AdvTemplateId }) => {
    try {
      const project = await create.mutateAsync(input);
      setDialogOpen(false);
      router.push(`/studio-advanced/${project.id}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'That workflow could not be created.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-[var(--pf-text-secondary)]">
          Free-form node workflows for image, video and storyboard work.
        </p>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" /> New project
        </Button>
      </div>

      <LoadingRegion label="Loading workflows">
        {projects.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((key) => <Skeleton key={key} className="aspect-[4/3] w-full rounded-[18px]" />)}
          </div>
        ) : projects.isError ? (
          <ErrorState
            title="Workflows could not be loaded"
            message={projects.error instanceof Error ? projects.error.message : undefined}
            onRetry={() => { void projects.refetch(); }}
          />
        ) : (projects.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="No workflows yet"
            description="Create an image, video, or storyboard workflow — or start from a blank canvas."
            action={<Button onClick={() => setDialogOpen(true)}><Plus className="size-4" /> New project</Button>}
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {projects.data?.map((project) => (
              <li
                key={project.id}
                className="group relative overflow-hidden rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-surface)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--pf-shadow-md)]"
              >
                <Link
                  href={`/studio-advanced/${project.id}`}
                  className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 overflow-hidden bg-[var(--pf-surface-muted)] text-[var(--pf-text-tertiary)]"
                  aria-label={`Open ${project.name}`}
                >
                  <ProjectPreview project={project} />
                </Link>
                <button
                  type="button"
                  className="absolute right-3 top-3 rounded-full bg-[var(--pf-surface)]/90 p-2 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label={`Delete ${project.name}`}
                  onClick={() => setPendingDelete(project)}
                >
                  <Trash2 className="size-4" />
                </button>
                <div className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <Link
                      href={`/studio-advanced/${project.id}`}
                      className="flex items-center gap-2 truncate text-left text-[14px] font-bold hover:underline"
                    >
                      <span className="truncate">{project.name}</span>
                      <Badge>{TEMPLATE_LABEL[project.template] ?? 'Blank'}</Badge>
                    </Link>
                    <p className="text-[11px] text-[var(--pf-text-tertiary)]">
                      {project.nodeCount} node{project.nodeCount === 1 ? '' : 's'} · edited {relativeTime(project.updatedAt)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </LoadingRegion>

      <NewProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreate={onCreate}
        creating={create.isPending}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        title={`Delete ${pendingDelete?.name ?? 'this workflow'}?`}
        description="The workflow and its node graph are removed. Generated images stay in your history."
        confirmLabel="Delete workflow"
        destructive
        onConfirm={async () => {
          const project = pendingDelete;
          setPendingDelete(null);
          if (!project) return;
          try {
            await remove.mutateAsync(project.id);
          } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : 'That workflow could not be deleted.');
          }
        }}
      />
    </div>
  );
}

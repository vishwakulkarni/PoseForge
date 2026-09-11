'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FolderKanban, Plus, Star, Trash2 } from 'lucide-react';
import {
  useCreateStudioProject,
  useDeleteStudioProject,
  useStudioProjects,
} from '@/lib/api/hooks';
import type { StudioProjectSummary } from '@/lib/api/types';
import { relativeTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';

function CreateProjectForm({
  onCreated,
  onCancel,
}: {
  onCreated: (project: StudioProjectSummary) => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const create = useCreateStudioProject();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const trimmed = name.trim();
    if (!trimmed) return setFormError('Give this project a name.');

    try {
      const project = await create.mutateAsync(trimmed);
      onCreated(project);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Could not create that project.');
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>New project</DialogTitle>
        <DialogDescription>
          Projects each keep their own canvas — characters, poses, and generation nodes.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Name" htmlFor="new-studio-project-name">
          <Input
            id="new-studio-project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Holiday card shoot"
            maxLength={100}
            autoFocus
          />
        </Field>

        {formError ? (
          <p role="alert" className="rounded-[11px] bg-[var(--pf-error-bg)] p-3 text-[12px] text-[var(--pf-error)]">
            {formError}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={create.isPending}>
            Create project
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function StudioProjectsView() {
  const router = useRouter();
  const { data: projects, isLoading, error, refetch } = useStudioProjects();
  const remove = useDeleteStudioProject();
  const toast = useToast();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<{ id: string; name: string } | null>(null);

  const openProject = (id: string) => router.push(`/studio/${id}`);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await remove.mutateAsync(pendingDelete.id);
      toast.success('Project removed', `${pendingDelete.name} is no longer saved.`);
      setPendingDelete(null);
    } catch (cause) {
      toast.error('Could not remove project', cause instanceof Error ? cause.message : undefined);
    }
  };

  if (error) {
    return (
      <ErrorState
        title="Could not load Studio projects"
        message={error instanceof Error ? error.message : undefined}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <>
      <div className="mb-5 flex justify-end">
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <Plus />
          New project
        </Button>
      </div>

      {isLoading ? (
        <LoadingRegion label="Loading Studio projects">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="aspect-[4/3] w-full rounded-[18px]" />
            ))}
          </div>
        </LoadingRegion>
      ) : !projects?.length ? (
        <EmptyState
          icon={<FolderKanban className="size-5" />}
          title="No Studio projects yet"
          description="A project keeps its own canvas of characters, poses, and generation nodes."
          action={
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus />
              Start your first project
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((project) => (
            <li
              key={project.id}
              className="group relative overflow-hidden rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-surface)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--pf-shadow-md)]"
            >
              <button
                type="button"
                onClick={() => openProject(project.id)}
                className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-[var(--pf-surface-muted)] text-[var(--pf-text-tertiary)]"
                aria-label={`Open ${project.name}`}
              >
                <FolderKanban className="size-7" />
              </button>

              {!project.isDefault ? (
                <Button
                  size="icon"
                  variant="secondary"
                  aria-label={`Delete ${project.name}`}
                  onClick={() => setPendingDelete({ id: project.id, name: project.name })}
                  className="absolute right-2 top-2 size-8 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              ) : null}

              <div className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => openProject(project.id)}
                    className="truncate text-left text-[14px] font-bold hover:underline"
                  >
                    {project.name}
                  </button>
                  <p className="text-[11px] text-[var(--pf-text-tertiary)]">
                    Updated {relativeTime(project.updatedAt)}
                  </p>
                  {project.isDefault ? (
                    <Badge variant="ok" className="mt-2">
                      <Star className="size-3" />
                      Default
                    </Badge>
                  ) : null}
                </div>
                <Button size="sm" variant="ghost" onClick={() => openProject(project.id)}>
                  Open
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <CreateProjectForm
            onCreated={(project) => {
              setCreateOpen(false);
              router.push(`/studio/${project.id}`);
            }}
            onCancel={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete ${pendingDelete?.name ?? 'project'}?`}
        description="The canvas, its nodes, and layout for this project are permanently removed."
        confirmLabel="Delete project"
        destructive
        loading={remove.isPending}
        onConfirm={confirmDelete}
      />
    </>
  );
}

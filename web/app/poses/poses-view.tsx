'use client';

import * as React from 'react';
import Link from 'next/link';
import { ExternalLink, ImagePlus, Images, Search, Trash2 } from 'lucide-react';
import {
  useCreatePoseReference,
  useDeletePoseReference,
  usePoseReferences,
} from '@/lib/api/hooks';
import type { PoseReference } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Input } from '@/components/ui/field';
import { Dropzone, useImagePreview } from '@/components/ui/dropzone';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';

/**
 * Rendered inside DialogContent, which Radix unmounts on close — so state
 * resets naturally on every open, with no reset effect.
 */
function AddPoseForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const preview = useImagePreview();
  const create = useCreatePoseReference();
  const toast = useToast();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!preview.file) return setFormError('Choose a pose photo to add.');

    const form = new FormData();
    form.append('posePhoto', preview.file);
    if (title.trim()) form.append('title', title.trim());
    if (category.trim()) form.append('category', category.trim());

    try {
      await create.mutateAsync(form);
      toast.success('Pose added', 'Auto-tagging runs in the background.');
      onDone();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not add that pose.');
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add a pose reference</DialogTitle>
        <DialogDescription>
          Any photo works as a pose source — only the body language is used, never the face.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field label="Pose photo" error={preview.error ?? undefined}>
            <Dropzone
              previewUrl={preview.url}
              onFileSelected={preview.select}
              onClear={preview.clear}
              disabled={preview.pending}
              label="Add pose photo"
              aria-label="Pose reference photo"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" htmlFor="pose-title" help="Optional. Auto-tagging fills gaps.">
              <Input
                id="pose-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Arms crossed, confident"
                maxLength={80}
              />
            </Field>
            <Field label="Category" htmlFor="pose-category" help="e.g. standing, seated, portrait.">
              <Input
                id="pose-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="standing"
                maxLength={40}
              />
            </Field>
          </div>

          {formError ? (
            <p role="alert" className="rounded-[11px] bg-[var(--pf-error-bg)] p-3 text-[12px] text-[var(--pf-error)]">
              {formError}
            </p>
          ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={create.isPending}>
            Add pose
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function AddPoseDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <AddPoseForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function PoseCard({
  pose,
  onDelete,
}: {
  pose: PoseReference;
  onDelete: (pose: PoseReference) => void;
}) {
  return (
    <li className="group relative overflow-hidden rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-surface)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--pf-shadow-md)]">
      <div className="relative aspect-[4/5] overflow-hidden bg-[var(--pf-surface-muted)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- mixed local storage and remote provider URLs */}
        <img
          src={pose.imageUrl}
          alt={pose.title ?? 'Pose reference'}
          loading="lazy"
          className="size-full object-cover"
        />

        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {pose.isCustom ? <Badge variant="running">Yours</Badge> : null}
          {pose.tagStatus === 'pending' ? <Badge variant="neutral">Tagging…</Badge> : null}
        </div>

        {pose.isCustom ? (
          <Button
            size="icon"
            variant="secondary"
            aria-label={`Delete pose ${pose.title ?? ''}`}
            onClick={() => onDelete(pose)}
            className="absolute right-2 top-2 size-8 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 p-4">
        <p className="truncate text-[13px] font-bold">{pose.title ?? 'Untitled pose'}</p>

        {pose.tags.length ? (
          <ul className="flex flex-wrap gap-1">
            {pose.tags.slice(0, 3).map((tag) => (
              <li
                key={tag}
                className="rounded-full bg-[var(--pf-surface-muted)] px-2 py-0.5 text-[10px] text-[var(--pf-text-tertiary)]"
              >
                {tag}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-1 flex items-center justify-between gap-2">
          <Button asChild size="sm" variant="primary">
            <Link href={`/studio?poseReferenceId=${pose.id}`}>Use in Studio</Link>
          </Button>
          {pose.sourcePageUrl ? (
            <a
              href={pose.sourcePageUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-[10px] text-[var(--pf-text-tertiary)] transition-colors hover:text-[var(--pf-text-secondary)]"
            >
              {pose.sourceProvider ?? 'Source'}
              <ExternalLink className="size-3" />
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function PosesView() {
  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState<string | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<PoseReference | null>(null);

  const { data: poses, isLoading, error, refetch } = usePoseReferences();
  const remove = useDeletePoseReference();
  const toast = useToast();

  const categories = React.useMemo(() => {
    if (!poses) return [];
    return [...new Set(poses.map((pose) => pose.category).filter(Boolean))].sort() as string[];
  }, [poses]);

  // Filtering happens client-side: the library is small enough that a round
  // trip per keystroke would be slower than the render.
  const filtered = React.useMemo(() => {
    if (!poses) return [];
    const term = search.trim().toLowerCase();
    return poses.filter((pose) => {
      if (category && pose.category !== category) return false;
      if (!term) return true;
      return (
        pose.title?.toLowerCase().includes(term) ||
        pose.category?.toLowerCase().includes(term) ||
        pose.tags.some((tag) => tag.toLowerCase().includes(term))
      );
    });
  }, [poses, search, category]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await remove.mutateAsync(pendingDelete.id);
      toast.success('Pose removed');
      setPendingDelete(null);
    } catch (cause) {
      toast.error('Could not remove pose', cause instanceof Error ? cause.message : undefined);
    }
  };

  if (error) {
    return (
      <ErrorState
        title="Could not load the pose library"
        message={error instanceof Error ? error.message : undefined}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--pf-text-tertiary)]" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search poses and tags"
              aria-label="Search poses"
              className="w-[260px] pl-9"
              type="search"
            />
          </div>

          {categories.length ? (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setCategory(null)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[11px] font-[650] transition-colors',
                  category === null
                    ? 'border-[var(--pf-accent)] bg-[var(--pf-accent-soft)] text-[var(--pf-accent)]'
                    : 'border-[var(--pf-border)] text-[var(--pf-text-secondary)] hover:text-[var(--pf-text-primary)]',
                )}
              >
                All
              </button>
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(item === category ? null : item)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-[11px] font-[650] transition-colors',
                    category === item
                      ? 'border-[var(--pf-accent)] bg-[var(--pf-accent-soft)] text-[var(--pf-accent)]'
                      : 'border-[var(--pf-border)] text-[var(--pf-text-secondary)] hover:text-[var(--pf-text-primary)]',
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <Button variant="primary" onClick={() => setAddOpen(true)}>
          <ImagePlus />
          Add pose
        </Button>
      </div>

      {isLoading ? (
        <LoadingRegion label="Loading pose library">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, index) => (
              <Skeleton key={index} className="aspect-[4/5] w-full rounded-[18px]" />
            ))}
          </div>
        </LoadingRegion>
      ) : !filtered.length ? (
        <EmptyState
          icon={<Images className="size-5" />}
          title={poses?.length ? 'No poses match those filters' : 'The pose library is empty'}
          description={
            poses?.length
              ? 'Try a different search term or clear the category filter.'
              : 'Add a pose photo and it becomes reusable across every generation.'
          }
          action={
            poses?.length ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('');
                  setCategory(null);
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setAddOpen(true)}>
                <ImagePlus />
                Add a pose
              </Button>
            )
          }
        />
      ) : (
        <>
          <p className="mb-3 text-[12px] text-[var(--pf-text-tertiary)]" aria-live="polite">
            {filtered.length} {filtered.length === 1 ? 'pose' : 'poses'}
            {poses && filtered.length !== poses.length ? ` of ${poses.length}` : ''}
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {filtered.map((pose) => (
              <PoseCard key={pose.id} pose={pose} onDelete={setPendingDelete} />
            ))}
          </ul>
        </>
      )}

      <AddPoseDialog open={addOpen} onOpenChange={setAddOpen} />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this pose reference?"
        description="Generations that used it keep their history — only the library entry and its stored file are removed."
        confirmLabel="Delete pose"
        destructive
        loading={remove.isPending}
        onConfirm={confirmDelete}
      />
    </>
  );
}

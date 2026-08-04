'use client';

import * as React from 'react';
import Link from 'next/link';
import { Trash2, UserPlus, Users } from 'lucide-react';
import { useCharacters, useCreateCharacter, useDeleteCharacter } from '@/lib/api/hooks';
import { relativeTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

/**
 * The form lives in its own component rendered *inside* DialogContent, which
 * Radix unmounts on close. That means every open starts from fresh state with
 * no reset effect — and no stale name or preview from the previous attempt.
 */
function AddCharacterForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const preview = useImagePreview();
  const create = useCreateCharacter();
  const toast = useToast();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const trimmed = name.trim();
    if (!trimmed) return setFormError('Give this character a name.');
    if (!preview.file) return setFormError('Add a reference photo.');

    const form = new FormData();
    form.append('name', trimmed);
    form.append('characterPhoto', preview.file);

    try {
      await create.mutateAsync(form);
      toast.success('Character saved', `${trimmed} is ready to use in Studio.`);
      onDone();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save that character.');
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add a character</DialogTitle>
        <DialogDescription>
          Save a face once and reuse it across every generation. The photo is normalised to PNG and
          stored on this machine.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field label="Name" htmlFor="character-name" help="How this person appears in pickers.">
            <Input
              id="character-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Anika"
              maxLength={80}
              autoFocus
            />
          </Field>

          <Field
            label="Reference photo"
            help="A clear, well-lit face works best. JPG, PNG, HEIC or HEIF."
            error={preview.error ?? undefined}
          >
            <Dropzone
              previewUrl={preview.url}
              onFileSelected={preview.select}
              onClear={preview.clear}
              disabled={preview.pending}
              label="Add reference photo"
              aria-label="Character reference photo"
            />
          </Field>

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
            Save character
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function AddCharacterDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <AddCharacterForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function CharactersView() {
  const { data: characters, isLoading, error, refetch } = useCharacters();
  const remove = useDeleteCharacter();
  const toast = useToast();
  const [addOpen, setAddOpen] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<{ id: string; name: string } | null>(null);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await remove.mutateAsync(pendingDelete.id);
      toast.success('Character removed', `${pendingDelete.name} is no longer saved.`);
      setPendingDelete(null);
    } catch (cause) {
      toast.error('Could not remove character', cause instanceof Error ? cause.message : undefined);
    }
  };

  if (error) {
    return (
      <ErrorState
        title="Could not load characters"
        message={error instanceof Error ? error.message : undefined}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <>
      <div className="mb-5 flex justify-end">
        <Button variant="primary" onClick={() => setAddOpen(true)}>
          <UserPlus />
          Add character
        </Button>
      </div>

      {isLoading ? (
        <LoadingRegion label="Loading characters">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="aspect-[4/5] w-full rounded-[18px]" />
            ))}
          </div>
        </LoadingRegion>
      ) : !characters?.length ? (
        <EmptyState
          icon={<Users className="size-5" />}
          title="No characters saved yet"
          description="Save a face once and it becomes reusable across every generation, without re-uploading."
          action={
            <Button variant="primary" onClick={() => setAddOpen(true)}>
              <UserPlus />
              Add your first character
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {characters.map((character) => (
            <li
              key={character.id}
              className="group relative overflow-hidden rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-surface)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--pf-shadow-md)]"
            >
              <div className="relative aspect-[4/5] overflow-hidden bg-[var(--pf-surface-muted)]">
                {character.primaryPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- served from the local Express storage mount
                  <img
                    src={character.primaryPhotoUrl}
                    alt={character.name}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="grid size-full place-items-center text-[var(--pf-text-tertiary)]">
                    <Users className="size-6" />
                  </div>
                )}

                <Button
                  size="icon"
                  variant="secondary"
                  aria-label={`Delete ${character.name}`}
                  onClick={() => setPendingDelete({ id: character.id, name: character.name })}
                  className="absolute right-2 top-2 size-8 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>

              <div className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-bold">{character.name}</p>
                  <p className="text-[11px] text-[var(--pf-text-tertiary)]">
                    Added {relativeTime(character.createdAt)}
                  </p>
                </div>
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/studio?characterId=${character.id}`}>Use</Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddCharacterDialog open={addOpen} onOpenChange={setAddOpen} />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete ${pendingDelete?.name ?? 'character'}?`}
        description="Past generations that used this character are kept — only the saved identity and its photos are removed."
        confirmLabel="Delete character"
        destructive
        loading={remove.isPending}
        onConfirm={confirmDelete}
      />
    </>
  );
}

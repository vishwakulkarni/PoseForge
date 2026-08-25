'use client';

import * as React from 'react';
import Link from 'next/link';
import { Images, Pencil, Sparkles, Trash2, UserPlus, Users } from 'lucide-react';
import {
  useCharacters,
  useCreateCharacter,
  useDeleteCharacter,
  useEngines,
  useGenerateCharacterAngles,
  useUpdateCharacter,
} from '@/lib/api/hooks';
import type { CharacterSummary, EngineInfo, EngineKey } from '@/lib/api/types';
import { relativeTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
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
import { Badge } from '@/components/ui/badge';

function useProfileEngineChoice() {
  const enginesQuery = useEngines();
  const [selectedKey, setSelectedKey] = React.useState<EngineKey | null>(null);
  const engines = React.useMemo(
    () => enginesQuery.data?.engines.filter((engine) => engine.capabilities?.angleProfiles) ?? [],
    [enginesQuery.data],
  );
  const selectedEngine = engines.find((engine) => engine.key === selectedKey)
    ?? engines.find((engine) => engine.key === enginesQuery.data?.defaultEngine && engine.ready)
    ?? engines.find((engine) => engine.ready)
    ?? engines[0]
    ?? null;

  return {
    engines,
    selectedEngine,
    setSelectedKey,
    isLoading: enginesQuery.isLoading,
    error: enginesQuery.error,
  };
}

function AngleEngineField({
  id,
  engines,
  selectedEngine,
  isLoading,
  error,
  onChange,
}: {
  id: string;
  engines: EngineInfo[];
  selectedEngine: EngineInfo | null;
  isLoading: boolean;
  error: Error | null;
  onChange: (engine: EngineKey) => void;
}) {
  const unavailableReason = selectedEngine && !selectedEngine.ready
    ? selectedEngine.reason || 'Configure this engine in Settings.'
    : null;

  return (
    <Field
      label="Generation engine"
      htmlFor={id}
      help="PoseForge sends five image-edit requests to the selected engine."
      error={error instanceof Error ? error.message : unavailableReason}
    >
      <Select
        id={id}
        value={selectedEngine?.key ?? ''}
        onChange={(event) => onChange(event.target.value as EngineKey)}
        disabled={isLoading || engines.length === 0}
      >
        {isLoading ? <option value="">Loading engines…</option> : null}
        {!isLoading && engines.length === 0 ? <option value="">No compatible engines</option> : null}
        {engines.map((engine) => (
          <option key={engine.key} value={engine.key} disabled={!engine.ready}>
            {engine.label}{engine.ready ? '' : ' — unavailable'}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/**
 * The form lives in its own component rendered *inside* DialogContent, which
 * Radix unmounts on close. That means every open starts from fresh state with
 * no reset effect — and no stale name or preview from the previous attempt.
 */
function AddCharacterForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [createdCharacter, setCreatedCharacter] = React.useState<CharacterSummary | null>(null);
  const preview = useImagePreview();
  const create = useCreateCharacter();
  const generateAngles = useGenerateCharacterAngles();
  const engineChoice = useProfileEngineChoice();
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
      const created = await create.mutateAsync(form);
      setCreatedCharacter(created);
      toast.success('Character saved', `${trimmed} is ready to use in Studio.`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save that character.');
    }
  };

  const startAngleGeneration = async () => {
    if (!createdCharacter || !engineChoice.selectedEngine?.ready) return;
    setFormError(null);
    try {
      await generateAngles.mutateAsync({
        id: createdCharacter.id,
        engine: engineChoice.selectedEngine.key,
      });
      toast.success(
        'Angle generation started',
        `Creating five identity views for ${createdCharacter.name} with ${engineChoice.selectedEngine.label}.`,
      );
      onDone();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not start angle generation.');
    }
  };

  if (createdCharacter) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Automatically generate all five character angles?</DialogTitle>
          <DialogDescription>
            PoseForge will use the uploaded photo only as the identity source and create left
            profile, left three-quarter, front, right three-quarter and right profile views. This
            sends five image-edit requests to the engine you choose.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-[14px] border border-[var(--pf-border)] bg-[var(--pf-surface-muted)] p-4 text-[12px] leading-relaxed text-[var(--pf-text-secondary)]">
          For best results, the uploaded photo should clearly show one person. The original photo
          stays unchanged and remains the fallback if angle generation fails.
        </div>

        <AngleEngineField
          id="new-character-angle-engine"
          engines={engineChoice.engines}
          selectedEngine={engineChoice.selectedEngine}
          isLoading={engineChoice.isLoading}
          error={engineChoice.error}
          onChange={engineChoice.setSelectedKey}
        />

        {formError ? (
          <p role="alert" className="mt-4 rounded-[11px] bg-[var(--pf-error-bg)] p-3 text-[12px] text-[var(--pf-error)]">
            {formError}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onDone}>
            Not now
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={generateAngles.isPending}
            disabled={!engineChoice.selectedEngine?.ready}
            onClick={startAngleGeneration}
          >
            <Sparkles />
            Generate all angles
          </Button>
        </DialogFooter>
      </>
    );
  }

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
            help="Use a clear photo with one visible person. Any head angle is accepted. JPG, PNG, HEIC or HEIF."
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

function GenerateAnglesDialog({
  character,
  onOpenChange,
}: {
  character: CharacterSummary | null;
  onOpenChange: (open: boolean) => void;
}) {
  const generateAngles = useGenerateCharacterAngles();
  const engineChoice = useProfileEngineChoice();
  const toast = useToast();
  const [formError, setFormError] = React.useState<string | null>(null);

  const generate = async () => {
    if (!character || !engineChoice.selectedEngine?.ready) return;
    setFormError(null);
    try {
      await generateAngles.mutateAsync({
        id: character.id,
        engine: engineChoice.selectedEngine.key,
      });
      toast.success(
        'Angle generation started',
        `Creating five identity views for ${character.name} with ${engineChoice.selectedEngine.label}.`,
      );
      onOpenChange(false);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Could not start angle generation.');
    }
  };

  return (
    <Dialog open={Boolean(character)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate five angles for {character?.name}?</DialogTitle>
          <DialogDescription>
            Choose the image engine that will create the left profile, left three-quarter, front,
            right three-quarter and right profile views.
          </DialogDescription>
        </DialogHeader>

        <AngleEngineField
          id="saved-character-angle-engine"
          engines={engineChoice.engines}
          selectedEngine={engineChoice.selectedEngine}
          isLoading={engineChoice.isLoading}
          error={engineChoice.error}
          onChange={engineChoice.setSelectedKey}
        />

        {formError ? (
          <p role="alert" className="rounded-[11px] bg-[var(--pf-error-bg)] p-3 text-[12px] text-[var(--pf-error)]">
            {formError}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={generateAngles.isPending}
            disabled={!engineChoice.selectedEngine?.ready}
            onClick={generate}
          >
            <Sparkles />
            Generate all angles
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameCharacterForm({
  character,
  onDone,
}: {
  character: CharacterSummary;
  onDone: () => void;
}) {
  const [name, setName] = React.useState(character.name);
  const [formError, setFormError] = React.useState<string | null>(null);
  const update = useUpdateCharacter();
  const toast = useToast();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const trimmed = name.trim();
    if (!trimmed) return setFormError('Give this character a name.');
    if (trimmed.length > 80) return setFormError('Character names must be 80 characters or fewer.');

    try {
      await update.mutateAsync({ id: character.id, name: trimmed });
      toast.success('Character renamed', `${character.name} is now ${trimmed}.`);
      onDone();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not rename that character.');
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Rename character</DialogTitle>
        <DialogDescription>
          The new name will appear anywhere this saved character is used.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} noValidate>
        <Field label="Name" htmlFor="rename-character-name" error={formError ?? undefined}>
          <Input
            id="rename-character-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            autoFocus
          />
        </Field>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={update.isPending}
            disabled={!name.trim() || name.trim() === character.name}
          >
            Save name
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function RenameCharacterDialog({
  character,
  onOpenChange,
}: {
  character: CharacterSummary | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(character)} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        {character ? (
          <RenameCharacterForm character={character} onDone={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function CharactersView() {
  const { data: characters, isLoading, error, refetch } = useCharacters();
  const remove = useDeleteCharacter();
  const toast = useToast();
  const [addOpen, setAddOpen] = React.useState(false);
  const [pendingAngles, setPendingAngles] = React.useState<CharacterSummary | null>(null);
  const [pendingRename, setPendingRename] = React.useState<CharacterSummary | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<{ id: string; name: string } | null>(null);
  const [previewProfile, setPreviewProfile] = React.useState<CharacterSummary | null>(null);

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
                  {character.angleProfile?.status === 'completed' ? (
                    <Badge variant="ok" className="mt-2">Five angles ready</Badge>
                  ) : character.angleProfile?.status === 'pending' || character.angleProfile?.status === 'running' ? (
                    <Badge variant="running" dot pulse className="mt-2">
                      Angles {character.angleProfile.completedAngles}/{character.angleProfile.totalAngles}
                    </Badge>
                  ) : character.angleProfile?.status === 'failed' ? (
                    <Badge variant="error" className="mt-2">Angle generation failed</Badge>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {character.angleProfile?.status === 'completed' && character.angleProfile.sheetUrl ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`View angles for ${character.name}`}
                      onClick={() => setPreviewProfile(character)}
                    >
                      <Images />
                      Angles
                    </Button>
                  ) : character.angleProfile?.status === 'failed' || !character.angleProfile ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPendingAngles(character)}
                    >
                      <Sparkles />
                      {character.angleProfile?.status === 'failed' ? 'Retry' : 'Angles'}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Rename ${character.name}`}
                    onClick={() => setPendingRename(character)}
                  >
                    <Pencil />
                    Edit
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/studio?characterId=${character.id}`}>Use</Link>
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddCharacterDialog open={addOpen} onOpenChange={setAddOpen} />

      <GenerateAnglesDialog
        character={pendingAngles}
        onOpenChange={(open) => !open && setPendingAngles(null)}
      />

      <RenameCharacterDialog
        character={pendingRename}
        onOpenChange={(open) => !open && setPendingRename(null)}
      />

      <Dialog open={Boolean(previewProfile)} onOpenChange={(open) => !open && setPreviewProfile(null)}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{previewProfile?.name} · five-angle profile</DialogTitle>
            <DialogDescription>
              This generated identity sheet is used automatically when this character is selected in Studio.
            </DialogDescription>
          </DialogHeader>
          {previewProfile?.angleProfile?.sheetUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- served from local Express storage
            <img
              src={previewProfile.angleProfile.sheetUrl}
              alt={`Five generated identity angles for ${previewProfile.name}`}
              className="w-full rounded-[14px] border border-[var(--pf-border)] bg-white object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>

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

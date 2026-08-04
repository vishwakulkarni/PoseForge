'use client';

import * as React from 'react';
import { User, X } from 'lucide-react';
import type { CharacterSummary } from '@/lib/api/types';
import type { CharacterSlot as SlotState } from '@/lib/studio/reducer';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dropzone } from '@/components/ui/dropzone';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import { EmptyState } from '@/components/ui/feedback';

export interface CharacterSlotCardProps {
  slot: SlotState;
  position: number;
  characters: CharacterSummary[];
  removable: boolean;
  onSelectCharacter: (character: CharacterSummary) => void;
  onSelectFile: (file: File) => void;
  onClear: () => void;
  onRemove: () => void;
  error?: string | null;
}

export function CharacterSlotCard({
  slot,
  position,
  characters,
  removable,
  onSelectCharacter,
  onSelectFile,
  onClear,
  onRemove,
  error,
}: CharacterSlotCardProps) {
  const filled = Boolean(slot.characterId || slot.file);
  const subtitle = slot.name ?? (slot.file ? slot.file.name : 'Add identity photo');

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-[16px] border bg-[var(--pf-surface)] p-4',
        error ? 'border-[var(--pf-error)]' : 'border-[var(--pf-border)]',
      )}
    >
      <div className="flex items-center gap-3">
        <div className="relative size-11 shrink-0 overflow-hidden rounded-[12px] bg-[var(--pf-surface-muted)]">
          {slot.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob and local storage URLs
            <img src={slot.previewUrl} alt="" className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center text-[var(--pf-text-tertiary)]">
              <User className="size-4" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold">Person {position}</p>
          <p className="truncate text-[11px] text-[var(--pf-text-tertiary)]">{subtitle}</p>
        </div>

        {filled ? (
          <Button size="sm" variant="ghost" onClick={onClear}>
            Change
          </Button>
        ) : null}

        {removable ? (
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Remove person ${position}`}
            onClick={onRemove}
            className="size-8"
          >
            <X className="size-3.5" />
          </Button>
        ) : null}
      </div>

      {!filled ? (
        <Tabs defaultValue={characters.length ? 'saved' : 'upload'}>
          <TabsList className="w-full">
            <TabsTrigger value="saved" className="flex-1">
              Saved
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex-1">
              Upload
            </TabsTrigger>
          </TabsList>

          <TabsContent value="saved" className="mt-3">
            {characters.length ? (
              <ul className="grid max-h-[190px] grid-cols-3 gap-2 overflow-y-auto pr-1">
                {characters.map((character) => (
                  <li key={character.id}>
                    <button
                      type="button"
                      onClick={() => onSelectCharacter(character)}
                      className="group flex w-full flex-col gap-1.5 rounded-[12px] border border-[var(--pf-border)] p-1.5 text-left transition-colors hover:border-[var(--pf-accent)] hover:bg-[var(--pf-accent-soft)]"
                    >
                      <span className="block aspect-square overflow-hidden rounded-[8px] bg-[var(--pf-surface-muted)]">
                        {character.primaryPhotoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- local storage mount
                          <img
                            src={character.primaryPhotoUrl}
                            alt=""
                            loading="lazy"
                            className="size-full object-cover"
                          />
                        ) : null}
                      </span>
                      <span className="truncate px-0.5 pb-0.5 text-[10px] font-semibold">
                        {character.name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No saved characters"
                description="Upload a photo here, or save one on the Characters page to reuse it."
                className="py-6"
              />
            )}
          </TabsContent>

          <TabsContent value="upload" className="mt-3">
            <Dropzone
              previewUrl={null}
              onFileSelected={onSelectFile}
              label={`Photo for person ${position}`}
              aria-label={`Upload identity photo for person ${position}`}
              className="min-h-[130px]"
            />
          </TabsContent>
        </Tabs>
      ) : null}

      {error ? (
        <p role="alert" className="text-[11px] font-semibold text-[var(--pf-error)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { CharacterSummary } from '@/lib/api/types';
import type { CharacterSlot } from '@/lib/studio/reducer';

function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5.5 20c1-4.2 3.4-6.2 6.5-6.2s5.5 2 6.5 6.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export interface SubjectSlotProps {
  slot: CharacterSlot;
  position: number;
  characters: CharacterSummary[];
  removable: boolean;
  onSelectCharacter: (character: CharacterSummary) => void;
  onSelectFile: (file: File) => Promise<boolean>;
  onPasteImage: () => Promise<boolean>;
  onRemove: () => void;
  /** Persists the current upload as a reusable saved character. */
  onSaveIdentity: (name: string) => Promise<void>;
}

export function SubjectSlot({
  slot,
  position,
  characters,
  removable,
  onSelectCharacter,
  onSelectFile,
  onPasteImage,
  onRemove,
  onSaveIdentity,
}: SubjectSlotProps) {
  const filled = Boolean(slot.characterId || slot.file);
  // The picker starts open on an empty slot so the very first action in the
  // Studio needs no extra click to reveal it.
  const [pickerOpen, setPickerOpen] = React.useState(!filled);
  const [mode, setMode] = React.useState<'upload' | 'saved'>('upload');
  const [identityName, setIdentityName] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [pasting, setPasting] = React.useState(false);

  const subtitle = slot.name ?? (slot.file ? slot.file.name : 'Add identity photo');
  const pickerId = `slot-${position}-picker`;

  const saveIdentity = async () => {
    const trimmed = identityName.trim();
    if (!trimmed || !slot.file) return;
    setSaving(true);
    try {
      await onSaveIdentity(trimmed);
      setIdentityName('');
    } finally {
      setSaving(false);
    }
  };

  const pasteImage = async () => {
    setPasting(true);
    try {
      if (await onPasteImage()) setPickerOpen(false);
    } finally {
      setPasting(false);
    }
  };

  return (
    <div className={cn('character-slot', filled && 'is-filled')}>
      <div className="slot-head">
        <label className="slot-preview">
          {slot.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob and local storage URLs
            <img src={slot.previewUrl} alt="" />
          ) : (
            <UserIcon />
          )}
          <input
            type="file"
            accept="image/*,.heic,.heif"
            aria-label={`Identity photo for subject ${position}`}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void onSelectFile(file).then((selected) => {
                  if (selected) setPickerOpen(false);
                });
              }
              event.target.value = '';
            }}
          />
        </label>

        <div className="slot-copy">
          <strong>Subject {position}</strong>
          <span>{subtitle}</span>
        </div>

        {removable ? (
          <button
            type="button"
            className="slot-remove"
            aria-label={`Remove subject ${position}`}
            onClick={onRemove}
          >
            ×
          </button>
        ) : null}

        <button
          type="button"
          className="slot-menu-btn"
          aria-label={`Choose source for subject ${position}`}
          aria-expanded={pickerOpen}
          aria-controls={pickerId}
          onClick={() => setPickerOpen((open) => !open)}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {pickerOpen ? (
        <div className="slot-picker" id={pickerId}>
          <div className="slot-mode-tabs" role="group" aria-label="Identity source">
            <button
              type="button"
              className={cn(mode === 'upload' && 'active')}
              aria-pressed={mode === 'upload'}
              onClick={() => setMode('upload')}
            >
              Upload
            </button>
            <button
              type="button"
              className={cn(mode === 'saved' && 'active')}
              aria-pressed={mode === 'saved'}
              onClick={() => setMode('saved')}
            >
              Saved
            </button>
          </div>

          {mode === 'upload' ? (
            <>
              <button
                type="button"
                className="paste-image-btn"
                disabled={pasting}
                onClick={() => void pasteImage()}
              >
                {pasting ? 'Pasting…' : 'Paste image'}
              </button>
              <div className="quick-save">
                <input
                  type="text"
                  placeholder="Save identity as..."
                  maxLength={80}
                  value={identityName}
                  aria-label={`Save subject ${position} as a named character`}
                  onChange={(event) => setIdentityName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void saveIdentity();
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={!slot.file || !identityName.trim() || saving}
                  onClick={() => void saveIdentity()}
                  title={
                    slot.file
                      ? 'Save this upload as a reusable character'
                      : 'Upload a photo first'
                  }
                >
                  {saving ? '…' : 'Save'}
                </button>
              </div>
            </>
          ) : characters.length ? (
            <div className="saved-strip">
              {characters.map((character) => (
                <button
                  key={character.id}
                  type="button"
                  className={cn(
                    'saved-chip',
                    slot.characterId === character.id && 'selected',
                  )}
                  onClick={() => {
                    onSelectCharacter(character);
                    setPickerOpen(false);
                  }}
                >
                  {character.primaryPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local storage mount
                    <img src={character.primaryPhotoUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="saved-avatar">{character.name.charAt(0).toUpperCase()}</span>
                  )}
                  <span className="saved-name">{character.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="collage-help">
              No saved characters yet. Upload here, then name it to reuse later.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { CharacterSummary, PoseReference } from '@/lib/api/types';
import type { CharacterSlot, StudioMode } from '@/lib/studio/reducer';
import { MAX_CHARACTERS, type AdvancedSettings } from '@/lib/studio/settings';
import { SubjectSlot } from './subject-slot';
import { StudioLabel, StudioSelect } from './primitives';

const COLLAGE_LAYOUTS = [
  ['auto', 'Auto'],
  ['horizontal', 'Horizontal strip'],
  ['vertical', 'Vertical strip'],
  ['2x2', '2 × 2'],
  ['3x2', '3 × 2'],
  ['2x3', '2 × 3'],
] as const;

/** Grid template for the collage cell overlay, mirroring lib/poseCollage.js. */
function collageGridStyle(count: number, layout: string): React.CSSProperties {
  if (layout === 'horizontal') return { gridTemplateColumns: `repeat(${count}, 1fr)` };
  if (layout === 'vertical') return { gridTemplateRows: `repeat(${count}, 1fr)` };
  if (layout === '2x2') return { gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' };
  if (layout === '3x2') return { gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' };
  if (layout === '2x3') return { gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: 'repeat(3, 1fr)' };
  const columns = count <= 3 ? count : Math.ceil(count / 2);
  return {
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gridTemplateRows: count <= 3 ? '1fr' : 'repeat(2, 1fr)',
  };
}

export interface SourcesPanelProps {
  mode: StudioMode;
  slots: CharacterSlot[];
  characters: CharacterSummary[];
  poses: PoseReference[];
  poseReferenceId: string | null;
  posePreviewUrl: string | null;
  poseIsUpload: boolean;
  settings: AdvancedSettings;
  patch: (updater: (current: AdvancedSettings) => AdvancedSettings) => void;
  onAddSlot: () => void;
  onRemoveSlot: (key: string) => void;
  onSelectCharacter: (key: string, character: CharacterSummary) => void;
  onSelectSlotFile: (key: string, file: File) => Promise<boolean>;
  onPasteSlotImage: (key: string) => Promise<boolean>;
  onSaveIdentity: (key: string, name: string) => Promise<void>;
  onSelectPoseFile: (file: File) => void;
  onPastePoseImage: () => Promise<void>;
  onSelectPoseReference: (pose: PoseReference) => void;
  onClearPose: () => void;
}

export function SourcesPanel({
  mode,
  slots,
  characters,
  poses,
  poseReferenceId,
  posePreviewUrl,
  poseIsUpload,
  settings,
  patch,
  onAddSlot,
  onRemoveSlot,
  onSelectCharacter,
  onSelectSlotFile,
  onPasteSlotImage,
  onSaveIdentity,
  onSelectPoseFile,
  onPastePoseImage,
  onSelectPoseReference,
  onClearPose,
}: SourcesPanelProps) {
  const dragDepth = React.useRef(0);
  const [dragActive, setDragActive] = React.useState(false);
  const [posePasting, setPosePasting] = React.useState(false);
  const collage = settings.poseCollage;
  const showCollage = mode === 'advanced' && collage.enabled && poseIsUpload;

  return (
    <aside className="studio-panel asset-panel" aria-label="Source assets">
      <div className="panel-head">
        <div>
          <span className="panel-kicker">01</span>
          <h2>Sources</h2>
        </div>
        <span className="panel-count">
          {slots.length} / {MAX_CHARACTERS}
        </span>
      </div>

      {/* ------------------------------------------------------ subjects */}
      <section className="asset-section">
        <div className="section-label-row">
          <span>Subjects</span>
          <span>Identity references</span>
        </div>

        <div className="character-slots">
          {slots.map((slot, index) => (
            <SubjectSlot
              key={slot.key}
              slot={slot}
              position={index + 1}
              characters={characters}
              removable={slots.length > 1}
              onSelectCharacter={(character) => onSelectCharacter(slot.key, character)}
              onSelectFile={(file) => onSelectSlotFile(slot.key, file)}
              onPasteImage={() => onPasteSlotImage(slot.key)}
              onRemove={() => onRemoveSlot(slot.key)}
              onSaveIdentity={(name) => onSaveIdentity(slot.key, name)}
            />
          ))}
        </div>

        <button
          type="button"
          className="add-source-btn"
          disabled={slots.length >= MAX_CHARACTERS}
          onClick={onAddSlot}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          Add another subject
        </button>
      </section>

      {/* ---------------------------------------------- pose reference */}
      <section className="asset-section pose-section">
        <div className="section-label-row">
          <span>Pose reference</span>
          <Link href="/poses">View library</Link>
        </div>

        <div
          className={cn(
            'pose-dropzone',
            posePreviewUrl && 'has-image',
            dragActive && 'drag-over',
          )}
          onDragEnter={(event) => {
            event.preventDefault();
            dragDepth.current += 1;
            setDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setDragActive(false);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            dragDepth.current = 0;
            setDragActive(false);
            const file = event.dataTransfer.files?.[0];
            if (file) onSelectPoseFile(file);
          }}
        >
          <input
            type="file"
            accept="image/*,.heic,.heif"
            aria-label="Pose reference photo"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onSelectPoseFile(file);
              event.target.value = '';
            }}
          />

          {posePreviewUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- blob and remote provider URLs */}
              <img className="preview-img" src={posePreviewUrl} alt="Selected pose reference" />
              {showCollage ? (
                <div
                  className="pose-collage-grid"
                  style={collageGridStyle(collage.count, collage.layout)}
                  aria-hidden
                >
                  {Array.from({ length: collage.count }, (_, index) => (
                    <span key={index}>{index + 1}</span>
                  ))}
                </div>
              ) : null}
              <div className="dz-overlay">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onClearPose();
                  }}
                >
                  Replace pose
                </button>
              </div>
            </>
          ) : (
            <div className="dz-body">
              <div className="dz-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M12 3v12m0-12L8 7m4-4 4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="dz-text">Add pose photo</div>
              <div className="dz-sub">Drag here or browse</div>
            </div>
          )}
        </div>

        <button
          type="button"
          className="paste-image-btn pose-paste-btn"
          disabled={posePasting}
          onClick={() => {
            setPosePasting(true);
            void onPastePoseImage().finally(() => setPosePasting(false));
          }}
        >
          {posePasting ? 'Pasting…' : 'Paste image'}
        </button>

        {mode === 'advanced' ? (
          <div className="pose-collage-controls">
            <label className="collage-toggle">
              <input
                type="checkbox"
                checked={collage.enabled}
                onChange={(event) =>
                  patch((c) => ({
                    ...c,
                    poseCollage: { ...c.poseCollage, enabled: event.target.checked },
                  }))
                }
              />
              <span>
                <strong>Multi-pose collage</strong>
                <small>Split one pose sheet into parallel outputs</small>
              </span>
            </label>

            {collage.enabled ? (
              <>
                <div className="collage-options">
                  <div>
                    <StudioLabel htmlFor="poseCollageCount">Pose cells</StudioLabel>
                    <StudioSelect
                      id="poseCollageCount"
                      value={String(collage.count)}
                      onChange={(event) =>
                        patch((c) => ({
                          ...c,
                          poseCollage: { ...c.poseCollage, count: Number(event.target.value) },
                        }))
                      }
                    >
                      {[2, 3, 4, 5, 6].map((count) => (
                        <option key={count} value={count}>
                          {count} poses
                        </option>
                      ))}
                    </StudioSelect>
                  </div>
                  <div>
                    <StudioLabel htmlFor="poseCollageLayout">Grid layout</StudioLabel>
                    <StudioSelect
                      id="poseCollageLayout"
                      value={collage.layout}
                      onChange={(event) =>
                        patch((c) => ({
                          ...c,
                          poseCollage: {
                            ...c.poseCollage,
                            layout: event.target.value as typeof c.poseCollage.layout,
                          },
                        }))
                      }
                    >
                      {COLLAGE_LAYOUTS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </StudioSelect>
                  </div>
                </div>
                <p className="collage-help">
                  {poseIsUpload
                    ? 'Each cell becomes one pose reference and one generated image. Maximum six jobs per batch.'
                    : 'Upload a pose sheet to split — library references are already single poses.'}
                </p>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="pose-library-mini">
          {poses.slice(0, 30).map((pose) => (
            <button
              key={pose.id}
              type="button"
              className={cn('pose-thumb', poseReferenceId === pose.id && 'selected')}
              aria-pressed={poseReferenceId === pose.id}
              aria-label={pose.title ?? 'Pose reference'}
              onClick={() => onSelectPoseReference(pose)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- mixed local and remote URLs */}
              <img src={pose.imageUrl} alt="" loading="lazy" />
              {pose.tagStatus === 'pending' ? <span className="pending-dot" /> : null}
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}

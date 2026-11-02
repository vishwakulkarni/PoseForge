'use client';

import * as React from 'react';
import { AlertCircle, Crop, Download, Loader2, Maximize } from 'lucide-react';
import { TRANSFORM_PRESETS, imageTransformNodeDefinition } from '@/lib/advanced-studio/registry/image-transform-node';
import type { AdvImageTransformNodeData, AdvTransformPreset } from '@/lib/advanced-studio/types';
import type { AdvNodeBodyProps } from '../node-context';
import { PillMenu, withUnavailableOption, type PillOption } from '../pill-menu';
import { DraftTextarea, RunFooter } from './node-parts';
import { cn } from '@/lib/utils';

const BUILT_IN = 'builtin';

/** Resizes for a platform and writes an optional caption band — or hands the
 * image to an engine that edits from an instruction (Codex CLI). */
export const ImageTransformNodeBody = React.memo(function ImageTransformNodeBody({
  id,
  data,
  actions,
}: AdvNodeBodyProps<AdvImageTransformNodeData>) {
  const running = actions.runningNodeIds.has(id) || data.status === 'running' || data.status === 'queued';
  const results = data.results ?? [];
  const active = results[Math.min(Math.max(data.activeResultIndex ?? 0, 0), Math.max(results.length - 1, 0))];
  const resolved = actions.resolveInputsFor(id);
  const captionConnected = resolved.texts.length > 0;
  const capability = actions.capabilityFor(data.engine);
  const editors = React.useMemo<PillOption<string>[]>(
    () => withUnavailableOption(
      [
        { value: BUILT_IN, label: 'Built-in', note: 'Resize and caption, free' },
        ...actions.capabilities.filter((engine) => engine.transform?.supported).map((engine) => ({
          value: engine.key,
          label: engine.label,
          note: engine.ready ? 'Edits the image from your instruction' : engine.reason ?? 'Not configured',
          disabled: !engine.ready,
        })),
      ],
      data.engine,
      data.engine ?? '',
    ),
    [actions.capabilities, data.engine],
  );
  const blockedReason = imageTransformNodeDefinition.validate?.(data, resolved)
    ?? (capability && !capability.ready ? capability.reason ?? `${capability.label} is not configured.` : null);
  const agent = Boolean(data.engine);

  return (
    <div className="adv-node-body adv-generator-body">
      <div
        className={cn('adv-preview', running && 'is-running')}
        onDoubleClick={() => { if (active?.imageUrl) actions.openPreview(active.imageUrl); }}
      >
        {running ? (
          <span className="adv-state"><Loader2 aria-hidden className="adv-spin" size={20} /> Transforming…</span>
        ) : active?.imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- served from local /storage */}
            <img src={active.imageUrl} alt={`${data.label} result`} className="adv-preview-image" />
            {active.width && active.height ? <span className="adv-preview-dimensions">{active.width} × {active.height}</span> : null}
          </>
        ) : data.status === 'error' ? (
          <span className="adv-state is-error"><AlertCircle aria-hidden size={20} /> {data.error ?? 'Transform failed'}</span>
        ) : (
          <span className="adv-state"><Crop aria-hidden size={20} /> Connect an image, then transform</span>
        )}
      </div>

      <div className="adv-controls nodrag nopan">
        <PillMenu
          label="Editor"
          value={data.engine ?? BUILT_IN}
          options={editors}
          onChange={(value) => actions.updateNodeData(id, { engine: value === BUILT_IN ? undefined : value, error: undefined })}
          disabled={actions.locked}
          className="adv-pill-wide"
        />
        <PillMenu
          label="Format"
          value={data.preset ?? '9:16'}
          options={TRANSFORM_PRESETS}
          onChange={(preset: AdvTransformPreset) => actions.updateNodeData(id, { preset })}
          disabled={actions.locked}
          className="adv-pill-wide"
        />
        <div className="adv-toggle-group" role="group" aria-label="Fit">
          {(['cover', 'contain'] as const).map((fit) => (
            <button
              key={fit}
              type="button"
              className={cn('adv-toggle', (data.fit ?? 'cover') === fit && 'is-active')}
              aria-pressed={(data.fit ?? 'cover') === fit}
              disabled={actions.locked || data.preset === 'original'}
              onClick={() => actions.updateNodeData(id, { fit })}
            >
              {fit === 'cover' ? 'Crop' : 'Pad'}
            </button>
          ))}
        </div>
        {data.fit === 'contain' && data.preset !== 'original' ? (
          <input
            type="color"
            className="adv-color-input"
            aria-label="Padding colour"
            value={data.background ?? '#000000'}
            disabled={actions.locked}
            onChange={(event) => actions.updateNodeData(id, { background: event.target.value })}
          />
        ) : null}
      </div>

      {agent ? (
        <DraftTextarea
          value={data.instruction ?? ''}
          onCommit={(instruction) => actions.updateNodeData(id, { instruction: instruction || undefined })}
          label={`${data.label} instruction`}
          placeholder="Remove the background, add our logo bottom-right, and set the caption as a bold title"
          maxLength={20_000}
          readOnly={actions.locked}
          className="adv-llm-instruction"
        />
      ) : null}
      <DraftTextarea
        value={data.overlayText ?? ''}
        onCommit={(overlayText) => actions.updateNodeData(id, { overlayText: overlayText || undefined })}
        label={`${data.label} caption`}
        placeholder={captionConnected
          ? 'Using the connected caption'
          : agent ? 'Text for the editor to use (optional)' : 'Caption to write on the image (optional)'}
        maxLength={500}
        readOnly={actions.locked || captionConnected}
        className="adv-caption-input"
      />
      {agent ? null : (
        <div className="adv-toggle-group nodrag nopan" role="group" aria-label="Caption position">
          {(['top', 'bottom'] as const).map((position) => (
            <button
              key={position}
              type="button"
              className={cn('adv-toggle', (data.overlayPosition ?? 'bottom') === position && 'is-active')}
              aria-pressed={(data.overlayPosition ?? 'bottom') === position}
              disabled={actions.locked}
              onClick={() => actions.updateNodeData(id, { overlayPosition: position })}
            >
              Caption {position}
            </button>
          ))}
        </div>
      )}

      <RunFooter id={id} status={data.status} actions={actions} blockedReason={blockedReason} label="Transform">
        {active?.imageUrl ? (
          <>
            <button type="button" className="adv-icon-button" title="Open full size" aria-label="Open full size" onClick={() => actions.openPreview(active.imageUrl!)}>
              <Maximize aria-hidden size={14} />
            </button>
            <a className="adv-icon-button" href={active.imageUrl} download title="Download image" aria-label="Download image">
              <Download aria-hidden size={14} />
            </a>
          </>
        ) : null}
      </RunFooter>
    </div>
  );
});

'use client';

import * as React from 'react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  ImageOff,
  Loader2,
  Maximize,
  Send,
  Sparkles,
} from 'lucide-react';
import type { AdvEngineCapability, AdvImageGeneratorNodeData } from '@/lib/advanced-studio/types';
import type { AdvNodeBodyProps } from '../node-context';
import { PillMenu, type PillOption } from '../pill-menu';
import { cn } from '@/lib/utils';

/**
 * Image generator.
 *
 * Every control is generated from the selected model's real capabilities —
 * aspect ratios, resolution tiers and reference-image limits all come from
 * /api/advanced-studio-projects/capabilities, never from a hardcoded list.
 * Switching models keeps the current selection when the new model supports it
 * and falls back to that model's default when it does not.
 */
export const ImageGeneratorNodeBody = React.memo(function ImageGeneratorNodeBody({
  id,
  data,
  actions,
}: AdvNodeBodyProps<AdvImageGeneratorNodeData>) {
  const candidateCapability = actions.capabilityFor(data.engine);
  const capability = candidateCapability?.image.supported ? candidateCapability : undefined;
  // A result can point at a file that is unreadable or has been removed from
  // storage. Without this the node would render the browser's broken-image
  // glyph and its alt text, which reads like a rendering bug.
  const [brokenUrl, setBrokenUrl] = React.useState<string | null>(null);
  const running = actions.runningNodeIds.has(id) || data.status === 'running' || data.status === 'queued';
  const results = data.results ?? [];
  const activeIndex = Math.min(Math.max(data.activeResultIndex ?? 0, 0), Math.max(results.length - 1, 0));
  const active = results[activeIndex];
  const resolved = actions.resolveInputsFor(id);

  const modelOptions = React.useMemo<PillOption<string>[]>(
    () => actions.capabilities.filter((engine) => engine.image.supported).flatMap((engine) =>
      (engine.models.length ? engine.models : [{ id: engine.key, label: engine.label }]).map((model) => ({
        value: `${engine.key}::${model.id}`,
        label: model.label,
        // A ready provider shows what the model is; an unready one shows why
        // it cannot be picked.
        note: engine.ready ? model.note : engine.reason ?? 'Not configured',
        // A provider that is a single local tool (the Codex CLI) would
        // otherwise show its name twice — as the group and as the only model.
        group: model.label === engine.label ? undefined : engine.label,
        disabled: !engine.ready,
      })),
    ),
    [actions.capabilities],
  );

  const selectedModelValue = data.engine ? `${data.engine}::${data.model ?? data.engine}` : undefined;

  const onModelChange = (value: string) => {
    const [engineKey, modelId] = value.split('::');
    const next = actions.capabilities.find((engine) => engine.key === engineKey);
    if (!next || !next.image.supported) return;
    actions.updateNodeData(id, {
      engine: engineKey,
      model: modelId,
      // Keep the user's choices where the new model still supports them.
      aspectRatio: coerce(data.aspectRatio, next.image.aspectRatios, next.image.defaultAspectRatio),
      resolution: coerce(
        data.resolution,
        next.image.resolutions.map((entry) => entry.id),
        next.image.defaultResolution,
      ),
      outputs: Math.min(data.outputs ?? 1, next.image.maxOutputs),
      error: undefined,
    });
  };

  const missingPrompt = !resolved.prompt.trim();
  const blockedReason = blockingReason(data, capability, resolved.imageUrls.length, missingPrompt);

  return (
    <div className="adv-node-body adv-generator-body">
      <div className={cn('adv-preview', running && 'is-running')} data-aspect={data.aspectRatio ?? '1:1'}>
        {running ? (
          <span className="adv-state"><Loader2 aria-hidden className="adv-spin" size={20} /> Generating…</span>
        ) : active?.imageUrl && brokenUrl !== active.imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- served
                from local /storage; see ImageInputNodeBody for the rationale. */}
            <img
              src={active.imageUrl}
              alt={`${data.label} result ${activeIndex + 1}`}
              className="adv-preview-image"
              onError={() => setBrokenUrl(active.imageUrl ?? null)}
            />
            <span className="adv-preview-dimensions">
              {active.width && active.height ? `${active.width} × ${active.height}` : 'Generated'}
            </span>
          </>
        ) : active?.imageUrl ? (
          <span className="adv-state is-error">
            <ImageOff aria-hidden size={20} /> This result could not be loaded
          </span>
        ) : data.status === 'error' ? (
          <span className="adv-state is-error"><AlertCircle aria-hidden size={20} /> {data.error ?? 'Generation failed'}</span>
        ) : (
          <span className="adv-state"><Sparkles aria-hidden size={20} /> Connect a prompt, then generate</span>
        )}
      </div>

      {results.length > 1 ? (
        <div className="adv-carousel nodrag nopan">
          <button
            type="button"
            className="adv-icon-button"
            aria-label="Previous result"
            disabled={activeIndex === 0}
            onClick={() => actions.updateNodeData(id, { activeResultIndex: activeIndex - 1 })}
          >
            <ChevronLeft aria-hidden size={15} />
          </button>
          <span className="adv-carousel-dots" aria-label={`Result ${activeIndex + 1} of ${results.length}`}>
            {results.map((result, index) => (
              <span key={result.generationId ?? index} className={cn('adv-dot', index === activeIndex && 'is-active')} />
            ))}
          </span>
          <button
            type="button"
            className="adv-icon-button"
            aria-label="Next result"
            disabled={activeIndex >= results.length - 1}
            onClick={() => actions.updateNodeData(id, { activeResultIndex: activeIndex + 1 })}
          >
            <ChevronRight aria-hidden size={15} />
          </button>
        </div>
      ) : null}

      <div className="adv-controls nodrag nopan">
        <PillMenu
          label="Model"
          value={selectedModelValue}
          options={modelOptions}
          onChange={onModelChange}
          disabled={actions.locked}
          placeholder="Choose a model"
          className="adv-pill-wide"
        />
        {capability ? (
          <>
            <PillMenu
              label="Aspect ratio"
              value={data.aspectRatio ?? capability.image.defaultAspectRatio}
              options={capability.image.aspectRatios.map((ratio) => ({ value: ratio, label: ratio }))}
              onChange={(ratio) => actions.updateNodeData(id, { aspectRatio: ratio })}
              disabled={actions.locked}
            />
            <PillMenu
              label="Resolution"
              value={data.resolution ?? capability.image.defaultResolution}
              options={capability.image.resolutions.map((entry) => ({ value: entry.id, label: entry.label }))}
              onChange={(resolution) => actions.updateNodeData(id, { resolution })}
              disabled={actions.locked}
            />
            <div className="adv-stepper" role="group" aria-label="Number of images">
              <button
                type="button"
                className="adv-icon-button"
                aria-label="Fewer images"
                disabled={actions.locked || (data.outputs ?? 1) <= 1}
                onClick={() => actions.updateNodeData(id, { outputs: Math.max((data.outputs ?? 1) - 1, 1) })}
              >
                −
              </button>
              <span className="adv-stepper-value">{data.outputs ?? 1}/{capability.image.maxOutputs}</span>
              <button
                type="button"
                className="adv-icon-button"
                aria-label="More images"
                disabled={actions.locked || (data.outputs ?? 1) >= capability.image.maxOutputs}
                onClick={() => actions.updateNodeData(id, { outputs: Math.min((data.outputs ?? 1) + 1, capability.image.maxOutputs) })}
              >
                +
              </button>
            </div>
          </>
        ) : null}
      </div>

      {blockedReason ? <p className="adv-inline-error" role="status">{blockedReason}</p> : null}

      <div className="adv-generator-footer nodrag nopan">
        <span className="adv-icon-row">
          {active?.imageUrl ? (
            <>
              <button
                type="button"
                className="adv-icon-button"
                title="Open full size"
                aria-label="Open full size"
                onClick={() => actions.openPreview(active.imageUrl!)}
              >
                <Maximize aria-hidden size={14} />
              </button>
              <a
                className="adv-icon-button"
                href={active.imageUrl}
                download
                title="Download image"
                aria-label="Download image"
              >
                <Download aria-hidden size={14} />
              </a>
            </>
          ) : null}
        </span>
        <button
          type="button"
          className="adv-generate-button"
          // The in-flight id set is the client-side double-submit guard; the
          // server rejects a concurrent run for the same node as well.
          disabled={actions.locked || running || Boolean(blockedReason)}
          onClick={() => actions.generate(id)}
        >
          {running ? <Loader2 aria-hidden className="adv-spin" size={14} /> : <Send aria-hidden size={14} />}
          {data.status === 'error' ? 'Retry' : 'Generate'}
        </button>
      </div>
    </div>
  );
});

function coerce(current: string | undefined, supported: string[], fallback: string) {
  return current && supported.includes(current) ? current : fallback;
}

function blockingReason(
  data: AdvImageGeneratorNodeData,
  capability: AdvEngineCapability | undefined,
  imageCount: number,
  missingPrompt: boolean,
): string | null {
  if (!data.engine) return 'Choose a model to enable generation.';
  if (!capability) return 'That model is no longer available. Choose another.';
  if (!capability.ready) return capability.reason ?? `${capability.label} is not configured.`;
  if (missingPrompt) return 'Connect a prompt with some text.';
  if (imageCount > capability.image.maxImages) {
    return `${capability.label} accepts at most ${capability.image.maxImages} reference images.`;
  }
  if (imageCount === 0 && !capability.image.textToImage) {
    return `${capability.label} edits images — connect at least one image input.`;
  }
  return null;
}

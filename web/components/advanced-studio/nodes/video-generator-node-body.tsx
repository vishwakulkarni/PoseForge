'use client';

import * as React from 'react';
import { AlertCircle, Clapperboard, Download, Loader2, Maximize, Send } from 'lucide-react';
import type { AdvVideoGeneratorNodeData } from '@/lib/advanced-studio/types';
import { coerceVideoSettings, selectedVideoModel } from '@/lib/advanced-studio/registry/video-generator-node';
import type { AdvNodeBodyProps } from '../node-context';
import { PillMenu, type PillOption } from '../pill-menu';
import { cn } from '@/lib/utils';

export const VideoGeneratorNodeBody = React.memo(function VideoGeneratorNodeBody({
  id,
  data,
  actions,
}: AdvNodeBodyProps<AdvVideoGeneratorNodeData>) {
  const capability = actions.capabilityFor(data.engine);
  const model = selectedVideoModel(data, capability);
  const resolved = actions.resolveInputsFor(id);
  const running = actions.runningNodeIds.has(id) || data.status === 'running' || data.status === 'queued';
  const results = data.results ?? [];
  const activeIndex = Math.min(Math.max(data.activeResultIndex ?? 0, 0), Math.max(results.length - 1, 0));
  const active = results[activeIndex];

  const modelOptions = React.useMemo<PillOption<string>[]>(
    () => actions.capabilities
      .filter((engine) => engine.video.supported)
      .flatMap((engine) => engine.models.map((option) => ({
        value: `${engine.key}::${option.id}`,
        label: option.label,
        group: engine.label,
        note: engine.ready ? option.note : engine.reason ?? 'Not configured',
        disabled: !engine.ready,
      }))),
    [actions.capabilities],
  );

  const onModelChange = (value: string) => {
    const separator = value.indexOf('::');
    const engineKey = value.slice(0, separator);
    const modelId = value.slice(separator + 2);
    const nextEngine = actions.capabilities.find((engine) => engine.key === engineKey);
    const nextModel = nextEngine?.video.supported
      ? nextEngine.video.models.find((entry) => entry.id === modelId)
      : undefined;
    if (!nextModel) return;
    actions.updateNodeData(id, {
      engine: engineKey,
      model: modelId,
      ...coerceVideoSettings(data, nextModel),
      error: undefined,
    });
  };

  const blockedReason = (() => {
    if (!data.engine || !data.model) return 'Choose a video model to enable generation.';
    if (!capability || !capability.video.supported || !model) return 'That video model is no longer available.';
    if (!capability.ready) return capability.reason ?? 'Add a fal.ai key in Settings to generate video.';
    if (!resolved.prompt.trim()) return 'Connect a prompt with some text.';
    if (model.inputs.includes('startFrame') && resolved.startFrameUrls.length === 0) return 'Connect a start frame for this model.';
    return null;
  })();

  return (
    <div className="adv-node-body adv-generator-body">
      <div
        className={cn('adv-preview', running && 'is-running')}
        data-aspect={data.aspectRatio ?? '16:9'}
        onDoubleClick={(event) => {
          if (!active?.videoUrl || running) return;
          event.preventDefault();
          event.stopPropagation();
          actions.openPreview(active.videoUrl, 'video');
        }}
      >
        {running ? (
          <span className="adv-state"><Loader2 aria-hidden className="adv-spin" size={20} /> Generating video…</span>
        ) : active?.videoUrl ? (
          <video className="adv-preview-image nodrag nopan" src={active.videoUrl} controls playsInline preload="metadata">
            Your browser does not support video playback.
          </video>
        ) : data.status === 'error' ? (
          <span className="adv-state is-error"><AlertCircle aria-hidden size={20} /> {data.error ?? 'Generation failed'}</span>
        ) : (
          <span className="adv-state"><Clapperboard aria-hidden size={20} /> Connect inputs, then generate</span>
        )}
      </div>

      <div className="adv-controls nodrag nopan">
        <PillMenu
          label="Model"
          value={data.engine && data.model ? `${data.engine}::${data.model}` : undefined}
          options={modelOptions}
          onChange={onModelChange}
          disabled={actions.locked}
          placeholder="Choose a video model"
          className="adv-pill-wide"
        />
        {model ? (
          <>
            <PillMenu
              label="Duration"
              value={String(data.duration ?? model.defaultDuration)}
              options={model.durations.map((seconds) => ({ value: String(seconds), label: `${seconds}s` }))}
              onChange={(duration) => actions.updateNodeData(id, { duration: Number(duration) })}
              disabled={actions.locked}
            />
            <PillMenu
              label="Aspect ratio"
              value={data.aspectRatio ?? model.defaultAspectRatio}
              options={model.aspectRatios.map((ratio) => ({ value: ratio, label: ratio }))}
              onChange={(aspectRatio) => actions.updateNodeData(id, { aspectRatio })}
              disabled={actions.locked}
            />
            <PillMenu
              label="Resolution"
              value={data.resolution ?? model.defaultResolution}
              options={model.resolutions.map((resolution) => ({ value: resolution, label: resolution }))}
              onChange={(resolution) => actions.updateNodeData(id, { resolution })}
              disabled={actions.locked}
            />
            {model.sound ? (
              <label className="adv-node-note nodrag">
                <input
                  type="checkbox"
                  checked={data.sound === true}
                  onChange={(event) => actions.updateNodeData(id, { sound: event.target.checked })}
                  disabled={actions.locked}
                />{' '}Generate sound
              </label>
            ) : null}
          </>
        ) : null}
      </div>

      {blockedReason ? <p className="adv-inline-error" role="status">{blockedReason}</p> : null}
      <div className="adv-generator-footer nodrag nopan">
        <span className="adv-icon-row">
          {active?.videoUrl ? (
            <>
              <button
                type="button"
                className="adv-icon-button"
                title="Open full size"
                aria-label="Open full size"
                onClick={() => actions.openPreview(active.videoUrl!, 'video')}
              >
                <Maximize aria-hidden size={14} />
              </button>
              <a className="adv-icon-button" href={active.videoUrl} download title="Download video" aria-label="Download video">
                <Download aria-hidden size={14} />
              </a>
            </>
          ) : null}
        </span>
        <button
          type="button"
          className="adv-generate-button"
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

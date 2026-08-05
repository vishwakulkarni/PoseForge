'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { Generation } from '@/lib/api/types';

export type CanvasState = 'idle' | 'ready' | 'running' | 'done';

export interface CanvasSubject {
  id: string;
  label: string;
  imageUrl: string | null;
}

export interface CanvasPose {
  label: string;
  imageUrl: string;
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 8;
const FIT_PADDING = 54;

interface Camera {
  x: number;
  y: number;
  scale: number;
}

export interface CanvasPanelProps {
  aspectRatio: string;
  status: CanvasState;
  subjects: CanvasSubject[];
  pose: CanvasPose | null;
  generations: Generation[];
  plannedOutputs: number;
  activeIndex: number;
  onSelectVariant: (index: number) => void;
  onRegenerate: () => void;
  tip: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function InputCard({
  kind,
  label,
  imageUrl,
  position,
}: {
  kind: 'subject' | 'pose';
  label: string;
  imageUrl: string | null;
  position?: number;
}) {
  const populated = Boolean(imageUrl);
  const kicker = kind === 'pose' ? 'Pose reference' : `Person ${position}`;

  return (
    <article className={cn('workflow-card', 'workflow-input-card', !populated && 'is-empty')}>
      <div className="workflow-card-media">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob, local storage, and provider URLs
          <img src={imageUrl} alt="" draggable={false} decoding="sync" />
        ) : (
          <div className="workflow-card-placeholder" aria-hidden>
            {kind === 'pose' ? (
              <svg width="25" height="25" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M12 9v5m0-3-4 3m4-3 4 3m-4 0-3 6m3-6 3 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="25" height="25" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5.5 20c.7-4 2.9-6 6.5-6s5.8 2 6.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
          </div>
        )}
      </div>
      <div className="workflow-card-copy">
        <span>{kicker}</span>
        <strong>{label}</strong>
      </div>
    </article>
  );
}

function OutputCard({
  generation,
  index,
  aspectRatio,
  canvasStatus,
  selected,
  onSelect,
  onRegenerate,
}: {
  generation?: Generation;
  index: number;
  aspectRatio: string;
  canvasStatus: CanvasState;
  selected: boolean;
  onSelect: () => void;
  onRegenerate: () => void;
}) {
  const generationStatus = generation?.status;
  const running = generationStatus === 'pending' || generationStatus === 'running' || (!generation && canvasStatus === 'running');
  const failed = generationStatus === 'failed';
  const outputUrl = generation?.outputUrl;

  return (
    <article
      className={cn(
        'workflow-card',
        'workflow-output-card',
        selected && 'is-selected',
        running && 'is-running',
        failed && 'is-failed',
        !generation && !running && 'is-empty',
      )}
      data-aspect={aspectRatio}
    >
      <button
        type="button"
        className="workflow-output-select"
        aria-label={`Select result ${index + 1}`}
        aria-pressed={selected}
        onClick={onSelect}
      >
        {outputUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local storage mount
          <img src={outputUrl} alt={`Generated result ${index + 1}`} draggable={false} decoding="sync" />
        ) : running ? (
          <span className="workflow-result-state" aria-live="polite">
            <i className="workflow-spinner" aria-hidden />
            <strong>{generationStatus === 'pending' ? 'Queued' : 'Forging result'}</strong>
            <small>Preserving identity and pose</small>
          </span>
        ) : failed ? (
          <span className="workflow-result-state" aria-live="polite">
            <i className="workflow-failure-mark" aria-hidden>!</i>
            <strong>Generation failed</strong>
            <small>{generation?.errorMessage ?? 'Review the engine and try again.'}</small>
          </span>
        ) : (
          <span className="workflow-result-state">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
            </svg>
            <strong>Result will appear here</strong>
            <small>Complete the inputs, then generate</small>
          </span>
        )}
      </button>

      <div className="workflow-card-copy">
        <span>Output {index + 1}</span>
        <strong>{outputUrl ? 'Generated result' : failed ? 'Needs attention' : running ? 'In progress' : 'Waiting'}</strong>
      </div>

      {selected && outputUrl ? (
        <div className="workflow-result-actions" data-interactive>
          <a href={outputUrl} download>Download</a>
          <Link href="/history">History</Link>
          <button type="button" onClick={onRegenerate}>Regenerate</button>
        </div>
      ) : null}
    </article>
  );
}

export function CanvasPanel({
  aspectRatio,
  status,
  subjects,
  pose,
  generations,
  plannedOutputs,
  activeIndex,
  onSelectVariant,
  onRegenerate,
  tip,
}: CanvasPanelProps) {
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const worldRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{ pointerId: number; clientX: number; clientY: number } | null>(null);
  const [camera, setCamera] = React.useState<Camera>({ x: 0, y: 0, scale: 1 });
  const [panning, setPanning] = React.useState(false);

  const fitWorkflow = React.useCallback(() => {
    const viewport = viewportRef.current;
    const world = worldRef.current;
    if (!viewport || !world) return;
    const width = world.offsetWidth;
    const height = world.offsetHeight;
    if (!width || !height) return;
    const scale = clamp(
      Math.min(
        (viewport.clientWidth - FIT_PADDING * 2) / width,
        (viewport.clientHeight - FIT_PADDING * 2) / height,
        1,
      ),
      MIN_ZOOM,
      MAX_ZOOM,
    );
    setCamera({
      scale,
      x: (viewport.clientWidth - width * scale) / 2,
      y: (viewport.clientHeight - height * scale) / 2,
    });
  }, []);

  React.useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(fitWorkflow);
    return () => window.cancelAnimationFrame(frame);
  }, [fitWorkflow, subjects.length, Boolean(pose), generations.length, plannedOutputs]);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => fitWorkflow());
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fitWorkflow]);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    // React/browser wheel listeners may be passive. A native non-passive
    // listener keeps trackpad pinch and Ctrl+wheel scoped to the workflow
    // instead of allowing the browser to zoom the entire page.
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
      setCamera((current) => {
        const factor = Math.exp(-event.deltaY * 0.006);
        const scale = clamp(current.scale * factor, MIN_ZOOM, MAX_ZOOM);
        const worldX = (screenX - current.x) / current.scale;
        const worldY = (screenY - current.y) / current.scale;
        return { scale, x: screenX - worldX * scale, y: screenY - worldY * scale };
      });
    };
    const preventBrowserGesture = (event: Event) => event.preventDefault();

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    viewport.addEventListener('gesturestart', preventBrowserGesture, { passive: false });
    viewport.addEventListener('gesturechange', preventBrowserGesture, { passive: false });
    return () => {
      viewport.removeEventListener('wheel', handleWheel);
      viewport.removeEventListener('gesturestart', preventBrowserGesture);
      viewport.removeEventListener('gesturechange', preventBrowserGesture);
    };
  }, []);

  const outputCount = Math.max(generations.length, plannedOutputs, 1);

  return (
    <section className="canvas-panel" aria-label="Composition canvas">
      <div
        ref={viewportRef}
        className={cn('canvas-viewport', panning && 'is-panning')}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const target = event.target as HTMLElement;
          if (target.closest('button, a, input, select, textarea, [data-interactive]')) return;
          dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
          setPanning(true);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const dx = event.clientX - drag.clientX;
          const dy = event.clientY - drag.clientY;
          drag.clientX = event.clientX;
          drag.clientY = event.clientY;
          setCamera((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) return;
          dragRef.current = null;
          setPanning(false);
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          dragRef.current = null;
          setPanning(false);
        }}
      >
        <div
          ref={worldRef}
          className="workflow-world"
          style={{ transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})` }}
        >
          <div className="workflow-inputs" aria-label="Generation inputs">
            {subjects.length ? subjects.map((subject, index) => (
              <React.Fragment key={subject.id}>
                {index > 0 ? <span className="workflow-operator" aria-label="plus">+</span> : null}
                <InputCard kind="subject" label={subject.label} imageUrl={subject.imageUrl} position={index + 1} />
              </React.Fragment>
            )) : (
              <InputCard kind="subject" label="Add a character" imageUrl={null} position={1} />
            )}

            <span className="workflow-operator" aria-label="plus">+</span>
            <InputCard kind="pose" label={pose?.label ?? 'Add a pose'} imageUrl={pose?.imageUrl ?? null} />
          </div>

          <div className="workflow-equation-bridge" aria-label="equals">
            <span className="workflow-connector" aria-hidden />
            <span className="workflow-operator workflow-equals">=</span>
            <span className="workflow-connector" aria-hidden />
          </div>

          <div
            className={cn('workflow-outputs', outputCount > 3 && 'is-grid')}
            role="group"
            aria-label="Generated variations"
          >
            {Array.from({ length: outputCount }, (_, index) => (
              <OutputCard
                key={generations[index]?.id ?? `placeholder-${index}`}
                generation={generations[index]}
                index={index}
                aspectRatio={aspectRatio}
                canvasStatus={status}
                selected={index === activeIndex}
                onSelect={() => onSelectVariant(index)}
                onRegenerate={onRegenerate}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="canvas-footer">
        <div className="canvas-tip">
          <kbd>Tip</kbd>
          <span>{tip}</span>
        </div>
        <span className="canvas-navigation-hint">Drag to pan · Scroll to zoom</span>
        {status === 'running' ? <div className="canvas-progress" aria-hidden><span /></div> : null}
      </div>
    </section>
  );
}

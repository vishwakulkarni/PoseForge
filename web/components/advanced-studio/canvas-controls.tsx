'use client';

import * as React from 'react';
import { Panel, useReactFlow } from '@xyflow/react';
import {
  Hand,
  Keyboard,
  LayoutGrid,
  LockKeyhole,
  Maximize2,
  MousePointer2,
  Plus,
  Redo2,
  Undo2,
  UnlockKeyhole,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type AdvCanvasTool = 'select' | 'hand';

/**
 * On-canvas control cluster.
 *
 * Mirrors the guided Studio's cluster — same position, same pill, same 34px
 * targets — so the two canvases feel like one product. Every button here has a
 * keyboard equivalent, and each title spells it out so the shortcuts are
 * discoverable without opening the reference.
 */
export function AdvCanvasControls({
  tool,
  onToolChange,
  zoom,
  onViewportChange,
  locked,
  onToggleLock,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onArrange,
  canArrange,
  onAddNode,
  onShowShortcuts,
}: {
  tool: AdvCanvasTool;
  onToolChange: (tool: AdvCanvasTool) => void;
  zoom: number;
  onViewportChange: () => void;
  locked: boolean;
  onToggleLock: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onArrange: () => void;
  canArrange: boolean;
  onAddNode: () => void;
  onShowShortcuts: () => void;
}) {
  const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow();

  // React Flow's viewport commands are promises; the zoom readout only updates
  // once the transition they start has settled.
  const runViewportCommand = async (command: Promise<boolean>) => {
    await command;
    onViewportChange();
  };

  return (
    <Panel position="bottom-left" className="adv-controls-cluster nodrag nopan" aria-label="Canvas controls">
      <button
        type="button"
        aria-label="Select tool"
        title="Select — drag to box-select (V)"
        aria-pressed={tool === 'select'}
        className={cn(tool === 'select' && 'is-active')}
        onClick={() => onToolChange('select')}
      >
        <MousePointer2 aria-hidden size={15} />
      </button>
      <button
        type="button"
        aria-label="Hand tool"
        title="Hand — drag to pan (H)"
        aria-pressed={tool === 'hand'}
        className={cn(tool === 'hand' && 'is-active')}
        onClick={() => onToolChange('hand')}
      >
        <Hand aria-hidden size={15} />
      </button>

      <span className="adv-controls-divider" aria-hidden />

      <button type="button" aria-label="Zoom in" title="Zoom in (⌘+)" onClick={() => void runViewportCommand(zoomIn({ duration: 150 }))}>
        <ZoomIn aria-hidden size={15} />
      </button>
      <button
        type="button"
        className="adv-controls-zoom"
        aria-label={`Zoom is ${Math.round(zoom * 100)} percent. Reset to 100 percent`}
        title="Reset to 100% (⌘0)"
        onClick={() => void runViewportCommand(zoomTo(1, { duration: 150 }))}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" aria-label="Zoom out" title="Zoom out (⌘-)" onClick={() => void runViewportCommand(zoomOut({ duration: 150 }))}>
        <ZoomOut aria-hidden size={15} />
      </button>
      <button type="button" aria-label="Fit to view" title="Fit all nodes (⇧1)" onClick={() => void runViewportCommand(fitView({ padding: 0.2, duration: 200 }))}>
        <Maximize2 aria-hidden size={15} />
      </button>

      <span className="adv-controls-divider" aria-hidden />

      <button
        type="button"
        aria-label={locked ? 'Unlock canvas' : 'Lock canvas'}
        aria-pressed={locked}
        title={locked ? 'Unlock canvas (L)' : 'Lock canvas (L)'}
        className={cn(locked && 'is-active')}
        onClick={onToggleLock}
      >
        {locked ? <LockKeyhole aria-hidden size={15} /> : <UnlockKeyhole aria-hidden size={15} />}
      </button>
      <button type="button" aria-label="Undo" title="Undo (⌘Z)" disabled={!canUndo} onClick={onUndo}>
        <Undo2 aria-hidden size={15} />
      </button>
      <button type="button" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!canRedo} onClick={onRedo}>
        <Redo2 aria-hidden size={15} />
      </button>

      <span className="adv-controls-divider" aria-hidden />

      <button
        type="button"
        aria-label="Arrange nodes in a grid"
        title="Arrange selected nodes, or all of them (⇧A)"
        disabled={locked || !canArrange}
        onClick={onArrange}
      >
        <LayoutGrid aria-hidden size={15} />
      </button>
      <button type="button" aria-label="Add node" title="Add node (A)" disabled={locked} onClick={onAddNode}>
        <Plus aria-hidden size={15} />
      </button>

      <span className="adv-controls-divider" aria-hidden />

      <button type="button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={onShowShortcuts}>
        <Keyboard aria-hidden size={15} />
      </button>
    </Panel>
  );
}

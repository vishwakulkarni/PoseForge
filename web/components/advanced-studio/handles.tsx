'use client';

import * as React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Image as ImageIcon, Play, AudioWaveform } from 'lucide-react';
import { ADV_DATA_TYPES, dataTypeColor } from '@/lib/advanced-studio/data-types';
import type { AdvDataType, AdvHandleDef } from '@/lib/advanced-studio/types';
import { cn } from '@/lib/utils';

function TypeGlyph({ dataType }: { dataType: AdvDataType }) {
  const glyph = ADV_DATA_TYPES[dataType].glyph;
  if (glyph === 'T') return <span aria-hidden className="adv-handle-glyph-text">T</span>;
  if (glyph === 'image') return <ImageIcon aria-hidden size={11} strokeWidth={2} />;
  if (glyph === 'video') return <Play aria-hidden size={11} strokeWidth={2} />;
  return <AudioWaveform aria-hidden size={11} strokeWidth={2} />;
}

/**
 * A typed connection point.
 *
 * Colour and glyph come from the data type, so the same type always looks the
 * same on every node. `data-adv-type` is what the CSS uses to dim handles that
 * cannot accept the connection currently being dragged.
 */
export const AdvHandle = React.memo(function AdvHandle({
  handle,
  direction,
  index,
  total,
  connected,
}: {
  handle: AdvHandleDef;
  direction: 'input' | 'output';
  index: number;
  total: number;
  connected?: boolean;
}) {
  // Center-anchored stacking: handles keep a fixed slot so an edge does not
  // jump when a sibling handle appears or disappears with a model change.
  const offset = (index - (total - 1) / 2) * 34;
  return (
    <Handle
      type={direction === 'input' ? 'target' : 'source'}
      id={handle.id}
      position={direction === 'input' ? Position.Left : Position.Right}
      className={cn('adv-handle', connected && 'is-connected')}
      data-adv-type={handle.dataType}
      data-adv-direction={direction}
      style={{ top: `calc(50% + ${offset}px)`, ['--adv-handle-color' as string]: dataTypeColor(handle.dataType) }}
      title={`${handle.label} · ${ADV_DATA_TYPES[handle.dataType].label}`}
      aria-label={`${direction === 'input' ? 'Input' : 'Output'}: ${handle.label} (${ADV_DATA_TYPES[handle.dataType].label})`}
    >
      <TypeGlyph dataType={handle.dataType} />
    </Handle>
  );
});

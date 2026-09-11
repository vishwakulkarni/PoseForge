import { Frame } from 'lucide-react';
import type { AdvNodeDefinition } from '../types';

/**
 * Group / scene frame.
 *
 * Membership is a list of node ids rather than React Flow parenting: children
 * keep absolute coordinates, so edges, handles, menus and tooltips are never
 * clipped by the frame and a connection can cross a group boundary freely.
 * Dragging the frame applies the same delta to every member.
 */
export const groupNodeDefinition: AdvNodeDefinition<'group'> = {
  type: 'group',
  label: 'Group / Scene',
  description: 'Frame related nodes together, and order them as scenes.',
  category: 'organization',
  icon: Frame,
  addable: true,
  geometry: { width: 900, height: 620, minWidth: 260, minHeight: 200, maxWidth: 6000, maxHeight: 6000 },
  defaultLabel: (index) => `Group ${index}`,
  defaultData: () => ({ memberIds: [] }),
  handles: () => ({ inputs: [], outputs: [] }),
};

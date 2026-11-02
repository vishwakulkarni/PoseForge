import { ListOrdered } from 'lucide-react';
import type { AdvNodeDefinition } from '../types';

/** Upper bound on one list's fan-out, matching lib/advancedNodes/list.js. */
export const LIST_MAX_ITEMS = 25;

/** Fans a workflow out: one item per line, and every node downstream runs
 * once per item. Connected text wins over the node's own lines. */
export const listNodeDefinition: AdvNodeDefinition<'list'> = {
  type: 'list',
  label: 'List',
  description: 'Run everything after it once per line.',
  category: 'flow',
  icon: ListOrdered,
  addable: true,
  geometry: { width: 360, height: 320, minWidth: 260, minHeight: 200, maxWidth: 900, maxHeight: 1000 },
  defaultLabel: (index) => `List #${index}`,
  defaultData: () => ({ text: '' }),
  handles: () => ({
    inputs: [{ id: 'text', dataType: 'text', label: 'Text', maxConnections: 1 }],
    outputs: [{ id: 'text', dataType: 'text', label: 'Each item' }],
  }),
};

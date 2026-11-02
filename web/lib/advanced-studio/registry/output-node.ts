import { PackageCheck } from 'lucide-react';
import type { AdvNodeDefinition } from '../types';

/** Marks what a workflow delivers. A run's deliverables are its output
 * nodes' results, named after each node's label. */
export const outputNodeDefinition: AdvNodeDefinition<'output'> = {
  type: 'output',
  label: 'Output',
  description: 'Collect the finished images, clips and captions.',
  category: 'flow',
  icon: PackageCheck,
  addable: true,
  generative: true,
  geometry: { width: 360, height: 420, minWidth: 260, minHeight: 260, maxWidth: 1000, maxHeight: 1400 },
  defaultLabel: (index) => `Output #${index}`,
  defaultData: () => ({ activeResultIndex: 0, status: 'idle' }),
  handles: () => ({
    inputs: [
      { id: 'image', dataType: 'image', label: 'Images' },
      { id: 'video', dataType: 'video', label: 'Clips' },
      { id: 'text', dataType: 'text', label: 'Captions' },
    ],
    outputs: [],
  }),
  validate: (_data, resolved) => (
    resolved.imageUrls.length || resolved.videoUrls.length || resolved.texts.length ? null : 'Connect an image, clip or caption.'
  ),
};

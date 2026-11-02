import { Crop } from 'lucide-react';
import type { AdvNodeDefinition, AdvTransformPreset } from '../types';

export const TRANSFORM_PRESETS: { value: AdvTransformPreset; label: string }[] = [
  { value: '9:16', label: 'Story / Reel 9:16' },
  { value: '4:5', label: 'Portrait post 4:5' },
  { value: '1:1', label: 'Square post 1:1' },
  { value: '16:9', label: 'Landscape 16:9' },
  { value: '3:4', label: 'Pin 3:4' },
  { value: 'original', label: 'Original size' },
];

/** Crops or pads an image to a post format and can write a caption band on
 * it, locally and for free — or has an engine that edits images (Codex CLI)
 * do whatever its instruction says, then applies the format. */
export const imageTransformNodeDefinition: AdvNodeDefinition<'imageTransform'> = {
  type: 'imageTransform',
  label: 'Image Transform',
  description: 'Resize for a platform, add a caption, or have Codex edit it.',
  category: 'flow',
  icon: Crop,
  addable: true,
  generative: true,
  geometry: { width: 380, height: 560, minWidth: 280, minHeight: 400, maxWidth: 1000, maxHeight: 1400 },
  defaultLabel: (index) => `Transform #${index}`,
  defaultData: () => ({ preset: '9:16', fit: 'cover', activeResultIndex: 0, status: 'idle' }),
  handles: () => ({
    inputs: [
      { id: 'image', dataType: 'image', label: 'Image', maxConnections: 1, required: true },
      { id: 'text', dataType: 'text', label: 'Caption', maxConnections: 1 },
    ],
    outputs: [{ id: 'image', dataType: 'image', label: 'Image' }],
  }),
  validate: (data, resolved) => {
    if (!resolved.imageUrls.length) return 'Connect an image to transform.';
    if (data.engine && !data.instruction?.trim()) return 'Write what to do to the image.';
    return null;
  },
};

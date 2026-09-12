import { Sparkles } from 'lucide-react';
import type { AdvHandleDef, AdvNodeDefinition } from '../types';

/**
 * Image generator. The image input's multiplicity comes from the selected
 * model's real limit, and the handle disappears entirely for a model that
 * cannot take references — a handle that has no effect is never shown.
 */
export const imageGeneratorNodeDefinition: AdvNodeDefinition<'imageGenerator'> = {
  type: 'imageGenerator',
  label: 'Image Generator',
  description: 'Generate images from a prompt and any connected references.',
  category: 'generation',
  icon: Sparkles,
  addable: true,
  generative: true,
  geometry: { width: 420, height: 620, minWidth: 300, minHeight: 420, maxWidth: 1100, maxHeight: 1400 },
  defaultLabel: (index) => `Image Generator #${index}`,
  defaultData: () => ({ outputs: 1, activeResultIndex: 0, status: 'idle' }),
  handles: (data, capability) => {
    const maxImages = capability?.image.supported ? capability.image.maxImages : 1;
    const inputs: AdvHandleDef[] = [
      { id: 'prompt', dataType: 'text', label: 'Prompt', maxConnections: 1, required: true },
    ];
    if (maxImages > 0) {
      inputs.push({
        id: 'image',
        dataType: 'image',
        label: 'Reference images',
        maxConnections: maxImages,
        allowDuplicateSource: false,
      });
    }
    return {
      inputs,
      outputs: [{ id: 'image', dataType: 'image', label: 'Generated image' }],
    };
  },
  validate: (data, resolved) => {
    if (!data.engine) return 'Choose a model for this node before generating.';
    if (!resolved.prompt.trim()) return 'Connect a prompt with some text before generating.';
    return null;
  },
};

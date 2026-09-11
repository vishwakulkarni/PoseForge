import { Clapperboard } from 'lucide-react';
import type { AdvHandleDef, AdvNodeDefinition } from '../types';

/**
 * Video generator.
 *
 * The node exists so video projects and documents round-trip, but no provider
 * implements video generation yet — `addable: false` keeps it out of the
 * add-node menu until the video engine lands, and the body renders an explicit
 * "not configured" state rather than a control panel that cannot run.
 * Its handles are already model-driven so switching a model will add and
 * remove inputs without touching the canvas.
 */
export const videoGeneratorNodeDefinition: AdvNodeDefinition<'videoGenerator'> = {
  type: 'videoGenerator',
  label: 'Video Generator',
  description: 'Generate video from a prompt, frames, or reference media.',
  category: 'generation',
  icon: Clapperboard,
  addable: false,
  generative: true,
  geometry: { width: 420, height: 680, minWidth: 300, minHeight: 440, maxWidth: 1100, maxHeight: 1400 },
  defaultLabel: (index) => `Video Generator #${index}`,
  defaultData: () => ({ outputs: 1, activeResultIndex: 0, duration: 5, status: 'idle' }),
  handles: (data, capability) => {
    const inputs: AdvHandleDef[] = [
      { id: 'prompt', dataType: 'text', label: 'Prompt', maxConnections: 1, required: true },
    ];
    if (capability?.video?.supported) {
      inputs.push(
        { id: 'startFrame', dataType: 'image', label: 'Start frame', maxConnections: 1 },
        { id: 'endFrame', dataType: 'image', label: 'End frame', maxConnections: 1 },
      );
    }
    return {
      inputs,
      outputs: [{ id: 'video', dataType: 'video', label: 'Generated video' }],
    };
  },
  validate: (data) => (data.engine ? null : 'Video generation is not configured yet.'),
};

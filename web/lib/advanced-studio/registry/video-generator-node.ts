import { Clapperboard } from 'lucide-react';
import type {
  AdvEngineCapability,
  AdvHandleDef,
  AdvNodeDefinition,
  AdvVideoGeneratorNodeData,
  AdvVideoModelCapability,
} from '../types';

export function selectedVideoModel(
  data: Pick<AdvVideoGeneratorNodeData, 'model'>,
  capability?: AdvEngineCapability,
): AdvVideoModelCapability | undefined {
  return capability?.video.supported
    ? capability.video.models.find((model) => model.id === data.model)
    : undefined;
}

export function coerceVideoSettings(
  data: AdvVideoGeneratorNodeData,
  model: AdvVideoModelCapability,
): Pick<AdvVideoGeneratorNodeData, 'duration' | 'aspectRatio' | 'resolution' | 'sound'> {
  return {
    duration: model.durations.includes(Number(data.duration)) ? Number(data.duration) : model.defaultDuration,
    aspectRatio: data.aspectRatio && model.aspectRatios.includes(data.aspectRatio)
      ? data.aspectRatio
      : model.defaultAspectRatio,
    resolution: data.resolution && model.resolutions.includes(data.resolution)
      ? data.resolution
      : model.defaultResolution,
    sound: model.sound ? data.sound === true : false,
  };
}

export const videoGeneratorNodeDefinition: AdvNodeDefinition<'videoGenerator'> = {
  type: 'videoGenerator',
  label: 'Video Generator',
  description: 'Generate video from a prompt, frames, or reference media.',
  category: 'generation',
  icon: Clapperboard,
  addable: true,
  generative: true,
  geometry: { width: 420, height: 720, minWidth: 300, minHeight: 500, maxWidth: 1100, maxHeight: 1400 },
  defaultLabel: (index) => `Video Generator #${index}`,
  defaultData: () => ({ outputs: 1, activeResultIndex: 0, duration: 5, status: 'idle' }),
  handles: (data, capability) => {
    const model = selectedVideoModel(data, capability);
    const inputs: AdvHandleDef[] = [
      { id: 'prompt', dataType: 'text', label: 'Prompt', maxConnections: 1, required: true },
    ];
    if (model?.inputs.includes('startFrame')) {
      inputs.push({ id: 'startFrame', dataType: 'image', label: 'Start frame', maxConnections: 1, required: true });
    }
    if (model?.inputs.includes('endFrame')) {
      inputs.push({ id: 'endFrame', dataType: 'image', label: 'End frame', maxConnections: 1 });
    }
    if (model?.inputs.includes('reference')) {
      inputs.push({ id: 'reference', dataType: 'image', label: 'Reference image', maxConnections: 1 });
    }
    return { inputs, outputs: [{ id: 'video', dataType: 'video', label: 'Generated video' }] };
  },
  validate: (data, resolved) => {
    if (!data.engine || !data.model) return 'Choose a video model before generating.';
    if (!resolved.prompt.trim()) return 'Connect a prompt with some text before generating.';
    return null;
  },
};

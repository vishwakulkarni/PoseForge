import { AudioLines, Film } from 'lucide-react';
import type { AdvNodeDefinition } from '../types';

/** Video input. One uploaded clip, used as a reference video by models that
 * accept one (Dreamina Seedance reference-to-video). */
export const videoInputNodeDefinition: AdvNodeDefinition<'videoInput'> = {
  type: 'videoInput',
  label: 'Video Input',
  description: 'Upload a video clip to use as a reference.',
  category: 'media',
  icon: Film,
  addable: true,
  geometry: { width: 320, height: 300, minWidth: 220, minHeight: 200, maxWidth: 900, maxHeight: 1000 },
  defaultLabel: (index) => `Video #${index}`,
  defaultData: () => ({}),
  handles: () => ({
    inputs: [],
    outputs: [{ id: 'video', dataType: 'video', label: 'Video' }],
  }),
};

/** Audio input. One uploaded clip, used as a reference audio track. */
export const audioInputNodeDefinition: AdvNodeDefinition<'audioInput'> = {
  type: 'audioInput',
  label: 'Audio Input',
  description: 'Upload an audio clip to use as a reference.',
  category: 'media',
  icon: AudioLines,
  addable: true,
  geometry: { width: 320, height: 200, minWidth: 220, minHeight: 160, maxWidth: 900, maxHeight: 600 },
  defaultLabel: (index) => `Audio #${index}`,
  defaultData: () => ({}),
  handles: () => ({
    inputs: [],
    outputs: [{ id: 'audio', dataType: 'audio', label: 'Audio' }],
  }),
};

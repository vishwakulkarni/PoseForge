import { Wand2 } from 'lucide-react';
import type { AdvNodeDefinition } from '../types';

/** Writes text with a language model: captions, hooks, prompt variations,
 * translations. Connected text is the material it works from. */
export const llmTextNodeDefinition: AdvNodeDefinition<'llmText'> = {
  type: 'llmText',
  label: 'LLM Text',
  description: 'Write captions, hooks or prompt ideas with a language model.',
  category: 'generation',
  icon: Wand2,
  addable: true,
  generative: true,
  geometry: { width: 420, height: 440, minWidth: 300, minHeight: 320, maxWidth: 1000, maxHeight: 1200 },
  defaultLabel: (index) => `LLM Text #${index}`,
  defaultData: () => ({ instruction: '', activeResultIndex: 0, status: 'idle' }),
  handles: () => ({
    inputs: [{ id: 'text', dataType: 'text', label: 'Context' }],
    outputs: [{ id: 'text', dataType: 'text', label: 'Text' }],
  }),
  validate: (data, resolved) => {
    if (!data.engine) return 'Choose a text model before running.';
    if (!data.instruction.trim() && !resolved.texts.length) return 'Write an instruction or connect some text.';
    return null;
  },
};

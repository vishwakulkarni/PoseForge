import { Type } from 'lucide-react';
import type { AdvNodeDefinition } from '../types';

/** Prompt node. Text only — the structured mode is the same field parsed as
 * JSON/YAML, so downstream nodes always receive a string. */
export const textNodeDefinition: AdvNodeDefinition<'text'> = {
  type: 'text',
  label: 'Text / Prompt',
  description: 'Write a prompt in plain text or structured JSON/YAML.',
  category: 'inputs',
  icon: Type,
  addable: true,
  geometry: { width: 460, height: 300, minWidth: 260, minHeight: 180, maxWidth: 1000, maxHeight: 900 },
  defaultLabel: (index) => `Prompt #${index}`,
  defaultData: () => ({ text: '', mode: 'plain' }),
  handles: () => ({
    inputs: [],
    outputs: [{ id: 'text', dataType: 'text', label: 'Text' }],
  }),
};

export const TEXT_NODE_MAX_LENGTH = 20_000;

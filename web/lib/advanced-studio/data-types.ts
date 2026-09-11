/**
 * One source of truth for how each wire format looks and behaves.
 *
 * Handle icon, handle colour, edge stroke and the drag-compatibility rules all
 * read from here, which is what keeps "text is a T in teal" true on every node
 * without any node knowing about any other node.
 */
import type { AdvDataType } from './types';

export interface AdvDataTypeMeta {
  id: AdvDataType;
  label: string;
  /** Short glyph drawn inside the handle; `T` for text, otherwise an icon. */
  glyph: 'T' | 'image' | 'video' | 'audio';
  /** CSS custom property carrying the colour, defined in advanced-studio.css
   * so the palette follows the PoseForge theme in light and dark. */
  colorVar: string;
}

export const ADV_DATA_TYPES: Record<AdvDataType, AdvDataTypeMeta> = {
  text: { id: 'text', label: 'Text', glyph: 'T', colorVar: '--pf-adv-type-text' },
  image: { id: 'image', label: 'Image', glyph: 'image', colorVar: '--pf-adv-type-image' },
  video: { id: 'video', label: 'Video', glyph: 'video', colorVar: '--pf-adv-type-video' },
  audio: { id: 'audio', label: 'Audio', glyph: 'audio', colorVar: '--pf-adv-type-audio' },
};

export function dataTypeColor(dataType: AdvDataType): string {
  return `var(${ADV_DATA_TYPES[dataType].colorVar})`;
}

/** Which output types may feed an input of a given type. Kept as data rather
 * than a chain of conditionals so new formats compose automatically. */
const ACCEPTS: Record<AdvDataType, AdvDataType[]> = {
  text: ['text'],
  image: ['image'],
  video: ['video'],
  audio: ['audio'],
};

export function acceptsDataType(inputType: AdvDataType, outputType: AdvDataType): boolean {
  return ACCEPTS[inputType].includes(outputType);
}

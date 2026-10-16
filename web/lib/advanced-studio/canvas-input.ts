/**
 * Pure helpers for getting content onto the canvas from outside it (paste and
 * drag-and-drop) and for framing a selection in a group.
 */
import type { Rect } from './canvas-focus';

/** Written to the OS clipboard when nodes are copied, so a later paste can tell
 * "paste the nodes I copied" from text copied somewhere else. */
export const INTERNAL_CLIPBOARD_MARK = '​poseforge-advanced-nodes​';

/** Most text blocks one paste may turn into nodes. */
export const MAX_PASTED_BLOCKS = 20;

/** Blank lines separate blocks; each becomes its own prompt node. */
export function splitTextBlocks(text: string): { blocks: string[]; dropped: number } {
  const all = text.split(/\r?\n\s*\r?\n/).map((block) => block.trim()).filter(Boolean);
  return { blocks: all.slice(0, MAX_PASTED_BLOCKS), dropped: Math.max(0, all.length - MAX_PASTED_BLOCKS) };
}

export type DroppedMediaKind = 'image' | 'video' | 'audio';

export function mediaKindOf(file: Pick<File, 'type'>): DroppedMediaKind | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return null;
}

/** A group frame that encloses `rects`, with room above for its title bar. */
export function frameAround(rects: readonly Rect[], padding: number, headerHeight: number): Rect {
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return {
    x: left - padding,
    y: top - padding - headerHeight,
    width: right - left + padding * 2,
    height: bottom - top + padding * 2 + headerHeight,
  };
}

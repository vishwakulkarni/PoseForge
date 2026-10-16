/**
 * Pure helpers for getting content onto the canvas from outside it (paste and
 * drag-and-drop) and for framing a selection in a group.
 */

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

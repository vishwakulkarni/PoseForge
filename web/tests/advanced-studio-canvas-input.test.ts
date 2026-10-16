import { describe, expect, it } from 'vitest';
import { MAX_PASTED_BLOCKS, mediaKindOf, splitTextBlocks } from '@/lib/advanced-studio/canvas-input';

describe('splitTextBlocks', () => {
  it('splits on blank lines and trims', () => {
    expect(splitTextBlocks('  one\nstill one \n\n\ntwo\r\n\r\nthree  ').blocks).toEqual(['one\nstill one', 'two', 'three']);
  });

  it('returns nothing for whitespace', () => {
    expect(splitTextBlocks(' \n\n ')).toEqual({ blocks: [], dropped: 0 });
  });

  it('caps the number of blocks and reports the overflow', () => {
    const text = Array.from({ length: MAX_PASTED_BLOCKS + 3 }, (_, i) => `block ${i}`).join('\n\n');
    const result = splitTextBlocks(text);
    expect(result.blocks).toHaveLength(MAX_PASTED_BLOCKS);
    expect(result.dropped).toBe(3);
  });
});

describe('mediaKindOf', () => {
  it('maps MIME families and rejects the rest', () => {
    expect(mediaKindOf({ type: 'image/png' })).toBe('image');
    expect(mediaKindOf({ type: 'video/mp4' })).toBe('video');
    expect(mediaKindOf({ type: 'audio/mpeg' })).toBe('audio');
    expect(mediaKindOf({ type: 'application/pdf' })).toBeNull();
    expect(mediaKindOf({ type: '' })).toBeNull();
  });
});

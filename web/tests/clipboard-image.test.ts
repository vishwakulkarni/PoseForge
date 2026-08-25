import { describe, expect, it, vi } from 'vitest';
import { readClipboardImageFile } from '@/lib/clipboard-image';

function clipboardWith(items: Array<Pick<ClipboardItem, 'types' | 'getType'>>) {
  return {
    read: vi.fn().mockResolvedValue(items),
  } as unknown as Pick<Clipboard, 'read'>;
}

describe('readClipboardImageFile', () => {
  it('returns the first clipboard image as a named File', async () => {
    const image = new Blob(['pixels'], { type: 'image/png' });
    const getType = vi.fn().mockResolvedValue(image);

    const file = await readClipboardImageFile('Pasted character', clipboardWith([
      { types: ['text/plain', 'image/png'], getType },
    ]));

    expect(getType).toHaveBeenCalledWith('image/png');
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('Pasted character.png');
    expect(file.type).toBe('image/png');
    expect(file.size).toBe(image.size);
  });

  it('rejects clipboard content that has no image', async () => {
    await expect(readClipboardImageFile('Pasted image', clipboardWith([
      { types: ['text/plain'], getType: vi.fn() },
    ]))).rejects.toThrow('Clipboard does not contain an image.');
  });

  it('explains denied clipboard permission', async () => {
    const clipboard = {
      read: vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')),
    } as unknown as Pick<Clipboard, 'read'>;

    await expect(readClipboardImageFile('Pasted image', clipboard)).rejects.toThrow(
      'Clipboard access was denied. Allow clipboard access and try again.',
    );
  });

  it('explains when clipboard image reading is unsupported', async () => {
    await expect(readClipboardImageFile('Pasted image', undefined)).rejects.toThrow(
      'Clipboard image paste is not supported in this browser.',
    );
  });
});

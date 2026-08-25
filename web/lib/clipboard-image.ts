const IMAGE_EXTENSION_BY_TYPE: Record<string, string> = {
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function clipboardErrorMessage(cause: unknown) {
  if (cause instanceof DOMException && cause.name === 'NotAllowedError') {
    return 'Clipboard access was denied. Allow clipboard access and try again.';
  }
  return 'Could not read the clipboard. Copy an image and try again.';
}

/** Reads the first image in the browser clipboard and gives it a useful upload filename. */
export async function readClipboardImageFile(
  namePrefix = 'Pasted image',
  clipboard: Pick<Clipboard, 'read'> | undefined =
    typeof navigator === 'undefined' ? undefined : navigator.clipboard,
): Promise<File> {
  if (!clipboard?.read) {
    throw new Error('Clipboard image paste is not supported in this browser.');
  }

  let items: ClipboardItems;
  try {
    items = await clipboard.read();
  } catch (cause) {
    throw new Error(clipboardErrorMessage(cause), { cause });
  }

  for (const item of items) {
    const imageType = item.types.find((type) => type.startsWith('image/'));
    if (!imageType) continue;

    const blob = await item.getType(imageType);
    const extension = IMAGE_EXTENSION_BY_TYPE[imageType] ?? imageType.split('/')[1] ?? 'png';
    const timestamp = Date.now();
    return new File([blob], `${namePrefix}.${extension}`, {
      type: imageType,
      lastModified: timestamp,
    });
  }

  throw new Error('Clipboard does not contain an image.');
}

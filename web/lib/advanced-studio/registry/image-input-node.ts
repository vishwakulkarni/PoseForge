import { Image as ImageIcon } from 'lucide-react';
import type { AdvNodeDefinition } from '../types';

/** Image input. Holds a reference to an image stored by PoseForge's existing
 * media layer; the node never carries pixel data in the document. */
export const imageInputNodeDefinition: AdvNodeDefinition<'imageInput'> = {
  type: 'imageInput',
  label: 'Image Input',
  description: 'Drop, paste, or pick an image to feed into a generator.',
  category: 'media',
  icon: ImageIcon,
  addable: true,
  geometry: { width: 300, height: 360, minWidth: 200, minHeight: 220, maxWidth: 900, maxHeight: 1200 },
  defaultLabel: (index) => `Image #${index}`,
  defaultData: () => ({ imageFit: 'fill' }),
  handles: () => ({
    inputs: [],
    outputs: [{ id: 'image', dataType: 'image', label: 'Image' }],
  }),
};

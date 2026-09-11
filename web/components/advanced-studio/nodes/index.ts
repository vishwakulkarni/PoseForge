/**
 * Node type -> body component.
 *
 * Kept separate from lib/advanced-studio/registry so the registry (used by
 * validation, serialization and the server-shaped document model) stays free of
 * React imports and can be unit tested without a DOM.
 */
import type * as React from 'react';
import type { AdvNodeType } from '@/lib/advanced-studio/types';
import type { AdvNodeBodyProps } from '../node-context';
import { TextNodeBody } from './text-node-body';
import { ImageInputNodeBody } from './image-input-node-body';
import { ImageGeneratorNodeBody } from './image-generator-node-body';
import { VideoGeneratorNodeBody } from './video-generator-node-body';
import { GroupNodeBody } from './group-node-body';

// Each body narrows its own data type, so this map is heterogeneous by nature.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ADV_NODE_BODIES: Record<AdvNodeType, React.ComponentType<AdvNodeBodyProps<any>>> = {
  text: TextNodeBody,
  imageInput: ImageInputNodeBody,
  imageGenerator: ImageGeneratorNodeBody,
  videoGenerator: VideoGeneratorNodeBody,
  group: GroupNodeBody,
};

export { TextNodeBody, ImageInputNodeBody, ImageGeneratorNodeBody, VideoGeneratorNodeBody, GroupNodeBody };

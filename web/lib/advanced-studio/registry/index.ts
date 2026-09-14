/**
 * Node registry.
 *
 * The canvas, the add-node menu, connection validation and serialization all
 * read node behaviour from here. Adding a node type means adding a definition
 * file, one entry in this map, one body component in
 * components/advanced-studio/nodes, and (for a persisted shape) one sanitizer
 * entry in lib/advancedStudioProject.js — nothing else changes.
 */
import type { AdvDataType, AdvNodeCategory, AdvNodeDefinition, AdvNodeType } from '../types';
import { textNodeDefinition } from './text-node';
import { imageInputNodeDefinition } from './image-input-node';
import { imageGeneratorNodeDefinition } from './image-generator-node';
import { videoGeneratorNodeDefinition } from './video-generator-node';
import { groupNodeDefinition } from './group-node';

/** Exhaustive by construction: a missing or misnamed node type is a compile
 * error, and each entry stays narrowed to its own data type. */
type AdvNodeRegistry = { [K in AdvNodeType]: AdvNodeDefinition<K> };

export const ADV_NODE_REGISTRY: AdvNodeRegistry = {
  text: textNodeDefinition,
  imageInput: imageInputNodeDefinition,
  imageGenerator: imageGeneratorNodeDefinition,
  videoGenerator: videoGeneratorNodeDefinition,
  group: groupNodeDefinition,
};

export const ADV_NODE_TYPES = Object.keys(ADV_NODE_REGISTRY) as AdvNodeType[];

export function nodeDefinition<T extends AdvNodeType>(type: T): AdvNodeDefinition<T> {
  return ADV_NODE_REGISTRY[type] as unknown as AdvNodeDefinition<T>;
}

/** Presentation-only view of the registry, used by the add-node menu so it
 * never has to reason about per-type data generics. */
export interface AdvNodeListing {
  type: AdvNodeType;
  label: string;
  description: string;
  category: AdvNodeCategory;
  icon: AdvNodeDefinition['icon'];
  addable: boolean;
}

export function nodeListings(): AdvNodeListing[] {
  return ADV_NODE_TYPES.map((type) => {
    const definition = ADV_NODE_REGISTRY[type];
    return {
      type,
      label: definition.label,
      description: definition.description,
      category: definition.category,
      icon: definition.icon,
      addable: definition.addable,
    };
  });
}

export function isAdvNodeType(value: string): value is AdvNodeType {
  return Object.prototype.hasOwnProperty.call(ADV_NODE_REGISTRY, value);
}

/** Addable node types whose freshly-created (default-data, no capability)
 * form exposes an input of the given data type — used to filter the add-node
 * menu when it opens from a dragged connection rather than a blank canvas. */
export function nodeTypesAcceptingInput(dataType: AdvDataType): AdvNodeType[] {
  return ADV_NODE_TYPES.filter((type) => {
    const definition = ADV_NODE_REGISTRY[type];
    if (!definition.addable) return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handles = definition.handles(definition.defaultData() as any, undefined);
    return handles.inputs.some((input) => input.dataType === dataType);
  });
}

export const ADV_CATEGORY_ORDER: AdvNodeCategory[] = ['inputs', 'media', 'generation', 'organization'];

export const ADV_CATEGORY_LABELS: Record<AdvNodeCategory, string> = {
  inputs: 'Inputs',
  media: 'Media',
  generation: 'Generation',
  organization: 'Organization',
};

export { textNodeDefinition, imageInputNodeDefinition, imageGeneratorNodeDefinition, videoGeneratorNodeDefinition, groupNodeDefinition };

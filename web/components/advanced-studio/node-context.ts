'use client';

import * as React from 'react';
import type {
  AdvEngineCapability,
  AdvNodeData,
  AdvNodeType,
  AdvResolvedInputs,
} from '@/lib/advanced-studio/types';

/**
 * Everything a node body can do, injected once by the canvas.
 *
 * Bodies are pure presentation: they never touch React Flow state directly, so
 * editing a prompt re-renders one node rather than the whole graph.
 */
export interface AdvNodeActions {
  locked: boolean;
  projectId: string;
  capabilities: AdvEngineCapability[];
  capabilityFor: (engine?: string) => AdvEngineCapability | undefined;
  runningNodeIds: Set<string>;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  renameNode: (id: string, label: string) => void;
  duplicateNode: (id: string) => void;
  removeNode: (id: string) => void;
  generate: (id: string) => void;
  uploadImage: (id: string, file: File) => Promise<void>;
  clearImage: (id: string) => void;
  openPreview: (url: string) => void;
  resolveInputsFor: (id: string) => AdvResolvedInputs;
}

const noop = () => {};

export const AdvNodeActionsContext = React.createContext<AdvNodeActions>({
  locked: false,
  projectId: '',
  capabilities: [],
  capabilityFor: () => undefined,
  runningNodeIds: new Set(),
  updateNodeData: noop,
  renameNode: noop,
  duplicateNode: noop,
  removeNode: noop,
  generate: noop,
  uploadImage: async () => {},
  clearImage: noop,
  openPreview: noop,
  resolveInputsFor: () => ({ prompt: '', imageUrls: [], startFrameUrls: [], endFrameUrls: [], referenceImageUrls: [], videoUrls: [], audioUrls: [] }),
});

export function useAdvNodeActions() {
  return React.useContext(AdvNodeActionsContext);
}

export interface AdvNodeBodyProps<T extends AdvNodeData = AdvNodeData> {
  id: string;
  type: AdvNodeType;
  data: T & { label: string };
  selected: boolean;
  actions: AdvNodeActions;
}

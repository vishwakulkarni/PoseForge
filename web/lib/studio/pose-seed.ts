import type { PoseReference, StudioProjectDocument } from '@/lib/api/types';

/**
 * A Studio document that already holds `pose` as its pose source. Studio
 * rebuilds its sources from the saved document when a project opens, so a pose
 * has to live in the document to survive that rebuild; the node id and asset
 * fields match what the canvas itself writes for a library pose.
 */
export function poseSeedDocument(pose: PoseReference): StudioProjectDocument {
  return {
    schemaVersion: 1,
    viewport: null,
    locked: false,
    edges: [],
    nodes: [{
      id: `pose-${pose.id}`,
      kind: 'pose',
      position: { x: 0, y: 0 },
      assetType: 'pose',
      assetId: pose.id,
      imageUrl: pose.imageUrl,
      ...(pose.title ? { label: pose.title } : {}),
    }],
  };
}

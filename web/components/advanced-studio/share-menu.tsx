'use client';

import * as React from 'react';
import { AlertTriangle, Download, Share2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';
import { STATIC_DEMO } from '@/lib/demo-mode';
import type { AdvDocument, AdvEngineCapability } from '@/lib/advanced-studio/types';

/** What the share file will hold, read from the canvas. The server builds the
 * file itself (lib/advancedWorkflowShare.js); this only explains it. */
function describeShare(document: AdvDocument, capabilities: AdvEngineCapability[]) {
  let images = 0;
  let clips = 0;
  let libraryPhotos = 0;
  const providers = new Set<string>();
  for (const node of document.nodes) {
    const data = node.data as Record<string, unknown>;
    if (node.type === 'imageInput') {
      if (data.characterId || data.poseId) libraryPhotos += 1;
      if (data.characterId || data.poseId || String(data.imageUrl ?? '').startsWith('/storage/')) images += 1;
    } else if ((node.type === 'videoInput' || node.type === 'audioInput') && data.mediaUrl) {
      clips += 1;
    } else if ((node.type === 'imageGenerator' || node.type === 'videoGenerator') && typeof data.engine === 'string') {
      providers.add(capabilities.find((engine) => engine.key === data.engine)?.label ?? data.engine);
    }
  }
  return { images, clips, libraryPhotos, providers: [...providers] };
}

/**
 * Toolbar button that downloads the workflow as one `.poseforge.json` file:
 * nodes, wiring, prompts, chosen models and embedded input files — never
 * outputs, settings or keys.
 */
export function AdvShareMenu({
  projectId,
  projectName,
  document,
  capabilities,
}: {
  projectId: string;
  projectName: string;
  document: AdvDocument;
  capabilities: AdvEngineCapability[];
}) {
  const [open, setOpen] = React.useState(false);
  const share = React.useMemo(() => describeShare(document, capabilities), [capabilities, document]);
  const files = share.images + share.clips;

  return (
    <>
      <button
        type="button"
        className="adv-toolbar-button"
        title="Share this workflow as a file"
        onClick={() => setOpen(true)}
      >
        <Share2 aria-hidden size={15} />
        <span>Share</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="adv-import-dialog">
          <DialogHeader>
            <DialogTitle>Share {projectName}</DialogTitle>
            <DialogDescription>
              Download one file anyone with PoseForge can import. Outputs stay here; they generate
              their own.
            </DialogDescription>
          </DialogHeader>
          <ul className="adv-share-list">
            <li>{document.nodes.length} node{document.nodes.length === 1 ? '' : 's'} with their connections, prompts and settings</li>
            <li>{files ? `${files} input file${files === 1 ? '' : 's'} embedded` : 'No input files'}</li>
            <li>
              {share.providers.length
                ? `Models from ${share.providers.join(', ')}. Anyone without these set up can switch models when importing.`
                : 'No generator has a model chosen yet.'}
            </li>
          </ul>
          {share.libraryPhotos ? (
            <p className="adv-share-warning" role="note">
              <AlertTriangle aria-hidden size={14} />
              The file includes {share.libraryPhotos} photo{share.libraryPhotos === 1 ? '' : 's'} from your Characters or
              Pose library. Share it only with people you would show those photos to.
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {STATIC_DEMO ? (
              <Button type="button" variant="primary" disabled title="Not available in the demo">
                <Download /> Download file
              </Button>
            ) : (
              <Button asChild variant="primary">
                <a href={api.advancedStudio.exportUrl(projectId)} download onClick={() => setOpen(false)}>
                  <Download /> Download file
                </a>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

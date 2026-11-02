'use client';

import * as React from 'react';
import { AlertCircle, Download, PackageCheck } from 'lucide-react';
import { outputNodeDefinition } from '@/lib/advanced-studio/registry/output-node';
import type { AdvOutputNodeData } from '@/lib/advanced-studio/types';
import type { AdvNodeBodyProps } from '../node-context';
import { RunFooter } from './node-parts';

/** The deliverables of the last runs that reached it: images, clips and
 * captions, newest last. */
export const OutputNodeBody = React.memo(function OutputNodeBody({
  id,
  data,
  actions,
}: AdvNodeBodyProps<AdvOutputNodeData>) {
  const results = data.results ?? [];
  const resolved = actions.resolveInputsFor(id);
  const blockedReason = outputNodeDefinition.validate?.(data, resolved) ?? null;

  return (
    <div className="adv-node-body adv-generator-body">
      <div className="adv-output-list nowheel">
        {results.length ? results.map((result, index) => (
          <div key={`${result.imageUrl ?? result.videoUrl ?? index}-${index}`} className="adv-output-item">
            {result.imageUrl ? (
              <button type="button" className="adv-output-thumb" aria-label={`Open deliverable ${index + 1}`} onClick={() => actions.openPreview(result.imageUrl!)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- served from local /storage */}
                <img src={result.imageUrl} alt="" />
              </button>
            ) : result.videoUrl ? (
              <button type="button" className="adv-output-thumb" aria-label={`Open deliverable ${index + 1}`} onClick={() => actions.openPreview(result.videoUrl!, 'video')}>
                <video src={result.videoUrl} muted preload="metadata" />
              </button>
            ) : (
              <p className="adv-output-text">{result.text}</p>
            )}
            {result.imageUrl || result.videoUrl ? (
              <a className="adv-icon-button" href={result.imageUrl ?? result.videoUrl} download aria-label={`Download deliverable ${index + 1}`}>
                <Download aria-hidden size={14} />
              </a>
            ) : null}
          </div>
        )) : data.status === 'error' ? (
          <span className="adv-state is-error"><AlertCircle aria-hidden size={18} /> {data.error ?? 'Nothing was delivered'}</span>
        ) : (
          <span className="adv-state"><PackageCheck aria-hidden size={18} /> Finished images, clips and captions collect here</span>
        )}
      </div>
      <RunFooter id={id} status={data.status} actions={actions} blockedReason={blockedReason} label="Collect" />
    </div>
  );
});

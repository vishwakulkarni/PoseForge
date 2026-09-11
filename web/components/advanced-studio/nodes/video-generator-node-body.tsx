'use client';

import * as React from 'react';
import { Clapperboard } from 'lucide-react';
import type { AdvVideoGeneratorNodeData } from '@/lib/advanced-studio/types';
import type { AdvNodeBodyProps } from '../node-context';

/**
 * Video generator placeholder.
 *
 * The node, its handles and its persisted shape are already in place so video
 * projects round-trip, but no configured provider reports video support yet.
 * Rather than showing controls that cannot run, the body states that plainly.
 */
export const VideoGeneratorNodeBody = React.memo(function VideoGeneratorNodeBody({
  data,
  actions,
}: AdvNodeBodyProps<AdvVideoGeneratorNodeData>) {
  const provider = actions.capabilities.find((engine) => engine.video.supported);
  return (
    <div className="adv-node-body adv-generator-body">
      <div className="adv-preview" data-aspect={data.aspectRatio ?? '9:16'}>
        <span className="adv-state">
          <Clapperboard aria-hidden size={20} />
          {provider ? 'Ready to configure' : 'Video generation is not available yet'}
        </span>
      </div>
      <p className="adv-node-note">
        This node keeps its prompt connection and settings. Video providers arrive in the next
        phase, and this node will pick them up without rebuilding the workflow.
      </p>
    </div>
  );
});

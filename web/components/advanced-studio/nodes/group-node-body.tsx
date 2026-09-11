'use client';

import * as React from 'react';
import type { AdvGroupNodeData } from '@/lib/advanced-studio/types';
import type { AdvNodeBodyProps } from '../node-context';

/** A group is a frame: the visible chrome is the border and its title, drawn
 * by the shell, so the body only reports what it contains. */
export const GroupNodeBody = React.memo(function GroupNodeBody({
  data,
}: AdvNodeBodyProps<AdvGroupNodeData>) {
  const count = data.memberIds?.length ?? 0;
  return (
    <div className="adv-node-body adv-group-body">
      <span className="adv-group-meta">
        {count === 0 ? 'Drop nodes inside to group them' : `${count} node${count === 1 ? '' : 's'}`}
      </span>
    </div>
  );
});

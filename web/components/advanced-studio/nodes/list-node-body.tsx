'use client';

import * as React from 'react';
import { LIST_MAX_ITEMS } from '@/lib/advanced-studio/registry/list-node';
import { listItems } from '@/lib/advanced-studio/resolve-inputs';
import type { AdvListNodeData } from '@/lib/advanced-studio/types';
import type { AdvNodeBodyProps } from '../node-context';
import { DraftTextarea } from './node-parts';

/** One item per line. Connected text (an LLM's list, say) replaces the
 * node's own lines when the workflow runs. */
export const ListNodeBody = React.memo(function ListNodeBody({
  id,
  data,
  actions,
}: AdvNodeBodyProps<AdvListNodeData>) {
  const connected = actions.resolveInputsFor(id).texts;
  const items = connected.length ? connected.flatMap(listItems) : listItems(data.text ?? '');
  const tooMany = items.length > LIST_MAX_ITEMS;

  return (
    <div className="adv-node-body adv-text-body">
      <DraftTextarea
        value={data.text ?? ''}
        onCommit={(text) => actions.updateNodeData(id, { text })}
        label={`${data.label} items`}
        placeholder={'One item per line\nred kite\nblue kite'}
        maxLength={20_000}
        readOnly={actions.locked || connected.length > 0}
      />
      <div className="adv-text-footer">
        {tooMany ? (
          <span className="adv-inline-error">A list runs at most {LIST_MAX_ITEMS} items.</span>
        ) : (
          <span className="adv-counter">
            {connected.length ? 'From connected text · ' : ''}
            {items.length === 1 ? '1 item' : `${items.length} items`} — everything after runs once per item
          </span>
        )}
      </div>
    </div>
  );
});

'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import {
  ADV_CATEGORY_LABELS,
  ADV_CATEGORY_ORDER,
  nodeListings,
} from '@/lib/advanced-studio/registry';
import type { AdvNodeType } from '@/lib/advanced-studio/types';
import { cn } from '@/lib/utils';

/**
 * Searchable, category-grouped node picker.
 *
 * Its contents come straight from the registry, so a new node type appears
 * here the moment it is registered — there is no second list to update.
 */
export function AddNodeMenu({
  open,
  anchor,
  onClose,
  onSelect,
}: {
  open: boolean;
  /** Canvas-relative anchor point, or null to render docked under the toolbar. */
  anchor: { x: number; y: number } | null;
  onClose: () => void;
  onSelect: (type: AdvNodeType) => void;
}) {
  const [search, setSearch] = React.useState('');
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // The canvas keys this component by open state, so search text resets by
  // unmounting rather than by writing state from an effect.
  React.useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, open]);

  const matches = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return nodeListings()
      .filter((definition) => definition.addable)
      .filter((definition) => !term
        || definition.label.toLowerCase().includes(term)
        || definition.description.toLowerCase().includes(term));
  }, [search]);

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      className="adv-add-menu"
      role="dialog"
      aria-label="Add a node"
      style={anchor ? { left: anchor.x, top: anchor.y } : undefined}
      data-docked={anchor ? undefined : 'true'}
    >
      <label className="adv-add-search">
        <Search aria-hidden size={14} />
        <input
          ref={inputRef}
          value={search}
          placeholder="Search nodes"
          aria-label="Search nodes"
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && matches.length) {
              event.preventDefault();
              onSelect(matches[0].type);
            }
          }}
        />
      </label>

      <div className="adv-add-list">
        {matches.length === 0 ? (
          <p className="adv-add-empty">No node matches “{search}”.</p>
        ) : (
          ADV_CATEGORY_ORDER.map((category) => {
            const inCategory = matches.filter((definition) => definition.category === category);
            if (!inCategory.length) return null;
            return (
              <section key={category}>
                <p className="adv-add-group">{ADV_CATEGORY_LABELS[category]}</p>
                {inCategory.map((definition) => {
                  const Icon = definition.icon;
                  return (
                    <button
                      key={definition.type}
                      type="button"
                      className={cn('adv-add-item')}
                      onClick={() => onSelect(definition.type)}
                    >
                      <Icon aria-hidden size={15} />
                      <span>
                        <strong>{definition.label}</strong>
                        <small>{definition.description}</small>
                      </span>
                    </button>
                  );
                })}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

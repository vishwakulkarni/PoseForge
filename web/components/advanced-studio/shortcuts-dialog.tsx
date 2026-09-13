'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ShortcutGroup {
  title: string;
  items: { keys: string[]; label: string }[];
}

/** The single source of truth for what the canvas listens to; the dialog and
 * the control cluster's tooltips both describe these bindings. */
export const ADV_SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Tools',
    items: [
      { keys: ['V'], label: 'Select tool' },
      { keys: ['H'], label: 'Hand tool (pan)' },
      { keys: ['Space', 'drag'], label: 'Pan temporarily' },
      { keys: ['L'], label: 'Lock or unlock the canvas' },
    ],
  },
  {
    title: 'View',
    items: [
      { keys: ['⌘', '+'], label: 'Zoom in' },
      { keys: ['⌘', '−'], label: 'Zoom out' },
      { keys: ['⌘', '0'], label: 'Reset zoom to 100%' },
      { keys: ['⇧', '1'], label: 'Fit all nodes' },
      { keys: ['Scroll'], label: 'Pan · ⌘ scroll to zoom' },
    ],
  },
  {
    title: 'Nodes',
    items: [
      { keys: ['A'], label: 'Add node' },
      { keys: ['⌘', 'D'], label: 'Duplicate selection' },
      { keys: ['⌘', 'C'], label: 'Copy selection' },
      { keys: ['⌘', 'X'], label: 'Cut selection' },
      { keys: ['⌘', 'V'], label: 'Paste' },
      { keys: ['Delete'], label: 'Delete selection' },
      { keys: ['Double-click'], label: 'Enlarge image or video' },
      { keys: ['⇧', 'A'], label: 'Arrange in a grid' },
      { keys: ['↑', '↓', '←', '→'], label: 'Nudge · ⇧ for larger steps' },
    ],
  },
  {
    title: 'Selection and history',
    items: [
      { keys: ['⌘', 'A'], label: 'Select all' },
      { keys: ['⇧', 'click'], label: 'Add to selection' },
      { keys: ['Esc'], label: 'Clear selection, close menus' },
      { keys: ['⌘', 'Z'], label: 'Undo' },
      { keys: ['⇧', '⌘', 'Z'], label: 'Redo' },
      { keys: ['⌘', 'Y'], label: 'Redo' },
      { keys: ['?'], label: 'This list' },
    ],
  },
];

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="adv-shortcuts-dialog">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Shortcuts apply to the canvas. While you are typing in a prompt, only Escape is
            captured.
          </DialogDescription>
        </DialogHeader>
        <div className="adv-shortcuts-grid">
          {ADV_SHORTCUTS.map((group) => (
            <section key={group.title}>
              <h3>{group.title}</h3>
              <dl>
                {group.items.map((item) => (
                  <div key={item.label}>
                    <dt>
                      {item.keys.map((key) => (
                        <kbd key={key}>{key}</kbd>
                      ))}
                    </dt>
                    <dd>{item.label}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

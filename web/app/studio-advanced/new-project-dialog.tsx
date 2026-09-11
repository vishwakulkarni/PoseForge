'use client';

import * as React from 'react';
import { Clapperboard, FileStack, LayoutGrid, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { AdvTemplateId } from '@/lib/advanced-studio/types';
import { cn } from '@/lib/utils';

interface TemplateChoice {
  id: AdvTemplateId;
  title: string;
  description: string;
  detail: string;
  icon: typeof Sparkles;
}

/** Starter workflows. Each is just nodes and edges on the shared canvas, so a
 * template only decides what the canvas opens with — never how it behaves. */
const TEMPLATES: TemplateChoice[] = [
  {
    id: 'image',
    title: 'Image generation',
    description: 'Prompt into an image generator, ready for text-to-image or image-to-image.',
    detail: 'Prompt node · Image Generator',
    icon: Sparkles,
  },
  {
    id: 'video',
    title: 'Video generation',
    description: 'Prompt into a video generator. Add frames or references as the model allows.',
    detail: 'Prompt node · Video Generator',
    icon: Clapperboard,
  },
  {
    id: 'storyboard',
    title: 'Storyboard',
    description: 'Three ordered scene groups you can rename, duplicate, and extend.',
    detail: 'Scene 1–3 · prompt and still per scene',
    icon: FileStack,
  },
  {
    id: 'blank',
    title: 'Blank canvas',
    description: 'Start empty and add any node you like.',
    detail: 'Nothing on the canvas yet',
    icon: LayoutGrid,
  },
];

export function NewProjectDialog({
  open,
  onOpenChange,
  onCreate,
  creating,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: { name: string; template: AdvTemplateId }) => void;
  creating: boolean;
}) {
  const [template, setTemplate] = React.useState<AdvTemplateId>('image');
  const [name, setName] = React.useState('');

  // Reset when the dialog closes rather than in an effect, so reopening always
  // starts from the default choice without an extra render.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setTemplate('image');
      setName('');
    }
    onOpenChange(next);
  };

  const chosen = TEMPLATES.find((item) => item.id === template)!;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="adv-new-dialog">
        <DialogHeader>
          <DialogTitle>New Advanced Studio workflow</DialogTitle>
          <DialogDescription>
            Pick a starting point. Every option opens the same canvas — you can add or remove
            any node afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="adv-template-grid" role="radiogroup" aria-label="Workflow type">
          {TEMPLATES.map((item) => {
            const Icon = item.icon;
            const selected = item.id === template;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={cn('adv-template-card', selected && 'is-selected')}
                onClick={() => setTemplate(item.id)}
              >
                <span className="adv-template-icon"><Icon aria-hidden size={18} /></span>
                <strong>{item.title}</strong>
                <span className="adv-template-copy">{item.description}</span>
                <small>{item.detail}</small>
              </button>
            );
          })}
        </div>

        <label className="adv-field">
          <span>Name</span>
          <input
            value={name}
            maxLength={100}
            placeholder={chosen.title}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <div className="adv-dialog-actions">
          <button type="button" className="adv-toolbar-button" onClick={() => handleOpenChange(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="adv-generate-button"
            disabled={creating}
            onClick={() => onCreate({ name: name.trim() || chosen.title, template })}
          >
            {creating ? 'Creating…' : 'Create workflow'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

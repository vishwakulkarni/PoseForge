'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Layers, Workflow } from 'lucide-react';
import { api } from '@/lib/api/client';
import { queryKeys, useCreateAdvancedProject, useCreateStudioProject } from '@/lib/api/hooks';
import { withReferenceImage } from '@/lib/advanced-studio/seed';
import { poseSeedDocument } from '@/lib/studio/pose-seed';
import type { PoseReference } from '@/lib/api/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';

type Target = 'studio' | 'advanced';

const CHOICES: { target: Target; title: string; description: string; icon: typeof Layers }[] = [
  {
    target: 'studio',
    title: 'Studio',
    description: 'Put a saved face into this pose. A new project opens with the pose selected.',
    icon: Layers,
  },
  {
    target: 'advanced',
    title: 'Advanced Studio',
    description: 'Start a node workflow with this pose as a reference image for the generator.',
    icon: Workflow,
  },
];

/** Asks where a library pose should go, then creates a project there with the
 * pose already in place and opens it. */
export function UsePoseDialog({
  pose,
  onOpenChange,
}: {
  pose: PoseReference | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const client = useQueryClient();
  const createStudio = useCreateStudioProject();
  const createAdvanced = useCreateAdvancedProject();
  const [pending, setPending] = React.useState<Target | null>(null);

  const start = async (target: Target) => {
    if (!pose || pending) return;
    const name = pose.title?.trim() || 'Pose reference';
    setPending(target);
    try {
      if (target === 'studio') {
        const project = await createStudio.mutateAsync({ name, document: poseSeedDocument(pose) });
        router.push(`/studio/${project.id}`);
        return;
      }
      const project = await createAdvanced.mutateAsync({ name, template: 'image' });
      const seeded = await api.advancedStudio.update(project.id, {
        expectedRevision: project.revision,
        document: withReferenceImage(project.document, { url: pose.imageUrl, name }),
      });
      client.setQueryData(queryKeys.advancedProject(seeded.id), seeded);
      router.push(`/studio-advanced/${seeded.id}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'That project could not be created.');
      setPending(null);
    }
  };

  return (
    <Dialog open={Boolean(pose)} onOpenChange={(open) => { if (!pending) onOpenChange(open); }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Use this pose in…</DialogTitle>
          <DialogDescription>
            Pick a workspace. A new project is created for {pose?.title ?? 'this pose'}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {CHOICES.map(({ target, title, description, icon: Icon }) => (
            <button
              key={target}
              type="button"
              disabled={Boolean(pending)}
              onClick={() => void start(target)}
              className="flex items-start gap-3 rounded-[14px] border border-[var(--pf-border)] bg-[var(--pf-surface)] p-4 text-left transition-colors hover:border-[var(--pf-accent)] disabled:cursor-wait disabled:opacity-60"
            >
              <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--pf-accent)]" />
              <span className="flex flex-col gap-0.5">
                <span className="text-[14px] font-bold">
                  {title}{pending === target ? ' — creating…' : ''}
                </span>
                <span className="text-[12px] text-[var(--pf-text-secondary)]">{description}</span>
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

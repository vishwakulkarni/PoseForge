'use client';

import * as React from 'react';
import { Download, History as HistoryIcon, Trash2 } from 'lucide-react';
import { useDeleteGeneration, useGenerations } from '@/lib/api/hooks';
import type { Generation, GenerationStatus } from '@/lib/api/types';
import { formatCompact, formatCurrency, formatDuration, relativeTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Segmented } from '@/components/ui/segmented';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';

const FILTERS = [
  { value: 'all' as const, label: 'All' },
  { value: 'completed' as const, label: 'Completed' },
  { value: 'failed' as const, label: 'Failed' },
  { value: 'running' as const, label: 'In flight' },
];

type Filter = (typeof FILTERS)[number]['value'];

function latency(generation: Generation): number | null {
  if (!generation.startedAt || !generation.completedAt) return null;
  const delta =
    new Date(generation.completedAt).getTime() - new Date(generation.startedAt).getTime();
  return delta >= 0 ? delta : null;
}

function DetailDialog({
  generation,
  onOpenChange,
}: {
  generation: Generation | null;
  onOpenChange: (open: boolean) => void;
}) {
  if (!generation) return null;
  const usage = generation.usage ?? {};

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Generation detail</DialogTitle>
          <DialogDescription>
            {generation.engine} · {relativeTime(generation.createdAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <div className="overflow-hidden rounded-[16px] border border-[var(--pf-border)] bg-[var(--pf-surface-muted)]">
            {generation.outputUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- local storage mount
              <img
                src={generation.outputUrl}
                alt="Generated result"
                className="max-h-[60vh] w-full object-contain"
              />
            ) : (
              <div className="grid aspect-square place-items-center p-6 text-center text-[12px] text-[var(--pf-text-tertiary)]">
                {generation.errorMessage ?? 'No output produced.'}
              </div>
            )}
          </div>

          <dl className="flex flex-col gap-3 text-[12px]">
            {[
              ['Status', <StatusBadge key="s" status={generation.status} />],
              ['Engine', generation.engine],
              ['Model', usage.model ?? '—'],
              ['Mode', generation.studioMode],
              ['Pose', generation.poseTitle ?? 'Uploaded pose'],
              [
                'People',
                generation.characters.map((c) => c.name ?? `Subject ${c.position}`).join(', ') || '—',
              ],
              ['Tokens', formatCompact(usage.totalTokens)],
              [
                'Cost',
                `${formatCurrency(usage.actualCostUsd ?? usage.estimatedCostUsd)}${
                  usage.source === 'actual' ? '' : ' (est.)'
                }`,
              ],
              ['Latency', formatDuration(latency(generation))],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="flex items-center justify-between gap-3 border-b border-[var(--pf-border)] pb-2 last:border-0"
              >
                <dt className="text-[var(--pf-text-tertiary)]">{label}</dt>
                <dd className="text-right font-medium">{value}</dd>
              </div>
            ))}

            {usage.pricingNote ? (
              <p className="rounded-[11px] bg-[var(--pf-surface-muted)] p-3 text-[11px] leading-relaxed text-[var(--pf-text-tertiary)]">
                {usage.pricingNote}
              </p>
            ) : null}

            {generation.errorMessage ? (
              <p className="rounded-[11px] bg-[var(--pf-error-bg)] p-3 text-[11px] leading-relaxed text-[var(--pf-error)]">
                {generation.errorMessage}
              </p>
            ) : null}

            {generation.outputUrl ? (
              <Button asChild variant="primary" size="sm" className="mt-1">
                <a href={generation.outputUrl} download>
                  <Download />
                  Download PNG
                </a>
              </Button>
            ) : null}

            <details className="mt-1">
              <summary className="cursor-pointer text-[11px] text-[var(--pf-text-tertiary)] hover:text-[var(--pf-text-secondary)]">
                Show resolved prompt
              </summary>
              <p className="mt-2 whitespace-pre-wrap rounded-[11px] bg-[var(--pf-surface-muted)] p-3 font-mono text-[10px] leading-relaxed text-[var(--pf-text-secondary)]">
                {generation.prompt}
              </p>
            </details>
          </dl>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function HistoryView() {
  const [filter, setFilter] = React.useState<Filter>('all');
  const [detail, setDetail] = React.useState<Generation | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<Generation | null>(null);

  const status: GenerationStatus | undefined =
    filter === 'all' ? undefined : filter === 'running' ? 'running' : filter;

  const { data, isLoading, error, refetch } = useGenerations(
    { limit: 60, status },
    {
      // Keep in-flight rows moving without hammering the API.
      refetchInterval: 5_000,
    },
  );
  const remove = useDeleteGeneration();
  const toast = useToast();

  const generations = data?.generations ?? [];

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await remove.mutateAsync(pendingDelete.id);
      toast.success('Generation deleted');
      setPendingDelete(null);
    } catch (cause) {
      toast.error('Could not delete', cause instanceof Error ? cause.message : undefined);
    }
  };

  if (error) {
    return (
      <ErrorState
        title="Could not load history"
        message={error instanceof Error ? error.message : undefined}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          aria-label="Filter generations by status"
          value={filter}
          onValueChange={setFilter}
          options={FILTERS}
          size="sm"
        />
        <span className="text-[12px] text-[var(--pf-text-tertiary)]" aria-live="polite">
          {isLoading ? 'Loading…' : `${generations.length} shown`}
        </span>
      </div>

      {isLoading ? (
        <LoadingRegion label="Loading generation history">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="aspect-square w-full rounded-[18px]" />
            ))}
          </div>
        </LoadingRegion>
      ) : !generations.length ? (
        <EmptyState
          icon={<HistoryIcon className="size-5" />}
          title={filter === 'all' ? 'Nothing generated yet' : 'No runs match this filter'}
          description={
            filter === 'all'
              ? 'Every generation you run lands here with its prompt, usage and result.'
              : 'Try a different status filter.'
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {generations.map((generation) => {
            const usage = generation.usage ?? {};
            return (
              <li
                key={generation.id}
                className="group relative overflow-hidden rounded-[18px] border border-[var(--pf-border)] bg-[var(--pf-surface)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--pf-shadow-md)]"
              >
                <button
                  type="button"
                  onClick={() => setDetail(generation)}
                  className="block w-full text-left"
                  aria-label={`Open detail for generation from ${relativeTime(generation.createdAt)}`}
                >
                  <div className="relative aspect-square overflow-hidden bg-[var(--pf-surface-muted)]">
                    {generation.outputUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- local storage mount
                      <img
                        src={generation.outputUrl}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="grid size-full place-items-center px-4 text-center text-[11px] text-[var(--pf-text-tertiary)]">
                        {generation.status === 'failed'
                          ? 'Generation failed'
                          : 'Waiting for output…'}
                      </div>
                    )}
                    <div className="absolute left-2 top-2">
                      <StatusBadge status={generation.status} />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-[var(--pf-text-secondary)]">
                        {generation.engine}
                      </span>
                      <span className="text-[10px] text-[var(--pf-text-tertiary)]">
                        {relativeTime(generation.createdAt)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">{formatCompact(usage.totalTokens)} tok</Badge>
                      <Badge variant="outline">
                        {formatCurrency(usage.actualCostUsd ?? usage.estimatedCostUsd)}
                      </Badge>
                      {latency(generation) != null ? (
                        <Badge variant="outline">{formatDuration(latency(generation))}</Badge>
                      ) : null}
                    </div>
                  </div>
                </button>

                <Button
                  size="icon"
                  variant="secondary"
                  aria-label="Delete generation"
                  onClick={() => setPendingDelete(generation)}
                  className="absolute right-2 top-2 size-8 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <DetailDialog generation={detail} onOpenChange={(open) => !open && setDetail(null)} />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this generation?"
        description="The output image and its stored pose copy are removed from disk. This cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onConfirm={confirmDelete}
      />
    </>
  );
}

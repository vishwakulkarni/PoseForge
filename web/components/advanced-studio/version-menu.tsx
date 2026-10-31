'use client';

import * as React from 'react';
import { ChevronDown, History, RotateCcw } from 'lucide-react';
import { useAdvancedVersions } from '@/lib/api/hooks';
import type { AdvVersionSummary } from '@/lib/advanced-studio/types';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { cn, formatCurrency, relativeTime } from '@/lib/utils';

/** What a version cost across all of its runs. Engines billed through a plan
 * (Codex, fal) record no price, so a total can be partial. */
function versionCost(version: AdvVersionSummary): { label: string; note?: string } {
  // A server that predates cost tracking sends no counts: that is unknown,
  // not "nothing generated", so it must never read as $0.
  if (typeof version.generationCount !== 'number') return { label: '—', note: 'Cost not available' };
  if (version.generationCount === 0) return { label: formatCurrency(0), note: 'Nothing generated' };
  if (!version.pricedGenerationCount) return { label: 'Not priced', note: 'Billed through your provider plan' };
  const label = formatCurrency(version.costUsd ?? 0);
  if (version.pricedGenerationCount < version.generationCount) {
    const unpriced = version.generationCount - version.pricedGenerationCount;
    return { label: `${label}+`, note: `${unpriced} generation${unpriced === 1 ? '' : 's'} billed through a provider plan` };
  }
  return { label };
}

/**
 * Toolbar dropdown of a workflow's versions — each distinct set of nodes,
 * settings and wiring that has run — with what each one cost, and a way to put
 * an older version back on the canvas.
 */
export function AdvVersionMenu({
  projectId,
  onRestore,
  disabled,
}: {
  projectId: string;
  onRestore: (versionId: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [confirmVersion, setConfirmVersion] = React.useState<AdvVersionSummary | null>(null);
  const [restoringId, setRestoringId] = React.useState<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const toast = useToast();

  // Fetched once for the label, polled while the menu is open.
  const versionsQuery = useAdvancedVersions(projectId, open);
  const versions = versionsQuery.data?.versions ?? [];
  const currentVersionId = versionsQuery.data?.currentVersionId ?? null;
  const current = versions.find((version) => version.id === currentVersionId);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (confirmVersion) return;
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !confirmVersion) {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [confirmVersion, open]);

  const label = !versions.length ? 'No runs yet' : current ? `v${current.version}` : `v${versions[0].version} · edited`;

  const restore = async (version: AdvVersionSummary) => {
    setRestoringId(version.id);
    try {
      await onRestore(version.id);
      toast.success(`Restored version ${version.version}`, 'Its nodes and settings are back on the canvas. Results were kept.');
      setOpen(false);
    } catch (error) {
      toast.error('Could not restore that version', error instanceof Error ? error.message : undefined);
    } finally {
      setRestoringId(null);
      setConfirmVersion(null);
    }
  };

  return (
    <div className="adv-version-wrap" ref={containerRef}>
      <button
        type="button"
        className="adv-toolbar-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Versions: ${label}`}
        title="Versions and what each one cost"
        onClick={() => setOpen((value) => !value)}
      >
        <History aria-hidden size={15} />
        <span>{label}</span>
        <ChevronDown aria-hidden size={13} className={cn('adv-pill-chevron', open && 'is-open')} />
      </button>

      {open ? (
        <div className="adv-version-menu nowheel" role="dialog" aria-label="Versions">
          {!versions.length ? (
            <p className="adv-version-empty">
              {versionsQuery.isLoading ? 'Loading…' : 'Run a generator to record the first version. Each change to nodes, settings or connections that runs becomes a new version.'}
            </p>
          ) : (
            <ul className="adv-version-list" aria-label="Versions">
              {versions.map((version) => {
                const cost = versionCost(version);
                const onCanvas = version.id === currentVersionId;
                return (
                  <li key={version.id} className="adv-version-row">
                    <div className="adv-version-name">
                      <strong>v{version.version}</strong>
                      {onCanvas ? <span className="adv-version-badge">On canvas</span> : null}
                      <small>
                        {version.runCount} run{version.runCount === 1 ? '' : 's'} · {relativeTime(version.lastRunAt ?? version.createdAt)}
                      </small>
                    </div>
                    <span className="adv-version-cost" title={cost.note}>
                      {cost.label}
                      {cost.note ? <span className="sr-only">, {cost.note}</span> : null}
                    </span>
                    {onCanvas ? null : (
                      <button
                        type="button"
                        className="adv-icon-button"
                        aria-label={`Restore version ${version.version} to the canvas`}
                        title="Restore to canvas"
                        disabled={disabled || restoringId !== null}
                        onClick={() => (currentVersionId ? void restore(version) : setConfirmVersion(version))}
                      >
                        <RotateCcw aria-hidden size={14} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmVersion !== null}
        onOpenChange={(next) => { if (!next) setConfirmVersion(null); }}
        title={confirmVersion ? `Restore version ${confirmVersion.version}?` : 'Restore version?'}
        description="The canvas has changes that have not run yet, so they are not saved as a version. Restoring replaces them. Every result is kept."
        confirmLabel="Restore"
        loading={restoringId !== null}
        onConfirm={() => { if (confirmVersion) void restore(confirmVersion); }}
      />
    </div>
  );
}

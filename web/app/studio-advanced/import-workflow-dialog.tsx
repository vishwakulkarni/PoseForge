'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { api } from '@/lib/api/client';
import { useImportAdvancedWorkflow } from '@/lib/api/hooks';
import type {
  AdvImportPreview,
  AdvImportReplacements,
  AdvShareGeneratorRow,
  AdvShareStatus,
} from '@/lib/advanced-studio/types';

const STATUS: Record<AdvShareStatus, { label: string; variant: NonNullable<BadgeProps['variant']> }> = {
  ready: { label: 'Ready', variant: 'ok' },
  'needs-setup': { label: 'Needs setup', variant: 'warning' },
  'unknown-model': { label: 'Model unavailable', variant: 'error' },
  'unknown-engine': { label: 'Not available here', variant: 'error' },
  unset: { label: 'No model chosen', variant: 'neutral' },
};

/** The Settings section that configures an engine (ids in settings-view.tsx). */
function settingsSection(engine: string | null): string {
  if (engine === 'codex' || engine?.startsWith('dreamina')) return 'cli-tools';
  if (engine === 'comfy') return 'local';
  return 'api-keys';
}

const KEEP = '';

function GeneratorRow({
  row,
  choice,
  onChoose,
}: {
  row: AdvShareGeneratorRow;
  choice: string;
  onChoose: (value: string) => void;
}) {
  const status = STATUS[row.status];
  const original = row.engine ? [row.engineLabel, row.modelLabel].filter(Boolean).join(' · ') : 'No model';
  return (
    <li className="adv-import-row">
      <div className="adv-import-row-head">
        <strong>{row.label}</strong>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>
      <p className="adv-import-row-model">{original}</p>
      {row.reason ? (
        <p className="adv-import-row-note">
          {row.reason}{' '}
          {row.status === 'needs-setup' ? (
            <Link href={`/settings#${settingsSection(row.engine)}`} target="_blank" className="underline">
              Set up in Settings
            </Link>
          ) : null}
        </p>
      ) : null}
      {row.issues.map((issue) => <p key={issue} className="adv-import-row-note">{issue}</p>)}
      {row.alternatives.length ? (
        <label className="adv-field">
          <span>Use</span>
          <select value={choice} onChange={(event) => onChoose(event.target.value)} aria-label={`Model for ${row.label}`}>
            <option value={KEEP}>{row.engine ? `Keep ${original}` : 'Leave unset'}</option>
            {row.alternatives.map((option) => (
              <option key={`${option.engine}::${option.model}`} value={`${option.engine}::${option.model}`}>
                {option.engineLabel === option.label ? option.label : `${option.engineLabel} · ${option.label}`}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </li>
  );
}

/**
 * Imports a shared `.poseforge.json` workflow. Shows how each generator fits
 * this machine before anything is created; every node keeps the author's
 * engine and model unless the user picks a configured alternative.
 */
export function ImportWorkflowDialog({
  file,
  onOpenChange,
  onImported,
}: {
  file: File | null;
  onOpenChange: (open: boolean) => void;
  onImported: (projectId: string) => void;
}) {
  const [preview, setPreview] = React.useState<AdvImportPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [choices, setChoices] = React.useState<Record<string, string>>({});
  const importWorkflow = useImportAdvancedWorkflow();

  React.useEffect(() => {
    if (!file) return;
    // The parent remounts this dialog per file (`key`), so state starts empty.
    let cancelled = false;
    api.advancedStudio.previewImport(file).then(
      (result) => {
        if (cancelled) return;
        setPreview(result);
        setName(result.name);
      },
      (cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'That file could not be read.');
      },
    );
    return () => { cancelled = true; };
  }, [file]);

  const onImport = async () => {
    if (!file) return;
    const replacements: AdvImportReplacements = {};
    for (const [nodeId, value] of Object.entries(choices)) {
      if (!value) continue;
      const separator = value.indexOf('::');
      replacements[nodeId] = { engine: value.slice(0, separator), model: value.slice(separator + 2) };
    }
    try {
      const project = await importWorkflow.mutateAsync({ file, name: name.trim() || preview?.name, replacements });
      onImported(project.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That workflow could not be imported.');
    }
  };

  const generators = preview?.report.generators ?? [];
  const warnings = [...(preview?.warnings ?? []), ...(preview?.report.warnings ?? [])];

  return (
    <Dialog open={file !== null} onOpenChange={onOpenChange}>
      <DialogContent className="adv-import-dialog">
        <DialogHeader>
          <DialogTitle>Import workflow</DialogTitle>
          <DialogDescription>
            {file?.name}. Nodes, prompts and input images come with it; outputs are generated here.
          </DialogDescription>
        </DialogHeader>

        {!preview && !error ? (
          <p className="adv-import-loading"><Loader2 aria-hidden className="adv-spin" size={16} /> Reading the workflow…</p>
        ) : null}
        {error ? <p role="alert" className="adv-import-error">{error}</p> : null}

        {preview ? (
          <>
            <label className="adv-field">
              <span>Name</span>
              <input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} />
            </label>
            <p className="adv-import-summary">
              {preview.nodeCount} node{preview.nodeCount === 1 ? '' : 's'} · {preview.embeddedFiles} embedded file
              {preview.embeddedFiles === 1 ? '' : 's'}
              {preview.inputs.length ? ` · inputs: ${preview.inputs.map((input) => input.name).join(', ')}` : ''}
            </p>
            {generators.length ? (
              <ul className="adv-import-rows" aria-label="Generators">
                {generators.map((row) => (
                  <GeneratorRow
                    key={row.nodeId}
                    row={row}
                    choice={choices[row.nodeId] ?? KEEP}
                    onChoose={(value) => setChoices((current) => ({ ...current, [row.nodeId]: value }))}
                  />
                ))}
              </ul>
            ) : null}
            {warnings.length ? (
              <details className="adv-import-warnings">
                <summary><AlertTriangle aria-hidden size={14} /> {warnings.length} note{warnings.length === 1 ? '' : 's'} about this file</summary>
                <ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
              </details>
            ) : null}
          </>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="primary" disabled={!preview} loading={importWorkflow.isPending} onClick={() => void onImport()}>
            Import workflow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

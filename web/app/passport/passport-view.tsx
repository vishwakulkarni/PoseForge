'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, Download, ExternalLink, Printer } from 'lucide-react';
import {
  useCreatePassportPhoto,
  useEngines,
  useGenerationPolling,
  usePassportConfig,
} from '@/lib/api/hooks';
import type { DocumentProfile } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Card, PanelTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Segmented } from '@/components/ui/segmented';
import { Dropzone, useImagePreview } from '@/components/ui/dropzone';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';

const MODE_OPTIONS = [
  { value: 'local' as const, label: 'Local format', title: 'Crop and resize only — no AI' },
  { value: 'ai' as const, label: 'AI assist', title: 'Regenerate the portrait with an engine' },
];

type ProcessingMode = (typeof MODE_OPTIONS)[number]['value'];

function ProfileCard({
  profile,
  selected,
  onSelect,
}: {
  profile: DocumentProfile;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex flex-col items-start gap-1 rounded-[12px] border p-3 text-left transition-colors',
        selected
          ? 'border-[var(--pf-accent)] bg-[var(--pf-accent-soft)]'
          : 'border-[var(--pf-border)] hover:border-[var(--pf-border-strong)]',
      )}
    >
      <span className="flex items-center gap-1.5 text-[12px] font-bold">
        {selected ? <Check className="size-3.5 text-[var(--pf-accent)]" /> : null}
        {profile.label}
      </span>
      <span className="font-mono text-[10px] text-[var(--pf-text-tertiary)]">
        {profile.output.widthPx}×{profile.output.heightPx}px ·{' '}
        {profile.output.printWidthMm}×{profile.output.printHeightMm}mm
      </span>
    </button>
  );
}

export function PassportView() {
  const { data: config, isLoading, error, refetch } = usePassportConfig();
  const { data: engineData } = useEngines();
  const create = useCreatePassportPhoto();
  const preview = useImagePreview();
  const toast = useToast();

  const [profileId, setProfileId] = React.useState<string>('us-passport');
  const [mode, setMode] = React.useState<ProcessingMode>('local');
  const [engineChoice, setEngineChoice] = React.useState<string | null>(null);
  const [resultId, setResultId] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);

  const { data: generation } = useGenerationPolling(resultId);

  // Derived rather than synced into state via an effect: null means "the user
  // has not chosen", so the server default applies and updates if it changes.
  const engine = engineChoice ?? engineData?.defaultEngine ?? '';

  const profile = config?.profiles.find((item) => item.id === profileId) ?? config?.profiles[0];

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!preview.file) return setFormError('Add a portrait photo first.');
    if (!profile) return setFormError('Choose a document type.');

    const form = new FormData();
    form.append('characterPhoto', preview.file);
    form.append('profileId', profile.id);
    form.append('processingMode', mode);
    if (mode === 'ai') form.append('engine', engine);

    try {
      const result = await create.mutateAsync(form);
      setResultId(result.id);
      toast.success(
        result.status === 'completed' ? 'Photo formatted' : 'Queued',
        result.status === 'completed'
          ? 'Ready to download.'
          : 'The engine is generating your photo.',
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not create that photo.';
      setFormError(message);
      toast.error('Request rejected', message);
    }
  };

  if (error) {
    return (
      <ErrorState
        title="Could not load document guidance"
        message={error instanceof Error ? error.message : undefined}
        onRetry={() => refetch()}
      />
    );
  }

  if (isLoading || !config || !profile) {
    return (
      <div className="grid gap-3 xl:grid-cols-[1.2fr_1fr]">
        <Skeleton className="h-[520px] w-full rounded-[22px]" />
        <Skeleton className="h-[520px] w-full rounded-[22px]" />
      </div>
    );
  }

  const engines = engineData?.engines ?? [];

  return (
    <form onSubmit={submit} noValidate className="grid gap-3 xl:grid-cols-[1.2fr_1fr]">
      <div className="flex flex-col gap-3">
        <Card>
          <PanelTitle>Document type</PanelTitle>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {config.profiles.map((item) => (
              <ProfileCard
                key={item.id}
                profile={item}
                selected={item.id === profile.id}
                onSelect={() => setProfileId(item.id)}
              />
            ))}
          </div>
        </Card>

        <Card>
          <PanelTitle>Your portrait</PanelTitle>
          <Field
            label="Photo"
            help="A straight-on, evenly lit head-and-shoulders photo works best."
            error={preview.error ?? undefined}
          >
            <Dropzone
              previewUrl={preview.url}
              onFileSelected={preview.select}
              onClear={preview.clear}
              disabled={preview.pending}
              label="Add portrait photo"
              aria-label="Portrait photo for document"
              className="min-h-[220px]"
            />
          </Field>
        </Card>

        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <PanelTitle className="mb-0">Processing</PanelTitle>
            <Segmented
              aria-label="Processing mode"
              value={mode}
              onValueChange={setMode}
              options={MODE_OPTIONS}
              size="sm"
            />
          </div>

          <p className="text-[12px] leading-relaxed text-[var(--pf-text-secondary)]">
            {mode === 'local'
              ? 'Your photo is cropped, resized and encoded on this machine. Nothing is sent anywhere and the image is not altered.'
              : 'An engine regenerates the portrait to match the layout. Many authorities prohibit AI-altered photos — check the official guidance below before using this.'}
          </p>

          {mode === 'ai' ? (
            <div className="mt-4 flex flex-col gap-3">
              <Field label="Engine" htmlFor="passport-engine">
                <Select value={engine} onValueChange={setEngineChoice}>
                  <SelectTrigger id="passport-engine">
                    <SelectValue placeholder="Select an engine" />
                  </SelectTrigger>
                  <SelectContent>
                    {engines.map((item) => (
                      <SelectItem key={item.key} value={item.key} disabled={!item.ready}>
                        {item.label}
                        {item.ready ? '' : ' — not ready'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <p className="flex items-start gap-2 rounded-[11px] bg-[var(--pf-warning-bg)] p-3 text-[11px] leading-relaxed text-[var(--pf-warning)]">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                Do not use AI assistance where the authority requires an unaltered photograph.
              </p>
            </div>
          ) : null}
        </Card>
      </div>

      {/* ---------------------------------------------------- right column */}
      <div className="flex flex-col gap-3">
        <div className="xl:sticky xl:top-[calc(var(--pf-nav-h)+12px)] flex flex-col gap-3">
          <Card>
            <PanelTitle>Result</PanelTitle>

            {generation?.outputUrl ? (
              <div className="flex flex-col gap-3">
                <div className="overflow-hidden rounded-[14px] border border-[var(--pf-border)] bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local storage mount */}
                  <img
                    src={generation.outputUrl}
                    alt="Formatted document photo"
                    className="mx-auto max-h-[320px] w-auto"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="primary" size="sm">
                    <a href={generation.outputUrl} download>
                      <Download />
                      Download photo
                    </a>
                  </Button>
                  {generation.documentSheetUrl ? (
                    <Button asChild variant="secondary" size="sm">
                      <a href={generation.documentSheetUrl} download>
                        <Printer />
                        4×6 print sheet
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : resultId ? (
              <div
                className="grid aspect-[4/5] place-items-center rounded-[14px] bg-[var(--pf-surface-muted)] px-6 text-center"
                role="status"
                aria-live="polite"
              >
                <div className="flex flex-col items-center gap-3">
                  {generation?.status === 'failed' ? (
                    <>
                      <p className="text-[13px] font-bold text-[var(--pf-error)]">Failed</p>
                      <p className="max-w-[260px] text-[11px] leading-relaxed text-[var(--pf-text-secondary)]">
                        {generation.errorMessage}
                      </p>
                    </>
                  ) : (
                    <>
                      <span className="size-8 animate-spin rounded-full border-2 border-[var(--pf-border-strong)] border-t-[var(--pf-accent)]" />
                      <p className="text-[12px] font-semibold">Preparing your photo…</p>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid aspect-[4/5] place-items-center rounded-[14px] border border-dashed border-[var(--pf-border-strong)] bg-[var(--pf-surface-muted)] px-6 text-center">
                <p className="max-w-[240px] text-[11px] leading-relaxed text-[var(--pf-text-tertiary)]">
                  Your formatted {profile.label.toLowerCase()} photo appears here, at exactly{' '}
                  {profile.output.widthPx}×{profile.output.heightPx} pixels and 300 DPI.
                </p>
              </div>
            )}

            {generation ? (
              <div className="mt-3">
                <StatusBadge status={generation.status} />
              </div>
            ) : null}

            {formError ? (
              <p
                role="alert"
                className="mt-3 rounded-[11px] bg-[var(--pf-error-bg)] p-3 text-[12px] text-[var(--pf-error)]"
              >
                {formError}
              </p>
            ) : null}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              block
              className="mt-4"
              loading={create.isPending}
            >
              {mode === 'local' ? 'Format photo' : 'Generate photo'}
            </Button>
          </Card>

          {/* ------------------------------------------------- requirements */}
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <PanelTitle className="mb-0">{profile.label} requirements</PanelTitle>
              <Badge variant="neutral">Checked {profile.retrievedOn}</Badge>
            </div>

            <ul className="flex flex-col gap-2">
              {profile.requirements.map((requirement) => (
                <li key={requirement} className="flex items-start gap-2 text-[12px] leading-relaxed">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--pf-success)]" />
                  <span className="text-[var(--pf-text-secondary)]">{requirement}</span>
                </li>
              ))}
            </ul>

            <p className="mt-4 text-[10px] text-[var(--pf-text-tertiary)]">
              {profile.sourceVersionLabel}
            </p>

            <ul className="mt-3 flex flex-col gap-1.5">
              {profile.officialLinks.map((link) => (
                <li key={link.url}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 text-[11px] text-[var(--pf-accent)] hover:underline"
                  >
                    {link.label}
                    <ExternalLink className="size-3" />
                  </a>
                </li>
              ))}
            </ul>

            <p className="mt-4 rounded-[11px] bg-[var(--pf-warning-bg)] p-3 text-[10px] leading-relaxed text-[var(--pf-warning)]">
              {profile.disclaimer}
            </p>
          </Card>

          <p className="text-center text-[11px] text-[var(--pf-text-tertiary)]">
            Every document photo is also saved to{' '}
            <Link href="/history" className="underline">
              History
            </Link>
            .
          </p>
        </div>
      </div>
    </form>
  );
}

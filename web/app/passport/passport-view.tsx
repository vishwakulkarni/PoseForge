'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Check,
  Download,
  ExternalLink,
  Printer,
  ShieldCheck,
} from 'lucide-react';
import {
  useCreatePassportPhoto,
  useEngines,
  useGenerationPolling,
  usePassportConfig,
  useUsageEstimate,
} from '@/lib/api/hooks';
import type { DocumentProfile, Generation } from '@/lib/api/types';
import { formatCompact, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Segmented } from '@/components/ui/segmented';
import { Dropzone, DropzoneBusy, useImagePreview } from '@/components/ui/dropzone';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';

const COUNTRY_OPTIONS = [
  { value: 'US', label: 'United States' },
  { value: 'IN', label: 'India' },
] as const;

const MODE_OPTIONS = [
  { value: 'local' as const, label: 'Local format', title: 'Crop and resize only — no AI' },
  { value: 'ai' as const, label: 'AI assist', title: 'Regenerate the portrait with an engine' },
];

type CountryCode = (typeof COUNTRY_OPTIONS)[number]['value'];
type ProcessingMode = (typeof MODE_OPTIONS)[number]['value'];

function friendlyDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function usageLabel(usage?: {
  source?: string;
  totalTokens?: number;
  estimatedCostUsd?: number | null;
  actualCostUsd?: number | null;
}) {
  if (!usage) return 'Estimate unavailable';
  if (usage.source === 'local') return 'Local formatting · 0 tokens · $0.00';
  const cost = usage.actualCostUsd ?? usage.estimatedCostUsd;
  return `${formatCompact(usage.totalTokens ?? 0)} tokens · ${cost == null ? 'plan-dependent cost' : formatCurrency(cost)}`;
}

function GuidelineDates({ profile }: { profile: DocumentProfile }) {
  return (
    <dl className="my-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
      <div className="rounded-[11px] bg-[var(--pf-surface-muted)] p-3">
        <dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--pf-text-tertiary)]">
          Guidelines checked
        </dt>
        <dd className="mt-1 text-[11px] font-bold text-[var(--pf-text-secondary)]">
          {friendlyDate(profile.retrievedOn)}
        </dd>
      </div>
      <div className="rounded-[11px] bg-[var(--pf-surface-muted)] p-3">
        <dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--pf-text-tertiary)]">
          Official source update
        </dt>
        <dd className="mt-1 text-[11px] font-bold text-[var(--pf-text-secondary)]">
          {profile.sourceUpdatedOn
            ? friendlyDate(profile.sourceUpdatedOn)
            : profile.sourceVersionLabel}
        </dd>
      </div>
    </dl>
  );
}

function ResultPackage({ generation, profile }: { generation: Generation; profile: DocumentProfile }) {
  if (!generation.outputUrl) return null;

  return (
    <Card className="xl:col-span-2" padding="lg">
      <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_230px_230px]">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--pf-accent)]">
            Document package ready
          </span>
          <h2 className="mt-2 font-[var(--font-display)] text-3xl font-extrabold tracking-[-0.04em]">
            Your {profile.label} files
          </h2>
          <p className="mt-3 max-w-xl text-[12px] leading-relaxed text-[var(--pf-text-secondary)]">
            Review face position, background, dimensions, and file size against the official source before submitting or printing.
          </p>
          <p className="mt-4 text-[11px] font-bold text-[var(--pf-accent)]">
            {usageLabel(generation.usage)}
          </p>
        </div>

        <div>
          <div className="relative aspect-square overflow-hidden rounded-[14px] border border-[var(--pf-border)] bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element -- local storage mount */}
            <img
              src={generation.outputUrl}
              alt="Prepared application photo"
              className="size-full object-contain"
            />
            <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-[9px] font-bold text-white">
              {profile.output.widthPx}×{profile.output.heightPx}px ·{' '}
              {profile.output.format.toUpperCase()}
            </span>
          </div>
          <Button asChild variant="primary" size="sm" block className="mt-2">
            <a href={generation.outputUrl} download>
              <Download /> Download application photo
            </a>
          </Button>
        </div>

        {profile.output.sheet && generation.documentSheetUrl ? (
          <div>
            <div className="relative aspect-[2/3] max-h-[230px] overflow-hidden rounded-[14px] border border-[var(--pf-border)] bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element -- local storage mount */}
              <img
                src={generation.documentSheetUrl}
                alt="Document photos on a 4 by 6 print sheet"
                className="size-full object-contain"
              />
              <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-[9px] font-bold text-white">
                4×6 inch print sheet
              </span>
            </div>
            <Button asChild variant="secondary" size="sm" block className="mt-2">
              <a href={generation.documentSheetUrl} download>
                <Printer /> Download print sheet
              </a>
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export function PassportView() {
  const { data: config, isLoading, error, refetch } = usePassportConfig();
  const { data: engineData } = useEngines();
  const create = useCreatePassportPhoto();
  const preview = useImagePreview();
  const toast = useToast();

  const [countryCode, setCountryCode] = React.useState<CountryCode>('US');
  const [profileId, setProfileId] = React.useState('us-passport');
  const [mode, setMode] = React.useState<ProcessingMode>('local');
  const [engineChoice, setEngineChoice] = React.useState<string | null>(null);
  const [resultId, setResultId] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);

  const { data: generation } = useGenerationPolling(resultId);
  const engines = engineData?.engines ?? [];
  const engine = engineChoice ?? engineData?.defaultEngine ?? '';
  const selectedEngine = engines.find((item) => item.key === engine);
  const countryProfiles =
    config?.profiles.filter((item) => item.countryCode === countryCode) ?? [];
  const profile = countryProfiles.find((item) => item.id === profileId) ?? countryProfiles[0];

  const { data: estimate } = useUsageEstimate(
    {
      engine,
      quality: 'high',
      aspectRatio: '1:1',
      subjects: 1,
      variants: 1,
      promptChars: 1000,
    },
    mode === 'ai' && Boolean(engine),
  );

  const chooseCountry = (next: CountryCode) => {
    setCountryCode(next);
    const first = config?.profiles.find((item) => item.countryCode === next);
    if (first) setProfileId(first.id);
    setResultId(null);
    setFormError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (!preview.file) return setFormError('Add a recent portrait first.');
    if (!profile) return setFormError('Choose a document type.');
    if (mode === 'ai' && !selectedEngine?.ready) {
      return setFormError('Choose an available generation engine.');
    }

    const form = new FormData();
    form.append('characterPhoto', preview.file);
    form.append('profileId', profile.id);
    form.append('processingMode', mode);
    if (mode === 'ai') form.append('engine', engine);

    try {
      const result = await create.mutateAsync(form);
      setResultId(result.id);
      toast.success(
        result.status === 'completed' ? 'Photo package ready' : 'Photo queued',
        result.status === 'completed'
          ? 'Review and download your files below.'
          : 'Your selected engine is preparing the photo.',
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
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <Skeleton className="h-[720px] w-full rounded-[22px]" />
        <Skeleton className="h-[620px] w-full rounded-[22px]" />
      </div>
    );
  }

  const canSubmit = Boolean(
    preview.file &&
      !preview.pending &&
      !create.isPending &&
      (mode === 'local' || selectedEngine?.ready),
  );
  const liveUsage =
    mode === 'local' ? 'Local formatting · 0 tokens · $0.00' : usageLabel(estimate);

  return (
    <form
      onSubmit={submit}
      noValidate
      className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]"
    >
      <Card padding="lg">
        <div className="grid gap-4 border-b border-[var(--pf-border)] pb-5 sm:grid-cols-2">
          <Field label="Country">
            <Segmented
              aria-label="Document country"
              value={countryCode}
              onValueChange={chooseCountry}
              options={COUNTRY_OPTIONS}
              size="sm"
              className="w-full justify-center"
            />
          </Field>
          <Field label="Document" htmlFor="document-profile">
            <Select
              value={profile.id}
              onValueChange={(value) => {
                setProfileId(value);
                setResultId(null);
                setFormError(null);
              }}
            >
              <SelectTrigger id="document-profile">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {countryProfiles.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-extrabold text-[var(--pf-accent)]">01</span>
            <h2 className="mt-1 text-lg font-extrabold">Add a recent portrait</h2>
          </div>
          <Badge variant="ok">Local by default</Badge>
        </div>

        <Field
          label="Portrait photo"
          help="Choose a clear, recent, front-facing image. PoseForge accepts JPG, PNG, HEIC, and HEIF up to 25 MB."
          error={preview.error ?? undefined}
          className="mt-4"
        >
          <div className="relative">
            <Dropzone
              previewUrl={preview.url}
              onFileSelected={preview.select}
              onClear={preview.clear}
              disabled={preview.pending}
              label="Choose a clear, front-facing photo"
              aria-label="Portrait photo for document"
              className="min-h-[390px] bg-[linear-gradient(var(--pf-border)_1px,transparent_1px),linear-gradient(90deg,var(--pf-border)_1px,transparent_1px)] bg-[size:34px_34px] [&_img]:object-contain"
            />
            {preview.pending ? <DropzoneBusy /> : null}
            <div
              aria-hidden
              style={{ aspectRatio: `${profile.output.widthPx}/${profile.output.heightPx}` }}
              className="pointer-events-none absolute left-1/2 top-1/2 z-[5] w-[min(48%,210px)] -translate-x-1/2 -translate-y-1/2 opacity-45"
            >
              <span className="absolute inset-[4%] rounded-[50%] border border-dashed border-[var(--pf-accent)]" />
              <span className="absolute bottom-[4%] left-[24%] right-[24%] h-[32%] rounded-t-[50%] border border-b-0 border-dashed border-[var(--pf-accent)]" />
            </div>
          </div>
        </Field>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {['Face camera directly', 'Use even natural light', 'Avoid filters and retouching'].map(
            (tip) => (
              <span
                key={tip}
                className="rounded-[10px] bg-[var(--pf-surface-muted)] px-3 py-2 text-center text-[10px] text-[var(--pf-text-tertiary)]"
              >
                <Check className="mr-1 inline size-3 text-[var(--pf-success)]" /> {tip}
              </span>
            ),
          )}
        </div>

        <div className="mt-5 grid gap-3 border-t border-[var(--pf-border)] pt-5 md:grid-cols-3">
          <Field label="Processing">
            <Segmented
              aria-label="Processing mode"
              value={mode}
              onValueChange={setMode}
              options={MODE_OPTIONS}
              size="sm"
            />
          </Field>
          {mode === 'ai' ? (
            <Field label="AI engine" htmlFor="passport-engine">
              <Select value={engine} onValueChange={setEngineChoice}>
                <SelectTrigger id="passport-engine">
                  <SelectValue placeholder="Select an engine" />
                </SelectTrigger>
                <SelectContent>
                  {engines.map((item) => (
                    <SelectItem key={item.key} value={item.key} disabled={!item.ready}>
                      {item.label}
                      {item.ready ? '' : ' — unavailable'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <div />
          )}
          <div className="rounded-[12px] border border-[var(--pf-border)] bg-[var(--pf-surface-muted)] p-3">
            <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--pf-text-tertiary)]">
              Usage
            </span>
            <strong className="mt-1 block text-[11px]">{liveUsage}</strong>
          </div>
        </div>

        {mode === 'ai' ? (
          <p className="mt-3 flex items-start gap-2 rounded-[11px] bg-[var(--pf-warning-bg)] p-3 text-[11px] leading-relaxed text-[var(--pf-warning)]">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            Experimental: some authorities require an unaltered photograph. Local formatting is
            the safer default; verify the linked official guidance before using AI assistance.
          </p>
        ) : null}

        {formError ? (
          <p
            role="alert"
            className="mt-3 rounded-[11px] bg-[var(--pf-error-bg)] p-3 text-[12px] text-[var(--pf-error)]"
          >
            {formError}
          </p>
        ) : null}

        {generation && !generation.outputUrl ? (
          <div
            className="mt-3 flex items-center justify-between gap-3 rounded-[11px] bg-[var(--pf-surface-muted)] p-3"
            role="status"
            aria-live="polite"
          >
            <div>
              <StatusBadge status={generation.status} />
              <p className="mt-1 text-[10px] text-[var(--pf-text-secondary)]">
                {generation.status === 'failed'
                  ? generation.errorMessage
                  : 'Preparing exact output dimensions…'}
              </p>
            </div>
            {generation.status !== 'failed' ? (
              <span className="size-5 animate-spin rounded-full border-2 border-[var(--pf-border-strong)] border-t-[var(--pf-accent)]" />
            ) : null}
          </div>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          className="mt-4 justify-between"
          loading={create.isPending}
          disabled={!canSubmit}
        >
          Prepare {profile.label} photo <span aria-hidden>→</span>
        </Button>
      </Card>

      <Card padding="lg" className="xl:sticky xl:top-[calc(var(--pf-nav-h)+12px)]">
        <div className="flex items-center gap-3 border-b border-[var(--pf-border)] pb-4">
          <span
            className={`grid size-11 place-items-center rounded-[13px] text-[10px] font-extrabold text-white ${
              countryCode === 'IN'
                ? 'bg-[linear-gradient(180deg,#ff8f1c_0_33%,#fff_33%_66%,#168747_66%)] !text-[#18396d]'
                : 'bg-[linear-gradient(180deg,#284985_0_48%,#b3263e_48%)]'
            }`}
          >
            {countryCode}
          </span>
          <div>
            <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--pf-text-tertiary)]">
              Official requirements
            </span>
            <h2 className="mt-1 text-lg font-extrabold">{profile.label} checklist</h2>
          </div>
        </div>

        <GuidelineDates profile={profile} />

        <ul className="flex flex-col gap-2.5">
          {profile.requirements.map((requirement) => (
            <li
              key={requirement}
              className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--pf-text-secondary)]"
            >
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[var(--pf-accent)]" />
              <span>{requirement}</span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[10px] text-[var(--pf-text-tertiary)]">
          {profile.sourceVersionLabel}
        </p>

        <ul className="mt-4 flex flex-col gap-2 border-t border-[var(--pf-border)] pt-4">
          {profile.officialLinks.map((link) => (
            <li key={link.url}>
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center justify-between rounded-[10px] bg-[var(--pf-accent-soft)] px-3 py-2.5 text-[10px] font-bold text-[var(--pf-accent)] hover:underline"
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

      {generation?.outputUrl ? <ResultPackage generation={generation} profile={profile} /> : null}

      <div className="flex flex-col justify-between gap-3 rounded-[14px] border border-[color-mix(in_srgb,var(--pf-warning)_35%,var(--pf-border))] bg-[var(--pf-warning-bg)] px-4 py-3 text-[10px] leading-relaxed text-[var(--pf-text-secondary)] sm:flex-row sm:items-center xl:col-span-2">
        <p>
          <strong className="text-[var(--pf-warning)]">Important:</strong> Government acceptance
          is not guaranteed. Always compare the final file with the linked authority guidance.
        </p>
        <p className="shrink-0">
          Saved automatically to{' '}
          <Link href="/history" className="font-bold underline">
            History
          </Link>
        </p>
      </div>
    </form>
  );
}

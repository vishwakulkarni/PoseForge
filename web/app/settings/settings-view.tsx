'use client';

import * as React from 'react';
import { CheckCircle2, ExternalLink, Lock, PlugZap, Save, XCircle } from 'lucide-react';
import {
  useEngines,
  useHiggsfieldStatus,
  useSettings,
  useUpdateSettings,
  useVerifyHiggsfield,
} from '@/lib/api/hooks';
import type { Credential, HiggsfieldVerifyResult, Settings } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, PanelTitle } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';

const ENGINE_SETUP_LINKS: Record<string, { label: string; href: string }> = {
  codex: { label: 'Install Codex CLI', href: 'https://github.com/openai/codex' },
  antigravity: { label: 'Install Antigravity CLI', href: 'https://antigravity.google/docs/cli/install/' },
};

const ENGINE_SETUP_STEPS: Record<string, string[]> = {
  codex: [
    'Install the Codex CLI, then run `codex login` and complete the sign-in flow.',
    'Open a new terminal (or run `source ~/.zshrc` / `source ~/.bashrc`) so the CLI is on PATH.',
    'Restart the PoseForge server (`npm run dev` or `npm start`).',
  ],
  antigravity: [
    'Install the Antigravity CLI, then run `agy install` to add it to your shell PATH.',
    'Run `agy` once to complete interactive sign-in.',
    'Open a new terminal (or run `source ~/.zshrc` / `source ~/.bashrc`) so the CLI is on PATH.',
    'Restart the PoseForge server (`npm run dev` or `npm start`).',
  ],
};

function EngineSetupHelp({ engineKey }: { engineKey: string }) {
  const steps = ENGINE_SETUP_STEPS[engineKey];
  const link = ENGINE_SETUP_LINKS[engineKey];
  if (!steps) return null;
  return (
    <div className="mt-1.5 border-t border-[var(--pf-border)] pt-1.5">
      <ol className="list-decimal space-y-0.5 pl-3.5 text-[10px] leading-relaxed text-[var(--pf-text-tertiary)]">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {link ? (
        <a
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-[10px] font-medium text-[var(--pf-accent)] underline underline-offset-2"
        >
          {link.label}
        </a>
      ) : null}
    </div>
  );
}

function CredentialState({ credential }: { credential: Credential }) {
  if (credential.source === 'environment') {
    return (
      <Badge variant="ok">
        <Lock className="size-3" />
        Set by environment
      </Badge>
    );
  }
  return credential.configured ? (
    <Badge variant="ok" dot>
      Saved · {credential.masked}
    </Badge>
  ) : (
    <Badge variant="neutral" dot>
      Not configured
    </Badge>
  );
}

/**
 * Write-only credential input.
 *
 * The API never returns the full key, so the field starts empty and an empty
 * submit means "leave unchanged" rather than "clear it". That distinction was
 * ambiguous in the legacy form, where saving any setting re-sent a blank key.
 */
function CredentialField({
  id,
  label,
  credential,
  value,
  onChange,
}: {
  id: string;
  label: string;
  credential: Credential;
  value: string;
  onChange: (value: string) => void;
}) {
  const locked = credential.source === 'environment';
  return (
    <Field
      label={label}
      htmlFor={id}
      labelAside={<CredentialState credential={credential} />}
      help={
        locked
          ? 'This key comes from the environment and cannot be changed here.'
          : 'Leave blank to keep the saved key. Type a new value to replace it.'
      }
    >
      <Input
        id={id}
        type="password"
        autoComplete="off"
        disabled={locked}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={locked ? 'Managed by environment' : credential.configured ? '••••••••' : 'Paste key'}
      />
    </Field>
  );
}

const NO_CREDENTIAL: Credential = { configured: false, masked: null, source: null };

const usd = (amount: number) => `$${amount.toFixed(2)}`;

/**
 * Higgsfield connection and spend controls. Higgsfield has no balance API, so
 * balance and top-ups stay on its console; PoseForge prices each request
 * before submitting it and enforces these limits on that price.
 */
function HiggsfieldCard({
  settings,
  draft,
  set,
}: {
  settings: Settings;
  draft: Record<string, string>;
  set: (key: string, value: string) => void;
}) {
  const { data: status, isError: statusFailed } = useHiggsfieldStatus();
  const verify = useVerifyHiggsfield();
  const [result, setResult] = React.useState<HiggsfieldVerifyResult | null>(null);
  const typed = draft.higgsfieldApiKey?.trim() ?? '';
  // An API server older than this page omits the field; treat it as unset
  // rather than crashing the whole Settings page.
  const credential = settings.higgsfieldApiKey ?? NO_CREDENTIAL;
  const canVerify = Boolean(typed) || credential.configured;

  const test = async () => {
    setResult(null);
    try {
      setResult(await verify.mutateAsync(typed || undefined));
    } catch (cause) {
      setResult({ ok: false, message: cause instanceof Error ? cause.message : 'Could not reach PoseForge.' });
    }
  };

  const limit = (key: 'higgsfieldMaxUsdPerGeneration' | 'higgsfieldMonthlyBudgetUsd') =>
    draft[key] ?? (settings[key] == null ? '' : String(settings[key]));
  const budget = status?.limits.monthlyBudgetUsd;

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-2">
        <PanelTitle className="mb-0">Higgsfield</PanelTitle>
        {status ? (
          <Badge variant={status.ready ? 'ok' : 'neutral'} dot>
            {status.ready ? 'Ready' : 'Not configured'}
          </Badge>
        ) : null}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <CredentialField
            id="higgsfield-key"
            label="API key (key-id:key-secret)"
            credential={credential}
            value={draft.higgsfieldApiKey ?? ''}
            onChange={(next) => {
              setResult(null);
              set('higgsfieldApiKey', next);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={test} loading={verify.isPending} disabled={!canVerify}>
              <PlugZap />
              Test connection
            </Button>
            {result ? (
              <span
                role="status"
                className={`text-[11px] ${result.ok ? 'text-[var(--pf-success)]' : 'text-[var(--pf-error)]'}`}
              >
                {result.message}
              </span>
            ) : null}
          </div>
          <p className="text-[11px] leading-relaxed text-[var(--pf-text-tertiary)]">
            Create a key at the Higgsfield console. Powers the Higgsfield image and video generators in Advanced
            Studio. Testing uses Higgsfield&apos;s free price estimate and spends no credits.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Max per generation (USD)"
              htmlFor="higgsfield-max-per-generation"
              help="Refuse any single run priced above this."
            >
              <Input
                id="higgsfield-max-per-generation"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                placeholder="No limit"
                value={limit('higgsfieldMaxUsdPerGeneration')}
                onChange={(event) => set('higgsfieldMaxUsdPerGeneration', event.target.value)}
              />
            </Field>
            <Field
              label="Monthly budget (USD)"
              htmlFor="higgsfield-monthly-budget"
              help="Refuse runs that would exceed it this month."
            >
              <Input
                id="higgsfield-monthly-budget"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                placeholder="No limit"
                value={limit('higgsfieldMonthlyBudgetUsd')}
                onChange={(event) => set('higgsfieldMonthlyBudgetUsd', event.target.value)}
              />
            </Field>
          </div>
          <div className="rounded-[12px] border border-[var(--pf-border)] bg-[var(--pf-surface-muted)] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--pf-text-tertiary)]">
              This month in PoseForge
            </p>
            <p className="mt-1 text-[18px] font-bold tabular-nums">
              {status ? usd(status.monthToDate.usd) : '—'}
              {budget != null ? (
                <span className="text-[12px] font-medium text-[var(--pf-text-tertiary)]"> of {usd(budget)}</span>
              ) : null}
            </p>
            <p className="text-[11px] text-[var(--pf-text-tertiary)]">
              {status
                ? `${status.monthToDate.credits.toLocaleString()} credits · ${status.monthToDate.runs} ${status.monthToDate.runs === 1 ? 'run' : 'runs'}`
                : statusFailed
                  ? 'Spend unavailable — restart the PoseForge server to load the Higgsfield API.'
                  : 'Loading…'}
            </p>
            <p className="mt-2 text-[10px] leading-relaxed text-[var(--pf-text-tertiary)]">
              Estimated from Higgsfield quotes. Failed, moderated and canceled runs are not charged and count as $0.
              Your balance and invoices live on the console.
            </p>
            <a
              href={status?.consoleUrl ?? 'https://console.higgsfield.ai'}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--pf-accent)] underline underline-offset-2"
            >
              Balance and top-up
              <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function SettingsView() {
  const { data: settings, isLoading, error, refetch } = useSettings();
  const { data: engineData } = useEngines();
  const update = useUpdateSettings();
  const toast = useToast();

  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const set = (key: string, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    // Only send fields the user actually touched. Blank credential inputs are
    // dropped so an untouched key is never overwritten with "".
    const patch: Record<string, string> = {};
    for (const [key, value] of Object.entries(draft)) {
      if (key.endsWith('ApiKey') && !value.trim()) continue;
      patch[key] = value;
    }

    if (!Object.keys(patch).length) {
      toast.toast({ title: 'Nothing to save', description: 'No settings were changed.' });
      return;
    }

    try {
      await update.mutateAsync(patch);
      setDraft({});
      toast.success('Settings saved');
    } catch (cause) {
      toast.error('Could not save settings', cause instanceof Error ? cause.message : undefined);
    }
  };

  if (error) {
    return (
      <ErrorState
        title="Could not load settings"
        message={error instanceof Error ? error.message : undefined}
        onRetry={() => refetch()}
      />
    );
  }

  if (isLoading || !settings) {
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-64 w-full rounded-[22px]" />
        ))}
      </div>
    );
  }

  const engines = engineData?.engines ?? [];
  const geminiModels = engines.find((e) => e.key === 'gemini')?.models ?? [];
  const antigravityModels = engines.find((e) => e.key === 'antigravity')?.models ?? [];
  const comfyModels = engines.find((e) => e.key === 'comfy')?.models ?? [];

  const value = (key: string, fallback: string) => draft[key] ?? fallback;
  const dirty = Object.keys(draft).length > 0;

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      {/* -------------------------------------------------- engine status */}
      <Card>
        <PanelTitle>Engine status</PanelTitle>
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {engines.map((engine) => (
            <li
              key={engine.key}
              className="flex items-start gap-2.5 rounded-[12px] border border-[var(--pf-border)] bg-[var(--pf-surface-muted)] p-3"
            >
              {engine.ready ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--pf-success)]" />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0 text-[var(--pf-text-tertiary)]" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold">{engine.label}</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--pf-text-tertiary)]">
                  {engine.ready ? 'Ready' : (engine.reason ?? 'Not configured')}
                </p>
                {!engine.ready ? <EngineSetupHelp engineKey={engine.key} /> : null}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* ----------------------------------------------- default engine */}
        <Card>
          <PanelTitle>Default engine</PanelTitle>
          <Field
            label="Used when Studio opens"
            htmlFor="default-engine"
            help="You can still switch engines per generation."
          >
            <Select
              value={value('defaultEngine', settings.defaultEngine)}
              onValueChange={(next) => set('defaultEngine', next)}
            >
              <SelectTrigger id="default-engine">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {engines.map((engine) => (
                  <SelectItem key={engine.key} value={engine.key}>
                    {engine.label}
                    {engine.ready ? '' : ' (not ready)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </Card>

        {/* ---------------------------------------------------- API keys */}
        <Card>
          <PanelTitle>Provider credentials</PanelTitle>
          <div className="flex flex-col gap-4">
            <CredentialField
              id="openai-key"
              label="OpenAI API key"
              credential={settings.openaiApiKey}
              value={draft.openaiApiKey ?? ''}
              onChange={(next) => set('openaiApiKey', next)}
            />
            <CredentialField
              id="gemini-key"
              label="Gemini API key"
              credential={settings.geminiApiKey}
              value={draft.geminiApiKey ?? ''}
              onChange={(next) => set('geminiApiKey', next)}
            />
            <CredentialField
              id="replicate-key"
              label="Replicate API token"
              credential={settings.replicateApiKey}
              value={draft.replicateApiKey ?? ''}
              onChange={(next) => set('replicateApiKey', next)}
            />
            <CredentialField
              id="fal-key"
              label="fal.ai API key"
              credential={settings.falApiKey}
              value={draft.falApiKey ?? ''}
              onChange={(next) => set('falApiKey', next)}
            />
          </div>
        </Card>

        {/* ----------------------------------------------------- models */}
        <Card>
          <PanelTitle>Model selection</PanelTitle>
          <div className="flex flex-col gap-4">
            {geminiModels.length ? (
              <Field label="Gemini image model" htmlFor="gemini-model">
                <Select
                  value={value('geminiModel', settings.geminiModel)}
                  onValueChange={(next) => set('geminiModel', next)}
                >
                  <SelectTrigger id="gemini-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {geminiModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}

            {antigravityModels.length ? (
              <Field label="Antigravity model" htmlFor="antigravity-model">
                <Select
                  value={value('antigravityModel', settings.antigravityModel)}
                  onValueChange={(next) => set('antigravityModel', next)}
                >
                  <SelectTrigger id="antigravity-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {antigravityModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
          </div>
        </Card>

        {/* ---------------------------------------------------- ComfyUI */}
        <Card>
          <PanelTitle>ComfyUI</PanelTitle>
          <div className="flex flex-col gap-4">
            <Field
              label="Endpoint"
              htmlFor="comfy-endpoint"
              help="Local addresses only unless COMFYUI_ALLOW_REMOTE is set."
            >
              <Input
                id="comfy-endpoint"
                value={value('comfyEndpoint', settings.comfyEndpoint)}
                onChange={(event) => set('comfyEndpoint', event.target.value)}
                placeholder="http://127.0.0.1:8188"
              />
            </Field>

            {comfyModels.length ? (
              <Field label="Model profile" htmlFor="comfy-model">
                <Select
                  value={value('comfyModel', settings.comfyModel)}
                  onValueChange={(next) => set('comfyModel', next)}
                >
                  <SelectTrigger id="comfy-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {comfyModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}

            <Field
              label="Workflow JSON"
              htmlFor="comfy-workflow"
              labelAside={
                settings.comfyWorkflow.configured ? (
                  <Badge variant="ok" dot>
                    {settings.comfyWorkflow.source === 'environment'
                      ? 'From environment'
                      : `${settings.comfyWorkflow.bytes ?? 0} bytes saved`}
                  </Badge>
                ) : (
                  <Badge variant="neutral" dot>
                    None
                  </Badge>
                )
              }
              help="Validated against the adapter contract on save. Max 900 KB."
            >
              <Textarea
                id="comfy-workflow"
                value={draft.comfyWorkflow ?? ''}
                onChange={(event) => set('comfyWorkflow', event.target.value)}
                placeholder={
                  settings.comfyWorkflow.configured
                    ? 'A workflow is saved. Paste new JSON to replace it.'
                    : 'Paste the exported ComfyUI API workflow JSON'
                }
                spellCheck={false}
                className="font-mono text-[11px]"
                disabled={settings.comfyWorkflow.source === 'environment'}
              />
            </Field>
          </div>
        </Card>
      </div>

      <HiggsfieldCard settings={settings} draft={draft} set={set} />

      {/* Sticky action bar so Save is always reachable on long forms. */}
      <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-[16px] border border-[var(--pf-border)] bg-[color-mix(in_srgb,var(--pf-surface)_92%,transparent)] p-3 backdrop-blur-[12px] shadow-[var(--pf-shadow-md)]">
        <span className="text-[12px] text-[var(--pf-text-secondary)]" aria-live="polite">
          {dirty ? 'You have unsaved changes.' : 'All changes saved.'}
        </span>
        <Button type="submit" variant="primary" loading={update.isPending} disabled={!dirty}>
          <Save />
          Save settings
        </Button>
      </div>
    </form>
  );
}

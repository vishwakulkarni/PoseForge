'use client';

import * as React from 'react';
import { CheckCircle2, Lock, Save, XCircle } from 'lucide-react';
import { useEngines, useSettings, useUpdateSettings } from '@/lib/api/hooks';
import type { Credential } from '@/lib/api/types';
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
              <div className="min-w-0">
                <p className="text-[12px] font-bold">{engine.label}</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--pf-text-tertiary)]">
                  {engine.ready ? 'Ready' : (engine.reason ?? 'Not configured')}
                </p>
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

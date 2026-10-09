'use client';

import * as React from 'react';
import { ChevronDown, ExternalLink, KeyRound, Lock, PlugZap, Save, Server, Terminal, type LucideIcon } from 'lucide-react';
import {
  useCreateDreaminaCanvas,
  useDreaminaLogin,
  useDreaminaLoginWait,
  useDreaminaStatus,
  useEngines,
  useHiggsfieldStatus,
  useSettings,
  useUpdateSettings,
  useVerifyHiggsfield,
} from '@/lib/api/hooks';
import type { Credential, DreaminaLogin, DreaminaStatus, HiggsfieldVerifyResult, Settings } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
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
import { cn } from '@/lib/utils';

interface SetupGuideContent {
  steps: React.ReactNode[];
  links: { label: string; href: string }[];
}

const code = (text: string) => <code className="rounded bg-[var(--pf-surface)] px-1 font-mono text-[10.5px]">{text}</code>;

const SETUP_GUIDES: Record<string, SetupGuideContent> = {
  codex: {
    steps: [
      <>Install the Codex CLI, then run {code('codex login')} and complete the sign-in flow.</>,
      <>Open a new terminal (or run {code('source ~/.zshrc')}) so the CLI is on PATH.</>,
      <>Restart the PoseForge server ({code('npm run dev')} or {code('npm start')}).</>,
    ],
    links: [{ label: 'Install Codex CLI', href: 'https://github.com/openai/codex' }],
  },
  antigravity: {
    steps: [
      <>Install the Antigravity CLI, then run {code('agy install')} to add it to your shell PATH.</>,
      <>Run {code('agy')} once to complete interactive sign-in.</>,
      <>Open a new terminal (or run {code('source ~/.zshrc')}) so the CLI is on PATH.</>,
      <>Restart the PoseForge server ({code('npm run dev')} or {code('npm start')}).</>,
    ],
    links: [{ label: 'Install Antigravity CLI', href: 'https://antigravity.google/docs/cli/install/' }],
  },
  dreamina: {
    steps: [
      <>Install the Dreamina Canvas CLI: {code('curl -fsSL https://dreamina.capcut.com/canvas-cli/install.sh | bash')}</>,
      <>Restart the PoseForge server so it finds {code('dreamina-canvas')} on PATH.</>,
      <>Click <strong>Sign in</strong> below and enter the code on Dreamina&apos;s page (or run {code('dreamina-canvas auth login')} in a terminal).</>,
      <>Click <strong>Create canvas</strong>. This makes the one canvas PoseForge runs on and spends no credits.</>,
      <>Set a credit limit per image and/or per video, then <strong>Save settings</strong>. Image and video models stay off until their limit is set.</>,
    ],
    links: [
      { label: 'Dreamina Canvas CLI', href: 'https://dreamina.capcut.com/canvas-cli' },
      { label: 'Dreamina', href: 'https://dreamina.capcut.com' },
    ],
  },
  higgsfield: {
    steps: [
      <>Sign in to the Higgsfield console and create an API key. Copy both the key ID and the secret.</>,
      <>Paste it below as {code('key-id:key-secret')}, or set {code('HF_CREDENTIALS')} in {code('.env.local')} and restart PoseForge.</>,
      <>Click <strong>Test connection</strong>. It uses a free price estimate and spends no credits.</>,
      <>Optionally set a max per generation and a monthly budget, then <strong>Save settings</strong>.</>,
    ],
    links: [
      { label: 'Higgsfield console', href: 'https://console.higgsfield.ai' },
      { label: 'API docs', href: 'https://docs.higgsfield.ai' },
    ],
  },
};

/** Numbered setup steps for a provider. Open while the provider is not ready,
 * collapsed (but still one click away) once it is. */
function SetupGuide({ provider, ready }: { provider: keyof typeof SETUP_GUIDES; ready: boolean | undefined }) {
  const guide = SETUP_GUIDES[provider];
  return (
    <details
      // Re-mount when readiness resolves so the default open state follows it.
      key={String(ready)}
      open={ready === false}
      className="group rounded-[12px] border border-[var(--pf-border)] bg-[var(--pf-surface-muted)] p-3"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-[var(--pf-text-tertiary)]">
        Setup guide
        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px] leading-relaxed text-[var(--pf-text-secondary)]">
        {guide.steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {guide.links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--pf-accent)] underline underline-offset-2"
          >
            {link.label}
            <ExternalLink className="size-3" />
          </a>
        ))}
      </div>
    </details>
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

function dreaminaReady(status: DreaminaStatus | undefined) {
  return Boolean(
    status?.installed &&
      status.loggedIn &&
      status.canvas &&
      (status.limits.creditCeiling != null || status.limits.imageCreditCeiling != null),
  );
}

/**
 * One group of providers that connect the same way (CLI sign-in, API key, or
 * local server), with a count of how many are ready.
 */
function SettingsSection({
  id,
  icon: Icon,
  title,
  description,
  ready,
  total,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  ready: number;
  total: number;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-6 flex-col gap-3 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--pf-border)] pb-3">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[var(--pf-accent-soft)] text-[var(--pf-accent)]">
            <Icon className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-[17px] font-bold">{title}</h2>
            <p className="mt-0.5 max-w-[68ch] text-[12px] leading-relaxed text-[var(--pf-text-secondary)]">{description}</p>
          </div>
        </div>
        <Badge variant={ready === total ? 'ok' : 'neutral'} dot>
          {ready} of {total} ready
        </Badge>
      </div>
      {children}
    </section>
  );
}

/** The header every provider card shares: name, what it powers, and status. */
function ProviderCard({
  title,
  description,
  ready,
  reason,
  className,
  children,
}: {
  title: string;
  description: React.ReactNode;
  /** Undefined while the status is still loading. */
  ready: boolean | undefined;
  reason?: string | null;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="text-[15px]">{title}</CardTitle>
          <CardDescription className="mt-0.5 text-[12px]">{description}</CardDescription>
        </div>
        {ready === undefined ? null : (
          <Badge variant={ready ? 'ok' : 'neutral'} dot className="shrink-0">
            {ready ? 'Ready' : 'Not ready'}
          </Badge>
        )}
      </div>
      {ready === false && reason ? (
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--pf-text-tertiary)]">{reason}</p>
      ) : null}
      {children ? <div className="mt-4 flex flex-col gap-4">{children}</div> : null}
    </Card>
  );
}

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
    <ProviderCard
      title="Higgsfield"
      description="Higgsfield image and video generators in Advanced Studio, with spend limits."
      ready={status?.ready}
    >
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
          <SetupGuide provider="higgsfield" ready={status?.ready} />
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
    </ProviderCard>
  );
}

/**
 * Dreamina Canvas CLI connection. Every PoseForge Dreamina image and video
 * runs on one dedicated canvas, created here on request. Dreamina prices each
 * run when it starts; the per-image or per-video limit is passed as the
 * credit ceiling, so anything priced above it is refused before it is charged.
 */
function DreaminaCard({
  settings,
  draft,
  set,
}: {
  settings: Settings;
  draft: Record<string, string>;
  set: (key: string, value: string) => void;
}) {
  const { data: status, isError: statusFailed, refetch } = useDreaminaStatus();
  const login = useDreaminaLogin();
  const loginWait = useDreaminaLoginWait();
  const createCanvas = useCreateDreaminaCanvas();
  const [challenge, setChallenge] = React.useState<Extract<DreaminaLogin, { status: 'pending' }> | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const waitForLogin = loginWait.mutateAsync;

  // Poll until the user finishes signing in on Dreamina's page.
  React.useEffect(() => {
    if (!challenge) return;
    const timer = window.setInterval(async () => {
      try {
        const next = await waitForLogin();
        if (next.status === 'signed-in') {
          setChallenge(null);
          setMessage('Signed in to Dreamina.');
          void refetch();
        }
      } catch (cause) {
        setChallenge(null);
        setMessage(cause instanceof Error ? cause.message : 'Sign-in failed.');
      }
    }, Math.max(challenge.pollSeconds ?? 5, 3) * 1000);
    return () => window.clearInterval(timer);
  }, [challenge, waitForLogin, refetch]);

  const startLogin = async () => {
    setMessage(null);
    try {
      const next = await login.mutateAsync();
      if (next.status === 'signed-in') setMessage('Already signed in to Dreamina.');
      else setChallenge(next);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not start Dreamina sign-in.');
    }
  };

  const makeCanvas = async () => {
    setMessage(null);
    try {
      await createCanvas.mutateAsync();
      setMessage('PoseForge canvas created.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not create the canvas.');
    }
  };

  const limit = (key: 'dreaminaCreditCeiling' | 'dreaminaImageCreditCeiling' | 'dreaminaMonthlyCreditBudget') =>
    draft[key] ?? (settings[key] == null ? '' : String(settings[key]));
  const budget = status?.limits.monthlyCreditBudget;

  return (
    <ProviderCard
      title="Dreamina"
      description="Seedream and GPT Image image models and Seedance 2.5, 2.0 and 2.0 Mini video models in Advanced Studio."
      ready={status ? dreaminaReady(status) : undefined}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-2 text-[12px]">
            <li className="flex items-center justify-between gap-2">
              <span>Canvas CLI</span>
              {status?.installed ? (
                <Badge variant="ok" dot>Installed{status.version ? ` · v${status.version}` : ''}</Badge>
              ) : (
                <Badge variant="neutral" dot>{status ? 'Not installed' : statusFailed ? 'Unavailable' : 'Checking…'}</Badge>
              )}
            </li>
            <li className="flex items-center justify-between gap-2">
              <span>Account</span>
              {status?.loggedIn ? (
                <Badge variant="ok" dot>
                  Signed in{status.membership?.isVip ? ` · ${status.membership.vipLevel ?? 'member'}` : ''}
                </Badge>
              ) : (
                <Button type="button" variant="secondary" size="sm" onClick={startLogin} loading={login.isPending} disabled={!status?.installed || Boolean(challenge)}>
                  Sign in
                </Button>
              )}
            </li>
            <li className="flex items-center justify-between gap-2">
              <span>PoseForge canvas</span>
              {status?.canvas ? (
                status.canvas.webUrl ? (
                  <a
                    href={status.canvas.webUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--pf-accent)] underline underline-offset-2"
                  >
                    Open in Dreamina
                    <ExternalLink className="size-3" />
                  </a>
                ) : (
                  <Badge variant="ok" dot>Linked</Badge>
                )
              ) : (
                <Button type="button" variant="secondary" size="sm" onClick={makeCanvas} loading={createCanvas.isPending} disabled={!status?.loggedIn}>
                  Create canvas
                </Button>
              )}
            </li>
          </ul>
          {challenge ? (
            <div role="status" className="rounded-[12px] border border-[var(--pf-border)] bg-[var(--pf-surface-muted)] p-3 text-[11px]">
              <p>
                Enter code <span className="font-mono font-bold">{challenge.userCode}</span> on Dreamina&apos;s sign-in page.
                This page updates when you finish.
              </p>
              {challenge.verificationUri ? (
                <a
                  href={challenge.verificationUri}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 font-medium text-[var(--pf-accent)] underline underline-offset-2"
                >
                  Open Dreamina sign-in
                  <ExternalLink className="size-3" />
                </a>
              ) : null}
            </div>
          ) : null}
          {message || status?.error ? (
            <span role="status" className="text-[11px] text-[var(--pf-text-secondary)]">{message ?? status?.error}</span>
          ) : null}
          <p className="text-[11px] leading-relaxed text-[var(--pf-text-tertiary)]">
            Every run uses one PoseForge canvas on your Dreamina account, so you can review results there too.
          </p>
          <SetupGuide provider="dreamina" ready={status ? dreaminaReady(status) : undefined} />
        </div>

        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label="Credit limit per image"
              htmlFor="dreamina-image-credit-ceiling"
              help="Required for image models."
            >
              <Input
                id="dreamina-image-credit-ceiling"
                type="number"
                min={0}
                step="1"
                inputMode="numeric"
                placeholder="Not set"
                value={limit('dreaminaImageCreditCeiling')}
                onChange={(event) => set('dreaminaImageCreditCeiling', event.target.value)}
              />
            </Field>
            <Field
              label="Credit limit per video"
              htmlFor="dreamina-credit-ceiling"
              help="Required for video models."
            >
              <Input
                id="dreamina-credit-ceiling"
                type="number"
                min={0}
                step="1"
                inputMode="numeric"
                placeholder="Not set"
                value={limit('dreaminaCreditCeiling')}
                onChange={(event) => set('dreaminaCreditCeiling', event.target.value)}
              />
            </Field>
            <Field
              label="Monthly credit budget"
              htmlFor="dreamina-monthly-budget"
              help="Refuse runs that could exceed it this month."
            >
              <Input
                id="dreamina-monthly-budget"
                type="number"
                min={0}
                step="1"
                inputMode="numeric"
                placeholder="No limit"
                value={limit('dreaminaMonthlyCreditBudget')}
                onChange={(event) => set('dreaminaMonthlyCreditBudget', event.target.value)}
              />
            </Field>
          </div>
          <div className="rounded-[12px] border border-[var(--pf-border)] bg-[var(--pf-surface-muted)] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--pf-text-tertiary)]">
              This month in PoseForge
            </p>
            <p className="mt-1 text-[18px] font-bold tabular-nums">
              {status ? `${status.monthToDate.credits.toLocaleString()} credits` : '—'}
              {budget != null ? (
                <span className="text-[12px] font-medium text-[var(--pf-text-tertiary)]"> of {budget.toLocaleString()}</span>
              ) : null}
            </p>
            <p className="text-[11px] text-[var(--pf-text-tertiary)]">
              {status
                ? `${status.monthToDate.runs} ${status.monthToDate.runs === 1 ? 'run' : 'runs'}`
                : statusFailed
                  ? 'Unavailable — restart the PoseForge server to load the Dreamina API.'
                  : 'Loading…'}
            </p>
            <p className="mt-2 text-[10px] leading-relaxed text-[var(--pf-text-tertiary)]">
              Dreamina refuses any run priced above its limit, before charging. This total uses the credits Dreamina
              reports for each run; a run still in progress counts at its limit. Your balance lives on Dreamina.
            </p>
          </div>
        </div>
      </div>
    </ProviderCard>
  );
}

export function SettingsView() {
  const { data: settings, isLoading, error, refetch } = useSettings();
  const { data: engineData } = useEngines();
  const { data: dreaminaStatus } = useDreaminaStatus();
  const { data: higgsfieldStatus } = useHiggsfieldStatus();
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

  const engine = (key: string) => engines.find((item) => item.key === key);
  const readyCount = (flags: Array<boolean | undefined>) => flags.filter(Boolean).length;
  const cliReady = [engine('codex')?.ready, engine('antigravity')?.ready, dreaminaReady(dreaminaStatus)];
  const apiReady = [engine('openai')?.ready, engine('gemini')?.ready, engine('replicate')?.ready, engine('fal')?.ready, higgsfieldStatus?.ready];
  const localReady = [engine('comfy')?.ready];
  const sections: Array<{ id: string; icon: LucideIcon; title: string; ready: number; total: number }> = [
    { id: 'cli-tools', icon: Terminal, title: 'CLI tools', ready: readyCount(cliReady), total: cliReady.length },
    { id: 'api-keys', icon: KeyRound, title: 'API keys', ready: readyCount(apiReady), total: apiReady.length },
    { id: 'local', icon: Server, title: 'Local', ready: readyCount(localReady), total: localReady.length },
  ];

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      {/* ------------------------------------------------ default + jump bar */}
      <Card>
        <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_1fr] md:items-end">
          <Field
            label="Default engine"
            htmlFor="default-engine"
            help="Used when Studio opens. You can still switch per generation."
          >
            <Select
              value={value('defaultEngine', settings.defaultEngine)}
              onValueChange={(next) => set('defaultEngine', next)}
            >
              <SelectTrigger id="default-engine">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {engines.map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.label}
                    {item.ready ? '' : ' (not ready)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <nav aria-label="Settings sections" className="flex flex-wrap gap-2 md:justify-end">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--pf-border)] bg-[var(--pf-surface-muted)] px-3 py-1.5 text-[12px] font-semibold transition-colors hover:border-[var(--pf-border-strong)]"
              >
                <section.icon className="size-3.5 text-[var(--pf-accent)]" aria-hidden />
                {section.title}
                <span
                  className={cn(
                    'tabular-nums text-[11px]',
                    section.ready === section.total ? 'text-[var(--pf-success)]' : 'text-[var(--pf-text-tertiary)]',
                  )}
                >
                  {section.ready}/{section.total}
                </span>
              </a>
            ))}
          </nav>
        </div>
      </Card>

      {/* ------------------------------------------------------ CLI tools */}
      <SettingsSection
        id="cli-tools"
        icon={Terminal}
        title="CLI tools"
        description="Command-line tools installed on this computer. They use their own sign-in, so PoseForge stores no keys for them."
        ready={sections[0].ready}
        total={sections[0].total}
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <ProviderCard
            title="Codex"
            description="Image generation through the Codex CLI and your OpenAI sign-in."
            ready={engine('codex')?.ready}
            reason={engine('codex')?.reason}
          >
            {engine('codex') ? <SetupGuide provider="codex" ready={engine('codex')?.ready} /> : null}
          </ProviderCard>
          <ProviderCard
            title="Antigravity"
            description="Image generation through the Antigravity CLI and your Google sign-in."
            ready={engine('antigravity')?.ready}
            reason={engine('antigravity')?.reason}
          >
            {antigravityModels.length ? (
              <Field label="Model" htmlFor="antigravity-model">
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
            {engine('antigravity') ? <SetupGuide provider="antigravity" ready={engine('antigravity')?.ready} /> : null}
          </ProviderCard>
        </div>
        <DreaminaCard settings={settings} draft={draft} set={set} />
      </SettingsSection>

      {/* ------------------------------------------------------- API keys */}
      <SettingsSection
        id="api-keys"
        icon={KeyRound}
        title="API keys"
        description="Hosted providers billed to your account with each of them. Keys are kept in PoseForge's local database and never sent back to the browser; a key set by an environment variable wins and is read-only here."
        ready={sections[1].ready}
        total={sections[1].total}
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <ProviderCard
            title="OpenAI"
            description="OpenAI image models, billed per request."
            ready={engine('openai')?.ready}
          >
            <CredentialField
              id="openai-key"
              label="API key"
              credential={settings.openaiApiKey}
              value={draft.openaiApiKey ?? ''}
              onChange={(next) => set('openaiApiKey', next)}
            />
          </ProviderCard>
          <ProviderCard
            title="Gemini"
            description="Google Gemini image models, billed per request."
            ready={engine('gemini')?.ready}
          >
            <CredentialField
              id="gemini-key"
              label="API key"
              credential={settings.geminiApiKey}
              value={draft.geminiApiKey ?? ''}
              onChange={(next) => set('geminiApiKey', next)}
            />
            {geminiModels.length ? (
              <Field label="Image model" htmlFor="gemini-model">
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
          </ProviderCard>
          <ProviderCard
            title="Replicate"
            description="Models hosted on Replicate."
            ready={engine('replicate')?.ready}
          >
            <CredentialField
              id="replicate-key"
              label="API token"
              credential={settings.replicateApiKey}
              value={draft.replicateApiKey ?? ''}
              onChange={(next) => set('replicateApiKey', next)}
            />
          </ProviderCard>
          <ProviderCard
            title="fal.ai"
            description="Image and video models hosted on fal.ai."
            ready={engine('fal')?.ready}
          >
            <CredentialField
              id="fal-key"
              label="API key"
              credential={settings.falApiKey}
              value={draft.falApiKey ?? ''}
              onChange={(next) => set('falApiKey', next)}
            />
          </ProviderCard>
        </div>
        <HiggsfieldCard settings={settings} draft={draft} set={set} />
      </SettingsSection>

      {/* ---------------------------------------------------------- Local */}
      <SettingsSection
        id="local"
        icon={Server}
        title="Local"
        description="Generation on hardware you run yourself. Nothing is billed."
        ready={sections[2].ready}
        total={sections[2].total}
      >
        <ProviderCard
          title="ComfyUI"
          description="Your own ComfyUI server running a saved workflow."
          ready={engine('comfy')?.ready}
          reason={engine('comfy')?.reason}
        >
          <div className="grid gap-4 lg:grid-cols-2">
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
            </div>

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
        </ProviderCard>
      </SettingsSection>

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

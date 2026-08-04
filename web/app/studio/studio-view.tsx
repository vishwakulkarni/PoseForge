'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Download, Images, Plus, Sparkles, Wand2 } from 'lucide-react';
import {
  useCharacters,
  useCreateGeneration,
  useEngines,
  useGenerationPolling,
  usePoseReferences,
  usePresets,
  useRecipes,
  useUsageEstimate,
} from '@/lib/api/hooks';
import { api } from '@/lib/api/client';
import {
  buildGenerationForm,
  initialStudioState,
  studioReducer,
  validateStudioState,
} from '@/lib/studio/reducer';
import { MAX_CHARACTERS, type AdvancedSettings } from '@/lib/studio/settings';
import { cn, formatCompact, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Card, PanelTitle } from '@/components/ui/card';
import { Field, Textarea } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Segmented } from '@/components/ui/segmented';
import { Dropzone } from '@/components/ui/dropzone';
import { Skeleton } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { CharacterSlotCard } from '@/components/studio/character-slot';
import { AdvancedPanel } from '@/components/studio/advanced-panel';

const MODE_OPTIONS = [
  { value: 'normal' as const, label: 'Normal' },
  { value: 'advanced' as const, label: 'Advanced' },
];

/** Result tile for one generation id, polling until it settles. */
function ResultTile({ id, active, onSelect }: { id: string; active: boolean; onSelect: () => void }) {
  const { data } = useGenerationPolling(id);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'relative aspect-square w-16 shrink-0 overflow-hidden rounded-[10px] border-2 transition-colors',
        active ? 'border-[var(--pf-accent)]' : 'border-transparent hover:border-[var(--pf-border-strong)]',
      )}
    >
      {data?.outputUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- local storage mount
        <img src={data.outputUrl} alt="" className="size-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center bg-[var(--pf-surface-muted)] text-[9px] text-[var(--pf-text-tertiary)]">
          {data?.status === 'failed' ? 'Failed' : '…'}
        </span>
      )}
    </button>
  );
}

function ResultPanel({ ids, activeIndex, onSelectIndex }: {
  ids: string[];
  activeIndex: number;
  onSelectIndex: (index: number) => void;
}) {
  const activeId = ids[activeIndex] ?? null;
  const { data: generation } = useGenerationPolling(activeId);

  if (!ids.length) {
    return (
      <div className="grid aspect-square place-items-center rounded-[16px] border border-dashed border-[var(--pf-border-strong)] bg-[var(--pf-surface-muted)] px-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <Sparkles className="size-6 text-[var(--pf-text-tertiary)]" />
          <p className="text-[13px] font-bold">Your result appears here</p>
          <p className="max-w-[260px] text-[11px] leading-relaxed text-[var(--pf-text-tertiary)]">
            Add a person, choose a pose, then forge. Usage and cost are shown before you commit.
          </p>
        </div>
      </div>
    );
  }

  const usage = generation?.usage ?? {};

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-[16px] border border-[var(--pf-border)] bg-[var(--pf-surface-muted)]">
        {generation?.outputUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local storage mount
          <img
            src={generation.outputUrl}
            alt="Generated result"
            className="aspect-square w-full object-contain"
          />
        ) : (
          <div
            className="grid aspect-square place-items-center px-6 text-center"
            role="status"
            aria-live="polite"
          >
            <div className="flex flex-col items-center gap-3">
              {generation?.status === 'failed' ? (
                <>
                  <p className="text-[13px] font-bold text-[var(--pf-error)]">Generation failed</p>
                  <p className="max-w-[280px] text-[11px] leading-relaxed text-[var(--pf-text-secondary)]">
                    {generation.errorMessage ?? 'The engine did not return an image.'}
                  </p>
                </>
              ) : (
                <>
                  <span className="size-8 animate-spin rounded-full border-2 border-[var(--pf-border-strong)] border-t-[var(--pf-accent)]" />
                  <p className="text-[12px] font-semibold">
                    {generation?.status === 'running' ? 'Generating…' : 'Queued…'}
                  </p>
                  <p className="text-[10px] text-[var(--pf-text-tertiary)]">
                    This can take 30 seconds to a few minutes.
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {generation ? (
          <div className="absolute left-3 top-3">
            <StatusBadge status={generation.status} />
          </div>
        ) : null}
      </div>

      {ids.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Generated variants">
          {ids.map((id, index) => (
            <ResultTile
              key={id}
              id={id}
              active={index === activeIndex}
              onSelect={() => onSelectIndex(index)}
            />
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{formatCompact(usage.totalTokens)} tokens</Badge>
          <Badge variant="outline">
            {formatCurrency(usage.actualCostUsd ?? usage.estimatedCostUsd)}
            {usage.source === 'actual' ? '' : ' est.'}
          </Badge>
        </div>
        {generation?.outputUrl ? (
          <Button asChild size="sm" variant="primary">
            <a href={generation.outputUrl} download>
              <Download />
              Download
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function StudioView() {
  const searchParams = useSearchParams();
  const toast = useToast();

  const [state, dispatch] = React.useReducer(
    studioReducer,
    undefined,
    () =>
      initialStudioState({
        mode: searchParams.get('mode') === 'advanced' ? 'advanced' : 'normal',
      }),
  );
  const [submitErrors, setSubmitErrors] = React.useState<string[]>([]);

  const { data: characters } = useCharacters();
  const { data: engineData } = useEngines();
  const { data: backgrounds } = usePresets('background');
  const { data: styles } = usePresets('style');
  const { data: poses } = usePoseReferences();
  const { data: recipes } = useRecipes();
  const createGeneration = useCreateGeneration();

  // Adopt the server's default engine once, without clobbering a user choice.
  React.useEffect(() => {
    if (!state.engine && engineData?.defaultEngine) {
      dispatch({ type: 'setEngine', engine: engineData.defaultEngine });
    }
  }, [engineData?.defaultEngine, state.engine]);

  // Deep links from Characters ("Use") and Poses ("Use in Studio").
  const appliedDeepLink = React.useRef(false);
  React.useEffect(() => {
    if (appliedDeepLink.current) return;

    const characterId = searchParams.get('characterId');
    const poseReferenceId = searchParams.get('poseReferenceId');
    if (!characterId && !poseReferenceId) return;
    // Wait until the lists are loaded so we can resolve names and previews.
    if (characterId && !characters) return;
    if (poseReferenceId && !poses) return;

    if (characterId) {
      const character = characters?.find((c) => c.id === characterId);
      if (character) {
        dispatch({
          type: 'setSlotCharacter',
          key: state.slots[0].key,
          characterId: character.id,
          name: character.name,
          previewUrl: character.primaryPhotoUrl,
        });
      }
    }

    if (poseReferenceId) {
      const pose = poses?.find((p) => p.id === poseReferenceId);
      if (pose) {
        dispatch({ type: 'setPoseReference', id: pose.id, previewUrl: pose.imageUrl });
      }
    }

    appliedDeepLink.current = true;
  }, [searchParams, characters, poses, state.slots]);

  const filledSlots = state.slots.filter((slot) => slot.characterId || slot.file).length;

  const { data: estimate } = useUsageEstimate(
    {
      engine: state.engine,
      quality: state.advanced.output.quality,
      aspectRatio: state.advanced.output.aspectRatio,
      subjects: Math.max(1, filledSlots),
      variants: state.advanced.output.variantCount,
      promptChars: 600 + state.instructions.length,
    },
    Boolean(state.engine),
  );

  const patchAdvanced = React.useCallback(
    (updater: (current: AdvancedSettings) => AdvancedSettings) =>
      dispatch({ type: 'patchAdvanced', patch: updater }),
    [],
  );

  const selectPoseFile = async (file: File) => {
    try {
      const previewUrl = await api.media.previewUrl(file);
      dispatch({ type: 'setPoseFile', file, previewUrl });
    } catch (cause) {
      toast.error('Could not preview that pose', cause instanceof Error ? cause.message : undefined);
    }
  };

  const selectSlotFile = async (key: string, file: File) => {
    try {
      const previewUrl = await api.media.previewUrl(file);
      dispatch({ type: 'setSlotFile', key, file, previewUrl });
    } catch (cause) {
      toast.error('Could not preview that photo', cause instanceof Error ? cause.message : undefined);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validation = validateStudioState(state);
    setSubmitErrors(validation.errors);
    if (!validation.valid) return;

    try {
      const result = await createGeneration.mutateAsync(buildGenerationForm(state));
      dispatch({ type: 'setActiveGenerations', ids: result.generationIds });
      toast.success(
        result.generationIds.length > 1
          ? `${result.generationIds.length} variants queued`
          : 'Generation queued',
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not start the generation.';
      setSubmitErrors([message]);
      toast.error('Generation rejected', message);
    }
  };

  const engines = engineData?.engines ?? [];
  const selectedEngine = engines.find((engine) => engine.key === state.engine);

  return (
    <form onSubmit={submit} noValidate className="grid gap-3 xl:grid-cols-[1.35fr_1fr]">
      {/* ------------------------------------------------------ left column */}
      <div className="flex flex-col gap-3">
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <PanelTitle className="mb-0">Mode</PanelTitle>
            <Segmented
              aria-label="Studio mode"
              value={state.mode}
              onValueChange={(mode) => dispatch({ type: 'setMode', mode })}
              options={MODE_OPTIONS}
              size="sm"
            />
          </div>
          <p className="text-[12px] leading-relaxed text-[var(--pf-text-secondary)]">
            {state.mode === 'normal'
              ? 'Normal mode keeps it to the essentials and always produces one image.'
              : 'Advanced mode unlocks camera, lighting, composition, finish and multi-variant controls.'}
          </p>
        </Card>

        {/* ------------------------------------------------------- people */}
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <PanelTitle className="mb-0">People</PanelTitle>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => dispatch({ type: 'addSlot' })}
              disabled={state.slots.length >= MAX_CHARACTERS}
            >
              <Plus />
              Add person
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            {state.slots.map((slot, index) => (
              <CharacterSlotCard
                key={slot.key}
                slot={slot}
                position={index + 1}
                characters={characters ?? []}
                removable={state.slots.length > 1}
                onSelectCharacter={(character) =>
                  dispatch({
                    type: 'setSlotCharacter',
                    key: slot.key,
                    characterId: character.id,
                    name: character.name,
                    previewUrl: character.primaryPhotoUrl,
                  })
                }
                onSelectFile={(file) => void selectSlotFile(slot.key, file)}
                onClear={() => dispatch({ type: 'clearSlot', key: slot.key })}
                onRemove={() => dispatch({ type: 'removeSlot', key: slot.key })}
              />
            ))}
          </div>
        </Card>

        {/* --------------------------------------------------------- pose */}
        <Card>
          <PanelTitle>Pose</PanelTitle>
          <div className="grid gap-4 sm:grid-cols-[1fr_1.2fr]">
            <Dropzone
              previewUrl={state.posePreviewUrl}
              onFileSelected={(file) => void selectPoseFile(file)}
              onClear={() => dispatch({ type: 'clearPose' })}
              label="Upload a pose"
              aria-label="Pose reference photo"
            />

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-[var(--pf-text-secondary)]">
                  Or pick from the library
                </span>
                <Button asChild size="sm" variant="ghost">
                  <Link href="/poses">
                    <Images />
                    Browse
                  </Link>
                </Button>
              </div>

              {poses ? (
                <ul className="grid max-h-[180px] grid-cols-4 gap-2 overflow-y-auto pr-1">
                  {poses.slice(0, 24).map((pose) => (
                    <li key={pose.id}>
                      <button
                        type="button"
                        onClick={() =>
                          dispatch({
                            type: 'setPoseReference',
                            id: pose.id,
                            previewUrl: pose.imageUrl,
                          })
                        }
                        aria-pressed={state.poseReferenceId === pose.id}
                        className={cn(
                          'block aspect-[4/5] w-full overflow-hidden rounded-[10px] border-2 transition-colors',
                          state.poseReferenceId === pose.id
                            ? 'border-[var(--pf-accent)]'
                            : 'border-transparent hover:border-[var(--pf-border-strong)]',
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- mixed local and remote URLs */}
                        <img
                          src={pose.imageUrl}
                          alt={pose.title ?? 'Pose reference'}
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <Skeleton key={index} className="aspect-[4/5] w-full rounded-[10px]" />
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* ------------------------------------------------------ direction */}
        <Card>
          <PanelTitle>Direction</PanelTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Background preset" htmlFor="background-preset">
              <Select
                value={state.backgroundPresetId ?? 'none'}
                onValueChange={(next) =>
                  dispatch({
                    type: 'setPreset',
                    kind: 'background',
                    id: next === 'none' ? null : next,
                  })
                }
              >
                <SelectTrigger id="background-preset">
                  <SelectValue placeholder="No preset" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No preset</SelectItem>
                  {(backgrounds ?? []).map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Style preset" htmlFor="style-preset">
              <Select
                value={state.stylePresetId ?? 'none'}
                onValueChange={(next) =>
                  dispatch({ type: 'setPreset', kind: 'style', id: next === 'none' ? null : next })
                }
              >
                <SelectTrigger id="style-preset">
                  <SelectValue placeholder="No preset" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No preset</SelectItem>
                  {(styles ?? []).map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="mt-4">
            <Field
              label="Extra instructions"
              htmlFor="instructions"
              labelAside={`${state.instructions.length}/600`}
              help="Anything the presets do not cover."
            >
              <Textarea
                id="instructions"
                maxLength={600}
                value={state.instructions}
                onChange={(event) =>
                  dispatch({ type: 'setInstructions', value: event.target.value })
                }
                placeholder="Warm evening light, shot on a rooftop, subject looking off-camera"
              />
            </Field>
          </div>
        </Card>

        {/* ------------------------------------------------ advanced panel */}
        {state.mode === 'advanced' ? (
          <Card>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <PanelTitle className="mb-0">Advanced controls</PanelTitle>
              {recipes?.length ? (
                <Select
                  onValueChange={(id) => {
                    const recipe = recipes.find((item) => item.id === id);
                    if (recipe) {
                      dispatch({
                        type: 'applyRecipe',
                        settings: recipe.settings as unknown as AdvancedSettings,
                      });
                      toast.success('Recipe applied', recipe.name);
                    }
                  }}
                >
                  <SelectTrigger className="w-[200px]" aria-label="Apply a saved recipe">
                    <SelectValue placeholder="Apply a recipe" />
                  </SelectTrigger>
                  <SelectContent>
                    {recipes.map((recipe) => (
                      <SelectItem key={recipe.id} value={recipe.id}>
                        {recipe.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>

            <AdvancedPanel
              settings={state.advanced}
              patch={patchAdvanced}
              poseIsUpload={Boolean(state.poseFile)}
            />
          </Card>
        ) : null}
      </div>

      {/* ----------------------------------------------------- right column */}
      <div className="flex flex-col gap-3">
        <div className="xl:sticky xl:top-[calc(var(--pf-nav-h)+12px)] flex flex-col gap-3">
          <Card>
            <PanelTitle>Result</PanelTitle>
            <ResultPanel
              ids={state.activeGenerationIds}
              activeIndex={state.activeResultIndex}
              onSelectIndex={(index) => dispatch({ type: 'setActiveResultIndex', index })}
            />
          </Card>

          <Card>
            <PanelTitle>Engine</PanelTitle>
            <Select
              value={state.engine}
              onValueChange={(engine) => dispatch({ type: 'setEngine', engine })}
            >
              <SelectTrigger aria-label="Generation engine">
                <SelectValue placeholder="Select an engine" />
              </SelectTrigger>
              <SelectContent>
                {engines.map((engine) => (
                  <SelectItem key={engine.key} value={engine.key} disabled={!engine.ready}>
                    {engine.label}
                    {engine.ready ? '' : ' — not ready'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedEngine && !selectedEngine.ready ? (
              <p className="mt-2 rounded-[11px] bg-[var(--pf-warning-bg)] p-3 text-[11px] leading-relaxed text-[var(--pf-warning)]">
                {selectedEngine.reason ?? 'This engine is not ready.'}{' '}
                <Link href="/settings" className="underline">
                  Open settings
                </Link>
              </p>
            ) : null}

            {estimate ? (
              <dl className="mt-4 flex flex-col gap-2 text-[12px]">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[var(--pf-text-tertiary)]">Estimated tokens</dt>
                  <dd className="pf-numeric font-semibold">
                    {formatCompact(estimate.totalTokens)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[var(--pf-text-tertiary)]">Estimated cost</dt>
                  <dd className="pf-numeric font-semibold text-[var(--pf-accent)]">
                    {formatCurrency(estimate.estimatedCostUsd)}
                  </dd>
                </div>
                {estimate.pricingNote ? (
                  <p className="mt-1 text-[10px] leading-relaxed text-[var(--pf-text-tertiary)]">
                    {estimate.pricingNote}
                  </p>
                ) : null}
              </dl>
            ) : null}
          </Card>

          {submitErrors.length ? (
            <div
              role="alert"
              className="rounded-[16px] bg-[var(--pf-error-bg)] p-4 text-[12px] text-[var(--pf-error)]"
            >
              <p className="font-bold">Fix these before generating:</p>
              <ul className="mt-1.5 list-disc pl-4">
                {submitErrors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            block
            loading={createGeneration.isPending}
          >
            <Wand2 />
            {state.mode === 'advanced' && state.advanced.output.variantCount > 1
              ? `Forge ${state.advanced.output.variantCount} variants`
              : 'Forge image'}
          </Button>
        </div>
      </div>
    </form>
  );
}

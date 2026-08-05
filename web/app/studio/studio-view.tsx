'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import {
  useCharacters,
  useCreateCharacter,
  useCreateGeneration,
  useCreateRecipe,
  useEngines,
  useGenerationsPolling,
  usePoseReferences,
  usePresets,
  useRecipes,
  useUsageEstimate,
} from '@/lib/api/hooks';
import { api } from '@/lib/api/client';
import type { CharacterSummary, PoseReference } from '@/lib/api/types';
import {
  buildGenerationForm,
  initialStudioState,
  studioReducer,
  validateStudioState,
} from '@/lib/studio/reducer';
import { defaultAdvancedSettings, type AdvancedSettings } from '@/lib/studio/settings';
import { formatCompact, formatCurrency } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { SourcesPanel } from '@/components/studio/sources-panel';
import { CanvasPanel, type CanvasState } from '@/components/studio/canvas';
import { Inspector } from '@/components/studio/inspector';
import { GenerationDock } from '@/components/studio/dock';

const TIPS = [
  'Use a clear, front-facing identity photo for the strongest match.',
  'Pose references only contribute body language — never the face.',
  'Advanced mode adds camera, lighting and multi-variant control.',
];

function SaveRecipeDialog({
  open,
  onOpenChange,
  settings,
  characterCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AdvancedSettings;
  characterCount: number;
}) {
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const create = useCreateRecipe();
  const toast = useToast();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError('Give this recipe a name.');
    try {
      await create.mutateAsync({ name: trimmed, settings, characterCount });
      toast.success('Recipe saved', trimmed);
      onOpenChange(false);
      setName('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save that recipe.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save studio recipe</DialogTitle>
          <DialogDescription>
            Saves fidelity, camera, lighting, and output settings. Your source images are never
            included.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field label="Recipe name" htmlFor="recipe-name" error={error ?? undefined}>
            <Input
              id="recipe-name"
              value={name}
              maxLength={80}
              autoFocus
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Editorial portrait · soft window"
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={create.isPending}>
              Save recipe
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StudioView() {
  const searchParams = useSearchParams();
  const toast = useToast();

  const [state, dispatch] = React.useReducer(studioReducer, undefined, () =>
    initialStudioState({
      mode: searchParams.get('mode') === 'advanced' ? 'advanced' : 'normal',
    }),
  );
  const [errors, setErrors] = React.useState<string[]>([]);
  const [recipeOpen, setRecipeOpen] = React.useState(false);
  const [activeRecipeId, setActiveRecipeId] = React.useState('');

  const { data: characters } = useCharacters();
  const { data: engineData } = useEngines();
  const { data: backgrounds } = usePresets('background');
  const { data: styles } = usePresets('style');
  const { data: poses } = usePoseReferences();
  const { data: recipes } = useRecipes();
  const createGeneration = useCreateGeneration();
  const createCharacter = useCreateCharacter();

  const { generations, settled, completed, failed } = useGenerationsPolling(
    state.activeGenerationIds,
  );

  // Derived rather than synced through an effect: null engine means "use the
  // server default", which keeps working if that default changes.
  const engine = state.engine || engineData?.defaultEngine || '';
  const engines = React.useMemo(() => engineData?.engines ?? [], [engineData]);
  const selectedEngine = engines.find((item) => item.key === engine);

  /* ------------------------------------------------------- deep links */

  const appliedDeepLink = React.useRef(false);
  React.useEffect(() => {
    if (appliedDeepLink.current) return;
    const characterId = searchParams.get('characterId');
    const poseReferenceId = searchParams.get('poseReferenceId');
    if (!characterId && !poseReferenceId) return;
    if (characterId && !characters) return;
    if (poseReferenceId && !poses) return;

    if (characterId) {
      const character = characters?.find((item) => item.id === characterId);
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
      const pose = poses?.find((item) => item.id === poseReferenceId);
      if (pose) dispatch({ type: 'setPoseReference', id: pose.id, previewUrl: pose.imageUrl });
    }
    appliedDeepLink.current = true;
  }, [searchParams, characters, poses, state.slots]);

  /* --------------------------------------------------------- derived */

  const filledSlots = state.slots.filter((slot) => slot.characterId || slot.file);
  const hasPose = Boolean(state.poseFile || state.poseReferenceId);
  const allSlotsFilled = filledSlots.length === state.slots.length && filledSlots.length > 0;
  const collageNeedsUpload =
    state.mode === 'advanced' && state.advanced.poseCollage.enabled && !state.poseFile;

  const plannedOutputs =
    state.mode === 'advanced'
      ? state.advanced.poseCollage.enabled && state.poseFile
        ? state.advanced.poseCollage.count
        : state.advanced.output.variantCount
      : 1;

  const generating = createGeneration.isPending || (state.activeGenerationIds.length > 0 && !settled);

  const canGenerate =
    allSlotsFilled && hasPose && Boolean(selectedEngine?.ready) && !collageNeedsUpload && !generating;

  const { data: estimate } = useUsageEstimate(
    {
      engine,
      quality: state.advanced.output.quality,
      aspectRatio: state.advanced.output.aspectRatio,
      subjects: Math.max(1, filledSlots.length),
      variants: plannedOutputs,
      promptChars: 600 + state.instructions.length,
    },
    Boolean(engine),
  );

  const canvasStatus: CanvasState = generating
    ? 'running'
    : generations.some((item) => item.outputUrl)
      ? 'done'
      : canGenerate
        ? 'ready'
        : 'idle';

  const statusLabel = collageNeedsUpload && !generating ? 'Upload pose collage' : undefined;

  const patch = React.useCallback(
    (updater: (current: AdvancedSettings) => AdvancedSettings) =>
      dispatch({ type: 'patchAdvanced', patch: updater }),
    [],
  );

  /* --------------------------------------------------------- actions */

  const selectSlotFile = async (key: string, file: File) => {
    try {
      const previewUrl = await api.media.previewUrl(file);
      dispatch({ type: 'setSlotFile', key, file, previewUrl });
    } catch (cause) {
      toast.error('Could not preview that photo', cause instanceof Error ? cause.message : undefined);
    }
  };

  const selectPoseFile = async (file: File) => {
    try {
      const previewUrl = await api.media.previewUrl(file);
      dispatch({ type: 'setPoseFile', file, previewUrl });
    } catch (cause) {
      toast.error('Could not preview that pose', cause instanceof Error ? cause.message : undefined);
    }
  };

  const saveIdentity = async (key: string, name: string) => {
    const slot = state.slots.find((item) => item.key === key);
    if (!slot?.file) return;
    const form = new FormData();
    form.append('name', name);
    form.append('characterPhoto', slot.file);
    try {
      const saved = await createCharacter.mutateAsync(form);
      dispatch({
        type: 'setSlotCharacter',
        key,
        characterId: saved.id,
        name: saved.name,
        previewUrl: saved.primaryPhotoUrl,
      });
      toast.success('Identity saved', `${name} is now reusable across generations.`);
    } catch (cause) {
      toast.error('Could not save identity', cause instanceof Error ? cause.message : undefined);
    }
  };

  const applyRecipe = (id: string) => {
    setActiveRecipeId(id);
    if (!id) return;
    const recipe = recipes?.find((item) => item.id === id);
    if (!recipe) return;
    dispatch({ type: 'applyRecipe', settings: recipe.settings as unknown as AdvancedSettings });
    toast.success('Recipe applied', recipe.name);
  };

  const reset = () => {
    dispatch({
      type: 'patchAdvanced',
      patch: () => defaultAdvancedSettings(state.slots.length),
    });
    dispatch({ type: 'setInstructions', value: '' });
    dispatch({ type: 'setPreset', kind: 'background', id: null });
    dispatch({ type: 'setPreset', kind: 'style', id: null });
    setActiveRecipeId('');
    setErrors([]);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextState = { ...state, engine };
    const validation = validateStudioState(nextState);
    setErrors(validation.errors);
    if (!validation.valid) return;

    try {
      const result = await createGeneration.mutateAsync(buildGenerationForm(nextState));
      dispatch({ type: 'setActiveGenerations', ids: result.generationIds });
      toast.success(
        result.generationIds.length > 1
          ? `${result.generationIds.length} variants queued`
          : 'Generation queued',
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not start the generation.';
      setErrors([message]);
      toast.error('Generation rejected', message);
    }
  };

  /* ----------------------------------------------------- dock copy */

  const dockSummary = canGenerate
    ? `${filledSlots.length} subject${filledSlots.length === 1 ? '' : 's'} · ${plannedOutputs} output${plannedOutputs === 1 ? '' : 's'} · ${state.advanced.output.aspectRatio}`
    : collageNeedsUpload
      ? 'Upload a pose collage to continue'
      : 'Add sources to begin';

  const dockHint =
    selectedEngine && !selectedEngine.ready
      ? (selectedEngine.reason ?? 'This engine is not ready.')
      : engine === 'codex'
        ? 'Runs through the locally installed Codex CLI; the signed-in provider may process reference images.'
        : 'Your images stay on this machine unless the selected engine requires an API.';

  const dockUsage = estimate
    ? `Estimated usage: ${formatCompact(estimate.totalTokens)} tokens · ${
        estimate.estimatedCostUsd == null
          ? 'plan-dependent cost'
          : formatCurrency(estimate.estimatedCostUsd)
      }`
    : 'Usage estimate will appear here.';

  const dockStatus = errors.length
    ? errors[0]
    : state.activeGenerationIds.length
      ? `${completed + failed} of ${state.activeGenerationIds.length} variations finished${failed ? ` · ${failed} failed` : ''}.`
      : null;

  const capabilityNote =
    selectedEngine && filledSlots.length > 1
      ? 'Multiple identities are passed to the engine in order; some engines combine them into a reference montage.'
      : null;

  return (
    <form onSubmit={submit} noValidate>
      <div className="studio-shell">
        <div className="studio-workbench">
          <SourcesPanel
            mode={state.mode}
            slots={state.slots}
            characters={characters ?? []}
            poses={poses ?? []}
            poseReferenceId={state.poseReferenceId}
            posePreviewUrl={state.posePreviewUrl}
            poseIsUpload={Boolean(state.poseFile)}
            settings={state.advanced}
            patch={patch}
            onAddSlot={() => dispatch({ type: 'addSlot' })}
            onRemoveSlot={(key) => dispatch({ type: 'removeSlot', key })}
            onSelectCharacter={(key, character: CharacterSummary) =>
              dispatch({
                type: 'setSlotCharacter',
                key,
                characterId: character.id,
                name: character.name,
                previewUrl: character.primaryPhotoUrl,
              })
            }
            onSelectSlotFile={(key, file) => void selectSlotFile(key, file)}
            onSaveIdentity={saveIdentity}
            onSelectPoseFile={(file) => void selectPoseFile(file)}
            onSelectPoseReference={(pose: PoseReference) =>
              dispatch({ type: 'setPoseReference', id: pose.id, previewUrl: pose.imageUrl })
            }
            onClearPose={() => dispatch({ type: 'clearPose' })}
          />

          <CanvasPanel
            mode={state.mode}
            onModeChange={(mode) => dispatch({ type: 'setMode', mode })}
            aspectRatio={state.advanced.output.aspectRatio}
            status={canvasStatus}
            statusLabel={statusLabel}
            posePreviewUrl={state.posePreviewUrl}
            subjectPreviews={filledSlots
              .map((slot) => slot.previewUrl)
              .filter((url): url is string => Boolean(url))}
            subjectCount={filledSlots.length}
            hasPose={hasPose}
            generations={generations}
            activeIndex={state.activeResultIndex}
            onSelectVariant={(index) => dispatch({ type: 'setActiveResultIndex', index })}
            onRegenerate={() => void submit(new Event('submit') as unknown as React.FormEvent)}
            tip={TIPS[state.mode === 'advanced' ? 2 : filledSlots.length ? 1 : 0]}
          />

          <Inspector
            mode={state.mode}
            settings={state.advanced}
            patch={patch}
            slots={state.slots}
            backgrounds={backgrounds ?? []}
            styles={styles ?? []}
            backgroundPresetId={state.backgroundPresetId}
            stylePresetId={state.stylePresetId}
            onPresetChange={(kind, id) => dispatch({ type: 'setPreset', kind, id })}
            instructions={state.instructions}
            onInstructionsChange={(value) => dispatch({ type: 'setInstructions', value })}
            recipes={recipes ?? []}
            activeRecipeId={activeRecipeId}
            onApplyRecipe={applyRecipe}
            onSaveRecipe={() => setRecipeOpen(true)}
            onReset={reset}
            estimate={estimate}
            capabilityNote={capabilityNote}
          />
        </div>
      </div>

      <GenerationDock
        engines={engines}
        engine={engine}
        onEngineChange={(next) => dispatch({ type: 'setEngine', engine: next })}
        mode={state.mode}
        summary={dockSummary}
        hint={dockHint}
        usage={dockUsage}
        status={dockStatus}
        statusIsError={errors.length > 0}
        canGenerate={canGenerate}
        submitting={createGeneration.isPending}
      />

      <SaveRecipeDialog
        open={recipeOpen}
        onOpenChange={setRecipeOpen}
        settings={state.advanced}
        characterCount={Math.max(1, filledSlots.length)}
      />
    </form>
  );
}

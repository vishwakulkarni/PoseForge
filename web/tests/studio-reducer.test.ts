import { describe, expect, it } from 'vitest';
import {
  buildGenerationForm,
  initialStudioState,
  studioReducer,
  validateStudioState,
  type StudioState,
} from '@/lib/studio/reducer';
import { builtInRecipe, builtInRecipes, MAX_CHARACTERS, defaultAdvancedSettings } from '@/lib/studio/settings';

function file(name = 'photo.png') {
  return new File(['x'], name, { type: 'image/png' });
}

/** Applies a sequence of actions, mirroring how the UI dispatches them. */
function run(state: StudioState, ...actions: Parameters<typeof studioReducer>[1][]) {
  return actions.reduce(studioReducer, state);
}

describe('slot management', () => {
  it('starts with exactly one slot', () => {
    expect(initialStudioState().slots).toHaveLength(1);
  });

  it('adds slots up to the maximum and then stops', () => {
    let state = initialStudioState();
    for (let i = 0; i < 10; i += 1) state = studioReducer(state, { type: 'addSlot' });
    expect(state.slots).toHaveLength(MAX_CHARACTERS);
  });

  it('never removes the last slot', () => {
    const state = initialStudioState();
    const next = studioReducer(state, { type: 'removeSlot', key: state.slots[0].key });
    expect(next.slots).toHaveLength(1);
    expect(next).toBe(state);
  });

  it('keeps per-subject directions aligned when slots change', () => {
    let state = run(initialStudioState(), { type: 'addSlot' }, { type: 'addSlot' });
    expect(state.advanced.subjects).toHaveLength(3);

    state = studioReducer(state, {
      type: 'patchAdvanced',
      patch: (current) => ({
        ...current,
        subjects: current.subjects.map((s, i) => ({ ...s, direction: `person ${i + 1}` })),
      }),
    });

    state = studioReducer(state, { type: 'removeSlot', key: state.slots[2].key });

    expect(state.advanced.subjects).toHaveLength(2);
    // Text the user already typed for the remaining people survives.
    expect(state.advanced.subjects[0].direction).toBe('person 1');
    expect(state.advanced.subjects[1].direction).toBe('person 2');
  });

  it('makes a slot exclusively a saved character or an upload', () => {
    const state = initialStudioState();
    const key = state.slots[0].key;

    const withCharacter = studioReducer(state, {
      type: 'setSlotCharacter',
      key,
      characterId: 'char-1',
      name: 'Anika',
      previewUrl: '/storage/a.png',
    });
    expect(withCharacter.slots[0].characterId).toBe('char-1');
    expect(withCharacter.slots[0].file).toBeNull();

    const withFile = studioReducer(withCharacter, {
      type: 'setSlotFile',
      key,
      file: file(),
      previewUrl: 'blob:1',
    });
    // Uploading must clear the saved-character reference, not sit alongside it.
    expect(withFile.slots[0].characterId).toBeNull();
    expect(withFile.slots[0].file).toBeInstanceOf(File);
  });

  it('hydrates the character and pose selections owned by a Studio project', () => {
    const state = studioReducer(initialStudioState({ activeGenerationIds: ['old-run'] }), {
      type: 'hydrateProjectSources',
      characters: [{
        key: 'slot-project',
        characterId: 'char-project',
        name: 'Mira',
        previewUrl: '/storage/mira.png',
      }],
      pose: { id: 'pose-project', previewUrl: '/storage/pose.png' },
    });

    expect(state.slots).toEqual([expect.objectContaining({
      key: 'slot-project',
      characterId: 'char-project',
      name: 'Mira',
    })]);
    expect(state.poseReferenceId).toBe('pose-project');
    expect(state.posePreviewUrl).toBe('/storage/pose.png');
    expect(state.activeGenerationIds).toEqual([]);
  });

  it('refreshes metadata for selected saved characters without changing uploads', () => {
    let state = initialStudioState();
    const firstKey = state.slots[0].key;
    state = run(
      state,
      {
        type: 'setSlotCharacter',
        key: firstKey,
        characterId: 'char-1',
        name: 'Anika',
        previewUrl: '/storage/anika.png',
      },
      { type: 'addSlot' },
    );
    state = studioReducer(state, {
      type: 'setSlotFile',
      key: state.slots[1].key,
      file: file('upload.png'),
      previewUrl: 'blob:upload',
    });

    const synced = studioReducer(state, {
      type: 'syncSavedCharacters',
      characters: [{ id: 'char-1', name: 'Meera', primaryPhotoUrl: '/storage/meera.png' }],
    });

    expect(synced.slots[0]).toEqual(expect.objectContaining({
      characterId: 'char-1',
      name: 'Meera',
      previewUrl: '/storage/meera.png',
    }));
    expect(synced.slots[1]).toEqual(state.slots[1]);
  });
});

describe('pose selection', () => {
  it('treats upload and library reference as mutually exclusive', () => {
    let state = studioReducer(initialStudioState(), {
      type: 'setPoseFile',
      file: file('pose.png'),
      previewUrl: 'blob:pose',
    });
    expect(state.poseFile).toBeInstanceOf(File);
    expect(state.poseReferenceId).toBeNull();

    state = studioReducer(state, {
      type: 'setPoseReference',
      id: 'pose-1',
      previewUrl: '/storage/pose.png',
    });
    expect(state.poseReferenceId).toBe('pose-1');
    expect(state.poseFile).toBeNull();

    state = studioReducer(state, { type: 'clearPose' });
    expect(state.poseFile).toBeNull();
    expect(state.poseReferenceId).toBeNull();
  });
});

describe('mode switching', () => {
  it('forces a single variant and disables collage in normal mode', () => {
    let state = initialStudioState({ mode: 'advanced' });
    state = studioReducer(state, {
      type: 'patchAdvanced',
      patch: (current) => ({
        ...current,
        output: { ...current.output, variantCount: 4 },
        poseCollage: { ...current.poseCollage, enabled: true },
      }),
    });
    expect(state.advanced.output.variantCount).toBe(4);

    state = studioReducer(state, { type: 'setMode', mode: 'normal' });
    expect(state.advanced.output.variantCount).toBe(1);
    expect(state.advanced.poseCollage.enabled).toBe(false);
  });

  it('leaves advanced settings intact when entering advanced mode', () => {
    const state = run(
      initialStudioState(),
      {
        type: 'patchAdvanced',
        patch: (current) => ({ ...current, identityFidelity: 42 }),
      },
      { type: 'setMode', mode: 'advanced' },
    );
    expect(state.advanced.identityFidelity).toBe(42);
  });
});

describe('recipes', () => {
  it('provides built-in recipes with complete, subject-aware settings', () => {
    const recipes = builtInRecipes(2);
    expect(recipes).toHaveLength(8);

    const cinematic = builtInRecipe('builtin:cinematic-story', 2);
    expect(cinematic?.settings.subjects).toHaveLength(2);
    expect(cinematic?.settings.output.aspectRatio).toBe('9:16');
    expect(cinematic?.settings.lighting).toBe('dramatic');
  });

  it('resizes an applied recipe to the current people count', () => {
    let state = run(initialStudioState(), { type: 'addSlot' });
    const recipe = defaultAdvancedSettings(4);
    recipe.identityFidelity = 60;

    state = studioReducer(state, { type: 'applyRecipe', settings: recipe });

    expect(state.advanced.identityFidelity).toBe(60);
    // Recipe was built for 4 people but only 2 slots exist.
    expect(state.advanced.subjects).toHaveLength(2);
  });
});

describe('validation', () => {
  it('requires a person, a pose and an engine', () => {
    const result = validateStudioState(initialStudioState());
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(3);
  });

  it('passes once all three are provided', () => {
    const state = run(
      initialStudioState(),
      { type: 'setEngine', engine: 'codex' },
      { type: 'setPoseReference', id: 'pose-1', previewUrl: '/p.png' },
    );
    const withPerson = studioReducer(state, {
      type: 'setSlotCharacter',
      key: state.slots[0].key,
      characterId: 'char-1',
      name: 'A',
      previewUrl: '/a.png',
    });
    expect(validateStudioState(withPerson).valid).toBe(true);
  });

  it('rejects gaps in the people slots', () => {
    let state = run(initialStudioState(), { type: 'addSlot' }, { type: 'setEngine', engine: 'codex' });
    state = studioReducer(state, {
      type: 'setPoseReference',
      id: 'pose-1',
      previewUrl: '/p.png',
    });
    // Fill slot 2 but leave slot 1 empty.
    state = studioReducer(state, {
      type: 'setSlotCharacter',
      key: state.slots[1].key,
      characterId: 'char-2',
      name: 'B',
      previewUrl: '/b.png',
    });

    const result = validateStudioState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/in order/i);
  });
});

describe('buildGenerationForm', () => {
  function readyState() {
    let state = run(
      initialStudioState(),
      { type: 'setEngine', engine: 'gemini' },
      { type: 'addSlot' },
    );
    state = studioReducer(state, {
      type: 'setSlotCharacter',
      key: state.slots[0].key,
      characterId: 'char-1',
      name: 'A',
      previewUrl: '/a.png',
    });
    state = studioReducer(state, {
      type: 'setSlotFile',
      key: state.slots[1].key,
      file: file('b.png'),
      previewUrl: 'blob:b',
    });
    return studioReducer(state, {
      type: 'setPoseReference',
      id: 'pose-9',
      previewUrl: '/p.png',
    });
  }

  it('emits contiguous 1-based slot fields of the right kind', () => {
    const form = buildGenerationForm(readyState());
    expect(form.get('characterId_1')).toBe('char-1');
    expect(form.get('characterPhoto_2')).toBeInstanceOf(File);
    // A slot is never sent as both.
    expect(form.get('characterPhoto_1')).toBeNull();
    expect(form.get('characterId_2')).toBeNull();
  });

  it('renumbers slots after a removal so there is no gap', () => {
    let state = readyState();
    // Remove the first (saved-character) slot; the upload must become slot 1.
    state = studioReducer(state, { type: 'removeSlot', key: state.slots[0].key });

    const form = buildGenerationForm(state);
    expect(form.get('characterPhoto_1')).toBeInstanceOf(File);
    expect(form.get('characterId_1')).toBeNull();
    expect(form.get('characterPhoto_2')).toBeNull();
  });

  it('sends exactly one pose source', () => {
    const referenceForm = buildGenerationForm(readyState());
    expect(referenceForm.get('poseReferenceId')).toBe('pose-9');
    expect(referenceForm.get('posePhoto')).toBeNull();

    const uploadState = studioReducer(readyState(), {
      type: 'setPoseFile',
      file: file('pose.png'),
      previewUrl: 'blob:pose',
    });
    const uploadForm = buildGenerationForm(uploadState);
    expect(uploadForm.get('posePhoto')).toBeInstanceOf(File);
    expect(uploadForm.get('poseReferenceId')).toBeNull();
  });

  it('serializes advanced settings as JSON the server can parse', () => {
    const form = buildGenerationForm(readyState());
    const raw = form.get('advancedSettings');
    expect(typeof raw).toBe('string');
    const parsed = JSON.parse(raw as string);
    expect(parsed.output.aspectRatio).toBe('1:1');
    expect(parsed.subjects).toHaveLength(2);
  });

  it('only sends collage fields for an uploaded pose in advanced mode', () => {
    let state = studioReducer(readyState(), { type: 'setMode', mode: 'advanced' });
    state = studioReducer(state, {
      type: 'patchAdvanced',
      patch: (current) => ({
        ...current,
        poseCollage: { enabled: true, count: 3, layout: '2x2' },
      }),
    });

    // Still a library reference — collage needs an uploaded sheet.
    expect(buildGenerationForm(state).get('poseCollageEnabled')).toBeNull();

    const uploaded = studioReducer(state, {
      type: 'setPoseFile',
      file: file('sheet.png'),
      previewUrl: 'blob:sheet',
    });
    const form = buildGenerationForm(uploaded);
    expect(form.get('poseCollageEnabled')).toBe('true');
    expect(form.get('poseCollageCount')).toBe('3');
    expect(form.get('poseCollageLayout')).toBe('2x2');
  });

  it('omits empty optional fields rather than sending blanks', () => {
    const form = buildGenerationForm(readyState());
    expect(form.get('instructions')).toBeNull();
    expect(form.get('backgroundPresetId')).toBeNull();
    expect(form.get('stylePresetId')).toBeNull();
  });
});

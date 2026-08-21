import {
  MAX_CHARACTERS,
  defaultAdvancedSettings,
  resizeSubjects,
  type AdvancedSettings,
} from './settings';

export type StudioMode = 'normal' | 'advanced';

/**
 * A single person in the generation. Each slot resolves to *either* a saved
 * character or an uploaded file — never both, which is exactly what the
 * server enforces.
 */
export interface CharacterSlot {
  /** Stable key for React lists; slot positions shift when one is removed. */
  key: string;
  characterId: string | null;
  file: File | null;
  previewUrl: string | null;
  /** Display name for saved characters, so the slot can label itself. */
  name: string | null;
}

export interface StudioState {
  mode: StudioMode;
  slots: CharacterSlot[];
  poseFile: File | null;
  posePreviewUrl: string | null;
  poseReferenceId: string | null;
  engine: string;
  backgroundPresetId: string | null;
  stylePresetId: string | null;
  instructions: string;
  advanced: AdvancedSettings;
  /** Generation ids from the most recent submit, for the results strip. */
  activeGenerationIds: string[];
  activeResultIndex: number;
}

export type StudioAction =
  | { type: 'setMode'; mode: StudioMode }
  | { type: 'addSlot' }
  | { type: 'removeSlot'; key: string }
  | { type: 'setSlotCharacter'; key: string; characterId: string; name: string | null; previewUrl: string | null }
  | { type: 'setSlotFile'; key: string; file: File; previewUrl: string }
  | { type: 'addCanvasCharacter'; characterId: string; name: string | null; previewUrl: string | null }
  | {
      type: 'syncSavedCharacters';
      characters: Array<{ id: string; name: string; primaryPhotoUrl: string | null }>;
    }
  | { type: 'clearSlot'; key: string }
  | { type: 'setPoseFile'; file: File; previewUrl: string }
  | { type: 'setPoseReference'; id: string; previewUrl: string }
  | { type: 'clearPose' }
  | {
      type: 'hydrateProjectSources';
      characters: Array<{
        key: string;
        characterId: string;
        name: string | null;
        previewUrl: string | null;
      }>;
      pose: { id: string; previewUrl: string } | null;
    }
  | { type: 'setEngine'; engine: string }
  | { type: 'setPreset'; kind: 'background' | 'style'; id: string | null }
  | { type: 'setInstructions'; value: string }
  | { type: 'patchAdvanced'; patch: (current: AdvancedSettings) => AdvancedSettings }
  | { type: 'applyRecipe'; settings: AdvancedSettings }
  | { type: 'setActiveGenerations'; ids: string[] }
  | { type: 'setActiveResultIndex'; index: number }
  | { type: 'reset' };

let slotCounter = 0;
function newSlot(): CharacterSlot {
  slotCounter += 1;
  return { key: `slot-${slotCounter}`, characterId: null, file: null, previewUrl: null, name: null };
}

function newUniqueSlot(slots: CharacterSlot[]): CharacterSlot {
  let slot = newSlot();
  while (slots.some((current) => current.key === slot.key)) slot = newSlot();
  return slot;
}

export function initialStudioState(overrides: Partial<StudioState> = {}): StudioState {
  return {
    mode: 'normal',
    slots: [newSlot()],
    poseFile: null,
    posePreviewUrl: null,
    poseReferenceId: null,
    engine: '',
    backgroundPresetId: null,
    stylePresetId: null,
    instructions: '',
    advanced: defaultAdvancedSettings(1),
    activeGenerationIds: [],
    activeResultIndex: 0,
    ...overrides,
  };
}

function withSlot(
  state: StudioState,
  key: string,
  update: (slot: CharacterSlot) => CharacterSlot,
): StudioState {
  return { ...state, slots: state.slots.map((slot) => (slot.key === key ? update(slot) : slot)) };
}

export function studioReducer(state: StudioState, action: StudioAction): StudioState {
  switch (action.type) {
    case 'setMode': {
      const next = { ...state, mode: action.mode };
      // Normal mode always produces a single image; the server enforces this
      // too, so mirroring it here keeps the estimate honest.
      if (action.mode === 'normal') {
        next.advanced = {
          ...next.advanced,
          output: { ...next.advanced.output, variantCount: 1 },
          poseCollage: { ...next.advanced.poseCollage, enabled: false },
        };
      }
      return next;
    }

    case 'addSlot': {
      if (state.slots.length >= MAX_CHARACTERS) return state;
      const slots = [...state.slots, newUniqueSlot(state.slots)];
      return { ...state, slots, advanced: resizeSubjects(state.advanced, slots.length) };
    }

    case 'removeSlot': {
      // The first slot is required — the server rejects a generation with no
      // characters, so it can never be removed.
      if (state.slots.length <= 1) return state;
      const slots = state.slots.filter((slot) => slot.key !== action.key);
      if (slots.length === state.slots.length) return state;
      return { ...state, slots, advanced: resizeSubjects(state.advanced, slots.length) };
    }

    case 'setSlotCharacter':
      return withSlot(state, action.key, () => ({
        key: action.key,
        characterId: action.characterId,
        file: null,
        previewUrl: action.previewUrl,
        name: action.name,
      }));

    case 'setSlotFile':
      return withSlot(state, action.key, () => ({
        key: action.key,
        characterId: null,
        file: action.file,
        previewUrl: action.previewUrl,
        name: null,
      }));

    case 'addCanvasCharacter': {
      if (state.slots.length >= MAX_CHARACTERS) return state;
      const added = {
        ...newUniqueSlot(state.slots),
        characterId: action.characterId,
        previewUrl: action.previewUrl,
        name: action.name,
      };
      const slots = [...state.slots, added];
      return { ...state, slots, advanced: resizeSubjects(state.advanced, slots.length) };
    }

    case 'syncSavedCharacters': {
      const byId = new Map(action.characters.map((character) => [character.id, character]));
      let changed = false;
      const slots = state.slots.map((slot) => {
        if (!slot.characterId) return slot;
        const character = byId.get(slot.characterId);
        if (!character || (slot.name === character.name && slot.previewUrl === character.primaryPhotoUrl)) {
          return slot;
        }
        changed = true;
        return { ...slot, name: character.name, previewUrl: character.primaryPhotoUrl };
      });
      return changed ? { ...state, slots } : state;
    }

    case 'clearSlot':
      return withSlot(state, action.key, () => ({
        key: action.key,
        characterId: null,
        file: null,
        previewUrl: null,
        name: null,
      }));

    // A pose is either an upload or a library reference. Setting one must
    // clear the other, otherwise the request carries both and is rejected.
    case 'setPoseFile':
      return {
        ...state,
        poseFile: action.file,
        posePreviewUrl: action.previewUrl,
        poseReferenceId: null,
      };

    case 'setPoseReference':
      return {
        ...state,
        poseFile: null,
        posePreviewUrl: action.previewUrl,
        poseReferenceId: action.id,
      };

    case 'clearPose':
      return { ...state, poseFile: null, posePreviewUrl: null, poseReferenceId: null };

    case 'hydrateProjectSources': {
      const slots = action.characters.length
        ? action.characters.map((character) => ({
            key: character.key,
            characterId: character.characterId,
            file: null,
            previewUrl: character.previewUrl,
            name: character.name,
          }))
        : [{
            key: state.slots[0]?.key ?? newSlot().key,
            characterId: null,
            file: null,
            previewUrl: null,
            name: null,
          }];
      return {
        ...state,
        slots,
        poseFile: null,
        posePreviewUrl: action.pose?.previewUrl ?? null,
        poseReferenceId: action.pose?.id ?? null,
        activeGenerationIds: [],
        activeResultIndex: 0,
        advanced: resizeSubjects(state.advanced, slots.length),
      };
    }

    case 'setEngine':
      return { ...state, engine: action.engine };

    case 'setPreset':
      return {
        ...state,
        [action.kind === 'background' ? 'backgroundPresetId' : 'stylePresetId']: action.id,
      };

    case 'setInstructions':
      return { ...state, instructions: action.value };

    case 'patchAdvanced':
      return { ...state, advanced: action.patch(state.advanced) };

    case 'applyRecipe':
      // Recipes carry creative settings only; the subject array must be
      // resized to however many people are currently in the form.
      return { ...state, advanced: resizeSubjects(action.settings, state.slots.length) };

    case 'setActiveGenerations':
      return { ...state, activeGenerationIds: action.ids, activeResultIndex: 0 };

    case 'setActiveResultIndex':
      return { ...state, activeResultIndex: action.index };

    case 'reset':
      return initialStudioState({ mode: state.mode, engine: state.engine });

    default:
      return state;
  }
}

/* ------------------------------------------------------------ validation */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Mirrors the server's acceptance rules so the user sees the problem before
 * a round trip, not after a 400.
 */
export function validateStudioState(state: StudioState): ValidationResult {
  const errors: string[] = [];

  const filled = state.slots.filter((slot) => slot.characterId || slot.file);
  if (!filled.length) {
    errors.push('Add at least one person.');
  } else {
    // The server requires contiguous slots starting at position 1.
    const firstEmpty = state.slots.findIndex((slot) => !slot.characterId && !slot.file);
    if (firstEmpty !== -1 && firstEmpty < filled.length) {
      errors.push('Fill the people slots in order, with no gaps.');
    }
  }

  if (!state.poseFile && !state.poseReferenceId) {
    errors.push('Choose a pose photo or pick one from the library.');
  }

  if (!state.engine) {
    errors.push('Select a generation engine.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Serializes state into the multipart body the Express route expects.
 * Slot indices are recomputed to be 1..n contiguous regardless of which
 * slots the user removed along the way.
 */
export function buildGenerationForm(state: StudioState): FormData {
  const form = new FormData();
  const filled = state.slots.filter((slot) => slot.characterId || slot.file);

  filled.forEach((slot, index) => {
    const position = index + 1;
    if (slot.characterId) {
      form.append(`characterId_${position}`, slot.characterId);
    } else if (slot.file) {
      form.append(`characterPhoto_${position}`, slot.file);
    }
  });

  if (state.poseFile) {
    form.append('posePhoto', state.poseFile);
  } else if (state.poseReferenceId) {
    form.append('poseReferenceId', state.poseReferenceId);
  }

  form.append('engine', state.engine);
  form.append('studioMode', state.mode);
  if (state.backgroundPresetId) form.append('backgroundPresetId', state.backgroundPresetId);
  if (state.stylePresetId) form.append('stylePresetId', state.stylePresetId);
  if (state.instructions.trim()) form.append('instructions', state.instructions.trim());
  form.append('advancedSettings', JSON.stringify(state.advanced));

  if (state.mode === 'advanced' && state.advanced.poseCollage.enabled && state.poseFile) {
    form.append('poseCollageEnabled', 'true');
    form.append('poseCollageCount', String(state.advanced.poseCollage.count));
    form.append('poseCollageLayout', state.advanced.poseCollage.layout);
  }

  return form;
}

/**
 * Client-side mirror of lib/studioSettings.js.
 *
 * The server sanitizes everything it receives, so this file exists to keep the
 * UI's option lists and defaults in lockstep with the server's allow-lists.
 * If the two drift, the server silently coerces a value to its fallback and
 * the user sees a control that appears to do nothing — the exact class of bug
 * this mirror is meant to prevent.
 */

export const ASPECT_RATIOS = ['1:1', '4:5', '16:9', '9:16'] as const;
export const QUALITIES = ['low', 'medium', 'high'] as const;
export const FRAMINGS = ['auto', 'close-up', 'medium', 'full-body', 'wide'] as const;
export const ANGLES = ['auto', 'eye-level', 'low-angle', 'high-angle', 'overhead'] as const;
export const LENSES = ['auto', '24mm', '35mm', '50mm', '85mm'] as const;
export const DEPTHS = ['auto', 'shallow', 'balanced', 'deep'] as const;
export const LIGHTING = [
  'auto',
  'soft-studio',
  'golden-hour',
  'window-light',
  'dramatic',
  'overcast',
] as const;
export const APERTURES = ['auto', 'f/1.8', 'f/2.8', 'f/4', 'f/8', 'f/11'] as const;
export const SPACING = ['auto', 'tight', 'natural', 'airy'] as const;
export const CROPS = ['auto', 'safe', 'dynamic', 'extra-headroom'] as const;
export const SEPARATION = ['auto', 'flat', 'subtle', 'strong'] as const;
export const TEMPERATURES = ['auto', 'cool', 'neutral', 'warm'] as const;
export const TIMES = ['auto', 'morning', 'midday', 'sunset', 'night'] as const;
export const RETOUCH = ['none', 'natural', 'polished'] as const;
export const GRADES = [
  'auto',
  'neutral',
  'warm-film',
  'cool-editorial',
  'cinematic',
  'black-and-white',
] as const;
export const GRAIN = ['none', 'subtle', 'medium'] as const;
export const COLLAGE_LAYOUTS = ['auto', 'horizontal', 'vertical', '2x2', '3x2', '2x3'] as const;

export const MAX_CHARACTERS = 4;
export const MAX_VARIANTS = 6;

export interface SubjectDirection {
  direction: string;
  expression: string;
}

export interface AdvancedSettings {
  identityFidelity: number;
  poseFidelity: number;
  ageFidelity: number;
  hairFidelity: number;
  preserveSkinTexture: boolean;
  correctHands: boolean;
  subjects: SubjectDirection[];
  camera: {
    framing: (typeof FRAMINGS)[number];
    angle: (typeof ANGLES)[number];
    lens: (typeof LENSES)[number];
    depthOfField: (typeof DEPTHS)[number];
    aperture: (typeof APERTURES)[number];
  };
  lighting: (typeof LIGHTING)[number];
  lightingTemperature: (typeof TEMPERATURES)[number];
  timeOfDay: (typeof TIMES)[number];
  composition: {
    spacing: (typeof SPACING)[number];
    crop: (typeof CROPS)[number];
    backgroundSeparation: (typeof SEPARATION)[number];
    mirrorPose: boolean;
  };
  finish: {
    retouch: (typeof RETOUCH)[number];
    colorGrade: (typeof GRADES)[number];
    grain: (typeof GRAIN)[number];
    sharpness: number;
  };
  negativePrompt: string;
  output: {
    aspectRatio: (typeof ASPECT_RATIOS)[number];
    quality: (typeof QUALITIES)[number];
    variantCount: number;
    variationStrength: number;
    seed: number | null;
  };
  poseCollage: {
    enabled: boolean;
    count: number;
    layout: (typeof COLLAGE_LAYOUTS)[number];
  };
}

export function defaultAdvancedSettings(characterCount = 1): AdvancedSettings {
  return {
    identityFidelity: 85,
    poseFidelity: 80,
    ageFidelity: 90,
    hairFidelity: 85,
    preserveSkinTexture: true,
    correctHands: true,
    subjects: Array.from({ length: characterCount }, () => ({ direction: '', expression: '' })),
    camera: {
      framing: 'auto',
      angle: 'auto',
      lens: 'auto',
      depthOfField: 'auto',
      aperture: 'auto',
    },
    lighting: 'auto',
    lightingTemperature: 'auto',
    timeOfDay: 'auto',
    composition: {
      spacing: 'auto',
      crop: 'safe',
      backgroundSeparation: 'auto',
      mirrorPose: false,
    },
    finish: { retouch: 'natural', colorGrade: 'auto', grain: 'none', sharpness: 50 },
    negativePrompt: '',
    output: {
      aspectRatio: '1:1',
      quality: 'medium',
      variantCount: 1,
      variationStrength: 35,
      seed: null,
    },
    poseCollage: { enabled: false, count: 2, layout: 'auto' },
  };
}

/** Turns a kebab-case option value into a readable label. */
export function optionLabel(value: string): string {
  if (value === 'auto') return 'Auto';
  return value
    .split('-')
    .map((part) => (/^f\/|^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
}

/**
 * Keeps the per-subject direction array the same length as the slot list when
 * people are added or removed, preserving what the user already typed.
 */
export function resizeSubjects(
  settings: AdvancedSettings,
  characterCount: number,
): AdvancedSettings {
  if (settings.subjects.length === characterCount) return settings;
  return {
    ...settings,
    subjects: Array.from(
      { length: characterCount },
      (_, index) => settings.subjects[index] ?? { direction: '', expression: '' },
    ),
  };
}

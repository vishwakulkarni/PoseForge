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

export interface BuiltInRecipe {
  id: string;
  name: string;
  description: string;
  settings: AdvancedSettings;
}

/**
 * Curated starting points for common PoseForge shoots. They deliberately use
 * the same AdvancedSettings contract as saved recipes, so selecting one can
 * update every relevant control without a separate prompt-only code path.
 */
export function builtInRecipes(characterCount: number): BuiltInRecipe[] {
  const base = () => defaultAdvancedSettings(characterCount);

  return [
    {
      id: 'builtin:studio-portrait',
      name: 'Studio portrait',
      description: 'Clean close-up with soft, polished studio light.',
      settings: {
        ...base(),
        identityFidelity: 93,
        poseFidelity: 85,
        camera: { framing: 'close-up', angle: 'eye-level', lens: '85mm', depthOfField: 'shallow', aperture: 'f/2.8' },
        lighting: 'soft-studio',
        lightingTemperature: 'neutral',
        composition: { spacing: 'tight', crop: 'safe', backgroundSeparation: 'strong', mirrorPose: false },
        finish: { retouch: 'polished', colorGrade: 'neutral', grain: 'none', sharpness: 64 },
        output: { ...base().output, aspectRatio: '4:5', quality: 'high', variationStrength: 18 },
      },
    },
    {
      id: 'builtin:golden-hour',
      name: 'Golden hour',
      description: 'Warm outdoor portrait with natural sunset light.',
      settings: {
        ...base(),
        camera: { framing: 'medium', angle: 'eye-level', lens: '50mm', depthOfField: 'shallow', aperture: 'f/2.8' },
        lighting: 'golden-hour',
        lightingTemperature: 'warm',
        timeOfDay: 'sunset',
        composition: { spacing: 'natural', crop: 'safe', backgroundSeparation: 'subtle', mirrorPose: false },
        finish: { retouch: 'natural', colorGrade: 'warm-film', grain: 'subtle', sharpness: 54 },
        output: { ...base().output, aspectRatio: '4:5', quality: 'high', variationStrength: 32 },
      },
    },
    {
      id: 'builtin:family-lifestyle',
      name: 'Family lifestyle',
      description: 'Relaxed full-body composition for one or more people.',
      settings: {
        ...base(),
        identityFidelity: 90,
        poseFidelity: 88,
        camera: { framing: 'full-body', angle: 'eye-level', lens: '35mm', depthOfField: 'balanced', aperture: 'f/4' },
        lighting: 'window-light',
        lightingTemperature: 'neutral',
        timeOfDay: 'morning',
        composition: { spacing: 'airy', crop: 'safe', backgroundSeparation: 'subtle', mirrorPose: false },
        finish: { retouch: 'natural', colorGrade: 'neutral', grain: 'none', sharpness: 52 },
        output: { ...base().output, aspectRatio: '4:5', quality: 'high', variationStrength: 28 },
      },
    },
    {
      id: 'builtin:editorial',
      name: 'Editorial',
      description: 'Refined fashion framing with cool, intentional styling.',
      settings: {
        ...base(),
        identityFidelity: 92,
        camera: { framing: 'medium', angle: 'high-angle', lens: '85mm', depthOfField: 'shallow', aperture: 'f/2.8' },
        lighting: 'soft-studio',
        lightingTemperature: 'cool',
        timeOfDay: 'midday',
        composition: { spacing: 'natural', crop: 'dynamic', backgroundSeparation: 'strong', mirrorPose: false },
        finish: { retouch: 'polished', colorGrade: 'cool-editorial', grain: 'subtle', sharpness: 62 },
        output: { ...base().output, aspectRatio: '4:5', quality: 'high', variationStrength: 24 },
      },
    },
    {
      id: 'builtin:cinematic-story',
      name: 'Cinematic story',
      description: 'Dramatic vertical frame for a bold visual narrative.',
      settings: {
        ...base(),
        poseFidelity: 90,
        camera: { framing: 'full-body', angle: 'low-angle', lens: '35mm', depthOfField: 'deep', aperture: 'f/4' },
        lighting: 'dramatic',
        lightingTemperature: 'cool',
        timeOfDay: 'night',
        composition: { spacing: 'airy', crop: 'dynamic', backgroundSeparation: 'strong', mirrorPose: false },
        finish: { retouch: 'natural', colorGrade: 'cinematic', grain: 'medium', sharpness: 58 },
        output: { ...base().output, aspectRatio: '9:16', quality: 'high', variationStrength: 42 },
      },
    },
    {
      id: 'builtin:social-square',
      name: 'Social square',
      description: 'Balanced square composition for profiles and feeds.',
      settings: {
        ...base(),
        camera: { framing: 'medium', angle: 'eye-level', lens: '50mm', depthOfField: 'balanced', aperture: 'f/4' },
        lighting: 'soft-studio',
        lightingTemperature: 'warm',
        composition: { spacing: 'natural', crop: 'safe', backgroundSeparation: 'subtle', mirrorPose: false },
        finish: { retouch: 'polished', colorGrade: 'warm-film', grain: 'none', sharpness: 58 },
        output: { ...base().output, aspectRatio: '1:1', quality: 'high', variationStrength: 26 },
      },
    },
    {
      id: 'builtin:black-and-white',
      name: 'Black & white',
      description: 'High-contrast monochrome portrait with classic depth.',
      settings: {
        ...base(),
        identityFidelity: 92,
        camera: { framing: 'close-up', angle: 'eye-level', lens: '85mm', depthOfField: 'shallow', aperture: 'f/1.8' },
        lighting: 'dramatic',
        lightingTemperature: 'neutral',
        composition: { spacing: 'tight', crop: 'safe', backgroundSeparation: 'strong', mirrorPose: false },
        finish: { retouch: 'natural', colorGrade: 'black-and-white', grain: 'subtle', sharpness: 66 },
        output: { ...base().output, aspectRatio: '4:5', quality: 'high', variationStrength: 20 },
      },
    },
    {
      id: 'builtin:action',
      name: 'Action',
      description: 'Wide, energetic framing that keeps a dynamic pose clear.',
      settings: {
        ...base(),
        poseFidelity: 94,
        camera: { framing: 'wide', angle: 'low-angle', lens: '24mm', depthOfField: 'deep', aperture: 'f/8' },
        lighting: 'dramatic',
        lightingTemperature: 'neutral',
        composition: { spacing: 'airy', crop: 'dynamic', backgroundSeparation: 'strong', mirrorPose: false },
        finish: { retouch: 'none', colorGrade: 'cinematic', grain: 'none', sharpness: 72 },
        output: { ...base().output, aspectRatio: '16:9', quality: 'high', variationStrength: 50 },
      },
    },
  ];
}

export function builtInRecipe(id: string, characterCount: number): BuiltInRecipe | null {
  return builtInRecipes(characterCount).find((recipe) => recipe.id === id) ?? null;
}

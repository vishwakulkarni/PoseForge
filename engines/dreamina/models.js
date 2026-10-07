/**
 * Dreamina models PoseForge exposes: Seedance 2.5, 2.0 and 2.0 Mini for video, Seedream
 * and GPT Image for images. Values mirror `dreamina-canvas model list` as of
 * 2026-10-07 (CLI 1.0.1); the server revalidates every run, so a stale entry
 * fails with a clear Dreamina error rather than an unexpected charge.
 *
 * Each canonical model has three Dreamina modes, exposed as separate entries
 * so the node shows the right inputs: `t2v` (prompt only), `first_last_frame`
 * (a start frame and optional end frame; ratio should match the frame), and
 * `m2v` (reference images, videos and audio; Seedance 2.0 and 2.0 Mini need
 * at least one image or video). Dreamina has no sound flag for these models.
 */
const RATIOS = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];
const range = (min, max) => Array.from({ length: max - min + 1 }, (_, index) => min + index);

const SEEDANCE = [
  {
    model: "seedance_2.5",
    label: "Seedance 2.5",
    durations: range(4, 30),
    resolutions: ["480p", "720p", "1080p"],
    defaultResolution: "720p",
    maxPromptLength: 15_000,
    maxReferences: 30,
    maxReferenceVideos: 10,
    maxReferenceAudios: 10,
    audioOnlyReferences: true,
  },
  {
    model: "seedance_2.0",
    label: "Seedance 2.0",
    durations: range(4, 15),
    resolutions: ["720p", "1080p", "4k"],
    defaultResolution: "720p",
    maxPromptLength: 4_000,
    maxReferences: 9,
    maxReferenceVideos: 3,
    maxReferenceAudios: 3,
    audioOnlyReferences: false,
  },
  {
    model: "seedance_2.0_mini",
    label: "Seedance 2.0 Mini",
    durations: range(4, 15),
    resolutions: ["720p"],
    defaultResolution: "720p",
    maxPromptLength: 4_000,
    maxReferences: 9,
    maxReferenceVideos: 3,
    maxReferenceAudios: 3,
    audioOnlyReferences: false,
  },
];

const MODES = [
  { mode: "t2v", title: "Text to Video", note: "Prompt-only video on your PoseForge Dreamina canvas.", inputs: ["prompt"] },
  { mode: "first_last_frame", title: "First & Last Frame", note: "Animate a start frame; an end frame is optional. Pick the ratio that matches the start frame.", inputs: ["prompt", "startFrame", "endFrame"] },
  { mode: "m2v", title: "Reference to Video", note: "Generate a shot guided by connected reference images, videos and audio.", inputs: ["prompt", "reference", "referenceVideo", "referenceAudio"] },
];

const VIDEO_MODELS = SEEDANCE.flatMap((base) => MODES.map((mode) => ({
  id: `${base.model}:${mode.mode}`,
  label: `${base.label} — ${mode.title}`,
  note: mode.note,
  model: base.model,
  mode: mode.mode,
  inputs: mode.inputs,
  durations: base.durations,
  defaultDuration: 5,
  aspectRatios: RATIOS,
  defaultAspectRatio: "16:9",
  resolutions: base.resolutions,
  defaultResolution: base.defaultResolution,
  maxPromptLength: base.maxPromptLength,
  ...(mode.mode === "m2v" ? {
    maxReferences: base.maxReferences,
    maxReferenceVideos: base.maxReferenceVideos,
    maxReferenceAudios: base.maxReferenceAudios,
    audioOnlyReferences: base.audioOnlyReferences,
  } : {}),
  sound: false,
})));

function videoModel(id) {
  return VIDEO_MODELS.find((model) => model.id === id) || null;
}

/**
 * Image models run as `t2i` without connected images and `i2i` with them, so
 * one entry per model is enough. The node offers three detail tiers; each
 * maps onto the model's own resolutions (Seedream starts at 2K, so its
 * Standard and High tiers match).
 */
const IMAGE_RATIOS = ["21:9", "16:9", "3:2", "4:3", "1:1", "3:4", "2:3", "9:16"];
const IMAGE_MODELS = [
  { id: "seedream_5.0_pro", label: "Seedream 5.0 Pro", resolutions: ["1.5K", "2K", "4K"], maxReferences: 10 },
  { id: "seedream_5.0_lite", label: "Seedream 5.0 Lite", resolutions: ["2K", "4K"], maxReferences: 14 },
  { id: "seedream_4.6", label: "Seedream 4.6", resolutions: ["2K", "4K"], maxReferences: 14 },
  { id: "seedream_4.5", label: "Seedream 4.5", resolutions: ["2K", "4K"], maxReferences: 6 },
  { id: "seedream_4.1", label: "Seedream 4.1", resolutions: ["2K", "4K"], maxReferences: 6 },
  { id: "seedream_4.0", label: "Seedream 4.0", resolutions: ["2K", "4K"], maxReferences: 6 },
  { id: "gpt_image_2", label: "GPT Image 2", resolutions: ["1K", "2K", "4K"], maxReferences: 16 },
  { id: "dreamina_gpt_image_2_5_flare", label: "GPT Image 2.5 Flare", resolutions: ["1K", "2K", "4K"], maxReferences: 16 },
  { id: "dreamina_gpt_image_2_5_sunburst", label: "GPT Image 2.5 Sunburst", resolutions: ["1K", "2K", "4K"], maxReferences: 16 },
].map((model) => ({
  ...model,
  model: model.id,
  note: `Text to image, or image to image with up to ${model.maxReferences} connected images, on your PoseForge Dreamina canvas.`,
  aspectRatios: IMAGE_RATIOS,
  maxPromptLength: 4_000,
}));

const MAX_REFERENCE_IMAGES = Math.max(...IMAGE_MODELS.map((model) => model.maxReferences));

function imageModel(id) {
  return IMAGE_MODELS.find((model) => model.id === id) || null;
}

/** The model's resolution for a node detail tier ("medium" | "high" | "max"). */
function imageResolution(definition, quality) {
  if (quality === "max") return "4K";
  if (quality === "high") return "2K";
  return definition.resolutions[0];
}

module.exports = { VIDEO_MODELS, videoModel, IMAGE_MODELS, IMAGE_RATIOS, MAX_REFERENCE_IMAGES, imageModel, imageResolution };

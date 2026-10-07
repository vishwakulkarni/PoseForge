/**
 * Higgsfield model catalog — the single source of truth for request
 * construction and the Advanced Studio node UI.
 *
 * Video `params` lists the optional settings an endpoint accepts; anything
 * absent is shown in the node as one fixed option and never sent. `pricing`
 * is the published rate card, used only when Higgsfield's estimate endpoint
 * returns a description instead of an exact price (Seedance does). Schemas:
 * https://docs.higgsfield.ai/docs/models/video-generation and
 * https://docs.higgsfield.ai/docs/models/image-generation.
 */
const PRICING_RATE_DATE = "2026-10-07";
const SEEDANCE_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"];
// Rates Higgsfield published for Seedance 2.5 16:9 output without video
// input, before customer discounts. Other ratios bill by pixel count, so the
// rate is approximate there.
const SEEDANCE_PRICING = { usdPerSecond: { "480p": 0.2056, "720p": 0.4622, "1080p": 1.1372 } };

const VIDEO_MODELS = [
  {
    id: "bytedance/seedance-2.5/text-to-video",
    label: "Seedance 2.5 — Text to Video",
    note: "Prompt-only video generation with optional generated audio.",
    inputs: ["prompt"],
    params: ["aspectRatio", "resolution", "sound"],
    durations: [5, 10, 15],
    defaultDuration: 5,
    aspectRatios: SEEDANCE_RATIOS,
    defaultAspectRatio: "16:9",
    resolutions: ["480p", "720p", "1080p"],
    defaultResolution: "720p",
    sound: true,
    pricing: SEEDANCE_PRICING,
  },
  {
    id: "bytedance/seedance-2.5/image-to-video",
    label: "Seedance 2.5 — Image to Video",
    note: "Animate a start frame; an end frame is optional. Aspect ratio follows the start frame.",
    inputs: ["prompt", "startFrame", "endFrame"],
    params: ["resolution", "sound"],
    durations: [5, 10, 15],
    defaultDuration: 5,
    aspectRatios: ["auto"],
    defaultAspectRatio: "auto",
    resolutions: ["480p", "720p", "1080p"],
    defaultResolution: "720p",
    sound: true,
    pricing: SEEDANCE_PRICING,
  },
  {
    id: "bytedance/seedance-2.5/reference-to-video",
    label: "Seedance 2.5 — Reference to Video",
    note: "Generate a new shot that keeps the subject of a reference image.",
    inputs: ["prompt", "reference"],
    params: ["aspectRatio", "resolution", "sound"],
    durations: [5, 10, 15],
    defaultDuration: 5,
    aspectRatios: SEEDANCE_RATIOS,
    defaultAspectRatio: "16:9",
    resolutions: ["480p", "720p", "1080p"],
    defaultResolution: "720p",
    sound: true,
    pricing: SEEDANCE_PRICING,
  },
  {
    id: "kling-video/v2.5-turbo/pro/text-to-video",
    label: "Kling 2.5 Turbo Pro — Text to Video",
    note: "Prompt-only video generation.",
    inputs: ["prompt"],
    params: [],
    durations: [5, 10],
    defaultDuration: 5,
    aspectRatios: ["16:9"],
    defaultAspectRatio: "16:9",
    resolutions: ["auto"],
    defaultResolution: "auto",
    sound: false,
  },
  {
    id: "kling-video/v2.5-turbo/pro/image-to-video",
    label: "Kling 2.5 Turbo Pro — Image to Video",
    note: "Animate a start frame. Aspect ratio follows the start frame.",
    inputs: ["prompt", "startFrame"],
    params: [],
    durations: [5, 10],
    defaultDuration: 5,
    aspectRatios: ["auto"],
    defaultAspectRatio: "auto",
    resolutions: ["auto"],
    defaultResolution: "auto",
    sound: false,
  },
];

/** `resolutionFor` maps PoseForge's engine-facing quality knob to the
 * model's own resolution vocabulary. */
const IMAGE_MODELS = [
  {
    id: "xai/grok-imagine-image-2.0",
    label: "Grok Imagine Image 2.0",
    note: "Text-to-image, or edit with up to 10 connected reference images.",
    maxReferenceImages: 10,
    textToImage: true,
    aspectRatios: ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"],
    resolutionFor: (quality) => (quality === "high" ? "2k" : "1k"),
  },
  {
    id: "higgsfield-ai/soul/v2/standard",
    label: "Higgsfield Soul 2.0",
    note: "Higgsfield's photoreal text-to-image model. Prompt only; connected images are not used.",
    maxReferenceImages: 0,
    textToImage: true,
    aspectRatios: ["9:16", "16:9", "4:3", "3:4", "1:1", "2:3", "3:2"],
    resolutionFor: (quality) => (quality === "high" ? "1080p" : "720p"),
  },
];

function videoModel(modelId) {
  return VIDEO_MODELS.find((model) => model.id === modelId) || null;
}

function imageModel(modelId) {
  return IMAGE_MODELS.find((model) => model.id === modelId) || null;
}

module.exports = { PRICING_RATE_DATE, VIDEO_MODELS, IMAGE_MODELS, videoModel, imageModel };

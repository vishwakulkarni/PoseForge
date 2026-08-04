const ASPECT_RATIOS = new Set(["1:1", "4:5", "16:9", "9:16"]);
const QUALITIES = new Set(["low", "medium", "high"]);
const FRAMINGS = new Set(["auto", "close-up", "medium", "full-body", "wide"]);
const ANGLES = new Set(["auto", "eye-level", "low-angle", "high-angle", "overhead"]);
const LENSES = new Set(["auto", "24mm", "35mm", "50mm", "85mm"]);
const DEPTHS = new Set(["auto", "shallow", "balanced", "deep"]);
const LIGHTING = new Set(["auto", "soft-studio", "golden-hour", "window-light", "dramatic", "overcast"]);
const APERTURES = new Set(["auto", "f/1.8", "f/2.8", "f/4", "f/8", "f/11"]);
const SPACING = new Set(["auto", "tight", "natural", "airy"]);
const CROPS = new Set(["auto", "safe", "dynamic", "extra-headroom"]);
const SEPARATION = new Set(["auto", "flat", "subtle", "strong"]);
const TEMPERATURES = new Set(["auto", "cool", "neutral", "warm"]);
const TIMES = new Set(["auto", "morning", "midday", "sunset", "night"]);
const RETOUCH = new Set(["none", "natural", "polished"]);
const GRADES = new Set(["auto", "neutral", "warm-film", "cool-editorial", "cinematic", "black-and-white"]);
const GRAIN = new Set(["none", "subtle", "medium"]);
const COLLAGE_LAYOUTS = new Set(["auto", "horizontal", "vertical", "2x2", "3x2", "2x3"]);

function text(value, max = 300) {
  return String(value || "").trim().slice(0, max);
}

function choice(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function strength(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 0), 100) : fallback;
}

function sanitizeAdvancedSettings(input = {}, characterCount = 1) {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const subjects = Array.isArray(raw.subjects) ? raw.subjects : [];
  return {
    identityFidelity: strength(raw.identityFidelity, 85),
    poseFidelity: strength(raw.poseFidelity, 80),
    ageFidelity: strength(raw.ageFidelity, 90),
    hairFidelity: strength(raw.hairFidelity, 85),
    preserveSkinTexture: raw.preserveSkinTexture !== false,
    correctHands: raw.correctHands !== false,
    subjects: Array.from({ length: characterCount }, (_, index) => ({
      direction: text(subjects[index]?.direction, 280),
      expression: text(subjects[index]?.expression, 100),
    })),
    camera: {
      framing: choice(raw.camera?.framing, FRAMINGS, "auto"),
      angle: choice(raw.camera?.angle, ANGLES, "auto"),
      lens: choice(raw.camera?.lens, LENSES, "auto"),
      depthOfField: choice(raw.camera?.depthOfField, DEPTHS, "auto"),
      aperture: choice(raw.camera?.aperture, APERTURES, "auto"),
    },
    lighting: choice(raw.lighting, LIGHTING, "auto"),
    lightingTemperature: choice(raw.lightingTemperature, TEMPERATURES, "auto"),
    timeOfDay: choice(raw.timeOfDay, TIMES, "auto"),
    composition: {
      spacing: choice(raw.composition?.spacing, SPACING, "auto"),
      crop: choice(raw.composition?.crop, CROPS, "safe"),
      backgroundSeparation: choice(raw.composition?.backgroundSeparation, SEPARATION, "auto"),
      mirrorPose: raw.composition?.mirrorPose === true,
    },
    finish: {
      retouch: choice(raw.finish?.retouch, RETOUCH, "natural"),
      colorGrade: choice(raw.finish?.colorGrade, GRADES, "auto"),
      grain: choice(raw.finish?.grain, GRAIN, "none"),
      sharpness: strength(raw.finish?.sharpness, 50),
    },
    negativePrompt: text(raw.negativePrompt, 400),
    output: {
      aspectRatio: choice(raw.output?.aspectRatio, ASPECT_RATIOS, "1:1"),
      quality: choice(raw.output?.quality, QUALITIES, "medium"),
      variantCount: Math.min(Math.max(Number(raw.output?.variantCount) || 1, 1), 6),
      variationStrength: strength(raw.output?.variationStrength, 35),
      seed: raw.output?.seed === "" || raw.output?.seed == null ? null : Math.min(Math.max(Math.trunc(Number(raw.output.seed)) || 0, 0), 2147483647),
    },
    poseCollage: {
      enabled: raw.poseCollage?.enabled === true,
      count: Math.min(Math.max(Number(raw.poseCollage?.count) || 2, 2), 6),
      layout: choice(raw.poseCollage?.layout, COLLAGE_LAYOUTS, "auto"),
    },
  };
}

function fidelityLabel(value) {
  if (value >= 85) return "very strictly";
  if (value >= 65) return "closely";
  if (value >= 40) return "moderately";
  return "loosely";
}

function buildAdvancedPromptFragment(settings) {
  if (!settings) return "";
  const lines = [
    `Preserve each subject's identity ${fidelityLabel(settings.identityFidelity)}.`,
    `Follow the reference pose ${fidelityLabel(settings.poseFidelity)} while keeping anatomy natural.`,
    `Preserve apparent age ${fidelityLabel(settings.ageFidelity)} and hair ${fidelityLabel(settings.hairFidelity)}.`,
  ];
  if (settings.preserveSkinTexture) lines.push("Keep natural skin texture; avoid plastic or over-smoothed skin.");
  if (settings.correctHands) lines.push("Pay special attention to anatomically correct hands, fingers, eyes, and teeth.");
  settings.subjects.forEach((subject, index) => {
    const parts = [];
    if (subject.direction) parts.push(subject.direction);
    if (subject.expression) parts.push(`Expression: ${subject.expression}`);
    if (parts.length) lines.push(`Direction for person ${index + 1}: ${parts.join(". ")}.`);
  });
  const camera = settings.camera;
  const cameraParts = [
    camera.framing !== "auto" ? `${camera.framing} framing` : "",
    camera.angle !== "auto" ? `${camera.angle} camera angle` : "",
    camera.lens !== "auto" ? `${camera.lens} lens character` : "",
    camera.depthOfField !== "auto" ? `${camera.depthOfField} depth of field` : "",
    camera.aperture !== "auto" ? `${camera.aperture} aperture character` : "",
  ].filter(Boolean);
  if (cameraParts.length) lines.push(`Camera direction: ${cameraParts.join(", ")}.`);
  if (settings.lighting !== "auto") lines.push(`Lighting direction: ${settings.lighting.replaceAll("-", " ")}.`);
  if (settings.lightingTemperature !== "auto") lines.push(`Use a ${settings.lightingTemperature} color temperature.`);
  if (settings.timeOfDay !== "auto") lines.push(`Scene time: ${settings.timeOfDay}.`);
  const composition = settings.composition;
  if (composition.spacing !== "auto") lines.push(`Use ${composition.spacing} subject spacing.`);
  if (composition.crop !== "auto") lines.push(`Use a ${composition.crop.replaceAll("-", " ")} crop with no accidental limb cuts.`);
  if (composition.backgroundSeparation !== "auto") lines.push(`Background separation: ${composition.backgroundSeparation}.`);
  if (composition.mirrorPose) lines.push("Mirror the pose reference horizontally before applying it.");
  const finish = settings.finish;
  lines.push(`Retouching: ${finish.retouch}; color grade: ${finish.colorGrade.replaceAll("-", " ")}; film grain: ${finish.grain}; output sharpness ${finish.sharpness}/100.`);
  lines.push(`Compose for a ${settings.output.aspectRatio} aspect ratio.`);
  lines.push(`Variation strength: ${settings.output.variationStrength}/100.`);
  if (settings.output.seed != null) lines.push(`Use seed ${settings.output.seed} when the engine supports deterministic seeds.`);
  if (settings.negativePrompt) lines.push(`Avoid: ${settings.negativePrompt}.`);
  return lines.join(" ");
}

function outputSettings(settings) {
  return {
    aspectRatio: settings.output.aspectRatio,
    quality: settings.output.quality,
    variationStrength: settings.output.variationStrength,
    seed: settings.output.seed,
  };
}

module.exports = { sanitizeAdvancedSettings, buildAdvancedPromptFragment, outputSettings };

/**
 * Prompt template module.
 *
 * Builds the merge instruction sent to Codex/GPT Image. The goal:
 * preserve the identity/appearance of every person given as a character
 * reference (1-4 of them — e.g. dad, mom, kid), while copying the pose,
 * body position, and composition from the pose reference photo, and
 * composing everyone together into one natural-looking photo.
 *
 * Kept as a single exported function so the wording can be iterated on
 * without touching any other part of the app.
 */

function ordinal(n) {
  return ["first", "second", "third", "fourth"][n - 1] || `${n}th`;
}

function buildMergePrompt({ characterCount = 1, backgroundPresetFragment, stylePresetFragment, customInstructions } = {}) {
  const count = Math.min(Math.max(Number(characterCount) || 1, 1), 4);

  const characterLines = count === 1
    ? [`Image 1 is the CHARACTER reference: it shows the person to preserve. Their identity must match exactly — face, facial features, skin tone, body type, hair, and any distinguishing details must match Image 1.`]
    : [
        `Images 1 through ${count} are CHARACTER references, one person each (the ${ordinal(1)} through ${ordinal(count)} images). Each person's identity must be preserved exactly — face, facial features, skin tone, body type, hair, and any distinguishing details must match their own reference image. Do not swap, blend, or merge features between the different people.`,
      ];

  const poseImageNumber = count + 1;
  const groupInstruction = count === 1
    ? `Generate a single new photorealistic image of the person from Image 1, posed exactly as the person in Image ${poseImageNumber} is posed.`
    : `Generate a single new photorealistic image composing all ${count} people from Images 1-${count} together in one scene, posed and arranged as shown in Image ${poseImageNumber} — as if they were genuinely photographed together. Every person from every character reference must appear in the output, each clearly and individually recognizable as themselves.`;

  const prompt = [
    count === 1 ? `You are given two images.` : `You are given ${count + 1} images.`,
    ...characterLines,
    `Image ${poseImageNumber} is the POSE reference: it shows a pose, body position, and composition to copy. Ignore the identity of whoever is in that image — only use it for pose, camera angle, framing, and composition.`,
    groupInstruction,
    `Keep clothing plausible and consistent with each character reference unless the pose reference clearly implies a different context. Match lighting and framing style to look like a natural photograph, not a collage or composite.`,
    `Do not include any watermarks, text, or borders in the output.`,
  ];
  if (backgroundPresetFragment) prompt.push(backgroundPresetFragment);
  if (stylePresetFragment) prompt.push(stylePresetFragment);
  if (customInstructions) prompt.push(`Additional instructions from the user: ${customInstructions}`);
  return prompt.join(" ");
}

module.exports = { buildMergePrompt };

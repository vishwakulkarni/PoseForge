/**
 * Prompt template module.
 *
 * Builds the merge instruction sent to Codex/GPT Image. The goal:
 * preserve the identity/appearance of the subject from the character photo,
 * while copying the pose, body position, and composition from the pose
 * reference photo.
 *
 * Kept as a single exported function so the wording can be iterated on
 * without touching any other part of the app.
 */

function buildMergePrompt({ characterName, backgroundPresetFragment, stylePresetFragment, customInstructions } = {}) {
  const subjectLabel = characterName
    ? `the person from the first image ("${characterName}")`
    : "the person from the first image";

  const prompt = [
    `You are given two images.`,
    `Image 1 is the CHARACTER reference: it shows ${subjectLabel}. Preserve this person's identity exactly — face, facial features, skin tone, body type, hair, and any distinguishing details must match Image 1.`,
    `Image 2 is the POSE reference: it shows a pose, body position, and composition to copy. Ignore the identity of whoever is in Image 2 — only use it for pose, camera angle, framing, and composition.`,
    `Generate a single new photorealistic image of the person from Image 1, posed exactly as the person in Image 2 is posed.`,
    `Keep clothing plausible and consistent with the character reference unless the pose reference clearly implies a different context. Match lighting and framing style to look like a natural photograph, not a collage or composite.`,
    `Do not include any watermarks, text, or borders in the output.`,
  ];
  if (backgroundPresetFragment) prompt.push(backgroundPresetFragment);
  if (stylePresetFragment) prompt.push(stylePresetFragment);
  if (customInstructions) prompt.push(`Additional instructions from the user: ${customInstructions}`);
  return prompt.join(" ");
}

module.exports = { buildMergePrompt };

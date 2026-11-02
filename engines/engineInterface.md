# Engine adapter contract

Each engine exports `key`, `label`, `isReady()`, and `generate({ characterPhotoPaths, posePhotoPath, prompt, outputPath, outputSettings, apiKey, model })`. `isReady()` returns `{ ready, reason? }`; `generate` must write an image to `outputPath` or throw a clear `Error`. `outputSettings` and `model` are optional and adapters must provide safe defaults.

`characterPhotoPaths` is an array of 1-4 local file paths (one per person in the generation, in order — this is also the order the prompt text refers to them by, e.g. "Image 1", "Image 2"). Every path must be included in the request to the underlying model; dropping any of them means that person won't appear in the output. `prompt` (built by `lib/promptTemplate.js`) already accounts for however many paths were given, so adapters don't need to reason about the count themselves — just forward every image, in order, followed by the pose reference.

## Advanced Studio

An engine appears in Advanced Studio when it declares what it can do there:

- **Images**: `capabilities.freeform`, a `generateFreeform({ referencePaths, prompt, outputPath, outputSettings, apiKey, model })`
  method, and `imageSettings: { aspectRatios, resolutions: [{ id, label, quality }], defaultResolution, note? }`.
  The node menus are built from `imageSettings`; `quality` is the value `outputSettings.quality` receives.
- **Video**: `capabilities.video`, `generateVideo(...)`, `videoModels` and `modelDefinition(modelId)`.
- **Text** (LLM Text nodes): `assistPrompt({ instruction, system })` returning `{ text }`. `system` replaces the
  default prompt-assistant instructions when given.
- **Image edits** (Image Transform nodes): `transformImage({ inputPath, instruction, context, outputPath })` writes a PNG
  to `outputPath` after editing the image at `inputPath` as `instruction` says, using `context` (connected text) as
  material. `outputPath` is in a scratch folder the caller removes.

Register the module in `engines/index.js`; nothing else needs to change.

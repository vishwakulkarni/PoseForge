# Engine adapter contract

Each engine exports `key`, `label`, `isReady()`, and `generate({ characterPhotoPaths, posePhotoPath, prompt, outputPath, outputSettings, apiKey, model })`. `isReady()` returns `{ ready, reason? }`; `generate` must write an image to `outputPath` or throw a clear `Error`. `outputSettings` and `model` are optional and adapters must provide safe defaults.

`characterPhotoPaths` is an array of 1-4 local file paths (one per person in the generation, in order — this is also the order the prompt text refers to them by, e.g. "Image 1", "Image 2"). Every path must be included in the request to the underlying model; dropping any of them means that person won't appear in the output. `prompt` (built by `lib/promptTemplate.js`) already accounts for however many paths were given, so adapters don't need to reason about the count themselves — just forward every image, in order, followed by the pose reference.

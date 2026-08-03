# Engine adapter contract

Each engine exports `key`, `label`, `isReady()`, and `generate({ characterPhotoPath, posePhotoPath, prompt, outputPath, apiKey })`. `isReady()` returns `{ ready, reason? }`; `generate` must write a PNG to `outputPath` or throw a clear `Error`.

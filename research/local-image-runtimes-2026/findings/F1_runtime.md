# F1 — Runtime choice

ComfyUI is the recommended primary local engine because it already owns model residency, workflow graphs, uploads, progress, queueing, cancellation, and outputs. PoseForge should integrate through a versioned workflow template and the loopback HTTP API. `stable-diffusion.cpp` should be an optional lightweight CLI adapter; Diffusers should be used for prototype/reference scripts; InvokeAI is a strong alternative for users who prioritize a polished standalone app and tokenized multi-user server.

Confidence: high for runtime mechanics; medium for long-term custom-node stability.


# InvokeAI

- Repository: https://github.com/invoke-ai/InvokeAI
- Hardware requirements: https://invoke.ai/start-here/system-requirements/
- FastAPI application: https://github.com/invoke-ai/InvokeAI/blob/main/invokeai/app/api_app.py
- License: Apache-2.0
- Retrieved: 2026-08-04

Verbatim evidence:

> "Invoke runs a locally hosted web server & React UI"

> "All Apple Silicon (M1, M2, etc) Macs work, but 16GB+ memory is recommended."

> "SDXL ... VRAM (min) 8GB"

> "FLUX.2 Klein 4B ... VRAM (min) 12GB ... FP8 works with 8GB+"

The server source registers a FastAPI/OpenAPI surface, Swagger at `/docs`, a session queue router, and Bearer/JWT authentication in multi-user mode.

Notes: polished, commercially friendly, and more auth-complete than ComfyUI. Its API is clean, but its primary product is a full creative application and its workflow/node ecosystem is less extensive for experimental pose/identity compositions.


# ComfyUI

- URL: https://github.com/Comfy-Org/ComfyUI
- API example: https://github.com/Comfy-Org/ComfyUI/blob/master/script_examples/basic_api_example.py
- License: GPL-3.0, https://github.com/Comfy-Org/ComfyUI/blob/master/LICENSE
- Retrieved: 2026-08-04

Verbatim evidence:

> "It is available on Windows, Linux, and macOS"

> "Supports all operating systems and GPU types (NVIDIA, AMD, Intel, Apple Silicon, Ascend)."

> "Asynchronous Queue system"

> "Works fully offline: core will never download anything unless you want to."

> `request.Request("http://127.0.0.1:8188/prompt", data=data)`

Notes: workflows export to API JSON and are submitted to `/prompt`; progress/results are available through the local server and websocket/history endpoints. The core README explicitly lists ControlNet, SDXL, FLUX, FLUX.2, Qwen Image, and Qwen Image Edit. It is the broadest workflow ecosystem, but a stock local server should be treated as an unauthenticated loopback service. GPL obligations matter when distributing a modified/bundled runtime, not merely invoking a separate process.


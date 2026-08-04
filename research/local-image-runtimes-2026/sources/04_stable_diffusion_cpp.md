# stable-diffusion.cpp

- Repository: https://github.com/leejet/stable-diffusion.cpp
- RPC guide: https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/rpc.md
- License: MIT
- Retrieved: 2026-08-04

Verbatim evidence:

> "API and command-line option may change frequently."

> `./bin/sd-cli -m ../models/v1-5-pruned-emaonly.safetensors -p "a lovely cat"`

> "Supported backends - CPU ... CUDA ... Vulkan ... Metal ... OpenCL ... SYCL"

> "Control Net support with SD 1.5"

> "PhotoMaker support."

> "The RPC server does not currently support authentication or encryption."

Notes: strongest true local CLI and attractive for Metal/GGUF/low-dependency installs. It supports current generation/edit model families, but exact structural ControlNet is limited to SD 1.5 in the official feature list. Its RPC is compute offload, not a production generation job API. The project warns its CLI/API may change.


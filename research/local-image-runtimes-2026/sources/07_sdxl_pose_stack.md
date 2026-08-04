# SDXL exact-pose stack

- SDXL: https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0
- OpenPose ControlNet: https://huggingface.co/xinsir/controlnet-openpose-sdxl-1.0
- PhotoMaker: https://github.com/TencentARC/PhotoMaker
- IP-Adapter: https://github.com/tencent-ailab/IP-Adapter
- Retrieved: 2026-08-04

Verbatim evidence:

> OpenPose model card: "License: apache-2.0"

> PhotoMaker: "minimum GPU memory requirement ... 11G"

> PhotoMaker V2 can work with ControlNet for "edge, pose, depth, and more."

> Diffusers IP-Adapter docs: "For structural control, combine IP-Adapter with ControlNet conditioned on depth maps, edge maps, pose estimations, and more."

Notes: SDXL base uses CreativeML Open RAIL++-M; Xinsir OpenPose and PhotoMaker code are Apache-2.0. This remains the best explicit skeleton-control recipe. For a commercially safer configuration, use ordinary CLIP-based IP-Adapter/PhotoMaker V1 and audit every downloaded base/LoRA. PhotoMaker V2 relies on InsightFace, so it is not a clean commercial default.


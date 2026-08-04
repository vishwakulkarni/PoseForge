# Identity adapter license traps

- InstantID: https://github.com/instantX-research/InstantID
- IP-Adapter FaceID: https://huggingface.co/h94/IP-Adapter-FaceID
- PhotoMaker V2: https://github.com/TencentARC/PhotoMaker/blob/main/README_pmv2.md
- Retrieved: 2026-08-04

Verbatim evidence:

> InstantID: "both manual-downloading and auto-downloading face models from insightface are for non-commercial research purposes only"

> InstantID: "Our released checkpoints are also for research purposes only."

> IP-Adapter FaceID: "released exclusively for research purposes and is not intended for commercial use."

> PhotoMaker V2: "relies on InsightFace" and "needs to comply with its license."

Notes: an Apache-2.0 code repository does not make its model weights or upstream face encoders commercially usable. Do not ship InstantID, IP-Adapter FaceID, or PhotoMaker V2 as default commercial PoseForge engines without separate commercial rights. Ordinary CLIP-based IP-Adapter is a different, less identity-specific option.


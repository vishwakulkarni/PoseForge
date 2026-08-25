# 3D and confidence-aware pose guidance

- URL: https://github.com/fudan-generative-vision/champ
- Accessed: 2026-08-20
- Source type: Official ECCV 2024 implementation/paper companion
- Scores: Credibility 5/5; Recency 4/5; Bias 3/5 (5 = low bias risk)

## Verbatim quotes

> "Champ: Controllable and Consistent Human Image Animation with 3D Parametric Guidance"

> "Guidance motion data which is produced via SMPL & Rendering is necessary when performing inference."

> "Directory includes motions per subfolder" ... "depth" ... "dwpose" ... "mask" ... "normal" ... "semantic_map"

## Notes

Champ demonstrates a higher-cost geometry stack combining SMPL-derived depth, normals, semantic maps, masks, and DWPose. It targets video but informs an advanced static pipeline. The code is MIT; public SMPL-X assets are separately non-commercial unless licensed.

# DensePose in Detectron2

- URL: https://github.com/facebookresearch/detectron2/tree/main/projects/DensePose
- Accessed: 2026-08-20
- Source type: Official maintained implementation/paper documentation
- Scores: Credibility 5/5; Recency 4/5; Bias 4/5 (5 = low bias risk)

## Verbatim quotes

> "DensePose aims at learning and establishing dense correspondences between image pixels and 3D object geometry for deformable objects, such as humans or animals."

> "For chart-based estimation, 3D object mesh is split into charts and for each pixel the model estimates chart index I and local chart coordinates (U, V)."

> "Detectron2 is released under the Apache 2.0 license"

## Notes

DensePose encodes body-surface correspondence rather than only sparse joints, making it useful for torso rotation, silhouette, and limb surface layout. It does not encode facial identity, clothing texture, or hidden anatomy.

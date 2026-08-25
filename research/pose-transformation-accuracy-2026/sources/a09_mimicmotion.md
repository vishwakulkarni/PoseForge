# MimicMotion official repository

- URL: https://github.com/Tencent/MimicMotion
- Accessed: 2026-08-20
- Source type: Official ICML 2025 implementation/paper companion
- Scores: Credibility 5/5; Recency 5/5; Bias 3/5 (5 = low bias risk)

## Verbatim quotes

> "MimicMotion: High-Quality Human Motion Video Generation with Confidence-aware Pose Guidance"

> "with confidence-aware pose guidance, temporal smoothness can be achieved so model robustness can be enhanced with large-scale training data."

> "regional loss amplification based on pose confidence significantly eases the distortion of image significantly."

> "Download DWPose pretrained model"

## Notes

Video-specific, but the confidence-aware idea transfers: pose keypoints should carry confidence, and uncertain hands/occluded joints should be rejected, corrected, or down-weighted rather than enforced.

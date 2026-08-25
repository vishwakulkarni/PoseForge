# F1: Separate identity and pose conditioning

The strongest supported design is a hybrid: multiple real identity references feed an identity-specific channel, while DWPose/OpenPose plus DensePose or depth feeds a separate structural channel. Prompt-only multi-reference editing remains useful as a quality tier, but the reviewed evidence does not establish keypoint-exact pose transfer. ControlNet, DWPose, DensePose, PhotoMaker, InstantID, and 3D-guided Champ independently support separation or composition of controls. Confidence-aware MimicMotion supports rejecting or down-weighting uncertain pose joints.

Commercial use requires a license audit: InstantID and IP-Adapter FaceID explicitly restrict released face models/checkpoints to research use; PhotoMaker, base models, face encoders, and 3D body assets must be reviewed component by component.


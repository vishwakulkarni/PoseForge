# Indian model identity-preservation demos

These launch assets demonstrate one synthetic adult Indian model adopting three substantially different pose references while preserving her recognizable identity, hair, blue Indian dress, earrings, shoes, and styling.

| Demo | Identity input | Pose-only input | Result | Presentation |
| --- | --- | --- | --- | --- |
| Overhead editorial pose | `indian-model-identity.png` | `american-pose-01-overhead.png` | `indian-result-01-overhead-v2.png` | `demo-01-overhead.png` |
| Seated editorial pose | `indian-model-identity.png` | `american-pose-02-seated.png` | `indian-result-02-seated-v2.png` | `demo-02-seated.png` |
| Deep side lunge | `indian-model-identity.png` | `american-pose-03-lunge.png` | `indian-result-03-lunge-v2.png` | `demo-03-lunge.png` |

## Reproduce the presentation assets

From the repository root:

```bash
npm run demo:identity
```

The script uses the checked-in source and result images. It does not call an image provider.

## Generation record

- Workflow: OpenAI built-in image generation, identity-preserve mode
- Input order: the Indian model image was the identity authority; each second image supplied pose, framing, and camera direction only
- Shared constraints: preserve the identity source's face, skin tone, hair, age, body type, dress, jewelry, and shoes; do not blend the pose model's identity or outfit; no text or watermark
- Generation times observed on August 7, 2026: overhead 29.2 s, seated 49.3 s, lunge 47.4 s
- Execution: managed image-generation service; local hardware does not perform inference
- Local environment: macOS client; the service did not expose accelerator details

These images are synthetic demonstration assets. Before publishing any replacement made from a real person's photograph, record that person's permission and attribution preference. These assets demonstrate the launch presentation workflow; they are not evidence of Codex CLI, Google Antigravity, or ComfyUI parity.

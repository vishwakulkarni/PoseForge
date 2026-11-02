# PoseForge user guide

PoseForge is a local-first photo studio for putting a saved person into a new
pose, composing portraits, and preparing document photos. Your database,
workspace, and generated files live on your computer.

## Privacy boundary

- **ComfyUI** can keep both files and inference on your machine.
- **Local formatting** in ID Photos crops, resizes, and creates print sheets
  without sending the portrait to an AI provider.
- **OpenAI, Gemini, and Replicate** send the selected references and prompt to
  that provider's API.
- **Codex CLI** uses the account and provider connection of the locally
  installed CLI. It may send references to their provider.

PoseForge has no hosted account or gallery service. Review `SECURITY.md` before
exposing the app outside a trusted machine.

## Studio

Studio combines identity photos, a pose reference, and art direction.

1. Add one to four subjects in **Sources**, or select a saved character.
2. Add a pose image, choose one from the pose library, or use a pose collage in
   Advanced mode.
3. Set the background, style, and optional creative brief.
4. Choose a ready generation engine in the docked action bar.
5. Review the token and cost estimate, then generate.

Normal mode keeps the core workflow compact. Advanced mode adds per-person
direction, fidelity controls, camera and lighting, composition, retouching,
aspect ratio, recipes, pose-collage splitting, and up to six queued variants.
The generate action stays docked at the bottom of the workspace.

HEIC and HEIF uploads are converted for browser preview and processing. The
original subject should be clear, well lit, and large enough to recognize.

## Automate content in Advanced Studio

**Add node** includes building blocks for repeatable content:

- **LLM Text** writes captions, hooks or prompt ideas from your instruction
  and any text connected to it. Choose OpenAI, Gemini or Codex CLI, then
  select **Write**.
- **List** makes everything after it run once per line, up to 25 lines. Type
  the lines yourself, or connect text such as an LLM's "five ideas, one per
  line". The node shows how many items will run.
- **Image Transform** resizes an image for a platform: Story/Reel 9:16,
  portrait 4:5, square 1:1, landscape 16:9 or pin 3:4. **Crop** fills the
  frame and **Pad** fits the whole image on a colour you pick. It can write a
  caption on the image, either typed into the node or connected from another
  node. With **Editor: Built-in** it runs on your computer and costs nothing.
  Choose **Editor: Codex CLI** and describe the edit instead, for example
  "remove the background and add our logo bottom-right". Codex makes the edit
  using any connected text, and the format is then applied to its result.
- **Output** collects the finished images, clips and captions, so a run
  reports what it delivered.

A typical chain is LLM Text → List → Image Generator → Image Transform →
Output. One run turns one brief into several captioned posts in the right
format.

**Fallback model.** On a generator or LLM Text node, choose a second model.
It is used when the first one isn't set up or fails, and the result records
which model made it.

Scheduled runs, webhooks and resuming interrupted runs are set up through
the MCP tools or the API; see the MCP guide.

## Share an Advanced Studio workflow

Choose **Share** in the Advanced Studio toolbar to download the workflow as
one `.poseforge.json` file. The file holds:
- the nodes and their connections;
- the prompts;
- the model each generator uses;
- the input images and clips.

Generated results are not included: whoever imports the file generates their
own. Character and Pose library inputs embed their current photo, so only
share the file with people you would show those photos to.

To use a shared file, choose **Import workflow** on the Advanced Studio page.
The import dialog shows how each generator fits your setup:
- **Ready:** it runs as is.
- **Needs setup:** the author used a provider you haven't configured. The
  dialog links to the right Settings section.
- **Model unavailable** or **Not available here:** your version of PoseForge
  doesn't have that model or engine.

Each generator keeps the author's choice unless you pick one of your
configured models instead. A node you keep stays on the author's model and
works once that provider is set up.

## Characters and poses

**Characters** stores people you use repeatedly. In Studio, **Use character**
fills the next available subject slot. **Poses** contains curated references
and uploaded poses. **Use this pose** returns to Studio with that pose selected.

Uploaded pose images are saved automatically. Use search and category filters
to narrow the library before opening a pose.

## ID Photos

ID Photos supports the U.S. and India profiles supplied by the API, including
passport, visa, India e-Visa, and India OCI application photos.

1. Choose the country and document.
2. Upload a recent, front-facing portrait.
3. Keep **Local format** selected for crop, resize, and optional 4×6 print-sheet
   generation with zero provider tokens.
4. Compare the result against the checklist and linked official source.

Every profile shows when PoseForge checked the guidance and, when the authority
publishes one, the source's own update date. Government acceptance is never
guaranteed. The official authority is the source of truth.

**AI assist** is experimental and may be unsuitable where an authority requires
an unaltered photograph. It uses the selected engine and displays an estimated
usage cost before generation.

## History and Metrics

History contains the runs stored by this PoseForge installation. Open a run to
inspect its engine, status, output, and recorded usage.

Metrics aggregates the same generation records into cost, tokens, reliability,
latency, queue time, and engine/model breakdowns. Use **Session** for runs since
the API process started or **Historical** for all stored runs. Export the current
scope as JSON or CSV. See `docs/METRICS.md` for exact definitions.

## Settings and engines

Settings reports engine readiness, selects the default engine, and stores the
configuration required by API providers. Credential fields are write-only in
the browser; saved secrets are never rendered back into the page.

Codex requires its CLI to be installed and authenticated.
ComfyUI requires a running server and an exported API workflow. Gemini, OpenAI,
and Replicate require provider API keys. Follow the setup instructions shown
beside each engine in Settings.

## Troubleshooting

- If an engine is unavailable, open Settings and read its readiness reason.
- If a generation fails, open History for the recorded error and request ID.
- If a cloud engine rejects an image, confirm its size, format, and provider
  policy; try a JPG or PNG if its API does not accept HEIC directly.
- If the UI cannot load data, restart the single PoseForge process with
  `npm run dev` and review its terminal output.

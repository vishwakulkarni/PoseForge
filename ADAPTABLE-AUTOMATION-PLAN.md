# Adaptable Content Automation — Plan

Scope: Advanced Studio workflows (`/studio-advanced`), their run engine, and the MCP tools that drive them.

**Status (2026-11-01): implemented.** All six phases are done. See the Unreleased section of `CHANGELOG.md` and
"Building blocks for content", "Resuming runs" and "Triggers" in `docs/MCP.md`. Triggers and setting inputs are
available through the API and MCP only; the canvas has no UI for them yet.

## Where it's rigid today

The workflow engine is well built: it runs nodes in parallel waves, records versions and runs, takes `{{inputs}}`, runs batches, has MCP tools, and imports and exports shared workflows. It's hard to adapt for one reason: **the node kinds are hard-coded in about 8 places.** To add a kind such as "LLM caption", "resize for Instagram" or "upscale", you have to edit all of these:

| Where | What's hard-coded |
|---|---|
| `lib/advancedStudioProject.js` (`NODE_TYPES`) | The list of kinds the document check accepts |
| `lib/advancedWorkflowRunner.js` and `lib/advancedWorkflowShare.js` | `GENERATOR_TYPES`, defined twice: only generators ever run |
| `routes/advanced-studio-projects.js` (`resolveNodeInputs`) | Works by checking each kind and connection-point name in turn |
| `routes/advanced-studio-projects.js` (`runGeneratorNode`) | Picks between image and video with an if/else |
| `web/lib/advanced-studio/resolve-inputs.ts` | A hand-maintained copy of the server's input resolver |
| `lib/advancedRunInputs.js` | Inputs can only be text or images, so a generator's settings (aspect ratio, model) can't change per run |
| `lib/advancedCapabilities.js` (`IMAGE_CAPABILITIES`) | The image settings table lives here, but the video models live on each engine. The two are set up differently |
| `executeRun` / `liveRuns` in the route | Runs only exist in server memory. A restart leaves runs marked `running` forever. There is no recovery step |

The frontend already has the right model: a per-node registry in `web/lib/advanced-studio/registry/` and a typed `ACCEPTS` table in `data-types.ts` for which outputs can feed which inputs. The server has nothing like it.

## Phases

### Phase 1: a node registry on the server (the foundation, no change in behavior)

- Add `lib/advancedNodes/`, with one module per kind: `{ type, inputs: [{ id, dataType, multiple }], outputs: [{ id, dataType }], sanitize(data), execute?(ctx) }`.
- `NODE_TYPES`, both copies of `GENERATOR_TYPES`, the `resolveNodeInputs` checks and `runGeneratorNode` all read from the registry. "Runnable" means the node has `execute`, not "is a generator".
- Wave planning (`planWaves` / `runWaves`) orders nodes by the dependencies of any node that has `execute`.
- `GET /capabilities` sends each kind's inputs and outputs to the frontend so the two can't drift apart. `resolve-inputs.ts` stays only for previews.
- **Done when:** the existing `advancedWorkflowRuns` and share tests pass unchanged, and adding a kind touches only one server module and one UI module.

### Phase 2: node kinds that make content workflows adaptable

Each one is a single registry module.

- **LLM text**: a prompt plus inputs in, text out. It reuses `lib/promptAssistant.js` for captions, hooks, prompt variations and translations.
- **List / fan-out**: one text input becomes N lines, and the nodes downstream run once per item. This is the batch feature moved inside the graph.
- **Image transform**: crop or resize to a platform preset (9:16, 1:1, 4:5), add a padded background or overlay text. It uses the `sharp` library already installed.
- **Output / export**: names and gathers the final files of a run, so the run record and MCP `get_run` return clear deliverables instead of every node's results.

### Phase 3: inputs of any type

- Inputs can be bound to any setting a node exposes, not only text and images. For example, `aspectRatio` or `model` on a generator, or `audio` and `video` media inputs.
- Each input gets a type (`enum`, `number`, `media`). The type check uses the node's real capabilities, so a single batch can turn one template into 9:16, 1:1 and 16:9 versions.

### Phase 4: fallback when a provider fails

- Generator nodes get an optional ordered list of fallback engines and models. If the first choice isn't set up, fails or hits a rate limit, the next one runs. The run records which provider actually ran.
- The import compatibility report from `advancedWorkflowShare` can suggest a fallback list automatically.
- Move the image settings table from `IMAGE_CAPABILITIES` onto each engine module, the way `videoModels` already works. Then adding a provider really means one file.

### Phase 5: runs that survive a restart

- On startup, any run left as `running` or `queued` is marked `failed`, with a message saying the server restarted. Nodes that finished keep their results.
- Optional: offer "resume" for the nodes that didn't finish, using the run's stored inputs and its version's document.
- This has to be in place before scheduled or unattended automation is safe.

### Phase 6: triggers (only if you want unattended runs)

- Saved run presets: a workflow, its inputs and a schedule, run by a cron scheduler inside the app. Optionally a webhook endpoint that takes inputs.
- Everything goes through the existing `startRun`, so spending limits and usage tracking still apply.
- Skip this phase if MCP agents and manual runs are enough.

## Order and risks

- Do the phases in order 1 → 3 → 2 → 4 → 5 → 6. Phase 1 makes the rest cheap, and Phase 5 has to come before Phase 6.
- **Old documents:** Phase 1 doesn't change the document format, so no migration is needed. A new kind added in Phase 2 needs a `schemaVersion` bump only if it changes the data of an existing kind. `migrateAdvancedDocument` already handles that.
- **Imported workflows:** the share importer has to run new kinds through their registry `sanitize` function, because imported files aren't trusted.
- **Uncommitted work:** commit the in-progress share feature and migration `017` before starting Phase 1, because Phase 1 edits the same route and share files.

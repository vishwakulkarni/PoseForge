const fs = require("fs");
const path = require("path");
const { z } = require("zod");

const BASE = "/api/advanced-studio-projects";

const DOCUMENT_GUIDE = `A workflow document is { nodes: [], edges: [] }.
Nodes: { id, type, position: { x, y }, data, label? }. advanced_list_capabilities → nodeTypes lists every type's
input handles (target handles), output types and which settings can be bound to run inputs.
- text: data { text } — a prompt. Output "text".
- imageInput: data { imageUrl | characterId | poseId }. imageUrl may be a /storage URL from upload_workflow_image or any
  http(s) image URL (downloaded once at run time); characterId uses that character's current primary photo; poseId uses a
  pose library image. Output "image".
- videoInput / audioInput: data { mediaUrl } from upload_workflow_media or an http(s) URL. Output "video" / "audio".
- imageGenerator: data { engine, model, aspectRatio, resolution, outputs (1-4), fallbacks? }. Inputs "prompt" (text,
  required), "image" (references). Output "image".
- videoGenerator: data { engine, model, aspectRatio, resolution, duration, sound, fallbacks? }. Inputs "prompt",
  "startFrame" / "endFrame" / "reference" (images), "referenceVideo", "referenceAudio". Output "video".
- llmText: data { engine, instruction } — writes text (captions, hooks, prompt variations, translations) with an engine
  whose text.supported is true (OpenAI, Gemini, Codex CLI). Input "text" (context). Output "text".
- list: data { text } — fans out: one item per line (bullets and "1." numbering are dropped) of the connected text, else
  of its own text, at most 25. Every running node downstream runs once per item. Input "text". Output "text".
- imageTransform: data { preset ("original", "9:16", "4:5", "1:1", "16:9", "3:4"), fit ("cover" crops, "contain" pads),
  background ("#rrggbb" padding), overlayText?, overlayPosition ("top" | "bottom") } — resizes for a platform and can
  write a caption band; connected text overrides overlayText. Inputs "image" (required), "text". Output "image". Local, free.
  With engine set to one whose transform.supported is true (codex), that engine edits the image as data.instruction says —
  remove a background, add a logo, grade colours, lay out a title — using connected text as material; the preset is
  applied to its result and no caption band is drawn.
- output: no data — marks deliverables. Inputs "image", "video", "text". A run's deliverables are its output nodes'
  results, named after each node's label.
fallbacks: [{ engine, model? }] (up to 3) on a generator or llmText are tried in order when its own model is not set up
or fails; each result records the engine and model that produced it.
Edges: { id, source, sourceHandle, target, targetHandle, dataType }; sourceHandle is the output type.
Pick engine/model/aspectRatio/resolution values from advanced_list_capabilities.
Inputs make a workflow a reusable template: write {{name}} in a text or list node's text, an llmText instruction or an
imageTransform overlayText or instruction; set data.inputName on a text, list, imageInput, videoInput or audioInput node (its current
value is the default); or bind a setting with data.inputBindings, e.g. { "aspectRatio": "format" } on a generator or
{ "preset": "format" } on an imageTransform. Fill them per run with run_workflow / run_batch / triggers "inputs".
Example — prompt → image → animated video:
nodes: [{ id: "p", type: "text", position: {x:0,y:0}, data: { text: "A neon city at dusk" } },
 { id: "img", type: "imageGenerator", position: {x:500,y:0}, data: { engine: "openai", aspectRatio: "16:9" } },
 { id: "vid", type: "videoGenerator", position: {x:1000,y:0}, data: { engine: "fal-video", model: "<id>" } }]
edges: [{ id: "e1", source: "p", sourceHandle: "text", target: "img", targetHandle: "prompt", dataType: "text" },
 { id: "e2", source: "p", sourceHandle: "text", target: "vid", targetHandle: "prompt", dataType: "text" },
 { id: "e3", source: "img", sourceHandle: "image", target: "vid", targetHandle: "startFrame", dataType: "image" }]
Example — one brief → five captioned 9:16 posts: llmText ("Write 5 short hooks about {{topic}}") → list → imageGenerator
(prompt) → imageTransform (preset "9:16", list also wired to its "text") → output.`;

const workflowId = z.string().uuid().describe("Workflow (Advanced Studio project) id.");
const imageValue = z.union([
  z.string().describe("A /storage URL or an http(s) image URL."),
  z.object({ characterId: z.string().uuid() }),
  z.object({ poseId: z.string().uuid() }),
  z.object({ url: z.string() }),
]);
const inputsSchema = z.record(z.string(), z.union([z.string(), z.number(), imageValue]))
  .describe("Values for the workflow's inputs (see get_workflow → inputs): text for {{name}} placeholders and text inputs, an image value for image inputs, a URL for video and audio inputs, and for a setting input one of its options (or a number in its range).");
const nodeIdsSchema = z.array(z.string()).optional()
  .describe("Ids of nodes that run (generators, llmText, imageTransform, output). Unselected upstream nodes keep their existing results.");
const scheduleSchema = z.union([
  z.object({ type: z.literal("interval"), minutes: z.number().int().min(5).max(10080) }),
  z.object({ type: z.literal("daily"), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).describe("HH:MM, 24-hour, in the server's local time.") }),
  z.null(),
]).describe("When the trigger runs on its own; null for webhook-only or on-demand.");
const triggerId = z.string().uuid().describe("Trigger id.");
const documentSchema = z.record(z.string(), z.unknown()).describe(DOCUMENT_GUIDE);

const { isExecutable } = require("../../advancedNodes");

module.exports = [
  {
    name: "advanced_list_capabilities",
    route: `GET ${BASE}/capabilities`,
    description: "List what Advanced Studio workflows can use: engines (readiness, models, aspect ratios, resolutions; for video the per-model inputs, durations and sound support; text.supported for llmText), nodeTypes (each type's input handles, output types, whether it runs, and which settings can be bound to run inputs) and transformPresets. Call this before writing node data.",
    input: {},
    annotations: { readOnlyHint: true },
  },
  {
    name: "list_workflows",
    route: `GET ${BASE}`,
    description: "List Advanced Studio workflows with their id, name, template, revision and node count.",
    input: {},
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_workflow",
    route: `GET ${BASE}/:id`,
    description: "Get a workflow's full document and current revision. Pass the revision to update_workflow as expectedRevision.",
    input: { id: workflowId },
    annotations: { readOnlyHint: true },
  },
  {
    name: "create_workflow",
    route: `POST ${BASE}`,
    description: `Create an Advanced Studio workflow, either from a starter template or from a full document. The response's warnings list anything that was dropped or that the engine will ignore — fix them with update_workflow.\n\n${DOCUMENT_GUIDE}`,
    input: {
      name: z.string().max(100).optional(),
      template: z.enum(["image", "video", "storyboard", "blank"]).optional().describe("Starter graph, used when no document is given."),
      document: documentSchema.optional(),
    },
  },
  {
    name: "update_workflow",
    route: `PUT ${BASE}/:id`,
    description: "Replace a workflow's document (and optionally rename it). expectedRevision must be the revision from your last read; a conflict means someone else saved first — call get_workflow and reapply your change. Check the response's warnings.",
    input: {
      id: workflowId,
      expectedRevision: z.number().int().min(0),
      name: z.string().max(100).optional(),
      document: documentSchema,
    },
  },
  {
    name: "delete_workflow",
    route: `DELETE ${BASE}/:id`,
    description: "Archive a workflow. Its generated files stay in history.",
    input: { id: workflowId },
    annotations: { destructiveHint: true },
  },
  {
    name: "upload_workflow_image",
    route: `POST ${BASE}/:id/assets`,
    description: "Upload a local image (PNG, JPEG, WebP, HEIC; 25MB max) for a workflow. Put the returned url in an imageInput node's data.imageUrl.",
    input: { id: workflowId, filePath: z.string().describe("Absolute path of the image on this machine.") },
    files: { image: "filePath" },
  },
  {
    name: "upload_workflow_media",
    route: `POST ${BASE}/:id/media`,
    description: "Upload a local video (MP4, MOV, WebM, M4V) or audio clip (MP3, WAV, M4A, AAC, OGG, FLAC), 200MB max. Put the returned url in a videoInput or audioInput node's data.mediaUrl.",
    input: { id: workflowId, filePath: z.string().describe("Absolute path of the clip on this machine.") },
    files: { file: "filePath" },
  },
  {
    name: "export_workflow",
    route: `GET ${BASE}/:id/export`,
    description: "Save a workflow as a shareable .poseforge.json file: nodes, wiring, prompts, the chosen engine and model of each generator, and its input images and clips embedded (character and pose inputs embed their current photo). Outputs, settings and keys are never included. Returns what the file needs to run (requirements) and anything left out (exportWarnings).",
    input: {
      id: workflowId,
      filePath: z.string().describe("Absolute path to write, e.g. /Users/me/paris-reel.poseforge.json."),
    },
    async call({ id, filePath }, api) {
      const file = await api.call(`GET ${BASE}/:id/export`, { params: { id } });
      const target = path.resolve(filePath);
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.writeFile(target, JSON.stringify(file));
      return {
        filePath: target,
        bytes: (await fs.promises.stat(target)).size,
        name: file.name,
        nodeCount: file.document.nodes.length,
        embeddedFiles: Object.keys(file.assets).length,
        requirements: file.requirements,
        exportWarnings: file.exportWarnings,
      };
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "preview_workflow_import",
    route: `POST ${BASE}/import/preview`,
    description: "Check a .poseforge.json workflow file before importing it, without creating anything. report.generators lists each generator's status here — ready, needs-setup (the provider is not configured), unknown-model, unknown-engine or unset — with issues and the configured alternatives it could switch to.",
    input: { filePath: z.string().describe("Absolute path of the .poseforge.json file.") },
    files: { file: "filePath" },
    annotations: { readOnlyHint: true },
  },
  {
    name: "import_workflow",
    route: `POST ${BASE}/import`,
    description: "Create a workflow from a .poseforge.json file. Generators keep the author's engine and model unless replacements switches them (pick from preview_workflow_import alternatives); a generator whose provider is not set up imports as is and runs once it is configured.",
    input: {
      filePath: z.string().describe("Absolute path of the .poseforge.json file."),
      name: z.string().max(100).optional().describe("Name for the new workflow; defaults to the file's."),
      replacements: z.record(z.string(), z.object({ engine: z.string(), model: z.string() })).optional()
        .describe("Per generator node id, the engine and model to use instead of the author's."),
    },
    files: { file: "filePath" },
  },
  {
    name: "run_workflow",
    route: `POST ${BASE}/:id/run`,
    description: "Start a run and return a runId immediately. Runs every node that runs — or only nodeIds — in dependency order, independent nodes in parallel and once per item downstream of a list node, with optional inputs filled in (the saved workflow is not changed). Generations take seconds to minutes and may spend provider credits; poll get_run until its status is completed, partial or failed. A node downstream of a failed node is skipped.",
    input: { id: workflowId, nodeIds: nodeIdsSchema, inputs: inputsSchema.optional() },
  },
  {
    name: "run_batch",
    route: `POST ${BASE}/:id/batch`,
    description: "Run the same workflow once per row of inputs (at most 100 rows), e.g. every product × pose combination. Every row is validated before any starts. Returns a batchId and one runId per row; follow progress with list_runs({ batchId }). Spends provider credits for every row.",
    input: { id: workflowId, rows: z.array(inputsSchema).min(1).max(100), nodeIds: nodeIdsSchema },
  },
  {
    name: "get_run",
    route: `GET ${BASE}/:id/runs/:runId`,
    description: "One run: status (queued, running, completed, partial, failed), the version it ran, its inputs, each node's outcome, every output file (outputs), what it delivers (deliverables: its output nodes' results, named by node label, else every output), its estimated cost, and resumedFrom / triggerId when it was resumed or started by a trigger.",
    input: { id: workflowId, runId: z.string().uuid() },
    annotations: { readOnlyHint: true },
  },
  {
    name: "list_runs",
    route: `GET ${BASE}/:id/runs`,
    description: "A workflow's runs, newest first, optionally only those of one version or one batch.",
    input: {
      id: workflowId,
      versionId: z.string().uuid().optional(),
      batchId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "resume_run",
    route: `POST ${BASE}/:id/runs/:runId/resume`,
    description: "Run a failed or partial run's unfinished nodes again — after a server restart, a provider outage or a fix to a provider's setup — with the same version and inputs. Finished nodes are not run again; their results feed the resumed nodes. Returns the new runId (its resumedFrom is the old run). Spends provider credits.",
    input: { id: workflowId, runId: z.string().uuid() },
  },
  {
    name: "list_triggers",
    route: `GET ${BASE}/:id/triggers`,
    description: "A workflow's triggers: saved runs that fire on a schedule, from a webhook or on demand, each with its inputs, nodeIds, schedule, whether it has a webhook, enabled, nextRunAt, and its last run (lastRunId, lastError).",
    input: { id: workflowId },
    annotations: { readOnlyHint: true },
  },
  {
    name: "create_trigger",
    route: `POST ${BASE}/:id/triggers`,
    description: "Save a way to run this workflow unattended: inputs and nodeIds as for run_workflow, plus a schedule (every N minutes, or daily at HH:MM server time) and/or webhook: true. Validated against the workflow now. With webhook: true the response's webhookToken is shown only this once — the URL is POST /api/advanced-studio-projects/hooks/<triggerId> with Authorization: Bearer <token> and optional { inputs }. Scheduled runs spend provider credits without anyone present; a trigger whose last run is still going is skipped.",
    input: {
      id: workflowId,
      name: z.string().max(100).optional(),
      inputs: inputsSchema.optional(),
      nodeIds: nodeIdsSchema,
      schedule: scheduleSchema.optional(),
      webhook: z.boolean().optional().describe("Create a webhook (returns its token once)."),
      enabled: z.boolean().optional(),
    },
  },
  {
    name: "update_trigger",
    route: `PUT ${BASE}/:id/triggers/:triggerId`,
    description: "Change a trigger's name, inputs, nodeIds, schedule (null removes it) or enabled. webhook: true issues a new token (returned once; the old one stops working), webhook: false removes the webhook.",
    input: {
      id: workflowId,
      triggerId,
      name: z.string().max(100).optional(),
      inputs: inputsSchema.optional(),
      nodeIds: nodeIdsSchema,
      schedule: scheduleSchema.optional(),
      webhook: z.boolean().optional(),
      enabled: z.boolean().optional(),
    },
  },
  {
    name: "delete_trigger",
    route: `DELETE ${BASE}/:id/triggers/:triggerId`,
    description: "Delete a trigger. Its past runs stay.",
    input: { id: workflowId, triggerId },
    annotations: { destructiveHint: true },
  },
  {
    name: "run_trigger",
    route: `POST ${BASE}/:id/triggers/:triggerId/run`,
    description: "Fire a trigger now, optionally with inputs that override its own. Returns the runId; follow it with get_run. Spends provider credits.",
    input: { id: workflowId, triggerId, inputs: inputsSchema.optional() },
  },
  {
    name: "list_versions",
    route: `GET ${BASE}/:id/versions`,
    description: "A workflow's versions — each distinct set of nodes, settings and wiring that has run — with run counts, what each cost (costUsd; partial when pricedGenerationCount < generationCount, as plan-billed engines like Codex record no price), and which version the canvas currently matches (currentVersionId, null if it has changed since the last run).",
    input: { id: workflowId },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_version",
    route: `GET ${BASE}/:id/versions/:versionId`,
    description: "One version's full workflow document.",
    input: { id: workflowId, versionId: z.string().uuid() },
    annotations: { readOnlyHint: true },
  },
  {
    name: "restore_version",
    route: `POST ${BASE}/:id/versions/:versionId/restore`,
    description: "Put a version's nodes, settings and wiring back on the canvas. Current results stay. expectedRevision is the workflow's current revision.",
    input: { id: workflowId, versionId: z.string().uuid(), expectedRevision: z.number().int().min(0) },
  },
  {
    name: "get_run_status",
    route: `GET ${BASE}/:id`,
    description: "The canvas view of a workflow: each running node's status (idle, queued, running, done, error), error and latest results with local file paths, and the ids of runs still in progress. running is true while any run is.",
    input: { id: workflowId },
    annotations: { readOnlyHint: true },
    async call({ id }, api) {
      const project = await api.call(`GET ${BASE}/:id`, { params: { id } });
      const running = new Set(project.activeRun?.running || []);
      const queued = new Set(project.activeRun?.queued || []);
      return {
        id: project.id,
        revision: project.revision,
        running: Boolean(project.activeRun),
        runIds: project.activeRun?.runIds || [],
        nodes: project.document.nodes
          .filter(isExecutable)
          .map((node) => ({
            id: node.id,
            type: node.type,
            label: node.label || null,
            status: running.has(node.id) ? "running" : queued.has(node.id) ? "queued" : node.data.status || "idle",
            error: node.data.error || null,
            results: node.data.results || [],
            activeResultIndex: node.data.activeResultIndex ?? 0,
          })),
      };
    },
  },
];

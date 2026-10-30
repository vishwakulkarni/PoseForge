const { z } = require("zod");

const BASE = "/api/advanced-studio-projects";

const DOCUMENT_GUIDE = `A workflow document is { nodes: [], edges: [] }.
Nodes: { id, type, position: { x, y }, data, label? }.
- text: data { text } — a prompt. Output handle "text".
- imageInput: data { imageUrl | characterId | poseId }. imageUrl may be a /storage URL from upload_workflow_image or any
  http(s) image URL (downloaded once at run time); characterId uses that character's current primary photo; poseId uses a
  pose library image. Output handle "image".
- videoInput / audioInput: data { mediaUrl } from upload_workflow_media. Output handle "video" / "audio".
- imageGenerator: data { engine, model, aspectRatio, resolution, outputs (1-4) }. Output handle "image".
- videoGenerator: data { engine, model, aspectRatio, resolution, duration, sound }. Output handle "video".
Edges: { id, source, sourceHandle, target, targetHandle, dataType }. Generator target handles:
"prompt" (text, required), "image" (reference images for imageGenerator), "startFrame" / "endFrame" / "reference"
(images for videoGenerator), "referenceVideo", "referenceAudio". A generator's output can feed another generator.
Pick engine/model/aspectRatio/resolution values from advanced_list_capabilities.
Inputs make a workflow a reusable template: write {{name}} in a text node's text, or set data.inputName on a text or
imageInput node (its current value is the default). Fill them per run with run_workflow / run_batch "inputs".
Example — prompt → image → animated video:
nodes: [{ id: "p", type: "text", position: {x:0,y:0}, data: { text: "A neon city at dusk" } },
 { id: "img", type: "imageGenerator", position: {x:500,y:0}, data: { engine: "openai", aspectRatio: "16:9" } },
 { id: "vid", type: "videoGenerator", position: {x:1000,y:0}, data: { engine: "fal-video", model: "<id>" } }]
edges: [{ id: "e1", source: "p", sourceHandle: "text", target: "img", targetHandle: "prompt", dataType: "text" },
 { id: "e2", source: "p", sourceHandle: "text", target: "vid", targetHandle: "prompt", dataType: "text" },
 { id: "e3", source: "img", sourceHandle: "image", target: "vid", targetHandle: "startFrame", dataType: "image" }]`;

const workflowId = z.string().uuid().describe("Workflow (Advanced Studio project) id.");
const imageValue = z.union([
  z.string().describe("A /storage URL or an http(s) image URL."),
  z.object({ characterId: z.string().uuid() }),
  z.object({ poseId: z.string().uuid() }),
  z.object({ url: z.string() }),
]);
const inputsSchema = z.record(z.string(), z.union([z.string(), imageValue]))
  .describe("Values for the workflow's inputs (see get_workflow → inputs): text for {{name}} placeholders and text inputs, an image value for image inputs.");
const nodeIdsSchema = z.array(z.string()).optional()
  .describe("Generator node ids to run. Unselected upstream nodes keep their existing results.");
const documentSchema = z.record(z.string(), z.unknown()).describe(DOCUMENT_GUIDE);

const GENERATOR_TYPES = new Set(["imageGenerator", "videoGenerator"]);

module.exports = [
  {
    name: "advanced_list_capabilities",
    route: `GET ${BASE}/capabilities`,
    description: "List the engines usable in Advanced Studio generator nodes: readiness, models, aspect ratios, resolutions, and for video the per-model inputs, durations and sound support. Call this before writing generator node data.",
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
    name: "run_workflow",
    route: `POST ${BASE}/:id/run`,
    description: "Start generating and return a runId immediately. Runs every generator node — or only nodeIds — in dependency order, independent nodes in parallel, with optional inputs filled in (the saved workflow is not changed). Generations take seconds to minutes and may spend provider credits; poll get_run until its status is completed, partial or failed. A node downstream of a failed node is skipped.",
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
    description: "One run: status (queued, running, completed, partial, failed), the version it ran, its inputs, each node's outcome, every output file, and its estimated cost.",
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
    description: "The canvas view of a workflow: each generator node's status (idle, queued, running, done, error), error and latest results with local file paths, and the ids of runs still in progress. running is true while any run is.",
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
          .filter((node) => GENERATOR_TYPES.has(node.type))
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

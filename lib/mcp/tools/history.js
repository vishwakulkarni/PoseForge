const { z } = require("zod");

const BASE = "/api/generations";
const generationId = z.string().uuid().describe("Generation id.");

module.exports = [
  {
    name: "list_generations",
    route: `GET ${BASE}`,
    description: "List generation history, newest first. Page with cursor (the last id of the previous page).",
    input: {
      limit: z.number().int().min(1).max(100).optional(),
      status: z.enum(["pending", "running", "completed", "failed"]).optional(),
      characterId: z.string().uuid().optional(),
      cursor: z.string().uuid().optional(),
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_generation",
    route: `GET ${BASE}/:id`,
    description: "Get one generation: status, engine, prompt, usage and output files.",
    input: { id: generationId },
    annotations: { readOnlyHint: true },
  },
  {
    name: "delete_generation",
    route: `DELETE ${BASE}/:id`,
    description: "Delete a generation and its files from history. This cannot be undone.",
    input: { id: generationId },
    annotations: { destructiveHint: true },
  },
  {
    name: "estimate_generation_cost",
    route: `GET ${BASE}/estimate`,
    description: "Estimate tokens and cost of a generation before running it.",
    input: {
      engine: z.string().optional().describe("Engine key from list_engines."),
      model: z.string().optional(),
      quality: z.enum(["low", "medium", "high"]).optional(),
      aspectRatio: z.enum(["1:1", "4:5", "16:9", "9:16"]).optional(),
      subjects: z.number().int().min(1).max(4).optional(),
      variants: z.number().int().min(1).max(6).optional(),
      promptChars: z.number().int().min(100).max(4000).optional(),
    },
    annotations: { readOnlyHint: true },
  },
];

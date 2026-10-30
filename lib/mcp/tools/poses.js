const { z } = require("zod");

const BASE = "/api/pose-references";

module.exports = [
  {
    name: "list_poses",
    route: `GET ${BASE}`,
    description: "List the pose library, optionally filtered by category or tag.",
    input: { category: z.string().optional(), tag: z.string().optional() },
    annotations: { readOnlyHint: true },
  },
  {
    name: "suggest_poses",
    route: `GET ${BASE}/suggestions`,
    description: "Suggest poses from the library for a number of subjects. The same seed returns the same suggestions.",
    input: {
      subjectCount: z.number().int().min(1).max(4).optional(),
      limit: z.number().int().min(1).max(6).optional(),
      seed: z.string().max(80).optional(),
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "add_pose",
    route: `POST ${BASE}`,
    description: "Add a local photo to the pose library as a custom pose reference.",
    input: {
      filePath: z.string().describe("Absolute path of the pose photo on this machine (25MB max)."),
      title: z.string().max(80).optional(),
      category: z.string().max(40).optional(),
    },
    files: { posePhoto: "filePath" },
  },
  {
    name: "delete_pose",
    route: `DELETE ${BASE}/:id`,
    description: "Delete a pose reference from the library.",
    input: { id: z.string().uuid() },
    annotations: { destructiveHint: true },
  },
];

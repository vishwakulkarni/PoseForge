const { z } = require("zod");

const BASE = "/api/characters";
const characterId = z.string().uuid().describe("Character id.");
const filePath = z.string().describe("Absolute path of a photo on this machine (PNG, JPEG, WebP, HEIC; 25MB max).");

module.exports = [
  {
    name: "list_characters",
    route: `GET ${BASE}`,
    description: "List saved characters with their photos. A character's primaryPhotoUrl can be used as an imageInput node's imageUrl in a workflow.",
    input: {},
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_character",
    route: `GET ${BASE}/:id`,
    description: "Get one character and all of its photos.",
    input: { id: characterId },
    annotations: { readOnlyHint: true },
  },
  {
    name: "create_character",
    route: `POST ${BASE}`,
    description: "Create a character from a name and one local photo of the person.",
    input: { name: z.string().min(1).max(80), filePath },
    files: { characterPhoto: "filePath" },
  },
  {
    name: "rename_character",
    route: `PATCH ${BASE}/:id`,
    description: "Rename a character. Names are unique and at most 80 characters.",
    input: { id: characterId, name: z.string().min(1).max(80) },
  },
  {
    name: "add_character_photo",
    route: `POST ${BASE}/:id/photos`,
    description: "Add another local photo to a character, optionally making it the primary photo.",
    input: { id: characterId, filePath, makePrimary: z.boolean().optional() },
    files: { photo: "filePath" },
  },
  {
    name: "build_angle_profile",
    route: `POST ${BASE}/:id/angle-profile`,
    description: "Generate a five-angle reference profile of a character with an engine that supports it (default openai). Spends provider credits.",
    input: { id: characterId, engine: z.string().optional().describe("Engine key from list_engines.") },
  },
  {
    name: "delete_character",
    route: `DELETE ${BASE}/:id`,
    description: "Delete a character and all of its photos from disk. This cannot be undone.",
    input: { id: characterId },
    annotations: { destructiveHint: true },
  },
];

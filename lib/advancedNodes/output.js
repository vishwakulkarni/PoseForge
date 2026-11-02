const { nodeError, sanitizeRunState } = require("./shared");

/**
 * Marks what a workflow delivers. Whatever reaches it — images, clips,
 * captions — becomes the run's deliverables, named after the node's label,
 * so a run reports finished files rather than every intermediate result.
 */
module.exports = {
  type: "output",
  inputs: [
    { id: "image", dataType: "image" },
    { id: "video", dataType: "video" },
    { id: "text", dataType: "text" },
  ],
  outputs: [],
  sanitize(value) {
    return sanitizeRunState(value, {});
  },
  items() {
    return [];
  },
  async execute(node, inputs) {
    const results = [
      ...(inputs.image || []).map((imageUrl) => ({ imageUrl })),
      ...(inputs.video || []).map((videoUrl) => ({ videoUrl })),
      ...(inputs.text || []).map((text) => ({ text })),
    ];
    if (!results.length) throw nodeError("Nothing reached this output. Connect an image, video or text.");
    return { results, item: {} };
  },
};

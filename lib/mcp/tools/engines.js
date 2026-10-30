module.exports = [
  {
    name: "list_engines",
    route: "GET /api/engines",
    description: "List every generation engine with its readiness, models and capabilities, and the default engine.",
    input: {},
    annotations: { readOnlyHint: true },
  },
];

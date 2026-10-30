const { z } = require("zod");

module.exports = [
  {
    name: "get_metrics",
    route: "GET /api/metrics",
    description: "Usage metrics: generation counts, success rates, latency, tokens and cost per engine, plus library totals. scope \"session\" covers only this server run.",
    input: { scope: z.enum(["historical", "session"]).optional() },
    annotations: { readOnlyHint: true },
  },
];

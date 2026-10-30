/**
 * API routes deliberately not exposed over MCP, each with the reason.
 *
 * tests/mcpCoverage.test.js fails for any route that is neither a tool's
 * `route` nor listed here, so a new endpoint always gets an explicit decision.
 * To expose one of these later, delete it here and add a tool in tools/.
 */
const GUIDED_STUDIO = "Guided Studio is not part of the MCP surface; agents automate through Advanced Studio workflows.";
const PROVIDER_LOGIN = "Interactive provider sign-in for the Settings page; list_engines reports whether each provider is ready.";
const NOT_CHOSEN = "Not part of the MCP scope yet.";

module.exports = {
  "GET /api/studio-projects": GUIDED_STUDIO,
  "GET /api/studio-projects/default": GUIDED_STUDIO,
  "GET /api/studio-projects/:id": GUIDED_STUDIO,
  "POST /api/studio-projects": GUIDED_STUDIO,
  "PUT /api/studio-projects/:id": GUIDED_STUDIO,
  "DELETE /api/studio-projects/:id": GUIDED_STUDIO,
  "POST /api/studio-projects/:id/run": GUIDED_STUDIO,
  "POST /api/studio-projects/:id/nodes/:nodeId/run": GUIDED_STUDIO,
  "POST /api/studio-projects/:id/nodes/:nodeId/assist": GUIDED_STUDIO,
  "POST /api/generations": "The guided Studio's character + pose transform; agents generate through run_workflow.",
  "POST /api/advanced-studio-projects/:id/nodes/:nodeId/run": "Holds the request open for the whole generation; run_workflow with nodeIds runs single nodes without blocking.",
  "PUT /api/settings": "Settings hold provider credentials and spending limits, which only the user changes, in the UI.",
  "GET /api/higgsfield/status": PROVIDER_LOGIN,
  "POST /api/higgsfield/verify": PROVIDER_LOGIN,
  "POST /api/higgsfield/estimate": "Pricing preview for the Settings page; estimate_generation_cost covers estimates.",
  "GET /api/dreamina/status": PROVIDER_LOGIN,
  "POST /api/dreamina/login": PROVIDER_LOGIN,
  "POST /api/dreamina/login/wait": PROVIDER_LOGIN,
  "POST /api/dreamina/canvas": PROVIDER_LOGIN,
  "GET /api/thumbnails": "Serves resized images to the browser; tools return original file paths instead.",
  "POST /api/media/preview": "Browser preview for HEIC uploads; uploads through MCP are converted server-side.",
  "GET /api/presets": NOT_CHOSEN,
  "POST /api/presets": NOT_CHOSEN,
  "GET /api/recipes": NOT_CHOSEN,
  "POST /api/recipes": NOT_CHOSEN,
  "DELETE /api/recipes/:id": NOT_CHOSEN,
  "GET /api/passport/config": NOT_CHOSEN,
  "POST /api/passport": NOT_CHOSEN,
};

/**
 * The run lifecycle shared by the Dreamina image and video engines.
 *
 * One generation = upload connected images as image nodes, create a node that
 * references them, run it under the generation ID as its submit ID, wait on
 * that same operation, then download the result. The submit ID is the
 * idempotency key: Dreamina never charges twice for it, and recovery only
 * ever observes it (`operation wait`), never resubmits.
 */
const fs = require("fs");
const crypto = require("crypto");
const cli = require("./cli");

const SUCCEEDED = /^(succe|done|complete|finish)/i;
const FAILED = /(fail|reject|cancel|error|block)/i;
const WAIT_SLICE_SECONDS = 600;

const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz";

/** A canonical Node ID (`node_` + 10 lowercase Crockford Base32 characters).
 * Choosing it up front means PoseForge always knows which saved node to
 * price, even when a refusal envelope omits it. */
function newNodeId() {
  return `node_${Array.from(crypto.randomBytes(10), (byte) => CROCKFORD[byte % 32]).join("")}`;
}

/** Puts a local image, video or audio file on the canvas as a media node so
 * the generating node can reference it and the canvas shows where the result
 * came from. */
async function importMedia(projectId, filePath, mediaType, title) {
  const upload = await cli.run(
    ["resource", "upload", "--file", filePath, "--type", mediaType, "--project-id", projectId, "--resource-id", crypto.randomUUID(), "--name", title],
    { timeoutMs: mediaType === "image" ? 120_000 : 600_000 }
  );
  const resourceId = upload.envelope?.data?.resourceId;
  if (!resourceId) throw new cli.DreaminaError(`Dreamina did not register the uploaded ${mediaType}.`, { requestId: upload.envelope?.meta?.requestId });
  const created = await cli.run(["node", "create", mediaType, "--project-id", projectId, "--title", title, "--resource-id", resourceId, "--import-kind", "local_upload"]);
  const nodeId = created.envelope?.data?.node?.nodeId;
  if (!nodeId) throw new cli.DreaminaError(`Dreamina did not create a node for the uploaded ${mediaType}.`, { requestId: created.envelope?.meta?.requestId });
  return nodeId;
}

function importImage(projectId, filePath, title) {
  return importMedia(projectId, filePath, "image", title);
}

function nodeTitle(prompt) {
  const text = prompt.replace(/\s+/g, " ").trim();
  return `PoseForge · ${text.length > 60 ? `${text.slice(0, 57)}…` : text}`;
}

/** A literal "{{" would otherwise be read as a reference placeholder. */
function escapePrompt(prompt) {
  return prompt.replace(/\{\{/g, "\\{{");
}

/** Observes the submitted operation until it is terminal or the local budget
 * runs out. Exit 20 means only the local wait ended. */
async function waitForOperation(projectId, submitId, deadline) {
  for (;;) {
    const remaining = Math.ceil((deadline - Date.now()) / 1000);
    if (remaining <= 0) return null;
    const slice = Math.min(remaining, WAIT_SLICE_SECONDS);
    const { exitCode, envelope } = await cli.run(
      ["operation", "wait", submitId, "--project-id", projectId, "--timeout", `${slice}s`],
      { accept: [cli.EXIT.incomplete], timeoutMs: (slice + 60) * 1000 }
    );
    const data = envelope?.data || envelope?.partialData || {};
    if (exitCode === cli.EXIT.ok && data.state && !/^(accepted|pending|queued|running|in_progress)/i.test(data.state)) return data;
  }
}

/** Credits Dreamina recorded for this run's outputs, when it reports them. */
async function chargedCredits(projectId, nodeId, submitId) {
  if (!nodeId) return null;
  try {
    const { envelope } = await cli.run(["node", "show", "--project-id", projectId, "--node-id", nodeId], { timeoutMs: 30_000 });
    const resources = envelope?.data?.nodes?.[0]?.node?.resources || [];
    const amounts = resources.filter((resource) => resource.submitId === submitId && resource.creditsAmount != null).map((resource) => resource.creditsAmount);
    return amounts.length ? amounts.reduce((sum, value) => sum + value, 0) : null;
  } catch {
    return null;
  }
}

/** First value under any of `keys`, searched depth-first. The exit-10
 * envelope's layout varies between releases (`data`, `partialData`,
 * `creditConfirmation`), so its fields are found by name. */
function findField(value, keys, accept = () => true) {
  if (!value || typeof value !== "object") return undefined;
  for (const key of keys) {
    if (key in value && value[key] != null && accept(value[key])) return value[key];
  }
  for (const child of Object.values(value)) {
    const found = findField(child, keys, accept);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** The saved node's price, from a read-only `node quote`. */
async function quotedCredits(projectId, nodeId) {
  if (!nodeId) return null;
  try {
    const { envelope } = await cli.run(["node", "quote", "--project-id", projectId, "--node-id", nodeId], { timeoutMs: 30_000 });
    const total = envelope?.data?.totalMaxCredits ?? envelope?.data?.items?.[0]?.maxCredits;
    return Number.isFinite(total) ? total : null;
  } catch {
    return null;
  }
}

/**
 * Submits one generating node and brings its result to `downloadPath`.
 * `createArgs` is the `node create image|video ...` command without the run
 * flags; `kind` names the output in messages. Every failure carries
 * `error.usage` saying whether Dreamina charged for it.
 */
async function runNode({ kind, createArgs, target, submitId, quoted, downloadPath, timeoutMs }) {
  const ceiling = quoted.creditCeiling;
  const projectId = target.projectId;
  const ids = { projectId, submitId, nodeId: null, resourceId: null, canvasUrl: target.webUrl };
  const nodeId = newNodeId();
  const args = [...createArgs, "--node-id", nodeId, "--run", "--submit-id", submitId, "--credit-ceiling", String(ceiling)];

  const notCharged = (note) => ({ ...quoted, ...ids, estimatedCredits: 0, refunded: true, pricingNote: note });
  let submitted;
  try {
    submitted = await cli.run(args, { accept: [cli.EXIT.confirmationRequired], timeoutMs: 300_000 });
  } catch (error) {
    // Rejected before acceptance: Dreamina did not run anything.
    if ([cli.EXIT.invalidInput, cli.EXIT.loginRequired, cli.EXIT.permission, cli.EXIT.compatibility].includes(error.exitCode)) {
      error.usage = notCharged("Not charged: Dreamina rejected the request before running it.");
    } else {
      error.usage = { ...quoted, ...ids, pricingNote: `Dreamina may have accepted this run; check the PoseForge canvas before retrying (submit ID ${submitId}).` };
    }
    throw error;
  }

  const envelope = submitted.envelope || {};
  ids.nodeId = nodeId;
  if (submitted.exitCode === cli.EXIT.confirmationRequired) {
    // Nothing ran, but the node is saved, so it can still be priced.
    const minimum = findField(envelope, ["minimumCreditCeiling", "totalMaxCredits", "maxCredits"], Number.isFinite)
      ?? await quotedCredits(projectId, ids.nodeId);
    const message = minimum != null
      ? `Dreamina priced this ${kind} at ${minimum} credits, above your ${ceiling}-credit limit per ${kind}. Nothing was charged; raise the limit in Settings to run it.`
      : `Dreamina could not price this ${kind}, so it was not run. Nothing was charged.`;
    const error = new cli.DreaminaError(message, { exitCode: submitted.exitCode, code: "confirmation-required", requestId: envelope.error?.requestId });
    error.usage = { ...notCharged(`Not charged: ${message}`), quotedCredits: minimum ?? null };
    throw error;
  }

  const result = await waitForOperation(projectId, submitId, Date.now() + timeoutMs);
  if (!result) {
    const error = new cli.DreaminaError(`Dreamina is still generating this ${kind}. It will finish on the PoseForge canvas${target.webUrl ? ` (${target.webUrl})` : ""}; submit ID ${submitId}.`, { code: "timeout" });
    error.usage = { ...quoted, ...ids, pricingNote: "Still running on Dreamina when PoseForge stopped waiting; up to the credit limit may be charged." };
    throw error;
  }

  const output = (result.resources || []).find((resource) => SUCCEEDED.test(resource.state || ""));
  const credits = await chargedCredits(projectId, ids.nodeId, submitId);
  if (!output) {
    const reason = result.submissionError?.message || (FAILED.test(result.state) ? `Dreamina reported the run as ${result.state}.` : `Dreamina finished without a ${kind}.`);
    const error = new cli.DreaminaError(reason, { code: "failed", requestId: result.submissionError?.requestId });
    error.usage = { ...quoted, ...ids, estimatedCredits: credits ?? 0, pricingNote: credits ? `Dreamina recorded ${credits} credits for this failed run.` : "Dreamina reported no credits for this failed run." };
    throw error;
  }

  ids.resourceId = output.resourceId;
  const download = await cli.run(["resource", "download", output.resourceId, "--project-id", projectId, "--output", downloadPath], { timeoutMs: 600_000 });
  const size = fs.existsSync(downloadPath) ? fs.statSync(downloadPath).size : 0;
  if (!size || (download.envelope?.data?.size && download.envelope.data.size !== size)) {
    const error = new cli.DreaminaError(`The Dreamina ${kind} downloaded incompletely. It is still on the PoseForge canvas.`, { code: "download" });
    error.usage = { ...quoted, ...ids, estimatedCredits: credits ?? ceiling };
    throw error;
  }
  return {
    ...quoted,
    ...ids,
    source: credits != null ? "provider-reported" : "estimated",
    estimatedCredits: credits ?? ceiling,
    sha256: download.envelope?.data?.sha256 || null,
    pricingNote: credits != null ? `Dreamina recorded ${credits} credits for this ${kind}.` : `Dreamina did not report the amount; counted at your ${ceiling}-credit limit.`,
  };
}

module.exports = { newNodeId, importMedia, importImage, nodeTitle, escapePrompt, runNode };

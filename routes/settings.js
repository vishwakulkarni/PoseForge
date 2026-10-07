const express = require("express");
const { pool } = require("../db/pool");
const { registry } = require("../engines");
const higgsfield = require("../engines/higgsfield/client");
const higgsfieldBilling = require("../engines/higgsfield/billing");
const dreamina = require("../engines/dreamina/account");
const { normalizeComfyEndpoint, validateWorkflowContract } = require("../lib/comfyWorkflow");
const { asyncHandler } = require("./helpers");
const router = express.Router();

function mask(value) { return value ? `${value.slice(0, 3)}...${value.slice(-4)}` : null; }
function credential(value, environmentValue) {
  if (environmentValue) return { configured: true, masked: "Configured by environment", source: "environment" };
  return { configured: Boolean(value), masked: mask(value), source: value ? "database" : null };
}
function modelAllowed(engineKey, model) { return (registry[engineKey]?.models || []).some((item) => item.id === model); }

async function getSettings() {
  const rows = (await pool.query("SELECT key, value FROM settings")).rows;
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value || ""]));
  return {
    defaultEngine: registry[values.default_engine] ? values.default_engine : "codex",
    openaiApiKey: credential(values.openai_api_key, process.env.OPENAI_API_KEY),
    replicateApiKey: credential(values.replicate_api_key, process.env.REPLICATE_API_TOKEN),
    falApiKey: credential(values.fal_api_key, process.env.FAL_KEY),
    higgsfieldApiKey: credential(values.higgsfield_api_key, process.env.HF_CREDENTIALS),
    higgsfieldMaxUsdPerGeneration: higgsfieldBilling.parseLimit(values.higgsfield_max_usd_per_generation),
    higgsfieldMonthlyBudgetUsd: higgsfieldBilling.parseLimit(values.higgsfield_monthly_budget_usd),
    dreaminaCreditCeiling: dreamina.parseCredits(values.dreamina_credit_ceiling),
    dreaminaImageCreditCeiling: dreamina.parseCredits(values.dreamina_image_credit_ceiling),
    dreaminaMonthlyCreditBudget: dreamina.parseCredits(values.dreamina_monthly_credit_budget),
    geminiApiKey: credential(values.gemini_api_key, process.env.GEMINI_API_KEY),
    geminiModel: modelAllowed("gemini", process.env.GEMINI_IMAGE_MODEL || values.gemini_model) ? process.env.GEMINI_IMAGE_MODEL || values.gemini_model : registry.gemini.models[0].id,
    antigravityModel: modelAllowed("antigravity", process.env.ANTIGRAVITY_MODEL || values.antigravity_model) ? process.env.ANTIGRAVITY_MODEL || values.antigravity_model : registry.antigravity.models[0].id,
    comfyEndpoint: process.env.COMFYUI_URL || values.comfy_endpoint || "http://127.0.0.1:8188",
    comfyModel: modelAllowed("comfy", process.env.COMFYUI_MODEL || values.comfy_model) ? process.env.COMFYUI_MODEL || values.comfy_model : registry.comfy.models[0].id,
    comfyWorkflow: {
      configured: Boolean(process.env.COMFYUI_WORKFLOW_PATH || values.comfy_workflow),
      source: process.env.COMFYUI_WORKFLOW_PATH ? "environment" : values.comfy_workflow ? "database" : null,
      bytes: process.env.COMFYUI_WORKFLOW_PATH ? null : Buffer.byteLength(values.comfy_workflow || "", "utf8"),
    },
  };
}

router.get("/", asyncHandler(async (req, res) => res.json(await getSettings())));

router.put("/", asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (Object.prototype.hasOwnProperty.call(body, "defaultEngine") && !registry[body.defaultEngine]) return res.status(400).json({ error: "Unknown default engine." });
  if (Object.prototype.hasOwnProperty.call(body, "geminiModel") && !modelAllowed("gemini", body.geminiModel)) return res.status(400).json({ error: "Unknown Gemini image model." });
  if (Object.prototype.hasOwnProperty.call(body, "antigravityModel") && !modelAllowed("antigravity", body.antigravityModel)) return res.status(400).json({ error: "Unknown Antigravity model." });
  if (Object.prototype.hasOwnProperty.call(body, "comfyModel") && !modelAllowed("comfy", body.comfyModel)) return res.status(400).json({ error: "Unknown ComfyUI model profile." });
  if (Object.prototype.hasOwnProperty.call(body, "higgsfieldApiKey")) {
    body.higgsfieldApiKey = String(body.higgsfieldApiKey || "").trim();
    if (body.higgsfieldApiKey && !higgsfield.validCredentials(body.higgsfieldApiKey)) {
      return res.status(400).json({ error: "Higgsfield credentials must be in key-id:key-secret format." });
    }
  }
  for (const field of ["higgsfieldMaxUsdPerGeneration", "higgsfieldMonthlyBudgetUsd"]) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    const raw = body[field] == null ? "" : String(body[field]).trim();
    if (raw && higgsfieldBilling.parseLimit(raw) == null) return res.status(400).json({ error: "Higgsfield spending limits must be a dollar amount of 0 or more." });
    body[field] = raw;
  }
  for (const field of ["dreaminaCreditCeiling", "dreaminaImageCreditCeiling", "dreaminaMonthlyCreditBudget"]) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    const raw = body[field] == null ? "" : String(body[field]).trim();
    if (raw && dreamina.parseCredits(raw) == null) return res.status(400).json({ error: "Dreamina credit limits must be a whole number of credits, 0 or more." });
    body[field] = raw;
  }
  if (Object.prototype.hasOwnProperty.call(body, "comfyEndpoint")) {
    try { body.comfyEndpoint = normalizeComfyEndpoint(body.comfyEndpoint, { allowRemote: process.env.COMFYUI_ALLOW_REMOTE === "true" }); }
    catch (error) { return res.status(400).json({ error: error.message }); }
  }
  if (Object.prototype.hasOwnProperty.call(body, "comfyWorkflow")) {
    const workflow = String(body.comfyWorkflow || "");
    if (Buffer.byteLength(workflow, "utf8") > 900 * 1024) return res.status(413).json({ error: "ComfyUI workflow must be smaller than 900 KB." });
    if (workflow) {
      try { validateWorkflowContract(workflow); }
      catch (error) { return res.status(400).json({ error: error.message }); }
    }
    body.comfyWorkflow = workflow;
  }
  const allowed = {
    defaultEngine: "default_engine",
    openaiApiKey: "openai_api_key",
    replicateApiKey: "replicate_api_key",
    falApiKey: "fal_api_key",
    higgsfieldApiKey: "higgsfield_api_key",
    higgsfieldMaxUsdPerGeneration: "higgsfield_max_usd_per_generation",
    higgsfieldMonthlyBudgetUsd: "higgsfield_monthly_budget_usd",
    dreaminaCreditCeiling: "dreamina_credit_ceiling",
    dreaminaImageCreditCeiling: "dreamina_image_credit_ceiling",
    dreaminaMonthlyCreditBudget: "dreamina_monthly_credit_budget",
    geminiApiKey: "gemini_api_key",
    geminiModel: "gemini_model",
    antigravityModel: "antigravity_model",
    comfyEndpoint: "comfy_endpoint",
    comfyModel: "comfy_model",
    comfyWorkflow: "comfy_workflow",
  };
  for (const [field, key] of Object.entries(allowed)) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      await pool.query("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [key, String(body[field] ?? "")]);
    }
  }
  dreamina.clearReadiness();
  res.json(await getSettings());
}));

module.exports = router;

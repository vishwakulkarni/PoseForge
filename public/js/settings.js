const settingsState = { engines: [], settings: null };

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

function selectedEngine(key) {
  return settingsState.engines.find((engine) => engine.key === key);
}

function selectedModel(engineKey, selectId) {
  const engine = selectedEngine(engineKey);
  return engine?.models?.find((model) => model.id === $(selectId).value);
}

function updateModelNote(engineKey, selectId, noteId) {
  const model = selectedModel(engineKey, selectId);
  $(noteId).textContent = model?.note || "Choose the model profile PoseForge should use.";
}

function renderEngineStatus() {
  $("engineStatus").innerHTML = settingsState.engines.map((engine) => {
    const model = engine.models?.find((item) => item.id === engine.selectedModel);
    const local = engine.capabilities?.local;
    const localCli = engine.capabilities?.localCli || engine.key === "codex";
    const detail = engine.reason || model?.label || (engine.capabilities?.multiImage ? "Multiple reference images" : "Standard generation");
    return `<article class="engine-row">
      <div class="engine-icon ${local || localCli ? "local" : "cloud"}">${local || localCli ? "L" : "A"}</div>
      <div class="engine-copy"><div class="name">${esc(engine.label)}</div><div class="reason">${esc(detail)}</div><span>${local ? "Local inference" : localCli ? "Local CLI · provider service" : "Provider API"}</span></div>
      <span class="badge ${engine.ready ? "badge-ok" : "badge-error"}"><span class="badge-dot"></span>${engine.ready ? "Ready" : "Needs setup"}</span>
    </article>`;
  }).join("");
}

function fillModelSelect(engineKey, selectId, value) {
  const engine = selectedEngine(engineKey);
  $(selectId).innerHTML = (engine?.models || []).map((model) => `<option value="${esc(model.id)}">${esc(model.label)}</option>`).join("");
  if (value) $(selectId).value = value;
}

async function loadSettings({ announce = false } = {}) {
  const [enginesData, settings] = await Promise.all([api("/api/engines"), api("/api/settings")]);
  settingsState.engines = enginesData.engines || [];
  settingsState.settings = settings;
  renderEngineStatus();

  $("defaultEngine").innerHTML = settingsState.engines.map((engine) => `<option value="${esc(engine.key)}">${esc(engine.label)}${engine.ready ? "" : " · setup required"}</option>`).join("");
  $("defaultEngine").value = settings.defaultEngine;
  $("openaiKey").placeholder = settings.openaiApiKey.masked || "Not configured";
  $("replicateKey").placeholder = settings.replicateApiKey.masked || "Not configured";
  $("geminiKey").placeholder = settings.geminiApiKey.masked || "Not configured";

  fillModelSelect("gemini", "geminiModel", settings.geminiModel);
  fillModelSelect("antigravity", "antigravityModel", settings.antigravityModel);
  fillModelSelect("comfy", "comfyModel", settings.comfyModel);
  updateModelNote("gemini", "geminiModel", "geminiModelNote");
  updateModelNote("antigravity", "antigravityModel", "antigravityModelNote");
  updateModelNote("comfy", "comfyModel", "comfyModelNote");
  $("comfyEndpoint").value = settings.comfyEndpoint;
  $("workflowState").textContent = settings.comfyWorkflow.configured
    ? `Configured${settings.comfyWorkflow.bytes ? ` · ${Math.ceil(settings.comfyWorkflow.bytes / 1024)} KB` : " by environment"}`
    : "Not configured";
  $("comfyWorkflow").placeholder = settings.comfyWorkflow.configured
    ? "A workflow is already configured. Paste JSON only to replace it."
    : "Paste the workflow exported with “Save (API Format)”";
  if (announce) setStatus($("settingsStatus"), "Engine status refreshed.", "ok");
}

async function saveSettings(payload, message) {
  await api("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  setStatus($("settingsStatus"), message, "ok");
  await loadSettings();
}

const keyInputs = { openaiApiKey: "openaiKey", replicateApiKey: "replicateKey", geminiApiKey: "geminiKey" };
document.querySelectorAll("button[data-key]").forEach((button) => button.addEventListener("click", async () => {
  const field = button.dataset.key;
  const input = $(keyInputs[field]);
  if (!input.value.trim()) return setStatus($("settingsStatus"), "Enter a key before saving.", "error");
  try {
    await saveSettings({ [field]: input.value.trim() }, "Credential saved.");
    input.value = "";
  } catch (error) { setStatus($("settingsStatus"), error.message, "error"); }
}));

$("geminiModel").addEventListener("change", () => updateModelNote("gemini", "geminiModel", "geminiModelNote"));
$("antigravityModel").addEventListener("change", () => updateModelNote("antigravity", "antigravityModel", "antigravityModelNote"));
$("comfyModel").addEventListener("change", () => updateModelNote("comfy", "comfyModel", "comfyModelNote"));

$("saveGeminiModel").addEventListener("click", async () => {
  try { await saveSettings({ geminiModel: $("geminiModel").value }, "Gemini model saved."); }
  catch (error) { setStatus($("settingsStatus"), error.message, "error"); }
});

$("saveAntigravityModel").addEventListener("click", async () => {
  try { await saveSettings({ antigravityModel: $("antigravityModel").value }, "Antigravity model saved."); }
  catch (error) { setStatus($("settingsStatus"), error.message, "error"); }
});

async function saveComfy(testAfterSave = false) {
  const payload = { comfyEndpoint: $("comfyEndpoint").value.trim(), comfyModel: $("comfyModel").value };
  if ($("comfyWorkflow").value.trim()) payload.comfyWorkflow = $("comfyWorkflow").value.trim();
  if (!payload.comfyEndpoint) return setStatus($("settingsStatus"), "Enter the local ComfyUI endpoint.", "error");
  try {
    await saveSettings(payload, testAfterSave ? "ComfyUI setup saved; testing connection…" : "ComfyUI setup saved.");
    $("comfyWorkflow").value = "";
    if (testAfterSave) {
      const engine = selectedEngine("comfy");
      setStatus($("settingsStatus"), engine?.ready ? "ComfyUI is connected and ready." : engine?.reason || "ComfyUI still needs setup.", engine?.ready ? "ok" : "error");
    }
  } catch (error) { setStatus($("settingsStatus"), error.message, "error"); }
}

$("saveComfy").addEventListener("click", () => saveComfy(false));
$("testComfy").addEventListener("click", () => saveComfy(true));
$("refreshEngines").addEventListener("click", () => loadSettings({ announce: true }).catch((error) => setStatus($("settingsStatus"), error.message, "error")));

$("saveDefault").addEventListener("click", async () => {
  try { await saveSettings({ defaultEngine: $("defaultEngine").value }, "Default engine saved."); }
  catch (error) { setStatus($("settingsStatus"), error.message, "error"); }
});

loadSettings().catch((error) => setStatus($("settingsStatus"), error.message, "error"));

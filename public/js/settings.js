async function loadSettings() {
  const [engines, settings] = await Promise.all([api("/api/engines"), api("/api/settings")]);
  $("engineStatus").innerHTML = engines.engines.map((item) => `
    <div class="engine-row">
      <div><div class="name">${item.label}</div>${item.reason ? `<div class="reason">${item.reason}</div>` : `<div class="reason">${item.capabilities?.multiImage ? "Multi-identity capable" : "Standard generation"}</div>`}</div>
      <span class="badge ${item.ready ? "badge-ok" : "badge-error"}"><span class="badge-dot"></span>${item.ready ? "Ready" : "Needs setup"}</span>
    </div>`).join("");
  $("defaultEngine").innerHTML = engines.engines.map((item) => `<option value="${item.key}">${item.label}</option>`).join("");
  $("defaultEngine").value = settings.defaultEngine;
  $("openaiKey").placeholder = settings.openaiApiKey.masked || "Not configured";
  $("replicateKey").placeholder = settings.replicateApiKey.masked || "Not configured";
}

document.querySelectorAll("button[data-key]").forEach((button) => button.addEventListener("click", async () => {
  const field = button.dataset.key;
  const input = $(field === "openaiApiKey" ? "openaiKey" : "replicateKey");
  if (!input.value.trim()) return setStatus($("settingsStatus"), "Enter a key before saving.", "error");
  try {
    await api("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: input.value.trim() }) });
    input.value = "";
    setStatus($("settingsStatus"), "Credential saved.", "ok");
    await loadSettings();
  } catch (error) { setStatus($("settingsStatus"), error.message, "error"); }
}));

$("saveDefault").addEventListener("click", async () => {
  try {
    await api("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defaultEngine: $("defaultEngine").value }) });
    setStatus($("settingsStatus"), "Default engine saved.", "ok");
  } catch (error) { setStatus($("settingsStatus"), error.message, "error"); }
});

loadSettings().catch((error) => setStatus($("settingsStatus"), error.message, "error"));

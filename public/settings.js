async function loadSettings() {
  const [engines, settings] = await Promise.all([api("/api/engines"), api("/api/settings")]);
  $("engineStatus").innerHTML = engines.engines.map((item) => `
    <div class="engine-row">
      <div>
        <div class="name">${item.label}</div>
        ${item.reason ? `<div class="reason">${item.reason}</div>` : ""}
      </div>
      <span class="badge ${item.ready ? "badge-ok" : "badge-error"}"><span class="badge-dot"></span>${item.ready ? "Ready" : "Needs setup"}</span>
    </div>
  `).join("");
  $("defaultEngine").innerHTML = engines.engines.map((item) => `<option value="${item.key}">${item.label}</option>`).join("");
  $("defaultEngine").value = settings.defaultEngine;
  $("openaiKey").placeholder = settings.openaiApiKey.masked || "Not configured";
  $("replicateKey").placeholder = settings.replicateApiKey.masked || "Not configured";
}

document.querySelectorAll("button[data-key]").forEach((button) => button.addEventListener("click", async () => {
  const field = button.dataset.key;
  const input = $(field === "openaiApiKey" ? "openaiKey" : "replicateKey");
  try {
    await api("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: input.value }) });
    input.value = "";
    setStatus($("settingsStatus"), "Saved.", "ok");
    await loadSettings();
  } catch (err) {
    setStatus($("settingsStatus"), err.message, "error");
  }
}));

$("saveDefault").addEventListener("click", async () => {
  try {
    await api("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defaultEngine: $("defaultEngine").value }) });
    setStatus($("settingsStatus"), "Default engine saved.", "ok");
  } catch (err) {
    setStatus($("settingsStatus"), err.message, "error");
  }
});

loadSettings().catch((err) => setStatus($("settingsStatus"), err.message, "error"));

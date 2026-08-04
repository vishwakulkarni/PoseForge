const historyState = { cursor: null };

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function loadFilters() {
  const data = await api("/api/characters");
  const select = $("characterFilter");
  data.characters.forEach((item) => select.add(new Option(item.name, item.id)));
}

function characterLabel(item) {
  if (!item.characters || !item.characters.length) return "Unsaved character";
  return item.characters.map((c) => c.name || `Person ${c.position}`).join(", ");
}

function statusBadge(status) {
  const map = {
    completed: '<span class="badge badge-ok">Completed</span>',
    failed: '<span class="badge badge-error">Failed</span>',
    running: '<span class="badge badge-neutral">Running</span>',
    pending: '<span class="badge badge-neutral">Queued</span>',
  };
  return map[status] || "";
}

function usageCost(value) {
  if (value == null) return "Plan-dependent";
  if (Number(value) === 0) return "$0.00";
  return value < 0.01 ? `$${Number(value).toFixed(4)}` : `$${Number(value).toFixed(2)}`;
}

function usageSummary(usage) {
  if (!usage || !Object.keys(usage).length) return "Not available";
  const source = usage.source === "local" ? "Local" : usage.source === "actual" ? "Recorded" : "Estimated";
  return `${source} · ${new Intl.NumberFormat().format(usage.totalTokens)} tokens · ${usageCost(usage.estimatedCostUsd)}`;
}

function card(item) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "history-card";
  el.innerHTML = `
    <div class="history-thumb">
      ${item.outputUrl ? `<img src="${item.outputUrl}" alt="Result for ${esc(characterLabel(item))}" />` : `<div class="skeleton" style="width:100%;height:100%;"></div>`}
      ${item.characters && item.characters.length > 1 ? `<span class="badge badge-neutral history-count-badge">${item.characters.length} people</span>` : ""}
    </div>
    <div class="history-meta">
      <h4>${esc(characterLabel(item))}</h4>
      <div class="row"><span>${esc(item.engine)} · ${relativeTime(item.createdAt)}</span>${statusBadge(item.status)}</div>
    </div>
  `;
  el.addEventListener("click", () => openDetail(item.id));
  return el;
}

async function load(reset = false) {
  const grid = $("historyGrid");
  if (reset) { historyState.cursor = null; grid.innerHTML = `<div class="skeleton" style="height:220px;"></div><div class="skeleton" style="height:220px;"></div><div class="skeleton" style="height:220px;"></div>`; }
  const params = new URLSearchParams({ limit: "24" });
  if ($("characterFilter").value) params.set("characterId", $("characterFilter").value);
  if ($("statusFilter").value) params.set("status", $("statusFilter").value);
  if (historyState.cursor) params.set("cursor", historyState.cursor);
  const data = await api(`/api/generations?${params}`);
  if (reset) grid.innerHTML = "";
  if (!data.generations.length && reset) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><p>No generations match these filters yet.</p></div>`;
  } else {
    data.generations.forEach((item) => grid.appendChild(card(item)));
  }
  historyState.cursor = data.nextCursor;
  $("loadMore").classList.toggle("hidden", !historyState.cursor);
}

async function openDetail(id) {
  const item = await api(`/api/generations/${id}`);
  const overlay = $("detailOverlay");
  const panel = $("detailPanel");
  const thumbRow = (item.characters || []).map((c) => `<img src="${c.photoUrl}" alt="${esc(c.name || `Person ${c.position}`)}" title="${esc(c.name || `Person ${c.position}`)}" />`).join("");
  panel.innerHTML = `
    ${item.outputUrl ? `<img class="detail-image" src="${item.outputUrl}" alt="Result" />` : ""}
    ${thumbRow ? `<div class="detail-people">${thumbRow}</div>` : ""}
    <div class="kv"><b>People</b><span>${esc(characterLabel(item))}</span></div>
    <div class="kv"><b>Engine</b><span>${esc(item.engine)}${item.advancedSettings?.engineModel || item.usage?.model ? ` · ${esc(item.advancedSettings?.engineModel || item.usage?.model)}` : ""}</span></div>
    <div class="kv"><b>Studio mode</b><span>${esc(item.studioMode || "normal")}</span></div>
    <div class="kv"><b>Status</b><span>${statusBadge(item.status)}</span></div>
    <div class="kv"><b>Background</b><span>${esc(item.backgroundPreset?.name || "None")}</span></div>
    <div class="kv"><b>Style</b><span>${esc(item.stylePreset?.name || "None")}</span></div>
    <div class="kv"><b>Pose reference</b><span><a href="${item.posePhotoUrl}" target="_blank" rel="noreferrer">View</a></span></div>
    ${item.advancedSettings?.output ? `<div class="kv"><b>Output</b><span>${esc(item.advancedSettings.output.aspectRatio || "1:1")} · ${esc(item.advancedSettings.output.quality || "standard")} quality</span></div>` : ""}
    <div class="kv"><b>Usage &amp; rough cost</b><span>${esc(usageSummary(item.usage))}</span></div>
    ${item.usage?.inputTokens ? `<div class="kv"><b>Token detail</b><span>${new Intl.NumberFormat().format(item.usage.inputTokens)} input · ${new Intl.NumberFormat().format(item.usage.outputTokens || 0)} output</span></div>` : ""}
    ${item.usage?.rateDate ? `<div class="kv"><b>Pricing basis</b><span>${esc(item.usage.rateDate)} · provider billing may vary</span></div>` : ""}
    ${item.errorMessage ? `<p class="error-box mt-3">${esc(item.errorMessage)}</p>` : ""}
    <pre>${esc(item.prompt)}</pre>
    <div class="detail-actions">
      ${item.outputUrl ? `<a class="btn btn-secondary" href="${item.outputUrl}" download>Download</a>` : ""}
      ${item.passportSheetUrl ? `<a class="btn btn-secondary" href="${item.passportSheetUrl}" download>Download 4 × 6 sheet</a>` : ""}
      <button type="button" class="btn btn-danger" id="deleteBtn">Delete</button>
      <button type="button" class="btn btn-ghost" id="closeDetail">Close</button>
    </div>
  `;
  overlay.classList.remove("hidden");
  $("closeDetail").addEventListener("click", () => overlay.classList.add("hidden"));
  $("deleteBtn").addEventListener("click", async () => {
    if (!confirm("Delete this generation and its files?")) return;
    await api(`/api/generations/${id}`, { method: "DELETE" });
    overlay.classList.add("hidden");
    load(true);
  });
}

$("detailOverlay").addEventListener("click", (e) => { if (e.target.id === "detailOverlay") e.target.classList.add("hidden"); });
$("characterFilter").addEventListener("change", () => load(true));
$("statusFilter").addEventListener("change", () => load(true));
$("loadMore").addEventListener("click", () => load());

Promise.all([loadFilters(), load(true)]).catch((err) => {
  $("historyGrid").innerHTML = `<p class="error-box" style="grid-column:1/-1;">${err.message}</p>`;
});

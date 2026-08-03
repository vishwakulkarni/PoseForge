const state = {
  characterMode: "upload",
  characterFile: null,
  poseFile: null,
  selectedCharacter: null, // { id, name, primaryPhotoUrl }
  characters: [],
  engines: [],
  lastGeneration: null,
};

function setupDropzone(zoneId, inputId, progressId, onFile) {
  const zone = $(zoneId);
  const input = $(inputId);
  const progress = $(progressId);

  function handleFile(file) {
    if (!file) return;
    onFile(file);
    progress.classList.remove("hidden");
    const bar = progress.firstElementChild;
    bar.style.width = "0%";
    requestAnimationFrame(() => { bar.style.width = "70%"; });
    const reader = new FileReader();
    reader.onload = (e) => {
      bar.style.width = "100%";
      zone.classList.add("has-image");
      zone.style.backgroundImage = "";
      let img = zone.querySelector("img.preview-img");
      if (!img) {
        img = document.createElement("img");
        img.className = "preview-img";
        zone.insertBefore(img, zone.firstChild);
      }
      img.src = e.target.result;
      setTimeout(() => progress.classList.add("hidden"), 500);
    };
    reader.readAsDataURL(file);
  }

  input.addEventListener("change", () => handleFile(input.files[0]));
  zone.addEventListener("click", (e) => { if (e.target.closest("[data-replace]")) return; });
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      handleFile(file);
    }
  });

  zone.querySelector("[data-replace]")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    input.value = "";
    input.click();
  });
}

setupDropzone("characterDropzone", "characterPhoto", "characterProgress", (file) => { state.characterFile = file; });
setupDropzone("poseDropzone", "posePhoto", "poseProgress", (file) => { state.poseFile = file; });

// ---------------------------------------------------------------------
// Character mode switch
// ---------------------------------------------------------------------
document.querySelectorAll("#characterModeSwitch button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#characterModeSwitch button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.characterMode = btn.dataset.mode;
    $("characterUploadMode").classList.toggle("hidden", state.characterMode !== "upload");
    $("characterSavedMode").classList.toggle("hidden", state.characterMode !== "saved");
  });
});

async function loadCharacters() {
  try {
    const data = await api("/api/characters");
    state.characters = data.characters || [];
    const strip = $("savedStrip");
    if (!state.characters.length) {
      strip.innerHTML = `<p class="status-line text-tertiary">No saved characters yet — upload one and click Save.</p>`;
      return;
    }
    strip.innerHTML = state.characters.map((c) => `
      <div class="saved-chip" data-id="${c.id}">
        ${c.primaryPhotoUrl
          ? `<img class="avatar" src="${c.primaryPhotoUrl}" alt="${c.name}" />`
          : `<div class="avatar" style="display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600;color:var(--text-tertiary);">${c.name.slice(0,1).toUpperCase()}</div>`}
        <span>${c.name}</span>
      </div>
    `).join("");
    strip.querySelectorAll(".saved-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        strip.querySelectorAll(".saved-chip").forEach((c) => c.classList.remove("selected"));
        chip.classList.add("selected");
        state.selectedCharacter = state.characters.find((c) => c.id === chip.dataset.id);
      });
    });
  } catch (err) {
    $("savedStrip").innerHTML = `<p class="status-line error">${err.message}</p>`;
  }
}

async function loadPresets() {
  try {
    const data = await api("/api/presets");
    const bg = data.presets.filter((p) => p.type === "background");
    const style = data.presets.filter((p) => p.type === "style");
    $("backgroundPreset").innerHTML = `<option value="">None</option>` + bg.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");
    $("stylePreset").innerHTML = `<option value="">None</option>` + style.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");
  } catch (_) { /* presets are optional */ }
}

async function loadEngines() {
  try {
    const data = await api("/api/engines");
    state.engines = data.engines || [];
    $("engine").innerHTML = state.engines.map((e) => `<option value="${e.key}" ${e.key === data.defaultEngine ? "selected" : ""}>${e.label}${e.ready ? "" : " (needs setup)"}</option>`).join("");
    updateEngineHint();
  } catch (err) {
    setStatus($("engineHint"), err.message, "error");
  }
}

function updateEngineHint() {
  const item = state.engines.find((e) => e.key === $("engine").value);
  if (item && !item.ready) {
    setStatus($("engineHint"), `${item.reason || "This engine needs setup"} — visit Settings to configure it.`, "error");
  } else {
    setStatus($("engineHint"), "", "neutral");
  }
}
$("engine").addEventListener("change", updateEngineHint);

$("saveCharacterBtn").addEventListener("click", async () => {
  const statusEl = $("saveCharacterStatus");
  if (!state.characterFile) return setStatus(statusEl, "Choose a photo first.", "error");
  const name = $("characterName").value.trim();
  if (!name) return setStatus(statusEl, "Enter a name to save under.", "error");
  setStatus(statusEl, "Saving…");
  const form = new FormData();
  form.append("characterPhoto", state.characterFile);
  form.append("name", name);
  try {
    await api("/api/characters", { method: "POST", body: form });
    setStatus(statusEl, "Character saved.", "ok");
    await loadCharacters();
  } catch (err) {
    setStatus(statusEl, err.message, "error");
  }
});

// ---------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------
$("studioForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const statusEl = $("generateStatus");
  const resultArea = $("resultArea");
  const badge = $("resultBadge");

  const engineItem = state.engines.find((e) => e.key === $("engine").value);
  if (!engineItem) return setStatus(statusEl, "Choose an engine.", "error");
  if (!engineItem.ready) return setStatus(statusEl, `${engineItem.reason || "Engine is not ready"}. Open Settings to configure it.`, "error");

  if (!state.poseFile) return setStatus(statusEl, "Add a pose reference photo.", "error");
  const usingSaved = state.characterMode === "saved";
  if (usingSaved && !state.selectedCharacter) return setStatus(statusEl, "Select a saved character.", "error");
  if (!usingSaved && !state.characterFile) return setStatus(statusEl, "Add a character photo.", "error");

  const form = new FormData();
  form.append("posePhoto", state.poseFile);
  if (usingSaved) form.append("characterId", state.selectedCharacter.id);
  else form.append("characterPhoto", state.characterFile);
  form.append("engine", engineItem.key);
  if ($("backgroundPreset").value) form.append("backgroundPresetId", $("backgroundPreset").value);
  if ($("stylePreset").value) form.append("stylePresetId", $("stylePreset").value);
  if ($("instructions").value.trim()) form.append("instructions", $("instructions").value.trim());

  $("transformBtn").disabled = true;
  badge.textContent = "Queued";
  badge.className = "badge badge-neutral";
  resultArea.innerHTML = `<div class="studio-loader"><img class="loader-mascot" src="/images/mascot-painter-dog.png" onerror="this.onerror=null;this.src='/images/mascot-painter-dog.svg';" alt="" /><div class="ring"></div><p id="loaderText">Queued…</p></div>`;
  setStatus(statusEl, "Queued…");

  try {
    const created = await api("/api/generations", { method: "POST", body: form });
    let record;
    do {
      await new Promise((r) => setTimeout(r, 1500));
      record = await api(`/api/generations/${created.id}`);
      const label = record.status === "running" ? "Generating… this can take a minute." : "Queued…";
      const loaderText = $("loaderText");
      if (loaderText) loaderText.textContent = label;
      setStatus(statusEl, label);
    } while (["pending", "running"].includes(record.status));

    state.lastGeneration = record;

    if (record.status === "completed") {
      badge.textContent = "Done";
      badge.className = "badge badge-ok";
      setStatus(statusEl, "Done.", "ok");
      resultArea.innerHTML = `
        <div class="compare">
          <figure><img src="${record.characterPhotoUrl}" alt="Original character" /><figcaption>Before</figcaption></figure>
          <figure><img src="${record.outputUrl}" alt="Transformed result" /><figcaption>After</figcaption></figure>
        </div>
        <div class="result-actions">
          <a class="btn btn-primary" href="${record.outputUrl}" download>Download</a>
          <button type="button" class="btn btn-secondary" id="shareBtn">Share</button>
          <button type="button" class="btn btn-secondary" id="regenerateBtn">Regenerate</button>
        </div>
      `;
      $("shareBtn")?.addEventListener("click", async () => {
        const url = new URL(record.outputUrl, location.origin).href;
        if (navigator.share) { try { await navigator.share({ title: "My PoseForge result", url }); } catch (_) {} }
        else { await navigator.clipboard.writeText(url); setStatus(statusEl, "Link copied to clipboard.", "ok"); }
      });
      $("regenerateBtn")?.addEventListener("click", () => $("studioForm").requestSubmit());
    } else {
      badge.textContent = "Failed";
      badge.className = "badge badge-error";
      resultArea.innerHTML = `<p class="error-box">${record.errorMessage || "Generation failed."}</p>`;
      setStatus(statusEl, record.errorMessage || "Generation failed.", "error");
    }
  } catch (err) {
    badge.textContent = "Failed";
    badge.className = "badge badge-error";
    resultArea.innerHTML = `<p class="error-box">${err.message}</p>`;
    setStatus(statusEl, err.message, "error");
  } finally {
    $("transformBtn").disabled = false;
  }
});

loadCharacters();
loadPresets();
loadEngines();

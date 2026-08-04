const MAX_CHARACTERS = 4;

const state = {
  characters: [], // saved characters, loaded once
  slots: [], // [{ position, mode: 'upload'|'saved', file, selectedCharacterId, selectedCharacterName, el }]
  poseFile: null,
  selectedPoseReferenceId: null,
  poseReferences: [],
  engines: [],
  lastGeneration: null,
};

function setPoseImagePreview(url) {
  const zone = $("poseDropzone");
  zone.classList.add("has-image");
  let img = zone.querySelector("img.preview-img");
  if (!img) { img = document.createElement("img"); img.className = "preview-img"; zone.insertBefore(img, zone.firstChild); }
  img.src = url;
}

// ---------------------------------------------------------------------
// Character slots (up to MAX_CHARACTERS, added one at a time)
// ---------------------------------------------------------------------

function slotTemplate(position) {
  return `
    <div class="character-slot" data-position="${position}">
      <div class="slot-head">
        <span class="slot-label">Person ${position}</span>
        <div class="mode-switch" data-role="modeSwitch">
          <button type="button" class="active" data-mode="upload">Upload</button>
          <button type="button" data-mode="saved">Saved</button>
        </div>
        ${position > 1 ? `<button type="button" class="slot-remove" data-role="remove" title="Remove person ${position}">×</button>` : ""}
      </div>
      <div data-role="uploadMode">
        <label class="dropzone slot-dropzone" data-role="dropzone">
          <input type="file" accept="image/*" data-role="fileInput" />
          <div class="dz-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 16V4M12 4l-4 4M12 4l4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          </div>
          <div class="dz-text">Drop a photo, or click to upload</div>
          <div class="dz-sub">A clear, front-facing photo works best</div>
          <div class="dz-overlay"><button type="button" data-role="replace">Replace photo</button></div>
        </label>
        <div class="upload-progress hidden" data-role="progress"><div></div></div>
        <div class="inline mt-3" style="display:flex; gap:8px;">
          <input type="text" data-role="saveName" placeholder="Save this person as… (optional)" />
          <button type="button" class="btn btn-secondary btn-sm" data-role="saveBtn">Save</button>
        </div>
        <p class="status-line" data-role="saveStatus"></p>
      </div>
      <div data-role="savedMode" class="hidden">
        <div class="saved-strip" data-role="savedStrip"></div>
        <p class="status-line text-tertiary mt-2">Select a saved character above.</p>
      </div>
    </div>
  `;
}

function renderSavedStrip(slot) {
  const strip = slot.el.querySelector('[data-role="savedStrip"]');
  if (!state.characters.length) {
    strip.innerHTML = `<p class="status-line text-tertiary">No saved characters yet — upload one and click Save.</p>`;
    return;
  }
  strip.innerHTML = state.characters.map((c) => `
    <div class="saved-chip ${slot.selectedCharacterId === c.id ? "selected" : ""}" data-id="${c.id}">
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
      const character = state.characters.find((c) => c.id === chip.dataset.id);
      slot.selectedCharacterId = character.id;
      slot.selectedCharacterName = character.name;
      updateAddPersonVisibility();
    });
  });
}

function wireSlot(slot) {
  const el = slot.el;
  const dropzone = el.querySelector('[data-role="dropzone"]');
  const fileInput = el.querySelector('[data-role="fileInput"]');
  const progress = el.querySelector('[data-role="progress"]');

  function handleFile(file) {
    if (!file) return;
    slot.file = file;
    slot.mode = "upload";
    progress.classList.remove("hidden");
    const bar = progress.firstElementChild;
    bar.style.width = "0%";
    requestAnimationFrame(() => { bar.style.width = "70%"; });
    const reader = new FileReader();
    reader.onload = (e) => {
      bar.style.width = "100%";
      dropzone.classList.add("has-image");
      dropzone.style.backgroundImage = "";
      let img = dropzone.querySelector("img.preview-img");
      if (!img) { img = document.createElement("img"); img.className = "preview-img"; dropzone.insertBefore(img, dropzone.firstChild); }
      img.src = e.target.result;
      setTimeout(() => progress.classList.add("hidden"), 500);
      updateAddPersonVisibility();
    };
    reader.readAsDataURL(file);
  }

  fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
  dropzone.addEventListener("click", (e) => { if (e.target.closest("[data-role=replace]")) return; });
  dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("drag-over"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) { const dt = new DataTransfer(); dt.items.add(file); fileInput.files = dt.files; handleFile(file); }
  });
  el.querySelector('[data-role="replace"]')?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); fileInput.value = ""; fileInput.click(); });

  el.querySelectorAll('[data-role="modeSwitch"] button').forEach((btn) => {
    btn.addEventListener("click", () => {
      el.querySelectorAll('[data-role="modeSwitch"] button').forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      slot.mode = btn.dataset.mode;
      el.querySelector('[data-role="uploadMode"]').classList.toggle("hidden", slot.mode !== "upload");
      el.querySelector('[data-role="savedMode"]').classList.toggle("hidden", slot.mode !== "saved");
      updateAddPersonVisibility();
    });
  });

  el.querySelector('[data-role="saveBtn"]').addEventListener("click", async () => {
    const statusEl = el.querySelector('[data-role="saveStatus"]');
    if (!slot.file) return setStatus(statusEl, "Choose a photo first.", "error");
    const name = el.querySelector('[data-role="saveName"]').value.trim();
    if (!name) return setStatus(statusEl, "Enter a name to save under.", "error");
    setStatus(statusEl, "Saving…");
    const form = new FormData();
    form.append("characterPhoto", slot.file);
    form.append("name", name);
    try {
      await api("/api/characters", { method: "POST", body: form });
      setStatus(statusEl, "Character saved.", "ok");
      await loadCharacters();
    } catch (err) {
      setStatus(statusEl, err.message, "error");
    }
  });

  el.querySelector('[data-role="remove"]')?.addEventListener("click", () => removeSlotsFrom(slot.position));

  renderSavedStrip(slot);
}

function addSlot() {
  const position = state.slots.length + 1;
  if (position > MAX_CHARACTERS) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = slotTemplate(position).trim();
  const el = wrapper.firstElementChild;
  $("characterSlots").appendChild(el);
  const slot = { position, mode: "upload", file: null, selectedCharacterId: null, selectedCharacterName: null, el };
  state.slots.push(slot);
  wireSlot(slot);
  updateAddPersonVisibility();
}

function removeSlotsFrom(position) {
  state.slots.filter((s) => s.position >= position).forEach((s) => s.el.remove());
  state.slots = state.slots.filter((s) => s.position < position);
  updateAddPersonVisibility();
}

function slotIsFilled(slot) {
  return slot.mode === "upload" ? Boolean(slot.file) : Boolean(slot.selectedCharacterId);
}

function updateAddPersonVisibility() {
  const btn = $("addPersonBtn");
  const last = state.slots[state.slots.length - 1];
  const canAdd = last && slotIsFilled(last) && state.slots.length < MAX_CHARACTERS;
  btn.classList.toggle("hidden", !canAdd);
}

$("addPersonBtn").addEventListener("click", addSlot);

async function loadCharacters() {
  try {
    const data = await api("/api/characters");
    state.characters = data.characters || [];
    state.slots.forEach(renderSavedStrip);
  } catch (err) {
    // Non-fatal — saved characters are optional; slots still work via upload.
  }
}

// ---------------------------------------------------------------------
// Pose reference
// ---------------------------------------------------------------------

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

setupDropzone("poseDropzone", "posePhoto", "poseProgress", (file) => {
  state.poseFile = file;
  state.selectedPoseReferenceId = null;
  document.querySelectorAll("#poseThumbStrip .pose-thumb").forEach((t) => t.classList.remove("selected"));
});

async function loadPoseReferences(preselectId) {
  const strip = $("poseThumbStrip");
  try {
    const data = await api("/api/pose-references");
    state.poseReferences = (data.poseReferences || []).slice(0, 14);
    if (!state.poseReferences.length) { strip.innerHTML = `<p class="status-line text-tertiary" style="font-size:12px;">No saved poses yet — upload one to start your library.</p>`; return; }
    strip.innerHTML = state.poseReferences.map((p) => `
      <div class="pose-thumb" data-id="${p.id}" title="${p.title}">
        <img src="${p.imageUrl}" alt="${p.title}" loading="lazy" />
        ${p.tagStatus === "pending" ? `<span class="pending-dot" title="Tagging…"></span>` : ""}
      </div>
    `).join("");
    strip.querySelectorAll(".pose-thumb").forEach((thumb) => {
      thumb.addEventListener("click", () => {
        const pose = state.poseReferences.find((p) => p.id === thumb.dataset.id);
        if (!pose) return;
        strip.querySelectorAll(".pose-thumb").forEach((t) => t.classList.remove("selected"));
        thumb.classList.add("selected");
        state.poseFile = null;
        state.selectedPoseReferenceId = pose.id;
        $("posePhoto").value = "";
        setPoseImagePreview(pose.imageUrl);
      });
    });
    if (preselectId) strip.querySelector(`.pose-thumb[data-id="${preselectId}"]`)?.click();
  } catch (err) {
    strip.innerHTML = `<p class="status-line error" style="font-size:12px;">${err.message}</p>`;
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

  if (!state.poseFile && !state.selectedPoseReferenceId) return setStatus(statusEl, "Add a pose reference photo, or pick one from your library.", "error");
  if (!state.slots.length || !slotIsFilled(state.slots[0])) return setStatus(statusEl, "Add at least one person.", "error");
  const unfilled = state.slots.find((s) => !slotIsFilled(s));
  if (unfilled) return setStatus(statusEl, `Add a photo (or pick a saved character) for Person ${unfilled.position}.`, "error");

  const form = new FormData();
  if (state.poseFile) form.append("posePhoto", state.poseFile);
  else form.append("poseReferenceId", state.selectedPoseReferenceId);
  state.slots.forEach((slot) => {
    if (slot.mode === "saved") form.append(`characterId_${slot.position}`, slot.selectedCharacterId);
    else form.append(`characterPhoto_${slot.position}`, slot.file);
  });
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
      const characters = record.characters || [];
      const beforeMarkup = characters.length <= 1
        ? `<img src="${characters[0]?.photoUrl}" alt="${characters[0]?.name || "Person 1"}" />`
        : `<div class="before-thumbs count-${characters.length}">${characters.map((c) => `<img src="${c.photoUrl}" alt="${c.name || `Person ${c.position}`}" />`).join("")}</div>`;
      resultArea.innerHTML = `
        <div class="compare">
          <figure>${beforeMarkup}<figcaption>Before</figcaption></figure>
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
      loadPoseReferences();
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

addSlot();
loadCharacters();
loadPresets();
loadEngines();
loadPoseReferences(new URLSearchParams(location.search).get("pose"));

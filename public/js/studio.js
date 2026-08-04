const MAX_CHARACTERS = 4;

const state = {
  mode: new URLSearchParams(location.search).get("mode") === "advanced" || localStorage.getItem("poseforge-studio-mode") === "advanced" ? "advanced" : "normal",
  characters: [],
  slots: [],
  poseFile: null,
  posePreviewUrl: "",
  selectedPoseReferenceId: null,
  poseReferences: [],
  poseCollageEnabled: false,
  engines: [],
  recipes: [],
  aspectRatio: "1:1",
  generations: [],
  activeResultIndex: 0,
  generating: false,
  usageEstimate: null,
  usageTimer: null,
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function iconUser() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.5" stroke="currentColor" stroke-width="1.6"/><path d="M5.5 20c1-4.2 3.4-6.2 6.5-6.2s5.5 2 6.5 6.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
}

function slotTemplate(position) {
  return `<div class="character-slot" data-position="${position}">
    <div class="slot-head">
      <label class="slot-preview" data-role="preview">${iconUser()}<input class="slot-file" type="file" accept="image/*,.heic,.heif" data-role="fileInput" /></label>
      <div class="slot-copy"><strong data-role="title">Subject ${position}</strong><span data-role="subtitle">Add identity photo</span></div>
      ${position > 1 ? `<button type="button" class="slot-remove" data-role="remove" aria-label="Remove subject ${position}">×</button>` : ""}
      <button type="button" class="slot-menu-btn" data-role="menu" aria-label="Choose source for subject ${position}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="m7 10 5 5 5-5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button>
    </div>
    <div class="slot-picker" data-role="picker">
      <div class="slot-mode-tabs"><button type="button" class="active" data-mode="upload">Upload</button><button type="button" data-mode="saved">Saved</button></div>
      <div data-role="uploadMode">
        <div class="quick-save"><input type="text" data-role="saveName" placeholder="Save identity as…" /><button type="button" data-role="saveBtn">Save</button></div>
        <p class="status-line" data-role="saveStatus"></p>
      </div>
      <div class="saved-strip hidden" data-role="savedMode"></div>
    </div>
  </div>`;
}

function slotIsFilled(slot) {
  return slot.mode === "saved" ? Boolean(slot.selectedCharacterId) : Boolean(slot.file);
}

function slotPreviewUrl(slot) {
  if (slot.mode === "saved") return state.characters.find((c) => c.id === slot.selectedCharacterId)?.primaryPhotoUrl || "";
  return slot.previewUrl || "";
}

function renderSavedStrip(slot) {
  const strip = slot.el.querySelector('[data-role="savedMode"]');
  if (!state.characters.length) {
    strip.innerHTML = `<span class="status-line">No saved identities yet.</span>`;
    return;
  }
  strip.innerHTML = state.characters.map((character) => `<button type="button" class="saved-chip ${slot.selectedCharacterId === character.id ? "selected" : ""}" data-id="${character.id}" title="${esc(character.name)}">
    ${character.primaryPhotoUrl ? `<img src="${character.primaryPhotoUrl}" alt="" />` : `<span class="saved-avatar">${esc(character.name.slice(0, 1).toUpperCase())}</span>`}
    <span class="saved-name">${esc(character.name)}</span>
  </button>`).join("");
  strip.querySelectorAll(".saved-chip").forEach((chip) => chip.addEventListener("click", () => {
    slot.mode = "saved";
    slot.selectedCharacterId = chip.dataset.id;
    slot.file = null;
    strip.querySelectorAll(".saved-chip").forEach((item) => item.classList.toggle("selected", item === chip));
    syncSlot(slot);
  }));
}

function syncSlot(slot) {
  const character = state.characters.find((item) => item.id === slot.selectedCharacterId);
  const title = slot.el.querySelector('[data-role="title"]');
  const subtitle = slot.el.querySelector('[data-role="subtitle"]');
  const preview = slot.el.querySelector('[data-role="preview"]');
  const url = slotPreviewUrl(slot);
  title.textContent = character?.name || `Subject ${slot.position}`;
  subtitle.textContent = slotIsFilled(slot) ? (slot.mode === "saved" ? "Saved identity" : "Uploaded identity") : "Add identity photo";
  preview.querySelector("img")?.remove();
  if (url) preview.insertAdjacentHTML("afterbegin", `<img src="${url}" alt="" />`);
  slot.el.classList.toggle("is-filled", slotIsFilled(slot));
  slot.el.classList.remove("has-error");
  renderSubjectDirections();
  updateWorkspace();
}

function wireSlot(slot) {
  const input = slot.el.querySelector('[data-role="fileInput"]');
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    if (slot.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(slot.previewUrl);
    slot.mode = "upload";
    slot.file = file;
    slot.selectedCharacterId = null;
    slot.el.querySelector('[data-role="subtitle"]').textContent = isHeicFile(file) ? "Converting HEIC preview…" : "Preparing preview…";
    try {
      slot.previewUrl = await uploadPreviewUrl(file);
      syncSlot(slot);
    } catch (error) {
      slot.file = null;
      slot.previewUrl = "";
      input.value = "";
      slot.el.querySelector('[data-role="subtitle"]').textContent = error.message;
      slot.el.classList.add("has-error");
      updateWorkspace();
    }
  });
  slot.el.querySelector('[data-role="menu"]').addEventListener("click", () => slot.el.querySelector('[data-role="picker"]').classList.toggle("hidden"));
  slot.el.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => {
    slot.mode = button.dataset.mode;
    slot.el.querySelectorAll("[data-mode]").forEach((item) => item.classList.toggle("active", item === button));
    slot.el.querySelector('[data-role="uploadMode"]').classList.toggle("hidden", slot.mode !== "upload");
    slot.el.querySelector('[data-role="savedMode"]').classList.toggle("hidden", slot.mode !== "saved");
    syncSlot(slot);
  }));
  slot.el.querySelector('[data-role="saveBtn"]').addEventListener("click", async () => {
    const status = slot.el.querySelector('[data-role="saveStatus"]');
    const name = slot.el.querySelector('[data-role="saveName"]').value.trim();
    if (!slot.file) return setStatus(status, "Upload a photo first.", "error");
    if (!name) return setStatus(status, "Add a name first.", "error");
    const form = new FormData();
    form.append("characterPhoto", slot.file);
    form.append("name", name);
    try {
      setStatus(status, "Saving…");
      await api("/api/characters", { method: "POST", body: form });
      await loadCharacters();
      setStatus(status, "Saved to Characters.", "ok");
    } catch (error) { setStatus(status, error.message, "error"); }
  });
  slot.el.querySelector('[data-role="remove"]')?.addEventListener("click", () => removeSlotsFrom(slot.position));
  renderSavedStrip(slot);
}

function addSlot() {
  if (state.slots.length >= MAX_CHARACTERS) return;
  const position = state.slots.length + 1;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = slotTemplate(position);
  const slot = { position, mode: "upload", file: null, selectedCharacterId: null, previewUrl: "", el: wrapper.firstElementChild };
  state.slots.push(slot);
  $("characterSlots").appendChild(slot.el);
  wireSlot(slot);
  renderSubjectDirections();
  updateWorkspace();
}

function removeSlotsFrom(position) {
  state.slots.filter((slot) => slot.position >= position).forEach((slot) => {
    if (slot.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(slot.previewUrl);
    slot.el.remove();
  });
  state.slots = state.slots.filter((slot) => slot.position < position);
  renderSubjectDirections();
  updateWorkspace();
}

async function loadCharacters() {
  try {
    const data = await api("/api/characters");
    state.characters = data.characters || [];
    state.slots.forEach(renderSavedStrip);
  } catch (_) { /* uploads still work without the saved library */ }
}

function setupPoseUpload() {
  const zone = $("poseDropzone");
  const input = $("posePhoto");
  const progress = $("poseProgress");
  async function accept(file) {
    if (!file) return;
    if (state.posePreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(state.posePreviewUrl);
    state.poseFile = file;
    state.selectedPoseReferenceId = null;
    setStatus($("generateStatus"), isHeicFile(file) ? "Converting HEIC pose preview…" : "Preparing pose preview…");
    progress.classList.remove("hidden");
    try {
      state.posePreviewUrl = await uploadPreviewUrl(file);
      requestAnimationFrame(() => { progress.firstElementChild.style.width = "100%"; });
      setTimeout(() => progress.classList.add("hidden"), 450);
      setStatus($("generateStatus"), "Pose reference ready.", "ok");
      renderPosePreview();
    } catch (error) {
      state.poseFile = null;
      state.posePreviewUrl = "";
      input.value = "";
      progress.classList.add("hidden");
      setStatus($("generateStatus"), error.message, "error");
      renderPosePreview();
    }
  }
  input.addEventListener("change", () => accept(input.files[0]));
  zone.addEventListener("dragover", (event) => { event.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", (event) => { event.preventDefault(); zone.classList.remove("drag-over"); accept(event.dataTransfer.files[0]); });
  zone.querySelector("[data-replace]").addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); input.click(); });
}

function renderPosePreview() {
  const zone = $("poseDropzone");
  zone.querySelector("img.preview-img")?.remove();
  if (state.posePreviewUrl) zone.insertAdjacentHTML("afterbegin", `<img class="preview-img" src="${state.posePreviewUrl}" alt="" />`);
  zone.classList.toggle("has-image", Boolean(state.posePreviewUrl));
  document.querySelectorAll(".pose-thumb").forEach((thumb) => thumb.classList.toggle("selected", thumb.dataset.id === state.selectedPoseReferenceId));
  renderPoseCollageGrid();
  updateWorkspace();
}

async function loadPoseReferences(preselectId) {
  const strip = $("poseThumbStrip");
  try {
    const data = await api("/api/pose-references");
    const allPoses = data.poseReferences || [];
    const requested = preselectId ? allPoses.find((pose) => pose.id === preselectId) : null;
    state.poseReferences = (requested ? [requested, ...allPoses.filter((pose) => pose.id !== requested.id)] : allPoses).slice(0, 16);
    strip.innerHTML = state.poseReferences.map((pose) => `<button type="button" class="pose-thumb" data-id="${pose.id}" title="${esc(pose.title)}"><img src="${pose.imageUrl}" alt="" />${pose.tagStatus === "pending" ? `<span class="pending-dot"></span>` : ""}</button>`).join("");
    strip.querySelectorAll(".pose-thumb").forEach((thumb) => thumb.addEventListener("click", () => {
      const pose = state.poseReferences.find((item) => item.id === thumb.dataset.id);
      state.poseFile = null;
      state.selectedPoseReferenceId = pose.id;
      state.posePreviewUrl = pose.imageUrl;
      $("poseCollageEnabled").checked = false;
      syncPoseCollageControls();
      $("posePhoto").value = "";
      renderPosePreview();
    }));
    if (preselectId) strip.querySelector(`[data-id="${CSS.escape(preselectId)}"]`)?.click();
  } catch (error) { strip.innerHTML = `<span class="status-line error">${esc(error.message)}</span>`; }
}

async function loadPresets() {
  try {
    const data = await api("/api/presets");
    for (const preset of data.presets || []) {
      const target = preset.type === "background" ? $("backgroundPreset") : $("stylePreset");
      target.add(new Option(preset.name, preset.id));
    }
  } catch (_) { /* presets are optional */ }
}

function selectedEngine() { return state.engines.find((item) => item.key === $("engine").value); }

async function loadEngines() {
  const select = $("engine");
  try {
    const [enginesData, settingsData] = await Promise.all([api("/api/engines"), api("/api/settings")]);
    state.engines = enginesData.engines || [];
    select.innerHTML = "";
    state.engines.forEach((engine) => {
      const option = new Option(engine.label + (engine.ready ? "" : " · unavailable"), engine.key);
      option.disabled = !engine.ready;
      select.add(option);
    });
    const preferred = state.engines.find((item) => item.key === settingsData.defaultEngine && item.ready) || state.engines.find((item) => item.ready);
    if (preferred) select.value = preferred.key;
    updateEngineInfo();
  } catch (error) {
    select.innerHTML = `<option value="">No engines available</option>`;
    setStatus($("generateStatus"), error.message, "error");
  }
}

function updateEngineInfo() {
  const engine = selectedEngine();
  const stateEl = $("engineState");
  stateEl.classList.toggle("ready", Boolean(engine?.ready));
  stateEl.lastChild.textContent = engine?.ready ? "Ready" : "Unavailable";
  const notes = [];
  if (engine?.capabilities?.multiImage === "montage") notes.push("Multiple identities are combined into a reference montage for this engine.");
  if (engine?.capabilities?.quality === false) notes.push("Quality is interpreted as prompt direction by this engine.");
  if (engine?.capabilities?.aspectRatio === "prompt") notes.push("Aspect ratio is communicated as creative direction.");
  $("capabilityNote").textContent = notes.join(" ") || "Controls are supported by the selected engine.";
  $("engineHint").textContent = engine?.key === "codex" ? "Runs through your local Codex CLI workspace." : "Reference images are sent only to the selected API engine.";
  updateWorkspace();
  refreshUsageEstimate();
}

function setStudioMode(mode) {
  state.mode = mode === "advanced" ? "advanced" : "normal";
  document.body.dataset.studioMode = state.mode;
  localStorage.setItem("poseforge-studio-mode", state.mode);
  document.querySelectorAll("[data-studio-mode]").forEach((button) => button.classList.toggle("active", button.dataset.studioMode === state.mode));
  syncPoseCollageControls();
  updateWorkspace();
  refreshUsageEstimate();
}

function renderSubjectDirections() {
  const mount = $("subjectDirections");
  const previous = [...mount.querySelectorAll(".subject-direction")].map((el) => ({ direction: el.querySelector('[data-role="direction"]')?.value || "", expression: el.querySelector('[data-role="expression"]')?.value || "" }));
  mount.innerHTML = state.slots.map((slot, index) => {
    const character = state.characters.find((item) => item.id === slot.selectedCharacterId);
    const url = slotPreviewUrl(slot);
    return `<div class="subject-direction">
      <div class="subject-direction-head">${url ? `<img src="${url}" alt="" />` : `<span class="subject-direction-avatar">${index + 1}</span>`}<span>${esc(character?.name || `Subject ${index + 1}`)}</span></div>
      <input type="text" data-role="direction" maxlength="280" placeholder="Wardrobe or placement" value="${esc(previous[index]?.direction || "")}" />
      <input type="text" data-role="expression" maxlength="100" placeholder="Expression" value="${esc(previous[index]?.expression || "")}" />
    </div>`;
  }).join("");
}

function advancedSettings() {
  return {
    identityFidelity: Number($("identityFidelity").value),
    poseFidelity: Number($("poseFidelity").value),
    ageFidelity: Number($("ageFidelity").value),
    hairFidelity: Number($("hairFidelity").value),
    preserveSkinTexture: $("preserveSkinTexture").checked,
    correctHands: $("correctHands").checked,
    subjects: [...document.querySelectorAll(".subject-direction")].map((el) => ({ direction: el.querySelector('[data-role="direction"]').value.trim(), expression: el.querySelector('[data-role="expression"]').value.trim() })),
    camera: { framing: $("framing").value, angle: $("cameraAngle").value, lens: $("lens").value, depthOfField: $("depthOfField").value, aperture: $("aperture").value },
    lighting: $("lighting").value,
    lightingTemperature: $("lightingTemperature").value,
    timeOfDay: $("timeOfDay").value,
    composition: { spacing: $("subjectSpacing").value, crop: $("cropSafety").value, backgroundSeparation: $("backgroundSeparation").value, mirrorPose: $("mirrorPose").checked },
    finish: { retouch: $("retouch").value, colorGrade: $("colorGrade").value, grain: $("grain").value, sharpness: Number($("sharpness").value) },
    poseCollage: { enabled: $("poseCollageEnabled").checked, count: Number($("poseCollageCount").value), layout: $("poseCollageLayout").value },
    negativePrompt: $("negativePrompt").value.trim(),
    output: { aspectRatio: state.aspectRatio, quality: $("quality").value, variantCount: Number($("variantCount").value), variationStrength: Number($("variationStrength").value), seed: $("seed").value === "" ? null : Number($("seed").value) },
  };
}

function applyAdvancedSettings(settings = {}) {
  $("identityFidelity").value = settings.identityFidelity ?? 85;
  $("poseFidelity").value = settings.poseFidelity ?? 80;
  $("ageFidelity").value = settings.ageFidelity ?? 90;
  $("hairFidelity").value = settings.hairFidelity ?? 85;
  $("preserveSkinTexture").checked = settings.preserveSkinTexture !== false;
  $("correctHands").checked = settings.correctHands !== false;
  $("identityValue").textContent = $("identityFidelity").value;
  $("poseValue").textContent = $("poseFidelity").value;
  $("ageValue").textContent = $("ageFidelity").value;
  $("hairValue").textContent = $("hairFidelity").value;
  $("framing").value = settings.camera?.framing || "auto";
  $("cameraAngle").value = settings.camera?.angle || "auto";
  $("lens").value = settings.camera?.lens || "auto";
  $("depthOfField").value = settings.camera?.depthOfField || "auto";
  $("aperture").value = settings.camera?.aperture || "auto";
  $("lighting").value = settings.lighting || "auto";
  $("lightingTemperature").value = settings.lightingTemperature || "auto";
  $("timeOfDay").value = settings.timeOfDay || "auto";
  $("subjectSpacing").value = settings.composition?.spacing || "auto";
  $("cropSafety").value = settings.composition?.crop || "safe";
  $("backgroundSeparation").value = settings.composition?.backgroundSeparation || "auto";
  $("mirrorPose").checked = settings.composition?.mirrorPose === true;
  $("retouch").value = settings.finish?.retouch || "natural";
  $("colorGrade").value = settings.finish?.colorGrade || "auto";
  $("grain").value = settings.finish?.grain || "none";
  $("sharpness").value = settings.finish?.sharpness ?? 50;
  $("sharpnessValue").textContent = $("sharpness").value;
  $("negativePrompt").value = settings.negativePrompt || "";
  $("quality").value = settings.output?.quality || "medium";
  $("variantCount").value = String(settings.output?.variantCount || 1);
  $("variationStrength").value = settings.output?.variationStrength ?? 35;
  $("variationValue").textContent = $("variationStrength").value;
  $("seed").value = settings.output?.seed ?? "";
  $("poseCollageEnabled").checked = settings.poseCollage?.enabled === true;
  $("poseCollageCount").value = String(settings.poseCollage?.count || 2);
  $("poseCollageLayout").value = settings.poseCollage?.layout || "auto";
  setAspectRatio(settings.output?.aspectRatio || "1:1");
  const directionEls = document.querySelectorAll(".subject-direction");
  directionEls.forEach((el, index) => {
    el.querySelector('[data-role="direction"]').value = settings.subjects?.[index]?.direction || "";
    el.querySelector('[data-role="expression"]').value = settings.subjects?.[index]?.expression || "";
  });
  syncPoseCollageControls();
  updateWorkspace();
  refreshUsageEstimate();
}

function compactNumber(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function money(value) {
  if (value == null) return "plan-dependent cost";
  if (value < 0.01) return `$${Number(value).toFixed(4)}`;
  return `$${Number(value).toFixed(2)}`;
}

function renderUsage(usage, final = false) {
  if (!usage) return;
  state.usageEstimate = usage;
  const source = usage.source === "actual" ? "Recorded usage" : final ? "Final estimate" : "Estimated usage";
  const line = `${compactNumber(usage.totalTokens)} tokens · ${money(usage.estimatedCostUsd)}`;
  $("usageEstimate").innerHTML = `<span>${source}</span><strong>${line}</strong><small>${esc(usage.pricingNote || `Pricing basis reviewed ${usage.rateDate || "recently"}. Actual provider billing can vary.`)}</small>`;
  $("dockUsage").textContent = `${source}: ${line}`;
}

function aggregateGenerationUsage(generations) {
  const items = generations.map((item) => item.usage).filter((usage) => usage && usage.totalTokens);
  if (!items.length) return null;
  return {
    source: items.some((item) => item.source === "actual") ? "actual" : "estimated",
    rateDate: items[0].rateDate,
    inputTokens: items.reduce((sum, item) => sum + (Number(item.inputTokens) || 0), 0),
    outputTokens: items.reduce((sum, item) => sum + (Number(item.outputTokens) || 0), 0),
    totalTokens: items.reduce((sum, item) => sum + (Number(item.totalTokens) || 0), 0),
    estimatedCostUsd: items.every((item) => item.estimatedCostUsd != null) ? items.reduce((sum, item) => sum + Number(item.estimatedCostUsd), 0) : null,
    pricingNote: items[0].pricingNote,
  };
}

function refreshUsageEstimate() {
  clearTimeout(state.usageTimer);
  state.usageTimer = setTimeout(async () => {
    if (!$("engine").value) return;
    const settings = advancedSettings();
    const promptChars = $("instructions").value.length + $("negativePrompt").value.length + settings.subjects.reduce((sum, subject) => sum + subject.direction.length + subject.expression.length, 0) + 600;
    const params = new URLSearchParams({
      engine: $("engine").value,
      quality: state.mode === "advanced" ? settings.output.quality : "medium",
      aspectRatio: state.mode === "advanced" ? settings.output.aspectRatio : "1:1",
      subjects: String(Math.max(state.slots.filter(slotIsFilled).length, 1)),
      variants: String(plannedOutputCount()),
      promptChars: String(promptChars),
    });
    try { renderUsage(await api(`/api/generations/estimate?${params}`)); }
    catch (_) { $("dockUsage").textContent = "Usage estimate unavailable."; }
  }, 180);
}

function plannedOutputCount() {
  if (state.mode !== "advanced") return 1;
  return $("poseCollageEnabled").checked ? Number($("poseCollageCount").value) : Number($("variantCount").value);
}

function collageColumns(count, layout) {
  if (layout === "vertical") return 1;
  if (layout === "horizontal") return count;
  if (layout === "2x2" || layout === "2x3") return 2;
  if (layout === "3x2") return 3;
  if (count === 4) return 2;
  if (count >= 5) return 3;
  return count;
}

function renderPoseCollageGrid() {
  const grid = $("poseCollageGrid");
  const enabled = state.mode === "advanced" && $("poseCollageEnabled").checked && Boolean(state.posePreviewUrl);
  grid.classList.toggle("hidden", !enabled);
  if (!enabled) return;
  const count = Number($("poseCollageCount").value);
  grid.style.gridTemplateColumns = `repeat(${collageColumns(count, $("poseCollageLayout").value)}, 1fr)`;
  grid.innerHTML = Array.from({ length: count }, (_, index) => `<span>${index + 1}</span>`).join("");
}

function syncPoseCollageControls() {
  if (!$("poseCollageEnabled")) return;
  state.poseCollageEnabled = state.mode === "advanced" && $("poseCollageEnabled").checked;
  $("poseCollageOptions").classList.toggle("hidden", !state.poseCollageEnabled);
  $("poseCollageHelp").classList.toggle("hidden", !state.poseCollageEnabled);
  $("variantCount").disabled = state.poseCollageEnabled;
  if (state.poseCollageEnabled) $("variantCount").value = $("poseCollageCount").value;
  renderPoseCollageGrid();
  updateWorkspace();
  refreshUsageEstimate();
}

async function loadRecipes() {
  try {
    const data = await api("/api/recipes");
    state.recipes = data.recipes || [];
    $("recipeSelect").innerHTML = `<option value="">Custom setup</option>${state.recipes.map((recipe) => `<option value="${recipe.id}">${esc(recipe.name)}</option>`).join("")}`;
  } catch (_) { /* migrations may not be applied yet */ }
}

function openRecipeModal() {
  $("recipeModal").classList.remove("hidden");
  document.body.classList.add("modal-open");
  setTimeout(() => $("recipeName").focus(), 30);
}

function closeRecipeModal() {
  $("recipeModal").classList.add("hidden");
  document.body.classList.remove("modal-open");
  setStatus($("recipeStatus"), "");
}

async function saveRecipe() {
  const name = $("recipeName").value.trim();
  if (!name) return setStatus($("recipeStatus"), "Give this recipe a name.", "error");
  try {
    setStatus($("recipeStatus"), "Saving…");
    const recipe = await api("/api/recipes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, characterCount: state.slots.length, settings: advancedSettings() }) });
    await loadRecipes();
    $("recipeSelect").value = recipe.id;
    $("recipeName").value = "";
    closeRecipeModal();
  } catch (error) { setStatus($("recipeStatus"), error.message, "error"); }
}

function setAspectRatio(ratio) {
  state.aspectRatio = ["1:1", "4:5", "16:9", "9:16"].includes(ratio) ? ratio : "1:1";
  $("canvasArtboard").dataset.aspect = state.aspectRatio;
  $("canvasRatio").textContent = state.aspectRatio;
  document.querySelectorAll("[data-ratio]").forEach((button) => button.classList.toggle("active", button.dataset.ratio === state.aspectRatio));
  refreshUsageEstimate();
}

function updateWorkspace() {
  const filled = state.slots.filter(slotIsFilled);
  const hasPose = Boolean(state.posePreviewUrl);
  $("personCounter").textContent = `${state.slots.length} / ${MAX_CHARACTERS}`;
  $("addPersonBtn").classList.toggle("hidden", !(state.slots.length < MAX_CHARACTERS && slotIsFilled(state.slots[state.slots.length - 1])));
  const empty = $("canvasEmpty");
  const composition = $("sourceComposition");
  const showComposition = !state.generating && !state.generations.length && (filled.length || hasPose);
  empty.classList.toggle("hidden", showComposition || state.generating || state.generations.length);
  composition.classList.toggle("hidden", !showComposition);
  if (showComposition) {
    $("compositionPose").src = state.posePreviewUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600'%3E%3Crect width='100%25' height='100%25' fill='%23e9ebef'/%3E%3C/svg%3E";
    $("compositionSubjects").innerHTML = filled.map((slot) => `<div class="composition-subject"><img src="${slotPreviewUrl(slot)}" alt="" /></div>`).join("");
    $("compositionSummary").textContent = `${filled.length} subject${filled.length === 1 ? "" : "s"} · ${hasPose ? "pose ready" : "add pose"}`;
  }
  const ready = Boolean(filled.length && filled.length === state.slots.length && hasPose && selectedEngine()?.ready && !state.generating);
  const collageNeedsUpload = state.poseCollageEnabled && !state.poseFile;
  const canGenerate = ready && !collageNeedsUpload;
  const outputCount = plannedOutputCount();
  $("transformBtn").disabled = !canGenerate;
  $("generateSummary").textContent = canGenerate ? `${filled.length} subject${filled.length === 1 ? "" : "s"} · ${outputCount} output${outputCount === 1 ? "" : "s"} · ${state.aspectRatio}` : collageNeedsUpload ? "Upload a pose collage to continue" : "Add sources to begin";
  $("generateOverline").textContent = state.mode === "advanced" ? "Advanced transformation" : "Guided transformation";
  const dot = document.querySelector(".canvas-status-dot");
  dot.className = `canvas-status-dot${state.generating ? " running" : canGenerate ? " ready" : ""}`;
  $("canvasLabel").textContent = state.generating ? "Generation in progress" : state.generations.length ? "Generation complete" : canGenerate ? "Composition ready" : collageNeedsUpload ? "Upload pose collage" : "Ready to compose";
}

function renderGenerationStage() {
  const stage = $("resultArea");
  const tray = $("variantTray");
  if (state.generating && !state.generations.some((item) => item.outputUrl)) {
    stage.classList.remove("hidden");
    stage.innerHTML = `<div class="studio-loader"><img src="/images/mascot-painter-dog.png" onerror="this.onerror=null;this.src='/images/mascot-painter-dog.svg'" alt="" /><div class="loader-ring"></div><strong>Forging your composition</strong><span>Preserving identity, pose, and direction</span></div>`;
    return;
  }
  const current = state.generations[state.activeResultIndex] || state.generations.find((item) => item.outputUrl);
  if (!current?.outputUrl) {
    if (!state.generations.length) return stage.classList.add("hidden");
    stage.classList.remove("hidden");
    stage.innerHTML = `<div class="generation-error"><span>Generation stopped</span><strong>No variation completed successfully.</strong><p>${esc(state.generations[0]?.errorMessage || "Review the selected engine and try again.")}</p><a href="/history.html">Open generation history →</a></div>`;
    tray.classList.add("hidden");
    return;
  }
  stage.classList.remove("hidden");
  stage.innerHTML = `<img src="${current.outputUrl}" alt="Generated transformation" /><div class="result-overlay"><span>Variation ${state.activeResultIndex + 1}</span><div><a href="${current.outputUrl}" download>Download</a><a href="/history.html">History</a><button type="button" id="regenerateBtn">Regenerate</button></div></div>`;
  $("regenerateBtn").addEventListener("click", () => $("studioForm").requestSubmit());
  tray.classList.toggle("hidden", state.generations.length <= 1);
  tray.innerHTML = state.generations.map((item, index) => `<button type="button" class="variant-thumb ${index === state.activeResultIndex ? "active" : ""}" data-index="${index}">${item.outputUrl ? `<img src="${item.outputUrl}" alt="Variation ${index + 1}" />` : `<span>${item.status === "failed" ? "Failed" : "…"}</span>`}</button>`).join("");
  tray.querySelectorAll(".variant-thumb").forEach((button) => button.addEventListener("click", () => { state.activeResultIndex = Number(button.dataset.index); renderGenerationStage(); }));
}

async function pollGenerations(ids) {
  while (true) {
    const results = await Promise.all(ids.map((id) => api(`/api/generations/${id}`).catch((error) => ({ id, status: "failed", errorMessage: error.message }))));
    state.generations = results;
    const completed = results.filter((item) => item.status === "completed").length;
    const failed = results.filter((item) => item.status === "failed").length;
    setStatus($("generateStatus"), `${completed + failed} of ${results.length} variations finished${failed ? ` · ${failed} failed` : ""}.`, failed === results.length ? "error" : "neutral");
    if (completed) {
      const activeHasOutput = results[state.activeResultIndex]?.outputUrl;
      if (!activeHasOutput) state.activeResultIndex = results.findIndex((item) => item.outputUrl);
      renderGenerationStage();
    }
    if (results.every((item) => ["completed", "failed"].includes(item.status))) break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  const usage = aggregateGenerationUsage(state.generations);
  if (usage) renderUsage(usage, true);
}

async function generate(event) {
  event.preventDefault();
  if (state.generating) return;
  const filled = state.slots.filter(slotIsFilled);
  if (filled.length !== state.slots.length) return setStatus($("generateStatus"), "Add an identity for every subject.", "error");
  if (!state.poseFile && !state.selectedPoseReferenceId) return setStatus($("generateStatus"), "Add a pose reference.", "error");
  if (state.poseCollageEnabled && !state.poseFile) return setStatus($("generateStatus"), "Upload a pose collage instead of selecting a library pose.", "error");
  const form = new FormData();
  state.slots.forEach((slot, index) => {
    const position = index + 1;
    if (slot.mode === "saved") form.append(`characterId_${position}`, slot.selectedCharacterId);
    else form.append(`characterPhoto_${position}`, slot.file);
  });
  if (state.poseFile) form.append("posePhoto", state.poseFile);
  else form.append("poseReferenceId", state.selectedPoseReferenceId);
  form.append("engine", $("engine").value);
  form.append("studioMode", state.mode);
  form.append("advancedSettings", JSON.stringify(advancedSettings()));
  form.append("poseCollageEnabled", String(state.poseCollageEnabled));
  form.append("poseCollageCount", $("poseCollageCount").value);
  form.append("poseCollageLayout", $("poseCollageLayout").value);
  if ($("backgroundPreset").value) form.append("backgroundPresetId", $("backgroundPreset").value);
  if ($("stylePreset").value) form.append("stylePresetId", $("stylePreset").value);
  if ($("instructions").value.trim()) form.append("instructions", $("instructions").value.trim());
  state.generating = true;
  state.generations = [];
  state.activeResultIndex = 0;
  $("canvasProgress").classList.remove("hidden");
  setStatus($("generateStatus"), "Preparing references and joining the generation queue…");
  updateWorkspace();
  renderGenerationStage();
  try {
    const response = await api("/api/generations", { method: "POST", body: form });
    await pollGenerations(response.generationIds || [response.id]);
    const completed = state.generations.filter((item) => item.status === "completed").length;
    setStatus($("generateStatus"), completed ? `${completed} transformation${completed === 1 ? "" : "s"} ready.` : "Generation failed. Open History for details.", completed ? "ok" : "error");
  } catch (error) {
    state.generations = [];
    $("resultArea").classList.add("hidden");
    setStatus($("generateStatus"), error.message, "error");
  } finally {
    state.generating = false;
    $("canvasProgress").classList.add("hidden");
    updateWorkspace();
    renderGenerationStage();
  }
}

function resetControls() {
  $("backgroundPreset").value = "";
  $("stylePreset").value = "";
  $("instructions").value = "";
  $("instructionCount").textContent = "0 / 600";
  $("recipeSelect").value = "";
  applyAdvancedSettings();
  updateWorkspace();
}

function wireControls() {
  document.querySelectorAll("[data-studio-mode]").forEach((button) => button.addEventListener("click", () => setStudioMode(button.dataset.studioMode)));
  $("addPersonBtn").addEventListener("click", addSlot);
  $("engine").addEventListener("change", updateEngineInfo);
  $("studioForm").addEventListener("submit", generate);
  $("instructions").addEventListener("input", () => { $("instructionCount").textContent = `${$("instructions").value.length} / 600`; });
  [["identityFidelity", "identityValue"], ["poseFidelity", "poseValue"], ["ageFidelity", "ageValue"], ["hairFidelity", "hairValue"], ["sharpness", "sharpnessValue"], ["variationStrength", "variationValue"]].forEach(([inputId, valueId]) => $(inputId).addEventListener("input", () => { $(valueId).textContent = $(inputId).value; refreshUsageEstimate(); }));
  $("ratioPicker").addEventListener("click", (event) => { const button = event.target.closest("[data-ratio]"); if (button) { setAspectRatio(button.dataset.ratio); updateWorkspace(); } });
  $("variantCount").addEventListener("change", () => { updateWorkspace(); refreshUsageEstimate(); });
  $("poseCollageEnabled").addEventListener("change", syncPoseCollageControls);
  $("poseCollageCount").addEventListener("change", () => { $("variantCount").value = $("poseCollageCount").value; syncPoseCollageControls(); });
  $("poseCollageLayout").addEventListener("change", syncPoseCollageControls);
  $("instructions").addEventListener("input", refreshUsageEstimate);
  $("negativePrompt").addEventListener("input", refreshUsageEstimate);
  document.querySelectorAll(".inspector-scroll select, .inspector-scroll input[type='checkbox'], .inspector-scroll input[type='number']").forEach((control) => control.addEventListener("change", refreshUsageEstimate));
  $("subjectDirections").addEventListener("input", refreshUsageEstimate);
  $("resetControls").addEventListener("click", resetControls);
  $("fitCanvas").addEventListener("click", () => $("canvasArtboard").scrollIntoView({ behavior: "smooth", block: "center" }));
  $("saveRecipeBtn").addEventListener("click", openRecipeModal);
  $("closeRecipeModal").addEventListener("click", closeRecipeModal);
  $("cancelRecipe").addEventListener("click", closeRecipeModal);
  $("confirmRecipe").addEventListener("click", saveRecipe);
  $("recipeModal").addEventListener("click", (event) => { if (event.target === $("recipeModal")) closeRecipeModal(); });
  $("recipeSelect").addEventListener("change", () => { const recipe = state.recipes.find((item) => item.id === $("recipeSelect").value); if (recipe) applyAdvancedSettings(recipe.settings); });
}

async function init() {
  wireControls();
  setupPoseUpload();
  addSlot();
  setStudioMode(state.mode);
  const preselectedPose = new URLSearchParams(location.search).get("pose");
  const preselectedCharacter = new URLSearchParams(location.search).get("character");
  await Promise.all([loadCharacters(), loadPoseReferences(preselectedPose), loadPresets(), loadEngines(), loadRecipes()]);
  if (preselectedCharacter && state.characters.some((character) => character.id === preselectedCharacter)) {
    state.slots[0].mode = "saved";
    state.slots[0].selectedCharacterId = preselectedCharacter;
    state.slots[0].file = null;
    syncSlot(state.slots[0]);
  }
  state.slots.forEach(renderSavedStrip);
  renderSubjectDirections();
  updateWorkspace();
}

init();

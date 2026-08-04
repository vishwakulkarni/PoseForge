const passportState = { file: null, previewUrl: "", engines: [], profiles: [], country: "US", generating: false };

function currentProfile() { return passportState.profiles.find((profile) => profile.id === $("documentProfile").value); }
function passportMoney(value) { if (value == null) return "plan-dependent cost"; return value < 0.01 ? `$${Number(value).toFixed(4)}` : `$${Number(value).toFixed(2)}`; }
function passportUsageLabel(usage) { if (!usage) return "Usage unavailable"; if (usage.source === "local") return "Local formatting · 0 tokens · $0.00"; return `${new Intl.NumberFormat().format(usage.totalTokens || 0)} tokens · ${passportMoney(usage.estimatedCostUsd)}`; }
function friendlyDate(iso) { return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }); }

function renderProfileOptions(preferredId) {
  const items = passportState.profiles.filter((profile) => profile.countryCode === passportState.country);
  $("documentProfile").innerHTML = items.map((profile) => `<option value="${profile.id}">${profile.label}</option>`).join("");
  if (preferredId && items.some((profile) => profile.id === preferredId)) $("documentProfile").value = preferredId;
  renderProfile();
}

function renderProfile() {
  const profile = currentProfile();
  if (!profile) return;
  passportState.country = profile.countryCode;
  document.querySelectorAll("[data-country]").forEach((button) => button.classList.toggle("active", button.dataset.country === profile.countryCode));
  $("documentEyebrow").textContent = `Home document studio · ${profile.country}`;
  $("countryCode").textContent = profile.countryCode;
  $("countryName").textContent = profile.country;
  $("countryLockup").setAttribute("aria-label", `Current country: ${profile.country}`);
  $("guidelineFlag").textContent = profile.countryCode;
  $("guidelineFlag").classList.toggle("india", profile.countryCode === "IN");
  $("guidelineTitle").textContent = `${profile.label} checklist`;
  $("guidelineRetrieved").textContent = friendlyDate(profile.retrievedOn);
  $("guidelineSourceDate").textContent = profile.sourceVersionLabel;
  $("guidelineRequirements").innerHTML = profile.requirements.map((item) => `<li>${item}</li>`).join("");
  $("officialLinks").innerHTML = profile.officialLinks.map((link) => `<a href="${link.url}" target="_blank" rel="noreferrer">${link.label}<span>↗</span></a>`).join("");
  $("passportDisclaimer").textContent = profile.disclaimer;
  $("passportDropzone").style.setProperty("--document-ratio", `${profile.output.widthPx} / ${profile.output.heightPx}`);
  $("generatePassport").firstChild.textContent = `Prepare ${profile.label} photo `;
  refreshPassportEstimate();
  updatePassportButton();
}

async function loadPassportConfig() {
  const [config, enginesData, settingsData] = await Promise.all([api("/api/passport/config"), api("/api/engines"), api("/api/settings")]);
  passportState.profiles = config.profiles || [];
  passportState.engines = enginesData.engines || [];
  const select = $("passportEngine");
  select.innerHTML = "";
  passportState.engines.forEach((engine) => { const option = new Option(`${engine.label}${engine.ready ? "" : " · unavailable"}`, engine.key); option.disabled = !engine.ready; select.add(option); });
  const preferred = passportState.engines.find((engine) => engine.key === settingsData.defaultEngine && engine.ready) || passportState.engines.find((engine) => engine.ready);
  if (preferred) select.value = preferred.key;
  renderProfileOptions("us-passport");
}

async function refreshPassportEstimate() {
  if ($("processingMode").value === "local") { $("passportUsage").textContent = "Local formatting · 0 tokens · $0.00"; return; }
  if (!$("passportEngine").value) return;
  try { const usage = await api(`/api/generations/estimate?engine=${encodeURIComponent($("passportEngine").value)}&quality=high&aspectRatio=1%3A1&subjects=1&variants=1&promptChars=1000`); $("passportUsage").textContent = passportUsageLabel(usage); }
  catch (_) { $("passportUsage").textContent = "Estimate unavailable"; }
}

function updatePassportButton() {
  const local = $("processingMode").value === "local";
  const ready = local || passportState.engines.find((engine) => engine.key === $("passportEngine").value)?.ready;
  $("generatePassport").disabled = !passportState.file || !currentProfile() || !ready || passportState.generating;
}

function syncProcessingMode() {
  const ai = $("processingMode").value === "ai";
  $("passportEngineWrap").classList.toggle("hidden", !ai);
  $("aiWarning").classList.toggle("hidden", !ai);
  refreshPassportEstimate();
  updatePassportButton();
}

async function selectPassportFile(file) {
  if (!file) return;
  if (passportState.previewUrl.startsWith("blob:")) URL.revokeObjectURL(passportState.previewUrl);
  passportState.file = file;
  setStatus($("passportStatus"), isHeicFile(file) ? "Converting HEIC preview…" : "Preparing preview…");
  try {
    passportState.previewUrl = await uploadPreviewUrl(file);
    const zone = $("passportDropzone");
    let image = zone.querySelector("img.preview-img");
    if (!image) { image = document.createElement("img"); image.className = "preview-img"; zone.prepend(image); }
    image.src = passportState.previewUrl;
    zone.classList.add("has-image");
    setStatus($("passportStatus"), "Portrait ready. Check the official requirements before preparing the file.", "ok");
  } catch (error) { passportState.file = null; $("passportPhoto").value = ""; setStatus($("passportStatus"), error.message, "error"); }
  updatePassportButton();
}

async function pollPassport(id) {
  while (true) {
    const generation = await api(`/api/generations/${id}`);
    if (generation.status === "completed") return generation;
    if (generation.status === "failed") throw new Error(generation.errorMessage || "Document photo preparation failed.");
    setStatus($("passportStatus"), generation.status === "running" ? "Preparing exact output dimensions…" : "Processing queued…");
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
}

async function generatePassport() {
  const profile = currentProfile();
  if (!passportState.file || !profile || passportState.generating) return;
  passportState.generating = true;
  updatePassportButton();
  const form = new FormData();
  form.append("characterPhoto", passportState.file);
  form.append("profileId", profile.id);
  form.append("processingMode", $("processingMode").value);
  form.append("engine", $("passportEngine").value);
  try {
    setStatus($("passportStatus"), $("processingMode").value === "local" ? "Cropping and formatting locally…" : "Preparing AI-assisted photo…");
    const queued = await api("/api/passport", { method: "POST", body: form });
    const result = await pollPassport(queued.id);
    $("passportOutput").src = result.outputUrl;
    $("downloadPassport").href = result.outputUrl;
    $("passportSheet").src = result.documentSheetUrl || "";
    $("downloadSheet").href = result.documentSheetUrl || "";
    $("sheetOutputCard").classList.toggle("hidden", !profile.output.sheet || !result.documentSheetUrl);
    $("resultTitle").textContent = `${profile.label} files`;
    $("singleOutputLabel").textContent = `${profile.output.widthPx} × ${profile.output.heightPx} px · ${profile.output.format.toUpperCase()}`;
    $("resultUsage").textContent = passportUsageLabel(result.usage);
    $("passportResult").classList.remove("hidden");
    setStatus($("passportStatus"), `${profile.label} photo package is ready.`, "ok");
    $("passportResult").scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) { setStatus($("passportStatus"), error.message, "error"); }
  finally { passportState.generating = false; updatePassportButton(); }
}

document.querySelectorAll("[data-country]").forEach((button) => button.addEventListener("click", () => { passportState.country = button.dataset.country; renderProfileOptions(); }));
$("documentProfile").addEventListener("change", renderProfile);
$("processingMode").addEventListener("change", syncProcessingMode);
$("passportPhoto").addEventListener("change", () => selectPassportFile($("passportPhoto").files[0]));
$("replacePassportPhoto").addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); $("passportPhoto").click(); });
$("passportEngine").addEventListener("change", () => { refreshPassportEstimate(); updatePassportButton(); });
$("generatePassport").addEventListener("click", generatePassport);
loadPassportConfig().catch((error) => setStatus($("passportStatus"), error.message, "error"));

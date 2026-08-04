// The Gallery is the pose library: every pose PoseForge knows about,
// including the curated Pexels starter set and every pose photo you've
// ever uploaded in Studio (poses are saved to the library automatically —
// there's no separate "save" step). Starter photos are real, free-to-use
// stock photography from Pexels (license: https://www.pexels.com/license/,
// free for any use, no attribution required). See CREDITS.md.

let poseReferences = [];
let activeFilter = "all";

function poseCard(pose) {
  const tagBadge = pose.tagStatus === "pending" ? `<span class="tagging-badge">Tagging…</span>` : "";
  const tags = (pose.tags || []).slice(0, 4).map((t) => `<span class="tag">${t}</span>`).join("");
  return `
    <div class="example-card reveal in" data-id="${pose.id}">
      <div class="example-visual">
        <img src="${pose.imageUrl}" alt="${pose.title}" loading="lazy" />
      </div>
      <div class="example-meta">
        <h4>${pose.title}${tagBadge}</h4>
        <p>${pose.isCustom ? "Added by you" : "Starter pose"}</p>
        <div class="tags">${tags}</div>
        <div class="example-actions">
          <a class="btn btn-primary btn-sm" href="/studio.html?pose=${pose.id}">Use this pose</a>
          ${pose.isCustom ? `<button type="button" class="btn btn-secondary btn-sm" data-delete="${pose.id}">Delete</button>` : ""}
        </div>
      </div>
    </div>
  `;
}

function renderPoses() {
  const grid = $("exampleGrid");
  const items = activeFilter === "all" ? poseReferences : poseReferences.filter((p) => p.category === activeFilter);
  if (!items.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><p>No poses in this category yet.</p></div>`;
    return;
  }
  grid.innerHTML = items.map(poseCard).join("");
  grid.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!confirm("Remove this pose from your library?")) return;
      try { await api(`/api/pose-references/${btn.dataset.delete}`, { method: "DELETE" }); await loadPoses(); }
      catch (err) { alert(err.message); }
    });
  });
}

async function loadPoses() {
  const grid = $("exampleGrid");
  grid.innerHTML = `<div class="skeleton" style="height:220px;grid-column:1/-1;"></div>`;
  try {
    const data = await api("/api/pose-references");
    poseReferences = data.poseReferences || [];
    renderPoses();
  } catch (err) {
    grid.innerHTML = `<p class="status-line error" style="grid-column:1/-1;">${err.message}</p>`;
  }
}

document.querySelectorAll(".filter-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    activeFilter = chip.dataset.filter;
    renderPoses();
  });
});

// ---------------------------------------------------------------------
// Add-pose modal
// ---------------------------------------------------------------------
const addModal = $("addPoseModal");
$("addPoseBtn").addEventListener("click", () => addModal.classList.remove("hidden"));
$("closeAddPose").addEventListener("click", () => addModal.classList.add("hidden"));
$("cancelAddPose").addEventListener("click", () => addModal.classList.add("hidden"));
addModal.addEventListener("click", (e) => { if (e.target === addModal) addModal.classList.add("hidden"); });

$("addPoseDropzone").addEventListener("click", (e) => { if (!e.target.closest("input")) $("addPoseFile").click(); });
$("addPoseFile").addEventListener("change", () => {
  const file = $("addPoseFile").files[0];
  if (!file) return;
  const zone = $("addPoseDropzone");
  zone.classList.add("has-image");
  let img = zone.querySelector("img.preview-img");
  if (!img) { img = document.createElement("img"); img.className = "preview-img"; zone.insertBefore(img, zone.firstChild); }
  img.src = URL.createObjectURL(file);
});

$("submitAddPose").addEventListener("click", async () => {
  const statusEl = $("addPoseStatus");
  const file = $("addPoseFile").files[0];
  if (!file) return setStatus(statusEl, "Choose a photo.", "error");
  setStatus(statusEl, "Adding…");
  const form = new FormData();
  form.append("posePhoto", file);
  if ($("addPoseTitle").value.trim()) form.append("title", $("addPoseTitle").value.trim());
  try {
    await api("/api/pose-references", { method: "POST", body: form });
    setStatus(statusEl, "Added.", "ok");
    $("addPoseFile").value = "";
    $("addPoseTitle").value = "";
    $("addPoseDropzone").classList.remove("has-image");
    setTimeout(() => { addModal.classList.add("hidden"); setStatus(statusEl, ""); }, 500);
    await loadPoses();
  } catch (err) {
    setStatus(statusEl, err.message, "error");
  }
});

loadPoses();

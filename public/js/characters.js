let characters = [];
let selectedId = null;

async function loadCharacters() {
  const grid = $("characterGrid");
  grid.innerHTML = `<div class="skeleton" style="height:180px;grid-column:1/-1;"></div>`;
  try {
    const data = await api("/api/characters");
    characters = data.characters || [];
    if (!characters.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
        <p>No characters saved yet.</p>
        <p class="mt-2">Use "Add character" below, or save one directly from the Studio.</p>
      </div>`;
      return;
    }
    grid.innerHTML = characters.map((c) => `
      <div class="card character-tile" data-id="${c.id}">
        ${c.primaryPhotoUrl
          ? `<img class="character-portrait" src="${c.primaryPhotoUrl}" alt="${c.name}" />`
          : `<div class="character-portrait placeholder">${c.name.slice(0,1).toUpperCase()}</div>`}
        <h4>${c.name}</h4>
        <div class="meta">Added ${relativeTime(c.createdAt)}</div>
        <div class="character-tile-actions">
          <a class="btn btn-sm btn-secondary" href="/studio.html">Use in Studio</a>
          <button type="button" class="btn btn-sm btn-danger" data-delete="${c.id}">Delete</button>
        </div>
      </div>
    `).join("");

    grid.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("Delete this character? Past results stay in your History.")) return;
        try { await api(`/api/characters/${btn.dataset.delete}`, { method: "DELETE" }); await loadCharacters(); }
        catch (err) { alert(err.message); }
      });
    });
  } catch (err) {
    grid.innerHTML = `<p class="status-line error" style="grid-column:1/-1;">${err.message}</p>`;
  }
}

// ---------------------------------------------------------------------
// Add-character modal
// ---------------------------------------------------------------------
const modal = $("addModal");
$("addCharacterFab").addEventListener("click", () => modal.classList.remove("hidden"));
$("modalCancel").addEventListener("click", () => modal.classList.add("hidden"));
modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });

$("modalSave").addEventListener("click", async () => {
  const statusEl = $("modalStatus");
  const file = $("modalPhoto").files[0];
  const name = $("modalName").value.trim();
  if (!file) return setStatus(statusEl, "Choose a photo.", "error");
  if (!name) return setStatus(statusEl, "Enter a name.", "error");
  setStatus(statusEl, "Saving…");
  const form = new FormData();
  form.append("characterPhoto", file);
  form.append("name", name);
  try {
    await api("/api/characters", { method: "POST", body: form });
    setStatus(statusEl, "Saved.", "ok");
    $("modalPhoto").value = "";
    $("modalName").value = "";
    setTimeout(() => { modal.classList.add("hidden"); setStatus(statusEl, ""); }, 500);
    await loadCharacters();
  } catch (err) {
    setStatus(statusEl, err.message, "error");
  }
});

loadCharacters();

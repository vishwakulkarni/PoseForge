const EXAMPLES = [
  { category: "family", title: "Family of five, matching outfits", desc: "Two parents and three kids, posed together in coordinated tones.", tags: ["Family", "Matching outfits"] },
  { category: "siblings", title: "Sibling trio portrait", desc: "Three kids posed together, each recognizably themselves.", tags: ["Siblings", "Studio white"] },
  { category: "insta", title: "Instagram square, golden hour", desc: "Feed-ready square crop with warm, natural light.", tags: ["Instagram square", "Golden hour"] },
  { category: "seasonal", title: "Holiday card", desc: "Warm, festive styling for a keepsake you'll want to print.", tags: ["Seasonal", "Warm light"] },
  { category: "family", title: "Playground afternoon", desc: "A casual, candid family moment at the park.", tags: ["Outdoor", "Candid"] },
  { category: "siblings", title: "Two kids, beach sunset", desc: "Copies the pose and framing from a favorite reference photo.", tags: ["Siblings", "Beach"] },
  { category: "insta", title: "Instagram grid opener", desc: "A clean, centered square post to lead your next grid.", tags: ["Instagram square", "Studio gray"] },
  { category: "seasonal", title: "Backyard golden-hour family shot", desc: "Soft backlighting for a cinematic keepsake.", tags: ["Golden hour", "Family"] },
];

function renderExamples(filter) {
  const grid = $("exampleGrid");
  const items = filter === "all" ? EXAMPLES : EXAMPLES.filter((e) => e.category === filter);
  grid.innerHTML = items.map((item) => `
    <div class="example-card reveal in">
      <div class="example-visual">
        <div class="half before"><span class="label">Before</span><div class="figure"></div></div>
        <div class="half after"><span class="label">After</span><div class="figure"></div></div>
      </div>
      <div class="example-meta">
        <h4>${item.title}</h4>
        <p>${item.desc}</p>
        <div class="tags">${item.tags.map((t) => `<span class="tag">${t}</span>`).join("")}</div>
      </div>
    </div>
  `).join("");
}

document.querySelectorAll(".filter-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    renderExamples(chip.dataset.filter);
  });
});

renderExamples("all");

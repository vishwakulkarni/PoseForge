/* Shared utilities used by every screen: nav injection, fetch helper,
   status-line helper, relative-time formatting, scroll-reveal. */

const NAV_ITEMS = [
  { label: "Studio", href: "/studio.html" },
  { label: "Characters", href: "/characters.html" },
  { label: "Gallery", href: "/gallery.html" },
  { label: "History", href: "/history.html" },
  { label: "Settings", href: "/settings.html" },
];

function renderNav(activePage) {
  const mount = document.getElementById("site-nav");
  if (!mount) return;
  const path = location.pathname.replace(/^\//, "") || "index.html";
  const links = NAV_ITEMS.map((item) => {
    const isActive = activePage
      ? item.href.includes(activePage)
      : item.href.replace(/^\//, "") === path;
    return `<a href="${item.href}" class="${isActive ? "active" : ""}">${item.label}</a>`;
  }).join("");

  mount.innerHTML = `
    <div class="container">
      <a href="/" class="nav-brand"><img class="nav-mascot" src="/images/mascot-painter-dog.png" onerror="this.onerror=null;this.src='/images/mascot-painter-dog.svg';" alt="" />PoseForge</a>
      <ul class="nav-links">${links}</ul>
      <a href="/studio.html" class="nav-cta">Create a pose</a>
      <button class="nav-toggle" id="navToggle" aria-label="Menu">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="nav-mobile hidden" id="navMobile">
      ${NAV_ITEMS.map((item) => `<a href="${item.href}">${item.label}</a>`).join("")}
    </div>
  `;

  const toggle = document.getElementById("navToggle");
  const mobile = document.getElementById("navMobile");
  toggle?.addEventListener("click", () => mobile.classList.toggle("hidden"));
}

async function api(path, options = {}) {
  const res = await fetch(path, options);
  let body = null;
  try { body = await res.json(); } catch (_) { /* no body */ }
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status}).`);
  return body;
}

function setStatus(el, text, kind = "neutral") {
  if (!el) return;
  el.textContent = text;
  el.className = `status-line${kind && kind !== "neutral" ? ` ${kind}` : ""}`;
}

function relativeTime(iso) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function initScrollReveal() {
  const items = document.querySelectorAll(".reveal");
  if (!items.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  items.forEach((el) => io.observe(el));
}

function $(id) { return document.getElementById(id); }

document.addEventListener("DOMContentLoaded", () => {
  renderNav(document.body.dataset.nav);
  initScrollReveal();
});

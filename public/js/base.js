const NAV_ITEMS = [
  { label: "Studio", href: "/studio.html" },
  { label: "Characters", href: "/characters.html" },
  { label: "Poses", href: "/gallery.html" },
  { label: "ID Photos", href: "/passport.html" },
  { label: "History", href: "/history.html" },
  { label: "Settings", href: "/settings.html" },
];

function applyTheme(theme) {
  const next = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("poseforge-theme", next);
  document.querySelectorAll("[data-theme-label]").forEach((el) => { el.textContent = next === "dark" ? "Use light theme" : "Use dark theme"; });
}

const requestedTheme = new URLSearchParams(location.search).get("theme");
applyTheme(requestedTheme === "dark" || requestedTheme === "light" ? requestedTheme : (localStorage.getItem("poseforge-theme") || "light"));

function themeButton(extraClass = "") {
  return `<button type="button" class="icon-btn theme-toggle ${extraClass}" data-theme-toggle aria-label="Toggle color theme" title="Toggle color theme">
    <svg class="theme-icon-moon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 15.3A8.5 8.5 0 0 1 8.7 4 8.5 8.5 0 1 0 20 15.3Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <svg class="theme-icon-sun" width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="3.5" stroke="currentColor" stroke-width="1.7"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
  </button>`;
}

function renderNav(activePage) {
  const mount = document.getElementById("site-nav");
  if (!mount) return;
  const path = location.pathname.replace(/^\//, "") || "index.html";
  const links = NAV_ITEMS.map((item) => {
    const active = activePage ? item.href.includes(activePage) : item.href.replace(/^\//, "") === path;
    return `<li><a href="${item.href}" class="${active ? "active" : ""}">${item.label}</a></li>`;
  }).join("");
  mount.innerHTML = `
    <div class="container">
      <a href="/" class="nav-brand" aria-label="PoseForge home"><span class="nav-mark" aria-hidden="true"></span><span>PoseForge</span></a>
      <ul class="nav-links">${links}</ul>
      <div class="nav-actions">
        ${themeButton()}
        <a href="/studio.html" class="nav-cta">Open Studio</a>
        <button type="button" class="icon-btn nav-toggle" id="navToggle" aria-label="Open menu" aria-expanded="false">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
      </div>
    </div>
    <div class="nav-mobile hidden" id="navMobile">
      ${NAV_ITEMS.map((item) => `<a href="${item.href}">${item.label}</a>`).join("")}
      <button type="button" class="btn btn-secondary btn-block" data-theme-toggle><span data-theme-label>Toggle theme</span></button>
    </div>`;
  const toggle = document.getElementById("navToggle");
  const mobile = document.getElementById("navMobile");
  toggle?.addEventListener("click", () => {
    const open = mobile.classList.toggle("hidden") === false;
    toggle.setAttribute("aria-expanded", String(open));
  });
  wireThemeToggles();
}

function wireThemeToggles(root = document) {
  root.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    if (button.dataset.themeWired) return;
    button.dataset.themeWired = "true";
    button.addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  });
  applyTheme(document.documentElement.dataset.theme);
}

async function api(path, options = {}) {
  const res = await fetch(path, options);
  let body = null;
  try { body = await res.json(); } catch (_) { /* response has no JSON */ }
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status}).`);
  return body;
}

function setStatus(el, message, kind = "neutral") {
  if (!el) return;
  el.textContent = message;
  el.className = `status-line${kind !== "neutral" ? ` ${kind}` : ""}`;
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
  if (!("IntersectionObserver" in window)) return items.forEach((el) => el.classList.add("in"));
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) { entry.target.classList.add("in"); observer.unobserve(entry.target); }
  }), { threshold: .12 });
  items.forEach((el) => observer.observe(el));
}

function $(id) { return document.getElementById(id); }

function isHeicFile(file) {
  return Boolean(file && (/\.hei[cf]$/i.test(file.name || "") || /hei[cf]/i.test(file.type || "")));
}

async function uploadPreviewUrl(file) {
  if (!isHeicFile(file)) return URL.createObjectURL(file);
  const form = new FormData();
  form.append("image", file);
  const response = await fetch("/api/media/preview", { method: "POST", body: form });
  if (!response.ok) {
    let message = "This HEIC image could not be previewed.";
    try { message = (await response.json()).error || message; } catch (_) { /* no JSON */ }
    throw new Error(message);
  }
  return URL.createObjectURL(await response.blob());
}

document.addEventListener("DOMContentLoaded", () => {
  renderNav(document.body.dataset.nav);
  wireThemeToggles();
  initScrollReveal();
});

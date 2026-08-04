(() => {
  const requested = new URLSearchParams(location.search).get("theme");
  const saved = localStorage.getItem("poseforge-theme");
  document.documentElement.dataset.theme = requested === "dark" || requested === "light" ? requested : (saved === "dark" ? "dark" : "light");
})();

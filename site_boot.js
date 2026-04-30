(function () {
  function revealPage() {
    if (!document.body) return;
    document.documentElement.classList.remove("initially-hidden");
    document.body.classList.remove("initially-hidden");
    document.body.style.removeProperty("visibility");
    document.body.style.removeProperty("opacity");
    if (window.getComputedStyle(document.body).display === "none") {
      document.body.style.display = "block";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", revealPage, { once: true });
  } else {
    revealPage();
  }

  window.addEventListener("pageshow", revealPage);
  window.addEventListener("error", revealPage);
  window.addEventListener("unhandledrejection", revealPage);
  window.setTimeout(revealPage, 250);
  window.setTimeout(revealPage, 1500);
})();

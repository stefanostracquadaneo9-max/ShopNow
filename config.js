// Se il frontend gira su GitHub Pages o da file locale, usa il backend Railway.
// Se il frontend gira direttamente su Railway, usa lo stesso dominio corrente.
(function resolveShopNowApiBaseUrl() {
    const DEFAULT_RAILWAY_BACKEND_URL =
        "https://shopnow-production.up.railway.app";

    if (typeof window === "undefined" || !window.location) {
        return;
    }

    const protocol = String(window.location.protocol || "").toLowerCase();
    const hostname = String(window.location.hostname || "").toLowerCase();
    const isStaticHost =
        protocol === "file:" || hostname.endsWith(".github.io");

    window.SHOPNOW_API_BASE_URL = isStaticHost
        ? DEFAULT_RAILWAY_BACKEND_URL
        : "";
})();

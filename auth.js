const DB_KEY_PREFIX = "ecommerce_";
const AUTH_SESSION_KEY = "ecommerce-session-token";
const AUTH_REFRESH_KEY = "ecommerce-refresh-token";
const AUTH_STORAGE_VERSION_KEY = "ecommerce-auth-version";
const AUTH_STORAGE_VERSION = "20260405c";
const localDataRawCache = new Map();
const localDataValueCache = new Map();
let usersSyncPromise = null;
let productsSyncPromise = null;

window.SHOPNOW_API_BASE_URL =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1")
    ? "http://localhost:3000"
    : "https://shopnow-production.up.railway.app";

const SHOPNOW_API_BASE_URL = window.SHOPNOW_API_BASE_URL;

function getDataStorageKey(key) {
  return `${DB_KEY_PREFIX}${key}`;
}

function getDefaultProducts() {
  return [
    {
      id: 1,
      name: "Laptop Pro",
      price: 1299.99,
      image: "uploads/Laptop_Pro.jpg",
      category: "elettronica",
      stock: 10,
    },
    {
      id: 7,
      name: "Pantaloni Jeans",
      price: 79.99,
      image: "uploads/Pantaloni_Jeans.jpg",
      category: "abbigliamento",
      stock: 40,
    },
  ];
}

// --- INTERCETTORE GLOBALE FETCH (Gestione 401 Unauthorized) ---
let isRefreshing = false;
let refreshPromise = null;
const MAX_REFRESH_RETRIES = 1;

if (typeof window !== "undefined" && typeof window.fetch === "function") {
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const options = { ...(args[1] || {}) };
    const retryCount = options._retryCount || 0;

    let response = await originalFetch(args[0], options);

    if (response.status === 401) {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      const isAuthEndpoint =
        url.includes("/login") ||
        url.includes("/register") ||
        url.includes("/refresh");

      if (!isAuthEndpoint && retryCount >= MAX_REFRESH_RETRIES) {
        console.error(
          `[Auth Interceptor] Limite di retry raggiunto (${MAX_REFRESH_RETRIES}) per: ${url}. Interruzione tentativi.`,
        );
      }

      if (!isAuthEndpoint && retryCount < MAX_REFRESH_RETRIES) {
        if (!isRefreshing) {
          isRefreshing = true;
          refreshPromise = refreshAuthToken().finally(() => {
            isRefreshing = false;
            refreshPromise = null;
          });
        }

        const refreshed = await refreshPromise;
        if (refreshed) {
          const retryOptions = { ...options, _retryCount: retryCount + 1 };
          retryOptions.headers = {
            ...(retryOptions.headers || {}),
            Authorization: `Bearer ${getSessionToken()}`,
          };
          return window.fetch(args[0], retryOptions);
        }
      }

      const isAuthPage =
        window.location.pathname.includes("index.html") ||
        window.location.pathname === "/" ||
        window.location.pathname.endsWith("index.html");

      // Reindirizza solo se non siamo già sulla pagina di login o chiamando endpoint di auth
      if (!isAuthPage && !isAuthEndpoint) {
        console.warn(
          "Sessione scaduta o non valida (401). Reindirizzamento al login...",
        );
        if (typeof logout === "function") logout();
        window.location.href = "index.html?msg=session_expired";
      }
    }
    return response;
  };
}

async function refreshAuthToken() {
  const refreshToken = localStorage.getItem(AUTH_REFRESH_KEY);
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${SHOPNOW_API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      setSessionToken(data.sessionToken, data.refreshToken);
      return true;
    }
  } catch (e) {
    console.error("Impossibile rinnovare il token:", e);
  }
  return false;
}

const PRODUCT_IMAGE_OVERRIDES = {
  "Laptop Pro": "uploads/Laptop_Pro.jpg",
  "Pantaloni Jeans": "uploads/Pantaloni_Jeans.jpg",
};

// --- UTILITIES GLOBALI (Disponibili in tutto il sito) ---
const currencyFormatter = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
});
window.formatCurrency = (v) => currencyFormatter.format(Number(v || 0));

window.escapeHtml = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );

window.normalizeCountryCode = (v) => {
  const m = {
    ITALIA: "IT",
    ITALY: "IT",
    GERMANIA: "DE",
    FRANCE: "FR",
    SPAIN: "ES",
    USA: "US",
    UK: "GB",
  };
  const n = String(v || "")
    .trim()
    .toUpperCase();
  return m[n] || (n.length === 2 ? n : n.slice(0, 2) || "IT");
};

window.renderRatingStars = (r) => {
  const n = Math.max(0, Math.min(5, Number(r || 0)));
  const full = Math.floor(n),
    half = n - full >= 0.25 && n - full < 0.75,
    extra = n - full >= 0.75 ? 1 : 0;
  return (
    '<i class="fas fa-star"></i>'.repeat(full + extra) +
    (half ? '<i class="fas fa-star-half-alt"></i>' : "") +
    '<i class="far fa-star"></i>'.repeat(
      Math.max(0, 5 - full - extra - (half ? 1 : 0)),
    )
  );
};
// -------------------------------------------------------

function resolveProductImage(product) {
  const overrideImage = PRODUCT_IMAGE_OVERRIDES[product?.name];
  if (
    overrideImage &&
    (!product?.image ||
      String(product.image).startsWith("https://via.placeholder.com"))
  ) {
    return overrideImage;
  }
  return product?.image || "";
}
function normalizeLocalCatalogProduct(product) {
  const reviews = Array.isArray(product?.reviews)
    ? product.reviews.filter(Boolean).map((review) => ({ ...review }))
    : [];
  const reviewCount = reviews.length;
  const rating = reviewCount
    ? Number(
        (
          reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) /
          reviewCount
        ).toFixed(1),
      )
    : 0;
  return {
    ...product,
    reviews: reviews,
    rating: rating,
    reviewCount: reviewCount,
  };
}
function normalizeLocalCatalogProducts(products) {
  return Array.isArray(products)
    ? products.map((product) => normalizeLocalCatalogProduct(product))
    : [];
}

function stripSensitiveUserData(user) {
  if (!user || typeof user !== "object") {
    return user;
  }
  const sanitizedUser = { ...user };
  delete sanitizedUser.passwordHash;
  delete sanitizedUser.refreshToken;
  return sanitizedUser;
}

function getServerBaseUrl() {
  return SHOPNOW_API_BASE_URL;
}
function getBackendRequestHeaders(extraHeaders = {}) {
  const headers = { ...extraHeaders };
  try {
    const hostname = new URL(getServerBaseUrl()).hostname.toLowerCase();
    if (hostname.includes("ngrok-free")) {
      headers["ngrok-skip-browser-warning"] = "true";
    }
  } catch (error) {
    // Ignore URL parsing issues and keep default headers.
  }
  return headers;
}
function prefersServerAuth() {
  if (typeof window === "undefined" || !window.location) {
    return false;
  }
  if (window.location.protocol === "file:") {
    return false;
  }
  return Boolean(getServerBaseUrl());
}
function isStaticHostedMode() {
  return !prefersServerAuth();
}
async function initializeLocalDB() {
  if (window.DB_INITIALIZING) return;
  window.DB_INITIALIZING = true;

  // Se già inizializzato, facciamo solo una sync silente ed esciamo
  if (
    window.localStorage.getItem(DB_KEY_PREFIX + "initialized") === "1" &&
    !new URLSearchParams(window.location.search).get("reset")
  ) {
    if (prefersServerAuth()) {
      saveData("users", {});
    } else {
      syncUsersFromServer();
    }
    syncProductsFromServer();
    window.DB_INITIALIZING = false;
    return false;
  }

  const currentStorageVersion = window.localStorage.getItem(
    AUTH_STORAGE_VERSION_KEY,
  );
  if (currentStorageVersion !== AUTH_STORAGE_VERSION) {
    migrateAuthStorage();
  }
  const forceReset =
    typeof window !== "undefined" &&
    window.location &&
    new URLSearchParams(window.location.search).get("reset") === "1";
  if (forceReset) {
    console.log("Forzata reinizializzazione del DB locale");
    window.localStorage.removeItem(DB_KEY_PREFIX + "initialized");
    window.localStorage.removeItem(DB_KEY_PREFIX + "users");
    window.localStorage.removeItem(DB_KEY_PREFIX + "products");
    window.localStorage.removeItem(DB_KEY_PREFIX + "orders");
    window.localStorage.removeItem("cart");
    if (window.history && window.history.replaceState) {
      window.history.replaceState(
        {},
        "",
        window.location.pathname + window.location.hash,
      );
    }
  }
  const initialized = window.localStorage.getItem(
    DB_KEY_PREFIX + "initialized",
  );
  const existingUsers = loadData("users", {});
  const adminUser = existingUsers["admin@gmail.com"];
  let existingProducts = loadData("products", []);
  const shouldUseServerAuth = prefersServerAuth();
  if (existingProducts.length > 0) {
    let updated = false;
    existingProducts.forEach((product) => {
      if (
        product.image &&
        product.image.startsWith("https://via.placeholder.com")
      ) {
        product.image = "";
        updated = true;
      }
      const resolvedImage = resolveProductImage(product);
      if (product && product.image !== resolvedImage) {
        product.image = resolvedImage;
        updated = true;
      }
    });
    if (!prefersServerAuth()) {
      const normalizedProducts =
        normalizeLocalCatalogProducts(existingProducts);
      if (
        JSON.stringify(normalizedProducts) !== JSON.stringify(existingProducts)
      ) {
        existingProducts = normalizedProducts;
        updated = true;
      }
    }
    if (updated) {
      saveData("products", existingProducts);
      console.log("Immagini prodotti migrate a fallback locale");
    }
  }
  if (shouldUseServerAuth) {
    if (!initialized || !existingProducts.length) {
      const products = normalizeLocalCatalogProducts(
        existingProducts.length ? existingProducts : getDefaultProducts(),
      );
      saveData("products", products);
      saveData("orders", []);
      localStorage.setItem(DB_KEY_PREFIX + "initialized", "1");
    }
    saveData("users", {});
    syncProductsFromServer();
    window.DB_INITIALIZING = false;
    return false;
  }
  const expectedAdminShaHash =
    "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918";
  if (initialized && adminUser && adminUser.passwordHash) {
    const expectedLegacyHash = simpleHash("admin");
    if (
      adminUser.passwordHash !== expectedLegacyHash &&
      adminUser.passwordHash !== expectedAdminShaHash
    ) {
      console.log("Hash admin non valido trovato, ripristino con hash legacy.");
      adminUser.passwordHash = expectedLegacyHash;
      existingUsers[String(adminUser.email).toLowerCase()] = adminUser;
      saveData("users", existingUsers);
    }
  }
  if (!initialized || !adminUser || !existingProducts.length) {
    console.log("DB non inizializzato o admin mancante, inizializzo...");
    const users = {
      "admin@gmail.com": {
        id: 1,
        email: "admin@gmail.com",
        name: "Administrator",
        passwordHash: simpleHash("admin"),
        role: "admin",
        createdAt: new Date().toISOString(),
        addresses: [],
        orders: [],
      },
    };
    const products = normalizeLocalCatalogProducts(getDefaultProducts());
    saveData("users", users);
    saveData("products", products);
    saveData("orders", []);
    localStorage.setItem(DB_KEY_PREFIX + "initialized", "1");
    console.log("DB locale inizializzato con dati demo");
  }
  // Sincronizzazione in background per evitare blocchi UI (schermo bianco)
  syncUsersFromServer();
  syncProductsFromServer();
  window.DB_INITIALIZING = false;
}
function saveData(key, data) {
  try {
    const storageKey = getDataStorageKey(key);
    const serializedData = JSON.stringify(data);
    const cachedRaw = localDataRawCache.has(storageKey)
      ? localDataRawCache.get(storageKey)
      : localStorage.getItem(storageKey);
    if (cachedRaw === serializedData) {
      localDataRawCache.set(storageKey, serializedData);
      localDataValueCache.set(storageKey, data);
      return false;
    }
    localStorage.setItem(storageKey, serializedData);
    localDataRawCache.set(storageKey, serializedData);
    localDataValueCache.set(storageKey, data);
    console.log(`💾 Dati salvati: ${key}`);
    return true;
  } catch (error) {
    console.error("Errore salvataggio dati:", error);
    return false;
  }
}
function loadData(key, defaultValue = {}) {
  try {
    const storageKey = getDataStorageKey(key);
    const rawData = localStorage.getItem(storageKey);
    if (rawData == null) {
      localDataRawCache.delete(storageKey);
      localDataValueCache.delete(storageKey);
      return defaultValue;
    }
    if (
      localDataRawCache.get(storageKey) === rawData &&
      localDataValueCache.has(storageKey)
    ) {
      return localDataValueCache.get(storageKey);
    }
    const parsedData = JSON.parse(rawData);
    localDataRawCache.set(storageKey, rawData);
    localDataValueCache.set(storageKey, parsedData);
    return parsedData;
  } catch (error) {
    console.error("Errore caricamento dati:", error);
    return defaultValue;
  }
}
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
async function hashPassword(password) {
  if (window.crypto && crypto.subtle && crypto.subtle.digest) {
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return simpleHash(password);
}
function generateSessionToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
function getSessionToken() {
  return localStorage.getItem(AUTH_SESSION_KEY);
}
function setSessionToken(token, refreshToken = null) {
  localStorage.setItem(AUTH_SESSION_KEY, token);
  if (refreshToken) {
    localStorage.setItem(AUTH_REFRESH_KEY, refreshToken);
  }
}
function clearSessionToken() {
  const currentToken = getSessionToken();
  if (currentToken) {
    clearLocalSessionReferences(currentToken);
  }
  localStorage.removeItem(AUTH_SESSION_KEY);
  localStorage.removeItem(AUTH_REFRESH_KEY);
  localStorage.removeItem("user-role");
}
function getAuthRequestHeaders(extraHeaders = {}) {
  const headers = getBackendRequestHeaders(extraHeaders);
  const token = getSessionToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}
function clearLocalSessionReferences(tokenToClear = "") {
  try {
    const users = loadData("users", {});
    let changed = false;
    Object.entries(users).forEach(([key, user]) => {
      if (user && user.sessionToken === tokenToClear) {
        users[key] = { ...user, sessionToken: null };
        changed = true;
      }
    });
    if (changed) {
      saveData("users", users);
    }
  } catch (error) {
    console.error("Errore pulizia sessione locale:", error);
  }
}
function migrateAuthStorage() {
  try {
    const users = loadData("users", {});
    const migratedUsers = {};
    Object.entries(users).forEach(([key, user]) => {
      if (!user || typeof user !== "object") return;
      const normalizedEmail = String(user.email || key || "")
        .trim()
        .toLowerCase();
      if (!normalizedEmail) return;
      migratedUsers[normalizedEmail] = {
        ...migratedUsers[normalizedEmail],
        ...user,
        email: normalizedEmail,
      };
    });
    saveData("users", migratedUsers);
    const token = getSessionToken();
    if (token) {
      const hasMatchingSession = Object.values(migratedUsers).some(
        (user) => user && user.sessionToken === token,
      );
      if (!hasMatchingSession) {
        clearSessionToken();
      }
    }
    localStorage.setItem(AUTH_STORAGE_VERSION_KEY, AUTH_STORAGE_VERSION);
  } catch (error) {
    console.error("Errore migrazione auth storage:", error);
  }
}
function getAuthApiUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (prefersServerAuth()) {
    return `${getServerBaseUrl()}${normalizedPath}`;
  }
  return `${SHOPNOW_API_BASE_URL}${normalizedPath}`;
}
async function tryServerRegister({ name, email, password }) {
  if (!prefersServerAuth()) {
    return { ok: false, error: "Modalita statica attiva" };
  }
  try {
    const response = await fetch(getAuthApiUrl("/register"), {
      method: "POST",
      headers: getBackendRequestHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        name: name,
        email: email,
        password: password,
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        error: data?.error || "Registrazione server non riuscita",
      };
    }
    return { ok: true, data: data };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
async function tryServerLogin(email, password) {
  if (!prefersServerAuth()) {
    return { ok: false, error: "Modalita statica attiva" };
  }
  try {
    const response = await fetch(getAuthApiUrl("/login"), {
      method: "POST",
      headers: getBackendRequestHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ email: email, password: password }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        error: data?.error || "Login server non riuscito",
      };
    }
    return { ok: true, data: data };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
async function syncUsersFromServer() {
  if (!prefersServerAuth()) {
    return false;
  }
  if (usersSyncPromise) {
    return usersSyncPromise;
  }
  usersSyncPromise = (async () => {
    try {
      const response = await fetch(getAuthApiUrl("/api/auth/users"), {
        headers: getAuthRequestHeaders(),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.users || !Array.isArray(data.users)) {
        return false;
      }
      let localUsers = loadData("users", {});
      let changed = false;

      // Sincronizzazione professionale: rimuovi utenti locali non più presenti sul server
      const serverEmailSet = new Set(
        data.users.map((user) =>
          String(user.email || "")
            .toLowerCase()
            .trim(),
        ),
      );
      Object.keys(localUsers).forEach((email) => {
        if (!serverEmailSet.has(email)) {
          delete localUsers[email];
          changed = true;
        }
      });

      data.users.forEach((serverUser) => {
        const normalizedEmail = String(serverUser.email || "")
          .trim()
          .toLowerCase();
        if (!normalizedEmail) return;
        const existing =
          findUserEntryByEmail(localUsers, normalizedEmail)?.user || {};
        localUsers[normalizedEmail] = {
          ...stripSensitiveUserData(existing),
          id: serverUser.id,
          email: normalizedEmail,
          name: serverUser.name,
          role: serverUser.role,
          createdAt:
            existing.createdAt ||
            serverUser.createdAt ||
            new Date().toISOString(),
          addresses: existing.addresses || [],
          paymentMethods: existing.paymentMethods || [],
          orders: existing.orders || [],
        };
        changed = true;
      });
      if (changed) {
        saveData("users", localUsers);
      }
    } catch (error) {
      console.warn("Sync utenti server non disponibile:", error.message);
      return false;
    } finally {
      usersSyncPromise = null;
    }
  })();
  return usersSyncPromise;
}
async function syncProductsFromServer() {
  if (!prefersServerAuth()) {
    return false;
  }
  if (productsSyncPromise) {
    return productsSyncPromise;
  }
  productsSyncPromise = (async () => {
    try {
      const response = await fetch(getAuthApiUrl("/api/products"), {
        headers: getBackendRequestHeaders(),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data)) {
        console.warn("Risposta server prodotti non valida");
        return false;
      }
      const normalizedProducts = data.map((product) => ({
        ...product,
        image: resolveProductImage(product),
      }));
      const didWrite = saveData("products", normalizedProducts);
      if (!didWrite) {
        return false;
      }
      console.log(
        `✅ Sincronizzati ${normalizedProducts.length} prodotti dal server`,
      );
    } catch (error) {
      console.warn("❌ Sync prodotti server fallito:", error.message);
      // Se siamo su GitHub Pages e la sync fallisce, assicuriamoci di avere prodotti locali
      if (window.location.hostname.includes("github.io")) {
        ensureFallbackProducts();
      }
      return false;
    } finally {
      productsSyncPromise = null;
    }
  })();
  return productsSyncPromise;
}
function ensureFallbackProducts() {
  const existingProducts = getAllProducts();
  if (existingProducts && existingProducts.length > 0) {
    console.log(`📦 Usando ${existingProducts.length} prodotti locali`);
    return;
  }
}

function findUserEntryByEmail(users, email) {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  const exactMatch = users[normalizedEmail];
  if (exactMatch) {
    return { key: normalizedEmail, user: exactMatch };
  }
  const fallbackEntry = Object.entries(users).find(([key, user]) => {
    const candidateEmail = String(user?.email || key || "")
      .trim()
      .toLowerCase();
    return candidateEmail === normalizedEmail;
  });
  if (!fallbackEntry) return null;
  return { key: fallbackEntry[0], user: fallbackEntry[1] };
}
function migrateUserEmailKey(users, currentKey, normalizedEmail) {
  if (!users[currentKey] || currentKey === normalizedEmail) {
    return users[currentKey] || null;
  }
  const user = { ...users[currentKey], email: normalizedEmail };
  delete users[currentKey];
  users[normalizedEmail] = user;
  saveData("users", users);
  return user;
}
async function registerUser({ name, email, password }) {
  try {
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();
    const users = loadData("users", {});
    if (!prefersServerAuth() && findUserEntryByEmail(users, normalizedEmail)) {
      throw new Error("Email già registrata");
    }
    const serverResult = await tryServerRegister({
      name: name,
      email: normalizedEmail,
      password: password,
    });
    if (prefersServerAuth() && !serverResult.ok) {
      throw new Error(
        serverResult.error || "Registrazione server non riuscita",
      );
    }
    if (
      !serverResult.ok &&
      serverResult.error &&
      !/già/i.test(serverResult.error)
    ) {
      console.warn("Registrazione server non disponibile:", serverResult.error);
    }
    const user = {
      id: serverResult.ok
        ? serverResult.data.user.id
        : Object.keys(users).length + 1,
      email: normalizedEmail,
      name: name,
      role: serverResult.ok ? serverResult.data.user.role : "user",
      createdAt: serverResult.ok
        ? new Date().toISOString()
        : new Date().toISOString(),
      addresses: [],
      orders: [],
      sessionToken: serverResult.ok
        ? serverResult.data.sessionToken || null
        : null,
    };
    if (!prefersServerAuth()) {
      user.passwordHash = await hashPassword(password);
    }
    users[normalizedEmail] = user;
    saveData("users", users);
    return { success: true, message: "Account creato con successo" };
  } catch (error) {
    throw error; // Rilancia l'errore per essere gestito dal chiamante
  }
}
async function loginUser(email, password) {
  try {
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();
    console.log("Tentativo login per:", normalizedEmail);
    const users = loadData("users", {});
    console.log("Utenti nel DB:", Object.keys(users));
    const preferredServerLogin = await tryServerLogin(
      normalizedEmail,
      password,
    );
    if (preferredServerLogin.ok && preferredServerLogin.data?.user) {
      const serverUser = {
        id: preferredServerLogin.data.user.id,
        email: preferredServerLogin.data.user.email,
        name: preferredServerLogin.data.user.name,
        role: preferredServerLogin.data.user.role,
        sessionToken: preferredServerLogin.data.sessionToken,
        createdAt:
          preferredServerLogin.data.user.createdAt || new Date().toISOString(),
        addresses: users[normalizedEmail]?.addresses || [],
        paymentMethods: users[normalizedEmail]?.paymentMethods || [],
        orders: users[normalizedEmail]?.orders || [],
      };
      users[normalizedEmail] = serverUser;
      saveData("users", users);
      setSessionToken(
        serverUser.sessionToken,
        preferredServerLogin.data.refreshToken,
      );

      // Salva ruolo e reindirizza
      const role = String(serverUser.role || "user")
        .trim()
        .toLowerCase();
      console.log("Login Server Success. Role:", role);
      localStorage.setItem("user-role", role);

      if (role === "admin") {
        window.location.href = "admin.html";
      } else {
        window.location.href = "products.html";
      }

      return serverUser;
    }
    if (prefersServerAuth()) {
      throw new Error(preferredServerLogin.error || "Email o password errati");
    }
    const userEntry = findUserEntryByEmail(users, normalizedEmail);
    const user = userEntry?.user;
    if (!user) {
      if (prefersServerAuth()) {
        console.log("Login server rifiutato");
      }
      console.log("Utente non trovato");
      throw new Error("Email o password errati");
    }
    const passwordHash = await hashPassword(password);
    const legacyHash = simpleHash(password);
    const alternatePasswordHash = password.endsWith("?")
      ? await hashPassword(password.slice(0, -1))
      : null;
    const alternateLegacyHash = password.endsWith("?")
      ? simpleHash(password.slice(0, -1))
      : null;
    console.log("Hash calcolato:", passwordHash);
    console.log("Hash legacy:", legacyHash);
    console.log("Hash utente:", user.passwordHash);
    if (
      user.passwordHash !== passwordHash &&
      user.passwordHash !== legacyHash &&
      user.passwordHash !== alternatePasswordHash &&
      user.passwordHash !== alternateLegacyHash
    ) {
      if (prefersServerAuth()) {
        console.log("Login server rifiutato");
      }
      console.log("Hash non corrispondono");
      throw new Error("Email o password errati");
    }
    console.log("Login riuscito");
    const sessionToken = generateSessionToken();
    const storedUser =
      migrateUserEmailKey(users, userEntry.key, normalizedEmail) || user;
    storedUser.sessionToken = sessionToken;
    users[normalizedEmail] = storedUser;
    saveData("users", users);
    setSessionToken(sessionToken);

    // Salva ruolo e reindirizza (Modalità Statica)
    const role = String(storedUser.role || "user")
      .trim()
      .toLowerCase();
    console.log("Login Static Success. Role:", role);
    localStorage.setItem("user-role", role);

    if (role === "admin") {
      window.location.href = "admin.html";
    } else {
      window.location.href = "products.html";
    }

    return storedUser;
  } catch (error) {
    console.error("Errore login:", error.message);
    throw error;
  }
}
async function fetchCurrentUserFromServer(token) {
  if (!prefersServerAuth() || !token) return null;
  try {
    const response = await fetch(getAuthApiUrl("/api/profile"), {
      headers: getAuthRequestHeaders(),
    });
    if (response.status === 401) {
      clearLocalSessionReferences(token);
      clearSessionToken();
      return null;
    }
    if (!response.ok) {
      return null;
    }
    const serverUser = await response.json();
    const users = loadData("users", {});
    const normalizedEmail = String(serverUser.email || "")
      .trim()
      .toLowerCase();
    if (!normalizedEmail) {
      return null;
    }
    const existingUser =
      findUserEntryByEmail(users, normalizedEmail)?.user || {};
    const mergedUser = {
      ...stripSensitiveUserData(existingUser),
      ...serverUser,
      email: normalizedEmail,
      sessionToken: token,
      addresses: Array.isArray(serverUser.addresses)
        ? serverUser.addresses
        : existingUser.addresses || [],
      paymentMethods: Array.isArray(serverUser.paymentMethods)
        ? serverUser.paymentMethods
        : existingUser.paymentMethods || [],
      orders: Array.isArray(serverUser.orders)
        ? serverUser.orders
        : existingUser.orders || [],
    };
    users[normalizedEmail] = mergedUser;
    saveData("users", users);
    return mergedUser;
  } catch (error) {
    console.warn("Recupero utente server non disponibile:", error.message);
    return null;
  }
}
async function getCurrentUser() {
  const token = getSessionToken();
  if (!token) return null;
  if (prefersServerAuth()) {
    const serverUser = await fetchCurrentUserFromServer(token);
    if (serverUser) {
      return serverUser;
    }
    if (!getSessionToken()) {
      return null;
    }
  }
  try {
    const users = loadData("users", {});
    const user = Object.values(users).find((u) => u.sessionToken === token);
    return user || null;
  } catch (error) {
    console.error("Errore recupero utente:", error);
    return null;
  }
}
async function updateCurrentUser(changes) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Utente non autenticato");
  if (prefersServerAuth()) {
    const response = await fetch(getAuthApiUrl("/api/profile"), {
      method: "PUT",
      headers: getAuthRequestHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(changes),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || "Errore aggiornamento profilo");
    }
    const refreshedUser = await fetchCurrentUserFromServer(getSessionToken());
    return refreshedUser || data?.user || { ...user, ...changes };
  }
  try {
    const users = loadData("users", {});
    const userEntry = findUserEntryByEmail(users, user.email);
    if (userEntry) {
      const normalizedEmail = String(user.email || "")
        .trim()
        .toLowerCase();
      const currentUser =
        migrateUserEmailKey(users, userEntry.key, normalizedEmail) ||
        userEntry.user;
      users[normalizedEmail] = {
        ...currentUser,
        ...changes,
        email: normalizedEmail,
      };
      saveData("users", users);
      return users[normalizedEmail];
    }
  } catch (error) {
    throw new Error("Errore aggiornamento profilo");
  }
}
async function changePassword(currentPassword, newPassword, confirmPassword) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Utente non autenticato");
  if (!prefersServerAuth()) {
    throw new Error("Cambio password disponibile solo con backend attivo");
  }

  const response = await fetch(getAuthApiUrl("/api/profile/password"), {
    method: "POST",
    headers: getAuthRequestHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      currentPassword: currentPassword,
      newPassword: newPassword,
      confirmPassword: confirmPassword,
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || "Errore aggiornamento password");
  }
  if (data?.sessionToken) {
    setSessionToken(data.sessionToken, data.refreshToken || null);
  }
  await fetchCurrentUserFromServer(getSessionToken());
  return data;
}
async function addAddress(address) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Utente non autenticato");
  if (prefersServerAuth()) {
    const response = await fetch(getAuthApiUrl("/api/profile/addresses"), {
      method: "POST",
      headers: getAuthRequestHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(address),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || "Errore aggiunta indirizzo");
    }
    await fetchCurrentUserFromServer(getSessionToken());
    return { success: true, address: data?.address || address };
  }
  try {
    const users = loadData("users", {});
    const userEntry = findUserEntryByEmail(users, user.email);
    if (!userEntry) throw new Error("Utente non trovato");
    const normalizedEmail = String(user.email || "")
      .trim()
      .toLowerCase();
    const storedUser =
      migrateUserEmailKey(users, userEntry.key, normalizedEmail) ||
      userEntry.user;
    if (!storedUser.addresses) storedUser.addresses = [];
    storedUser.addresses.push(address);
    users[normalizedEmail] = storedUser;
    saveData("users", users);
    return { success: true, address: address };
  } catch (error) {
    throw new Error("Errore aggiunta indirizzo");
  }
}
async function removeAddress(index) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Utente non autenticato");
  if (prefersServerAuth()) {
    const addresses = Array.isArray(user.addresses) ? user.addresses : [];
    const targetAddress = addresses[index];
    if (!targetAddress?.id) {
      throw new Error("Indirizzo non trovato");
    }
    const response = await fetch(
      getAuthApiUrl(`/api/profile/addresses/${targetAddress.id}`),
      { method: "DELETE", headers: getAuthRequestHeaders() },
    );
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || "Errore rimozione indirizzo");
    }
    await fetchCurrentUserFromServer(getSessionToken());
    return { success: true };
  }
  try {
    const users = loadData("users", {});
    const userEntry = findUserEntryByEmail(users, user.email);
    if (!userEntry) throw new Error("Utente non trovato");
    const normalizedEmail = String(user.email || "")
      .trim()
      .toLowerCase();
    const storedUser =
      migrateUserEmailKey(users, userEntry.key, normalizedEmail) ||
      userEntry.user;
    const addresses = storedUser.addresses || [];
    if (index < 0 || index >= addresses.length) {
      throw new Error("Indirizzo non trovato");
    }
    addresses.splice(index, 1);
    storedUser.addresses = addresses;
    users[normalizedEmail] = storedUser;
    saveData("users", users);
    return { success: true };
  } catch (error) {
    throw new Error(error.message || "Errore rimozione indirizzo");
  }
}
async function addPaymentMethod(method) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Utente non autenticato");
  if (prefersServerAuth()) {
    const response = await fetch(
      getAuthApiUrl("/api/profile/payment-methods"),
      {
        method: "POST",
        headers: getAuthRequestHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(method),
      },
    );
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || "Errore aggiunta metodo pagamento");
    }
    await fetchCurrentUserFromServer(getSessionToken());
    return { success: true, method: data?.paymentMethod || method };
  }
  try {
    const users = loadData("users", {});
    const userEntry = findUserEntryByEmail(users, user.email);
    if (!userEntry) throw new Error("Utente non trovato");
    const normalizedEmail = String(user.email || "")
      .trim()
      .toLowerCase();
    const storedUser =
      migrateUserEmailKey(users, userEntry.key, normalizedEmail) ||
      userEntry.user;
    if (!storedUser.paymentMethods) storedUser.paymentMethods = [];
    storedUser.paymentMethods.push(method);
    users[normalizedEmail] = storedUser;
    saveData("users", users);
    return { success: true, method: method };
  } catch (error) {
    throw new Error("Errore aggiunta metodo pagamento");
  }
}
async function removePaymentMethod(index) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Utente non autenticato");
  if (prefersServerAuth()) {
    const methods = Array.isArray(user.paymentMethods)
      ? user.paymentMethods
      : [];
    const targetMethod = methods[index];
    if (!targetMethod?.id) {
      throw new Error("Metodo di pagamento non trovato");
    }
    const response = await fetch(
      getAuthApiUrl(`/api/profile/payment-methods/${targetMethod.id}`),
      { method: "DELETE", headers: getAuthRequestHeaders() },
    );
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || "Errore rimozione metodo pagamento");
    }
    await fetchCurrentUserFromServer(getSessionToken());
    return { success: true };
  }
  try {
    const users = loadData("users", {});
    const userEntry = findUserEntryByEmail(users, user.email);
    if (!userEntry) throw new Error("Utente non trovato");
    const normalizedEmail = String(user.email || "")
      .trim()
      .toLowerCase();
    const storedUser =
      migrateUserEmailKey(users, userEntry.key, normalizedEmail) ||
      userEntry.user;
    const methods = storedUser.paymentMethods || [];
    if (index < 0 || index >= methods.length) {
      throw new Error("Metodo di pagamento non trovato");
    }
    methods.splice(index, 1);
    storedUser.paymentMethods = methods;
    users[normalizedEmail] = storedUser;
    saveData("users", users);
    return { success: true };
  } catch (error) {
    throw new Error(error.message || "Errore rimozione metodo pagamento");
  }
}
async function saveOrderForCurrentUser(order) {
  const user = await getCurrentUser();
  if (!user) {
    console.error("Utente non autenticato");
    return;
  }
  if (prefersServerAuth()) {
    await fetchCurrentUserFromServer(getSessionToken());
    return;
  }
  try {
    const users = loadData("users", {});
    const userEntry = findUserEntryByEmail(users, user.email);
    if (!userEntry) throw new Error("Utente non trovato");
    const normalizedEmail = String(user.email || "")
      .trim()
      .toLowerCase();
    const storedUser =
      migrateUserEmailKey(users, userEntry.key, normalizedEmail) ||
      userEntry.user;
    if (!storedUser.orders) storedUser.orders = [];
    storedUser.orders.push({
      ...order,
      id: storedUser.orders.length + 1,
      createdAt: new Date().toISOString(),
    });
    users[normalizedEmail] = storedUser;
    saveData("users", users);
    console.log("✅ Ordine salvato");
  } catch (error) {
    console.error("Errore salvataggio ordine:", error);
  }
}
async function getCurrentUserOrders() {
  const user = await getCurrentUser();
  if (!user) return [];
  if (prefersServerAuth()) {
    return Array.isArray(user.orders) ? user.orders : [];
  }
  try {
    const users = loadData("users", {});
    const userEntry = findUserEntryByEmail(users, user.email);
    return userEntry?.user?.orders || [];
  } catch (error) {
    console.error("Errore recupero ordini:", error);
    return [];
  }
}
function getAllProducts() {
  let products = loadData("products", []);

  // Se non ci sono prodotti e siamo su GitHub Pages, assicuriamoci di averne di fallback
  if (
    (!products || products.length === 0) &&
    window.location.hostname.includes("github.io")
  ) {
    ensureFallbackProducts();
    products = loadData("products", []);
  }

  return products;
}
function getProductById(id) {
  const products = window.getAllProducts();
  return products.find((p) => p.id === parseInt(id));
}
async function logout() {
  console.log("Eseguo logout...");
  try {
    const token = getSessionToken();
    if (prefersServerAuth() && token) {
      await fetch(getAuthApiUrl("/api/auth/logout"), {
        method: "POST",
        headers: getAuthRequestHeaders(),
        keepalive: true,
      });
    }
  } catch (error) {
    console.warn("Logout server non completato:", error.message);
  } finally {
    clearSessionToken();
    updateAuthNav();
    window.location.href = "index.html";
  }
}
function searchProducts() {
  const input = document.getElementById("search-input");
  const query = String(input?.value || "")
    .trim()
    .toLowerCase();
  if (!query) return;
  window.location.href = `products.html?search=${encodeURIComponent(query)}`;
}
async function updateAuthNav() {
  const authLinks = document.getElementById("auth-links");
  if (!authLinks) return;
  const token = getSessionToken();
  if (token) {
    // Utente loggato
    try {
      const user = await getCurrentUser();
      if (!user) {
        authLinks.innerHTML = `<a href="index.html" class="text-white">Accedi</a>`;
        return;
      }
      let navHtml = `<a href="account.html" class="text-white me-3">Profilo</a>`;
      if (user.role === "admin") {
        navHtml += `<a href="admin.html" class="text-white me-3">Admin</a>`;
      }
      navHtml += `<a href="#" id="logout-link" class="text-white">Esci</a>`;
      authLinks.innerHTML = navHtml;
      const logoutLink = document.getElementById("logout-link");
      if (logoutLink) {
        logoutLink.addEventListener("click", (e) => {
          e.preventDefault();
          logout();
          window.location.href = "index.html";
        });
      }
    } catch (error) {
      console.error("Errore aggiornamento navigazione autenticata:", error);
      authLinks.innerHTML = `<a href="#" id="logout-link" class="text-white">Esci</a>`;
    }
  } else {
    authLinks.innerHTML = `<a href="index.html" class="text-white">Accedi / Registrati</a>`;
  }
}
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", async function () {
    // Forza la visibilità dopo un timeout di sicurezza se l'inizializzazione fallisce
    const forceShow = setTimeout(
      () => document.body.classList.remove("initially-hidden"),
      2000,
    );
    try {
      await initializeLocalDB();
    } catch (e) {
      console.warn("Errore durante l'inizializzazione del DB:", e);
    } finally {
      if (typeof window.updateCartCount === "function")
        window.updateCartCount();
      updateAuthNav();
      document.body.classList.remove("initially-hidden");
      clearTimeout(forceShow);
    }
  });
}
window.logout = logout;
window.login = loginUser;
window.register = registerUser;
window.searchProducts = searchProducts;
window.prefersServerAuth = prefersServerAuth;
window.isStaticHostedMode = isStaticHostedMode;
window.getServerBaseUrl = getServerBaseUrl;
window.getBackendRequestHeaders = getBackendRequestHeaders;
window.ensureFallbackProducts = ensureFallbackProducts;
window.getDefaultProducts = getDefaultProducts;
window.changePassword = changePassword;

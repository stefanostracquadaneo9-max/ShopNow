const DB_KEY_PREFIX = "ecommerce_";
const AUTH_SESSION_KEY = "ecommerce-session-token";
const AUTH_SERVER_BASE_URL = "http://localhost:3000";
const AUTH_STORAGE_VERSION_KEY = "ecommerce-auth-version";
const AUTH_STORAGE_VERSION = "20260405c";
const PRODUCT_IMAGE_OVERRIDES = {
    "Laptop Pro": "uploads/Laptop_Pro.jpg",
    "Pantaloni Jeans": "uploads/Pantaloni_Jeans.jpg",
};
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
function getRuntimeOverride() {
    if (typeof window === "undefined" || !window.location) {
        return "";
    }
    return String(
        new URLSearchParams(window.location.search).get("runtime") || "",
    )
        .trim()
        .toLowerCase();
}
function normalizeBaseUrl(value) {
    const normalized = String(value || "").trim();
    if (!normalized) {
        return "";
    }
    return normalized.replace(/\/+$/, "");
}
function getConfiguredApiBaseUrl() {
    if (typeof window === "undefined") {
        return "";
    }
    const runtimeValue = normalizeBaseUrl(window.SHOPNOW_API_BASE_URL);
    if (runtimeValue) {
        return runtimeValue;
    }
    if (typeof document !== "undefined") {
        const metaValue = normalizeBaseUrl(
            document
                .querySelector('meta[name="shopnow-api-base-url"]')
                ?.getAttribute("content"),
        );
        if (metaValue) {
            return metaValue;
        }
    }
    const queryValue =
        typeof window.location !== "undefined"
            ? normalizeBaseUrl(
                  new URLSearchParams(window.location.search).get("api_base"),
              )
            : "";
    return queryValue;
}
function getServerBaseUrl() {
    const configuredBaseUrl = getConfiguredApiBaseUrl();
    if (configuredBaseUrl) {
        return configuredBaseUrl;
    }
    if (typeof window !== "undefined" && window.location) {
        return normalizeBaseUrl(window.location.origin);
    }
    return normalizeBaseUrl(AUTH_SERVER_BASE_URL);
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
    const runtimeOverride = getRuntimeOverride();
    if (runtimeOverride === "server") {
        return true;
    }
    if (runtimeOverride === "static" || runtimeOverride === "github") {
        return false;
    }
    if (getConfiguredApiBaseUrl()) {
        return true;
    }
    if (window.location.protocol === "file:") {
        return false;
    }
    const hostname = String(window.location.hostname || "").toLowerCase();
    if (hostname.endsWith(".github.io")) {
        return false;
    }
    return true;
}
function isStaticHostedMode() {
    return !prefersServerAuth();
}
async function initializeLocalDB() {
    console.log("Inizializzazione DB chiamata");
    const currentStorageVersion = localStorage.getItem(
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
        localStorage.removeItem(DB_KEY_PREFIX + "initialized");
        localStorage.removeItem(DB_KEY_PREFIX + "users");
        localStorage.removeItem(DB_KEY_PREFIX + "products");
        localStorage.removeItem(DB_KEY_PREFIX + "orders");
        localStorage.removeItem("cart");
        if (window.history && window.history.replaceState) {
            window.history.replaceState(
                {},
                "",
                window.location.pathname + window.location.hash,
            );
        }
    }
    const initialized = localStorage.getItem(DB_KEY_PREFIX + "initialized");
    const existingUsers = loadData("users", {});
    const adminUser = existingUsers["admin@gmail.com"];
    const existingProducts = loadData("products", []);
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
        if (updated) {
            saveData("products", existingProducts);
            console.log("Immagini prodotti migrate a fallback locale");
        }
    }
    const expectedShaHash =
        "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918";
    if (initialized && adminUser && adminUser.passwordHash) {
        const expectedLegacyHash = simpleHash("admin");
        if (
            adminUser.passwordHash !== expectedLegacyHash &&
            adminUser.passwordHash !== expectedShaHash
        ) {
            console.log(
                "Hash admin non valido trovato, ripristino con hash legacy.",
            );
            adminUser.passwordHash = expectedLegacyHash;
            existingUsers[adminUser.email] = adminUser;
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
        const products = [
            {
                id: 1,
                name: "Laptop Pro",
                description: "Potente laptop per professionisti",
                price: 1299.99,
                category: "elettronica",
                image: "uploads/Laptop_Pro.jpg",
                stock: 10,
                rating: 4.5,
            },
            {
                id: 2,
                name: "Mouse Wireless",
                description: "Mouse senza fili ergonomico",
                price: 29.99,
                category: "elettronica",
                image: "",
                stock: 50,
                rating: 4.2,
            },
            {
                id: 3,
                name: "Tastiera Meccanica",
                description: "Tastiera con switch meccanici",
                price: 149.99,
                category: "elettronica",
                image: "",
                stock: 25,
                rating: 4.7,
            },
            {
                id: 4,
                name: "Monitor 4K",
                description: "Monitor 4K da 27 pollici",
                price: 399.99,
                category: "elettronica",
                image: "",
                stock: 15,
                rating: 4.4,
            },
            {
                id: 5,
                name: "Cuffie ANC",
                description: "Cuffie con cancellazione rumore",
                price: 199.99,
                category: "elettronica",
                image: "",
                stock: 30,
                rating: 4.6,
            },
            {
                id: 6,
                name: "Maglietta Premium",
                description: "Maglietta in cotone 100% organico",
                price: 34.99,
                category: "abbigliamento",
                image: "",
                stock: 60,
                rating: 4.3,
            },
            {
                id: 7,
                name: "Pantaloni Jeans",
                description: "Jeans di qualità premium",
                price: 79.99,
                category: "abbigliamento",
                image: "uploads/Pantaloni_Jeans.jpg",
                stock: 40,
                rating: 4.4,
            },
            {
                id: 8,
                name: "Giacca Invernale",
                description: "Giacca calda per l'inverno",
                price: 149.99,
                category: "abbigliamento",
                image: "",
                stock: 20,
                rating: 4.6,
            },
            {
                id: 9,
                name: "Scarpe Sportive",
                description: "Scarpe comode per sport e quotidiano",
                price: 99.99,
                category: "abbigliamento",
                image: "",
                stock: 35,
                rating: 4.5,
            },
            {
                id: 10,
                name: "Divano Moderno",
                description: "Divano in tessuto grigio chiaro",
                price: 599.99,
                category: "casa",
                image: "",
                stock: 8,
                rating: 4.7,
            },
            {
                id: 11,
                name: "Tavolo da Pranzo",
                description: "Tavolo in legno massello",
                price: 349.99,
                category: "casa",
                image: "",
                stock: 12,
                rating: 4.4,
            },
            {
                id: 12,
                name: "Lampada a Sospensione",
                description: "Lampada moderna design minimalista",
                price: 89.99,
                category: "casa",
                image: "",
                stock: 25,
                rating: 4.3,
            },
            {
                id: 13,
                name: "Tappeto Persiano",
                description: "Tappeto in lana naturale",
                price: 199.99,
                category: "casa",
                image: "",
                stock: 15,
                rating: 4.6,
            },
            {
                id: 14,
                name: "Bicicletta Mountain",
                description: "Bicicletta MTB 21 velocità",
                price: 449.99,
                category: "sport",
                image: "",
                stock: 10,
                rating: 4.5,
            },
            {
                id: 15,
                name: "Zaino Trekking",
                description: "Zaino 50L impermeabile",
                price: 129.99,
                category: "sport",
                image: "",
                stock: 40,
                rating: 4.4,
            },
            {
                id: 16,
                name: "Tenda da Campeggio",
                description: "Tenda 3 persone ultraleggera",
                price: 219.99,
                category: "sport",
                image: "",
                stock: 18,
                rating: 4.6,
            },
            {
                id: 17,
                name: "Pallone da Calcio",
                description: "Pallone professionale ufficiale",
                price: 44.99,
                category: "sport",
                image: "",
                stock: 50,
                rating: 4.3,
            },
            {
                id: 18,
                name: "Il Signore degli Anelli",
                description: "Trilogia completa in edizione speciale",
                price: 89.99,
                category: "libri",
                image: "",
                stock: 25,
                rating: 4.9,
            },
            {
                id: 19,
                name: "Harry Potter Complete",
                description: "Collezione completa di Harry Potter",
                price: 79.99,
                category: "libri",
                image: "",
                stock: 30,
                rating: 4.8,
            },
            {
                id: 20,
                name: "Microsservizi Professionali",
                description: "Guida tecnica su architetture microservizi",
                price: 59.99,
                category: "libri",
                image: "",
                stock: 15,
                rating: 4.4,
            },
            {
                id: 21,
                name: "Sapiens - Una breve storia",
                description: "Una breve storia dell'umanità",
                price: 24.99,
                category: "libri",
                image: "",
                stock: 45,
                rating: 4.7,
            },
            {
                id: 22,
                name: "Orologio Smartwatch",
                description: "Smartwatch con monitoraggio salute",
                price: 249.99,
                category: "altro",
                image: "",
                stock: 22,
                rating: 4.5,
            },
            {
                id: 23,
                name: "Power Bank 65W",
                description: "Power bank ad alta velocità 20000mAh",
                price: 59.99,
                category: "altro",
                image: "",
                stock: 50,
                rating: 4.3,
            },
            {
                id: 24,
                name: "Diffusore Bluetooth",
                description: "Altoparlante Bluetooth wireless",
                price: 89.99,
                category: "altro",
                image: "",
                stock: 35,
                rating: 4.4,
            },
            {
                id: 25,
                name: "Portafoglio RFID",
                description: "Portafoglio con protezione RFID",
                price: 39.99,
                category: "altro",
                image: "",
                stock: 60,
                rating: 4.2,
            },
        ];
        saveData("users", users);
        saveData("products", products);
        saveData("orders", []);
        localStorage.setItem(DB_KEY_PREFIX + "initialized", "1");
        console.log("DB locale inizializzato con dati demo");
    }
    await syncUsersFromServer();
    await syncProductsFromServer();
}
function saveData(key, data) {
    try {
        localStorage.setItem(DB_KEY_PREFIX + key, JSON.stringify(data));
        console.log(`💾 Dati salvati: ${key}`);
    } catch (error) {
        console.error("Errore salvataggio dati:", error);
    }
}
function loadData(key, defaultValue = {}) {
    try {
        const data = localStorage.getItem(DB_KEY_PREFIX + key);
        return data ? JSON.parse(data) : defaultValue;
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
function setSessionToken(token) {
    localStorage.setItem(AUTH_SESSION_KEY, token);
}
function clearSessionToken() {
    const currentToken = getSessionToken();
    if (currentToken) {
        clearLocalSessionReferences(currentToken);
    }
    localStorage.removeItem(AUTH_SESSION_KEY);
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
    return `${AUTH_SERVER_BASE_URL}${normalizedPath}`;
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
        return;
    }
    try {
        const response = await fetch(getAuthApiUrl("/api/auth/users"), {
            headers: getBackendRequestHeaders(),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.users || !Array.isArray(data.users)) {
            return;
        }
        const localUsers = loadData("users", {});
        let changed = false;
        data.users.forEach((serverUser) => {
            const normalizedEmail = String(serverUser.email || "")
                .trim()
                .toLowerCase();
            if (!normalizedEmail) return;
            const existing =
                findUserEntryByEmail(localUsers, normalizedEmail)?.user || {};
            localUsers[normalizedEmail] = {
                ...existing,
                id: serverUser.id,
                email: normalizedEmail,
                name: serverUser.name,
                role: serverUser.role,
                passwordHash: serverUser.passwordHash || existing.passwordHash,
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
    }
}
async function syncProductsFromServer() {
    if (!prefersServerAuth()) {
        return;
    }
    try {
        const response = await fetch(getAuthApiUrl("/api/products"), {
            headers: getBackendRequestHeaders(),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(data)) {
            return;
        }
        const normalizedProducts = data.map((product) => ({
            ...product,
            image: resolveProductImage(product),
        }));
        saveData("products", normalizedProducts);
    } catch (error) {
        console.warn("Sync prodotti server non disponibile:", error.message);
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
        if (
            !prefersServerAuth() &&
            findUserEntryByEmail(users, normalizedEmail)
        ) {
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
            console.warn(
                "Registrazione server non disponibile:",
                serverResult.error,
            );
        }
        const passwordHash = await hashPassword(password);
        const user = {
            id: serverResult.ok
                ? serverResult.data.user.id
                : Object.keys(users).length + 1,
            email: normalizedEmail,
            name: name,
            passwordHash: passwordHash,
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
        users[normalizedEmail] = user;
        saveData("users", users);
        return { success: true, message: "Account creato con successo" };
    } catch (error) {
        throw error;
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
            const passwordHash = await hashPassword(password);
            const serverUser = {
                id: preferredServerLogin.data.user.id,
                email: preferredServerLogin.data.user.email,
                name: preferredServerLogin.data.user.name,
                role: preferredServerLogin.data.user.role,
                passwordHash: passwordHash,
                sessionToken: preferredServerLogin.data.sessionToken,
                createdAt:
                    preferredServerLogin.data.user.createdAt ||
                    new Date().toISOString(),
                addresses: users[normalizedEmail]?.addresses || [],
                paymentMethods: users[normalizedEmail]?.paymentMethods || [],
                orders: users[normalizedEmail]?.orders || [],
            };
            users[normalizedEmail] = serverUser;
            saveData("users", users);
            setSessionToken(serverUser.sessionToken);
            return {
                id: serverUser.id,
                email: serverUser.email,
                name: serverUser.name,
                role: serverUser.role,
                sessionToken: serverUser.sessionToken,
            };
        }
        if (prefersServerAuth()) {
            throw new Error(
                preferredServerLogin.error || "Email o password errati",
            );
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
        return {
            id: storedUser.id,
            email: storedUser.email,
            name: storedUser.name,
            role: storedUser.role,
            sessionToken: sessionToken,
        };
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
            ...existingUser,
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
        const refreshedUser =
            await fetchCurrentUserFromServer(getSessionToken());
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
    const products = loadData("products", []);
    console.log("getAllProducts loaded:", products.length, "products");
    return products;
}
function getProductById(id) {
    const products = getAllProducts();
    return products.find((p) => p.id === parseInt(id));
}
function logoutUser() {
    clearSessionToken();
    console.log("✅ Logout eseguito");
    updateAuthNav();
}
function logout() {
    logoutUser();
    window.location.href = "index.html";
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
                    logoutUser();
                    window.location.href = "index.html";
                });
            }
        } catch (error) {
            console.error("Errore nav:", error);
            authLinks.innerHTML = `<a href="#" id="logout-link" class="text-white">Esci</a>`;
        }
    } else {
        authLinks.innerHTML = `<a href="index.html" class="text-white">Accedi / Registrati</a>`;
    }
}
if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", async function () {
        await initializeLocalDB();
        updateAuthNav();
    });
}
window.logout = logout;
window.searchProducts = searchProducts;
window.prefersServerAuth = prefersServerAuth;
window.isStaticHostedMode = isStaticHostedMode;
window.getServerBaseUrl = getServerBaseUrl;
window.getBackendRequestHeaders = getBackendRequestHeaders;

const SHIPPING_RATE_UNDER_THRESHOLD = 0.05;
const BUY_NOW_CART_KEY = "shopnow-buy-now-cart";
const CART_BRIDGE_KEYS = [
    "ecommerce_users",
    "ecommerce-session-token",
    "cart",
    "cart-count",
];
const currencyFormatter = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
});
let stripeInstance = null;
let stripeCardElement = null;
let bridgedCheckoutPrefill = null;
redirectFileModeCartPage();
function redirectFileModeCartPage() {
    return false;
}
function isServerCheckoutMode() {
    return typeof prefersServerAuth === "function"
        ? prefersServerAuth()
        : window.location.protocol !== "file:";
}
function isStaticCheckoutMode() {
    return !isServerCheckoutMode();
}
function isLocalhostMode() {
    return isServerCheckoutMode();
}
function isBuyNowMode() {
    return (
        new URLSearchParams(window.location.search).get("mode") === "buy-now"
    );
}
function shouldFocusCheckout() {
    return new URLSearchParams(window.location.search).get("checkout") === "1";
}
function clearCheckoutFocusFlag() {
    const currentUrl = new URL(window.location.href);
    if (!currentUrl.searchParams.has("checkout")) {
        return;
    }
    currentUrl.searchParams.delete("checkout");
    window.history.replaceState(
        {},
        "",
        `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
    );
}
/**
 * Gestione "Acquista ora" in stile Amazon
 */
function buyNow(productId) {
    const normalizedId = String(productId ?? "").trim();
    if (!normalizedId) return;
    try {
        const checkoutItems = { [normalizedId]: 1 };
        window.sessionStorage.setItem("shopnow-active-checkout", JSON.stringify(checkoutItems));
        window.location.href = `checkout.html?mode=direct`;
    } catch (error) {
        console.error("Errore Buy Now:", error);
    }
}

/**
 * Alias per buyNow utilizzato nel rendering del carrello
 */
function checkoutSingleItem(productId) {
    buyNow(productId);
}

/**
 * Avvia il checkout per un set specifico di prodotti
 */
function proceedToCheckout(items) {
    if (!items || Object.keys(items).length === 0) return;
    window.sessionStorage.setItem("shopnow-active-checkout", JSON.stringify(items));
    window.location.href = "checkout.html";
}
function getCartStorageArea() {
    return isBuyNowMode() ? window.sessionStorage : window.localStorage;
}
function getApiUrl(path) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const baseUrl =
        typeof getServerBaseUrl === "function"
            ? getServerBaseUrl()
            : "http://localhost:3000";
    return `${baseUrl}${normalizedPath}`;
}
function getApiRequestHeaders(extraHeaders = {}) {
    return typeof getBackendRequestHeaders === "function"
        ? getBackendRequestHeaders(extraHeaders)
        : { ...extraHeaders };
}
function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        };
        return entities[char] || char;
    });
}
function renderSavedPaymentMethod(method) {
    const box = document.getElementById("saved-payment-method");
    if (!box) {
        return;
    }
    if (
        !method ||
        (!method.alias && !method.brand && !method.last4 && !method.expiry)
    ) {
        box.style.display = "none";
        box.textContent = "";
        return;
    }
    const label = method.alias || "Metodo salvato";
    const brand = method.brand || "Carta";
    const last4 = method.last4 ? `**** ${method.last4}` : "";
    const expiry = method.expiry ? `Scadenza ${method.expiry}` : "";
    box.textContent = `${label}: ${brand} ${last4} ${expiry}`
        .replace(/\s+/g, " ")
        .trim();
    box.style.display = "block";
}
function consumeBridgeData() {
    if (!isLocalhostMode()) {
        return;
    }
    const currentUrl = new URL(window.location.href);
    const bridgeParam = currentUrl.searchParams.get("bridge");
    const prefillParam = currentUrl.searchParams.get("prefill");
    if (!bridgeParam && !prefillParam) {
        return;
    }
    if (bridgeParam) {
        try {
            const payload = JSON.parse(bridgeParam);
            Object.entries(payload).forEach(([key, value]) => {
                if (typeof value === "string") {
                    localStorage.setItem(key, value);
                }
            });
        } catch (error) {
            console.error("Errore import dati checkout:", error);
        }
    }
    try {
        bridgedCheckoutPrefill = prefillParam ? JSON.parse(prefillParam) : null;
    } catch (error) {
        console.error("Errore prefill checkout:", error);
        bridgedCheckoutPrefill = null;
    }
    currentUrl.searchParams.delete("bridge");
    currentUrl.searchParams.delete("prefill");
    window.history.replaceState(
        {},
        "",
        `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
    );
}
function getCart() {
    try {
        const raw = getCartStorageArea().getItem(
            isBuyNowMode() ? BUY_NOW_CART_KEY : "cart",
        );
        const parsed = raw ? JSON.parse(raw) : {};
        if (
            parsed &&
            typeof parsed === "object" &&
            !Array.isArray(parsed) &&
            Array.isArray(parsed.items)
        ) {
            return parsed.items.reduce((accumulator, item) => {
                if (item && item.id != null) {
                    accumulator[item.id] = Number(item.quantity || 0);
                }
                return accumulator;
            }, {});
        }
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed;
        }
        return {};
    } catch (error) {
        console.error("Errore lettura carrello:", error);
        return {};
    }
}
function addToCart(productId) {
    const cart = getCart();
    const product = getProductsForCart().find(p => String(p.id) === String(productId));
    const stock = getAvailableStockValue(product);
    
    const currentQty = cart[productId] || 0;
    if (currentQty >= stock) {
        alert("Prodotto esaurito o limite stock raggiunto.");
        return false;
    }

    cart[productId] = currentQty + 1;
    saveCart(cart);
    return true;
}

function saveCart(cart) {
    try {
        getCartStorageArea().setItem(
            isBuyNowMode() ? BUY_NOW_CART_KEY : "cart",
            JSON.stringify(cart),
        );
        updateCartCount();
    } catch (error) {
        console.error("Errore salvataggio carrello:", error);
    }
}
function clearLocalCart() {
    if (isBuyNowMode()) {
        sessionStorage.removeItem(BUY_NOW_CART_KEY);
        if (window.history && window.history.replaceState) {
            window.history.replaceState({}, "", window.location.pathname);
        }
        return;
    }
    localStorage.removeItem("cart");
    localStorage.setItem("cart-count", "0");
}
function updateCartCount() {
    const cart = getCart();
    const count = Object.values(cart).reduce(
        (sum, qty) => sum + Number(qty || 0),
        0,
    );
    localStorage.setItem("cart-count", String(count));
    const counter = document.getElementById("cart-count");
    if (counter) {
        counter.textContent = String(count);
    }
}
function showCheckoutMessage(type, text) {
    const box = document.getElementById("checkout-message");
    if (!box) {
        return;
    }
    if (!text) {
        box.style.display = "none";
        box.textContent = "";
        box.className = "mb-3";
        return;
    }
    box.style.display = "block";
    box.className = `alert alert-${type} mb-3`;
    box.textContent = text;
}
function setCheckoutLoading(isLoading) {
    const button = document.getElementById("checkout-btn");
    if (!button) {
        return;
    }
    button.disabled = isLoading;
    button.textContent = isLoading
        ? isStaticCheckoutMode()
            ? "Conferma ordine in corso..."
            : "Pagamento in corso..."
        : isStaticCheckoutMode()
          ? "Conferma ordine"
          : "Procedi al pagamento";
}
function fetchWithTimeout(url, options = {}, timeout = 15000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const fetchOptions = {
        ...options,
        signal: controller.signal,
    };
    return fetch(url, fetchOptions)
        .finally(() => clearTimeout(id))
        .catch((error) => {
            if (error.name === "AbortError") {
                throw new Error("Timeout: il server non risponde.");
            }
            throw error;
        });
}
function formatCurrency(value) {
    return currencyFormatter.format(Number(value || 0));
}
function calculateShippingCost(subtotal) {
    const normalizedSubtotal = Number(subtotal || 0);
    if (
        normalizedSubtotal <= 0 ||
        normalizedSubtotal >= FREE_SHIPPING_THRESHOLD
    ) {
        return 0;
    }
    return Number(
        (normalizedSubtotal * SHIPPING_RATE_UNDER_THRESHOLD).toFixed(2),
    );
}
function normalizeCountryCode(value) {
    const normalized = String(value || "")
        .trim()
        .toUpperCase();

    // Mappa paesi comuni con variazioni
    const countryMap = {
        // Italia
        ITALIA: "IT",
        ITALY: "IT",
        IT: "IT",
        // Stati Uniti
        "STATI UNITI": "US",
        USA: "US",
        "UNITED STATES": "US",
        US: "US",
        // Regno Unito
        "REGNO UNITO": "GB",
        "UNITED KINGDOM": "GB",
        UK: "GB",
        GB: "GB",
        // Germania
        GERMANIA: "DE",
        GERMANY: "DE",
        DE: "DE",
        // Francia
        FRANCIA: "FR",
        FRANCE: "FR",
        FR: "FR",
        // Spagna
        SPAGNA: "ES",
        SPAIN: "ES",
        ES: "ES",
        // Altri paesi europei comuni
        AUSTRIA: "AT",
        AUSTRIA: "AT",
        AT: "AT",
        BELGIO: "BE",
        BELGIUM: "BE",
        BE: "BE",
        OLANDA: "NL",
        NETHERLANDS: "NL",
        NL: "NL",
        SVEZIA: "SE",
        SWEDEN: "SE",
        SE: "SE",
        NORVEGIA: "NO",
        NORWAY: "NO",
        NO: "NO",
        DANIMARCA: "DK",
        DENMARK: "DK",
        DK: "DK",
        SVIZZERA: "CH",
        SWITZERLAND: "CH",
        CH: "CH",
        PORTOGALLO: "PT",
        PORTUGAL: "PT",
        PT: "PT",
        IRLANDA: "IE",
        IRELAND: "IE",
        IE: "IE",
        FINLANDIA: "FI",
        FINLAND: "FI",
        FI: "FI",
        POLONIA: "PL",
        POLAND: "PL",
        PL: "PL",
        CECOSLOVACCHIA: "CZ",
        "REPUBBLICA CECA": "CZ",
        CZECH: "CZ",
        CZ: "CZ",
        UNGHERIA: "HU",
        HUNGARY: "HU",
        HU: "HU",
        GRECIA: "GR",
        GREECE: "GR",
        GR: "GR",
        // Altri paesi
        CANADA: "CA",
        CA: "CA",
        AUSTRALIA: "AU",
        AU: "AU",
        GIAPPONE: "JP",
        JAPAN: "JP",
        JP: "JP",
        CINA: "CN",
        CHINA: "CN",
        CN: "CN",
        INDIA: "IN",
        IN: "IN",
        BRASILE: "BR",
        BRAZIL: "BR",
        BR: "BR",
        MESSICO: "MX",
        MEXICO: "MX",
        MX: "MX",
        ARGENTINA: "AR",
        AR: "AR",
        CILE: "CL",
        CHILE: "CL",
        CL: "CL",
        COLOMBIA: "CO",
        CO: "CO",
        PERU: "PE",
        PE: "PE",
        VENEZUELA: "VE",
        VE: "VE",
        URUGUAY: "UY",
        UY: "UY",
        PARAGUAY: "PY",
        PY: "PY",
        BOLIVIA: "BO",
        BO: "BO",
        ECUADOR: "EC",
        EC: "EC",
    };

    // Se è nella mappa, usa il codice corrispondente
    if (countryMap[normalized]) {
        return countryMap[normalized];
    }

    // Se è già un codice ISO a 2 lettere valido, restituiscilo
    if (/^[A-Z]{2}$/.test(normalized)) {
        return normalized;
    }

    // Per paesi non riconosciuti, prova a estrarre un codice a 2 lettere
    // o usa una logica di fallback
    const words = normalized.split(/\s+/);
    if (words.length > 0) {
        const firstWord = words[0];
        if (firstWord.length >= 2) {
            return firstWord.substring(0, 2).toUpperCase();
        }
    }

    // Fallback: restituisci i primi 2 caratteri
    return normalized.substring(0, 2).toUpperCase() || "IT";
}
function getProductsForCart() {
    if (typeof getAllProducts === "function") {
        const products = getAllProducts();
        if (products.length) {
            return products;
        }
    }
    if (typeof getDefaultProducts === "function") {
        return getDefaultProducts();
    }
    return [];
}
function getAvailableStockValue(product) {
    const parsedStock = Number(product?.stock);
    if (!Number.isFinite(parsedStock)) {
        return Number.POSITIVE_INFINITY;
    }
    return Math.max(0, Math.floor(parsedStock));
}
function sanitizeCartByStock(cart, products) {
    const sanitizedCart = {};
    let changed = false;
    Object.entries(cart || {}).forEach(([productId, quantityValue]) => {
        const requestedQuantity = Math.max(
            0,
            Math.floor(Number(quantityValue || 0)),
        );
        const product = products.find(
            (entry) => entry.id === Number(productId),
        );
        if (!product || requestedQuantity <= 0) {
            if (requestedQuantity > 0) {
                changed = true;
            }
            return;
        }
        const availableStock = getAvailableStockValue(product);
        const safeQuantity = Number.isFinite(availableStock)
            ? Math.min(requestedQuantity, availableStock)
            : requestedQuantity;
        if (safeQuantity !== requestedQuantity) {
            changed = true;
        }
        if (safeQuantity > 0) {
            sanitizedCart[productId] = safeQuantity;
        } else {
            changed = true;
        }
    });
    if (changed) {
        saveCart(sanitizedCart);
    }
    return sanitizedCart;
}
function getCartDetails() {
    const products = getProductsForCart();
    const cart = sanitizeCartByStock(getCart(), products);
    const items = [];
    let subtotal = 0;
    Object.entries(cart).forEach(([productId, quantityValue]) => {
        const quantity = Number(quantityValue || 0);
        if (quantity <= 0) {
            return;
        }
        const product = products.find(
            (entry) => entry.id === Number(productId),
        );
        if (!product) {
            return;
        }
        const price = Number(product.price || 0);
        const availableStock = getAvailableStockValue(product);
        subtotal += price * quantity;
        items.push({
            id: Number(product.id),
            name: product.name,
            price: price,
            quantity: quantity,
            image: product.image || "",
            stock: Number.isFinite(availableStock) ? availableStock : quantity,
        });
    });
    const shipping = items.length ? calculateShippingCost(subtotal) : 0;
    const vat = subtotal * 0.22;
    const total = Number((subtotal + vat + shipping).toFixed(2));
    return {
        items: items,
        subtotal: subtotal,
        vat: vat,
        shipping: shipping,
        total: total,
    };
}
function getCartItemImageMarkup(item) {
    if (!item.image) {
        return '<span class="text-muted small">N/D</span>';
    }
    return `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" style="width:50px;height:50px;object-fit:cover">`;
}
function renderCart() {
    const itemsContainer = document.getElementById("cart-items");
    const totalContainer = document.getElementById("cart-total");
    const checkoutPanel = document.getElementById("checkout-panel");
    const checkoutButton = document.getElementById("checkout-btn");
    const totalLabel = document.getElementById("checkout-total-label");
    if (
        !itemsContainer ||
        !totalContainer ||
        !checkoutPanel ||
        !checkoutButton ||
        !totalLabel
    ) {
        return;
    }
    const { items, subtotal, vat, shipping, total } = getCartDetails();
    if (!items.length) {
        itemsContainer.innerHTML = isBuyNowMode()
            ? '<div class="alert alert-warning">Seleziona almeno un prodotto per procedere al checkout rapido.</div>'
            : "<p>Il carrello e vuoto.</p>";
        totalContainer.innerHTML = "";
        checkoutPanel.style.display = "none";
        checkoutButton.style.display = "none";
        return;
    }
    const rowsMarkup = items
        .map(
            (item) => `
        <tr>
            <td>${getCartItemImageMarkup(item)}</td>
            <td>${escapeHtml(item.name)}</td>
            <td>${formatCurrency(item.price)}</td>
            <td>
                <button class="btn btn-sm btn-outline-secondary" onclick="updateQuantity(${item.id}, ${item.quantity - 1})">-</button>
                <span class="mx-2">${item.quantity}</span>
                <button class="btn btn-sm btn-outline-secondary" onclick="updateQuantity(${item.id}, ${item.quantity + 1})" ${item.quantity >= item.stock ? "disabled" : ""}>+</button>
                <div class="small text-muted mt-1">Disponibili: ${item.stock}</div>
            </td>
            <td>${formatCurrency(item.price * item.quantity)}</td>
            <td>
                <div class="d-flex flex-column gap-1">
                    <button class="btn btn-sm btn-buy-now py-0" onclick="checkoutSingleItem(${item.id})">Acquista ora</button>
                    <button class="btn btn-sm btn-outline-danger py-0" onclick="removeFromCart(${item.id})">Rimuovi</button>
                </div>
            </td>
        </tr>
    `,
        )
        .join("");
    const buyNowNotice = isBuyNowMode()
        ? `
            <div class="alert alert-warning d-flex align-items-center gap-2" role="alert">
                <i class="fas fa-bolt"></i>
                <span>Checkout rapido attivo: questo flusso "Acquista ora" usa solo il prodotto selezionato e porta direttamente al pagamento.</span>
            </div>
        `
        : "";
    itemsContainer.innerHTML = `
        ${buyNowNotice}
        <table class="table">
            <thead>
                <tr>
                    <th>Immagine</th>
                    <th>Prodotto</th>
                    <th>Prezzo</th>
                    <th>Quantita</th>
                    <th>Totale</th>
                    <th>Azioni</th>
                </tr>
            </thead>
            <tbody>${rowsMarkup}</tbody>
        </table>
    `;
    totalContainer.innerHTML = `
        <div class="summary-card">
            <div class="summary-row"><span>Subtotale:</span> <span>${formatCurrency(subtotal)}</span></div>
            <div class="summary-row"><span>IVA (22%):</span> <span>${formatCurrency(vat)}</span></div>
            <div class="summary-row"><span>Spedizione:</span> <span>${shipping > 0 ? `${formatCurrency(shipping)} (5% sotto ${formatCurrency(FREE_SHIPPING_THRESHOLD)})` : "Gratis"}</span></div>
            <div class="summary-row total"><span>Totale:</span> <span>${formatCurrency(total)}</span></div>
        </div>
    `;
    totalLabel.textContent = formatCurrency(total);
    checkoutPanel.style.display = "block";
    checkoutButton.style.display = "inline-block";
}
function updateQuantity(productId, newQty) {
    const cart = getCart();
    const product = getProductsForCart().find(
        (entry) => entry.id === Number(productId),
    );
    const availableStock = getAvailableStockValue(product);
    const normalizedQty = Math.max(0, Math.floor(Number(newQty || 0)));
    if (!product || availableStock <= 0 || normalizedQty <= 0) {
        delete cart[productId];
    } else {
        cart[productId] = Math.min(normalizedQty, availableStock);
        if (cart[productId] < normalizedQty) {
            showCheckoutMessage(
                "warning",
                `Per ${product.name} sono disponibili solo ${availableStock} pezzi.`,
            );
        }
    }
    saveCart(cart);
    renderCart();
}
function removeFromCart(productId) {
    const cart = getCart();
    delete cart[productId];
    saveCart(cart);
    renderCart();
}
function configureStaticCheckoutUi() {
    const checkoutButton = document.getElementById("checkout-btn");
    const stripeCardSection = document.getElementById("stripe-card-section");
    const cardElement = document.getElementById("card-element");
    const cardErrors = document.getElementById("card-errors");
    const paymentHint = stripeCardSection?.querySelector(".payment-hint");
    const paymentLabel = stripeCardSection?.querySelector(".form-label");
    if (checkoutButton) {
        checkoutButton.disabled = true;
        checkoutButton.textContent = "Stripe richiede backend";
    }
    if (paymentLabel) {
        paymentLabel.textContent = "Stripe non disponibile";
    }
    if (cardElement) {
        cardElement.style.display = "none";
        cardElement.innerHTML = "";
    }
    if (paymentHint) {
        paymentHint.textContent =
            "Per usare Stripe da GitHub Pages devi configurare un backend sicuro e controllare l'URL API centrale definito in `auth.js`.";
    }
    if (cardErrors) {
        cardErrors.textContent = "";
    }
    showCheckoutMessage(
        "warning",
        "Stripe reale e disattivato finche non colleghi un backend sicuro.",
    );
}
async function loadStripeScript() {
    if (typeof window.Stripe === "function") {
        return;
    }
    await new Promise((resolve, reject) => {
        const existing = document.querySelector(
            'script[data-stripe-js="true"]',
        );
        if (existing) {
            if (typeof window.Stripe === "function") {
                resolve();
                return;
            }
            existing.addEventListener("load", resolve, { once: true });
            existing.addEventListener("error", reject, { once: true });
            return;
        }
        const script = document.createElement("script");
        script.src = "https://js.stripe.com/v3/";
        script.async = true;
        script.dataset.stripeJs = "true";
        script.onload = resolve;
        script.onerror = () => reject(new Error("Stripe non disponibile."));
        document.head.appendChild(script);
    });
}
async function initializeStripeCheckout() {
    if (isStaticCheckoutMode()) {
        configureStaticCheckoutUi();
        return;
    }
    await loadStripeScript();
    const configResponse = await fetchWithTimeout(getApiUrl("/config"), {
        headers: getApiRequestHeaders(),
    });
    const config = await configResponse.json();
    if (
        !configResponse.ok ||
        !config.stripePublicKey ||
        config.stripePublicKey.includes("placeholder")
    ) {
        throw new Error(
            config.error || "Stripe non configurato correttamente.",
        );
    }
    stripeInstance = window.Stripe(config.stripePublicKey);
    const elements = stripeInstance.elements({
        appearance: {
            theme: "stripe",
            variables: { colorPrimary: "#007185", borderRadius: "10px" },
        },
    });
    stripeCardElement = elements.create("card", { hidePostalCode: true });
    stripeCardElement.mount("#card-element");
    stripeCardElement.on("change", (event) => {
        const errorBox = document.getElementById("card-errors");
        if (errorBox) {
            errorBox.textContent = event.error ? event.error.message : "";
        }
    });
}
async function handleCheckoutSubmit(event) {
    event.preventDefault();
    showCheckoutMessage("", "");
    const name = document.getElementById("checkout-name")?.value.trim() || "";
    const email = document.getElementById("checkout-email")?.value.trim() || "";
    const street =
        document.getElementById("checkout-address")?.value.trim() || "";
    const city = document.getElementById("checkout-city")?.value.trim() || "";
    const postalCode =
        document.getElementById("checkout-postal")?.value.trim() || "";
    const country = normalizeCountryCode(
        document.getElementById("checkout-country")?.value || "",
    );
    if (!name || !email || !street || !city || !postalCode || !country) {
        showCheckoutMessage("danger", "Compila tutti i campi del checkout.");
        return;
    }
    const { items, total } = getCartDetails();
    if (!items.length) {
        showCheckoutMessage("warning", "Il carrello e vuoto.");
        renderCart();
        return;
    }
    const shippingAddress = {
        line1: street,
        city: city,
        postalCode: postalCode,
        country: country,
    };
    setCheckoutLoading(true);
    try {
        if (isStaticCheckoutMode()) {
            throw new Error(
                "Stripe richiede un backend configurato. Controlla l'URL API centrale in `auth.js`.",
            );
        }
        if (!stripeInstance || !stripeCardElement) {
            throw new Error("Pagamento non disponibile al momento.");
        }
        const intentResponse = await fetchWithTimeout(
            getApiUrl("/create-payment-intent"),
            {
                method: "POST",
                headers: getApiRequestHeaders({
                    "Content-Type": "application/json",
                }),
                body: JSON.stringify({
                    amount: total,
                    items: items,
                    customerName: name,
                    customerEmail: email,
                }),
            },
        );
        const intentData = await intentResponse.json();
        if (!intentResponse.ok) {
            if (
                typeof syncProductsFromServer === "function" &&
                (intentResponse.status === 409 ||
                    /prezzi correnti/i.test(intentData.error || ""))
            ) {
                await syncProductsFromServer();
            }
            throw new Error(
                intentData.error || "Impossibile iniziare il pagamento.",
            );
        }
        if (!intentData.clientSecret) {
            throw new Error(
                intentData.error || "Client secret Stripe mancante.",
            );
        }
        const paymentResult = await stripeInstance.confirmCardPayment(
            intentData.clientSecret,
            {
                payment_method: {
                    card: stripeCardElement,
                    billing_details: {
                        name: name,
                        email: email,
                        address: {
                            line1: street,
                            city: city,
                            postal_code: postalCode,
                            country: country,
                        },
                    },
                },
            },
        );
        if (paymentResult.error) {
            throw new Error(
                paymentResult.error.message || "Pagamento non riuscito.",
            );
        }
        const checkoutResponse = await fetchWithTimeout(
            getApiUrl("/api/checkout"),
            {
                method: "POST",
                headers: getApiRequestHeaders({
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${typeof getSessionToken === "function" ? getSessionToken() : ""}`,
                }),
                body: JSON.stringify({
                    paymentIntentId: paymentResult.paymentIntent.id,
                    items: items,
                    total: total,
                    shippingAddress: shippingAddress,
                    customerName: name,
                    customerEmail: email,
                }),
            },
        );
        const data = await checkoutResponse.json();
        if (!checkoutResponse.ok) {
            if (
                typeof syncProductsFromServer === "function" &&
                (checkoutResponse.status === 409 ||
                    /prezzi correnti/i.test(data.error || ""))
            ) {
                await syncProductsFromServer();
            }
            throw new Error(data.error || "Ordine non completato.");
        }
        clearLocalCart();
        if (
            Array.isArray(data.updatedProducts) &&
            typeof saveData === "function"
        ) {
            saveData("products", data.updatedProducts);
        } else if (typeof syncProductsFromServer === "function") {
            await syncProductsFromServer();
        }
        renderCart();
        updateCartCount();
        if (typeof saveOrderForCurrentUser === "function") {
            await saveOrderForCurrentUser({
                id: data.order.id,
                total: total,
                status: data.order.status || "paid",
                date: new Date(
                    data.order.createdAt || Date.now(),
                ).toLocaleString("it-IT"),
                createdAt: data.order.createdAt || new Date().toISOString(),
                customer: name,
                email: email,
                items: items.map((item) => ({
                    id: item.id,
                    name: item.name,
                    quantity: item.quantity,
                    price: item.price,
                })),
                shippingAddress: shippingAddress,
            });
        }
        const emailText = data.emailSent
            ? "Ti abbiamo inviato anche l'email di conferma."
            : "Ordine registrato, ma l'email di conferma non e stata inviata.";
        showCheckoutMessage(
            "success",
            `Pagamento completato. Ordine #${data.order.id} confermato. ${emailText}`,
        );
    } catch (error) {
        console.error("Errore checkout:", error);
        const isNetworkFailure =
            error.message &&
            (error.message.includes("Timeout") ||
                error.message.includes("NetworkError") ||
                error.message.includes("Failed to fetch") ||
                error.message.includes("non e stato possibile") ||
                error.message.includes("net::ERR"));
        showCheckoutMessage(
            "danger",
            isNetworkFailure
                ? "Connessione al backend fallita. Controlla l'URL API centrale in `auth.js` e assicurati che il backend sia attivo."
                : error.message || "Errore durante il checkout.",
        );
    } finally {
        setCheckoutLoading(false);
    }
}
async function prefillCheckoutForm() {
    const nameInput = document.getElementById("checkout-name");
    const emailInput = document.getElementById("checkout-email");
    const addressInput = document.getElementById("checkout-address");
    const cityInput = document.getElementById("checkout-city");
    const postalInput = document.getElementById("checkout-postal");
    const countryInput = document.getElementById("checkout-country");
    if (bridgedCheckoutPrefill) {
        if (nameInput && !nameInput.value) {
            nameInput.value = bridgedCheckoutPrefill.name || "";
        }
        if (emailInput && !emailInput.value) {
            emailInput.value = bridgedCheckoutPrefill.email || "";
        }
        if (addressInput && !addressInput.value) {
            addressInput.value = bridgedCheckoutPrefill.line1 || "";
        }
        if (cityInput && !cityInput.value) {
            cityInput.value = bridgedCheckoutPrefill.city || "";
        }
        if (postalInput && !postalInput.value) {
            postalInput.value = bridgedCheckoutPrefill.postalCode || "";
        }
        if (countryInput && !countryInput.value) {
            countryInput.value = normalizeCountryCode(
                bridgedCheckoutPrefill.country || "IT",
            );
        }
        renderSavedPaymentMethod(bridgedCheckoutPrefill.paymentMethod);
    }
    if (typeof getCurrentUser !== "function") {
        return;
    }
    const user = await getCurrentUser();
    if (!user) {
        return;
    }
    if (nameInput && !nameInput.value) {
        nameInput.value = user.name || "";
    }
    if (emailInput && !emailInput.value) {
        emailInput.value = user.email || "";
    }
    const firstAddress =
        Array.isArray(user.addresses) && user.addresses.length
            ? user.addresses[0]
            : null;
    if (firstAddress) {
        if (addressInput && !addressInput.value) {
            addressInput.value =
                firstAddress.line1 || firstAddress.street || "";
        }
        if (cityInput && !cityInput.value) {
            cityInput.value = firstAddress.city || "";
        }
        if (postalInput && !postalInput.value) {
            postalInput.value = firstAddress.postalCode || "";
        }
        if (countryInput && !countryInput.value) {
            countryInput.value = normalizeCountryCode(
                firstAddress.country || "IT",
            );
        }
    }
    const firstPaymentMethod =
        Array.isArray(user.paymentMethods) && user.paymentMethods.length
            ? user.paymentMethods[0]
            : null;
    renderSavedPaymentMethod(
        firstPaymentMethod || bridgedCheckoutPrefill?.paymentMethod || null,
    );
}
document.addEventListener("DOMContentLoaded", async () => {
    consumeBridgeData();
    if (typeof initializeLocalDB === "function") {
        await initializeLocalDB();
    }

    // Assicuriamoci che i prodotti siano disponibili prima di renderizzare
    if (typeof syncProductsFromServer === "function") {
        try {
            await syncProductsFromServer();
        } catch (error) {
            console.warn("Errore sync prodotti:", error.message);
        }
    }

    updateCartCount();
    renderCart();
    const checkoutForm = document.getElementById("checkout-form");
    if (checkoutForm) {
        checkoutForm.addEventListener("submit", handleCheckoutSubmit);
    }
    await prefillCheckoutForm();
    try {
        await initializeStripeCheckout();
    } catch (error) {
        console.error("Errore inizializzazione Stripe:", error);
        const isNetworkFailure =
            error.message &&
            (error.message.includes("Timeout") ||
                error.message.includes("NetworkError") ||
                error.message.includes("Failed to fetch") ||
                error.message.includes("non e stato possibile") ||
                error.message.includes("net::ERR"));
        showCheckoutMessage(
            "danger",
            isNetworkFailure
                ? "Impossibile raggiungere il backend. Controlla l'URL API centrale in `auth.js` e il deploy del server."
                : "Stripe non disponibile. Riprova tra poco.",
        );
    }
    if (shouldFocusCheckout()) {
        window.setTimeout(focusCheckoutPanel, 150);
    }
});
window.removeFromCart = removeFromCart;
window.updateQuantity = updateQuantity;
window.addToCart = addToCart;
window.buyNow = buyNow;
window.proceedToCheckout = proceedToCheckout;
window.checkoutSingleItem = checkoutSingleItem;

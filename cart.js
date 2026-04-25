const FREE_SHIPPING_THRESHOLD = 30;
const SHIPPING_RATE_UNDER_THRESHOLD = 0.05;
const VAT_RATE = 0.22;
const BUY_NOW_CART_KEY = "shopnow-buy-now-cart";
const CART_BRIDGE_KEYS = [
  "ecommerce_users",
  "ecommerce-session-token",
  "cart",
  "cart-count",
];
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
  return new URLSearchParams(window.location.search).get("mode") === "buy-now";
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
  if (!productId) return;
  try {
    const token = localStorage.getItem("ecommerce-session-token");
    if (!token) {
      window.location.href = "index.html?msg=login_required";
      return;
    }

    // Puliamo eventuali vecchi dati di acquisto rapido
    window.sessionStorage.removeItem(BUY_NOW_CART_KEY);

    // Prepariamo il carrello temporaneo
    const buyNowCart = { [String(productId)]: 1 };
    window.sessionStorage.setItem(BUY_NOW_CART_KEY, JSON.stringify(buyNowCart));

    window.location.href = "checkout.html?mode=buy-now";
    return true;
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
  window.sessionStorage.setItem(
    "shopnow-active-checkout",
    JSON.stringify(items),
  );
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
      : window.SHOPNOW_API_BASE_URL || "http://localhost:3000";
  return `${baseUrl}${normalizedPath}`;
}
function getApiRequestHeaders(extraHeaders = {}) {
  return typeof getBackendRequestHeaders === "function"
    ? getBackendRequestHeaders(extraHeaders)
    : { ...extraHeaders };
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
  const product = getProductsForCart().find(
    (p) => String(p.id) === String(productId),
  );
  const stock = getAvailableStockValue(product);

  const currentQty = cart[productId] || 0;
  if (currentQty >= stock) {
    window.showToast("Prodotto esaurito o limite stock raggiunto.", "error");
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
function fetchWithTimeout(url, options = {}, timeout = 30000) {
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
    const product = products.find((entry) => entry.id === Number(productId));
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
    const product = products.find((entry) => entry.id === Number(productId));
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
  const vat = subtotal * VAT_RATE;
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
  return `<img src="${window.escapeHtml(item.image)}" alt="${window.escapeHtml(item.name)}" class="cart-item-image img-fluid rounded" style="max-width: 80px; height: auto;">`;
}
function renderCart() {
  const itemsContainer = document.getElementById("cart-items");
  const totalContainer = document.getElementById("cart-total");
  const checkoutSummary = document.getElementById("checkout-summary"); // Per pagina checkout
  const checkoutPanel = document.getElementById("checkout-panel");
  const checkoutButton = document.getElementById("checkout-btn");
  const totalLabel = document.getElementById("checkout-total-label");

  const { items, subtotal, vat, shipping, total } = getCartDetails();

  // Se siamo nella pagina di checkout, usiamo una logica di rendering diversa
  if (checkoutSummary && totalLabel) {
    renderCheckoutSummary(items, subtotal, shipping, vat, total);
    return;
  }

  if (!itemsContainer || !totalContainer) {
    return;
  }
  if (!items.length) {
    itemsContainer.innerHTML = isBuyNowMode()
      ? '<div class="alert alert-warning">Seleziona almeno un prodotto per procedere al checkout rapido.</div>'
      : "<p>Il carrello e vuoto.</p>";
    totalContainer.innerHTML = "";
    checkoutPanel.style.display = "none";
    checkoutButton.style.display = "none";
    return;
  }
  const itemsMarkup = items
    .map(
      (item) => `
        <div class="cart-item-card p-3 mb-3 border rounded bg-white shadow-sm">
            <div class="row align-items-center g-3">
                <div class="col-4 col-md-2 text-center">
                    ${getCartItemImageMarkup(item)}
                </div>
                <div class="col-8 col-md-4">
                    <h6 class="mb-1 fw-bold">${window.escapeHtml(item.name)}</h6>
                    <div class="text-primary fw-semibold">${window.formatCurrency(item.price)}</div>
                    <div class="small text-muted mt-1">Stock: ${item.stock}</div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="input-group input-group-sm" style="max-width: 120px;">
                        <button class="btn btn-outline-secondary" onclick="updateQuantity(${item.id}, ${item.quantity - 1})">-</button>
                        <span class="input-group-text bg-white px-3">${item.quantity}</span>
                        <button class="btn btn-outline-secondary" onclick="updateQuantity(${item.id}, ${item.quantity + 1})" ${item.quantity >= item.stock ? "disabled" : ""}>+</button>
                    </div>
                </div>
                <div class="col-6 col-md-3 text-end">
                    <div class="fw-bold mb-2">${window.formatCurrency(item.price * item.quantity)}</div>
                    <div class="d-flex flex-column flex-md-row gap-2 justify-content-end">
                        <button class="btn btn-sm btn-buy-now" onclick="checkoutSingleItem(${item.id})">
                            <i class="fas fa-bolt me-1"></i> Subito
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="removeFromCart(${item.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `,
    )
    .join("");
  const buyNowNotice = isBuyNowMode()
    ? `
            <div class="alert alert-info border-0 shadow-sm d-flex align-items-center gap-2 mb-4" style="background-color: #f0f8ff;">
                <i class="fas fa-bolt text-primary"></i>
                <span>Checkout rapido attivo: questo flusso "Acquista ora" usa solo il prodotto selezionato e porta direttamente al pagamento.</span>
            </div>
        `
    : "";
  itemsContainer.innerHTML = `
        ${buyNowNotice}
        <div class="cart-items-list">
            ${itemsMarkup}
        </div>
        ${
          !isBuyNowMode()
            ? `
            <div class="text-start mt-3">
                <button class="btn btn-sm btn-outline-secondary" onclick="clearFullCart()">
                    <i class="fas fa-trash-alt me-1"></i> Svuota carrello
                </button>
            </div>`
            : ""
        }
    `;
  totalContainer.innerHTML = `
        <div class="summary-card">
            <h5 class="fw-bold mb-3">Riepilogo ordine</h5>
            <div class="summary-row"><span>Subtotale:</span> <span>${window.formatCurrency(subtotal)}</span></div>
            <div class="summary-row"><span>Spedizione:</span> <span>${shipping > 0 ? `${window.formatCurrency(shipping)} (5% sotto ${window.formatCurrency(FREE_SHIPPING_THRESHOLD)})` : "Gratis"}</span></div>
            <div class="summary-row"><span>IVA (22%):</span> <span>${window.formatCurrency(vat)}</span></div>
            <hr>
            <div class="summary-row total mt-0 border-0"><span>Totale:</span> <span class="text-danger">${window.formatCurrency(total)}</span></div>
        </div>
    `;
  totalLabel.textContent = window.formatCurrency(total);
  checkoutPanel.style.display = "block";
  checkoutButton.style.display = "inline-block";
}

function renderCheckoutSummary(items, subtotal, shipping, vat, total) {
  const summaryContainer = document.getElementById("checkout-summary");
  const totalLabel = document.getElementById("checkout-total-label");

  summaryContainer.innerHTML = items
    .map(
      (item) => `
        <div class="d-flex justify-content-between align-items-center mb-2 small">
            <span>${window.escapeHtml(item.name)} (x${item.quantity})</span>
            <span>${window.formatCurrency(item.price * item.quantity)}</span>
        </div>
    `,
    )
    .join("");

  const detailsHtml = `
        <div class="summary-row mt-3"><span>Articoli:</span> <span>${window.formatCurrency(subtotal)}</span></div>
        <div class="summary-row"><span>Spedizione:</span> <span>${shipping > 0 ? window.formatCurrency(shipping) : "Gratis"}</span></div>
        <div class="summary-row"><span>IVA (22%):</span> <span>${window.formatCurrency(vat)}</span></div>
    `;
  summaryContainer.innerHTML += detailsHtml;
  totalLabel.textContent = window.formatCurrency(total);
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
function clearFullCart() {
  if (confirm("Sei sicuro di voler svuotare tutto il carrello?")) {
    clearLocalCart();
    renderCart();
    updateCartCount();
  }
}
function removeFromCart(productId) {
  const cart = getCart();
  delete cart[productId];
  saveCart(cart);
  renderCart();
}
document.addEventListener("DOMContentLoaded", async () => {
  consumeBridgeData(); // Deve essere chiamato prima di prefillCheckoutForm
  updateCartCount();
  renderCart();

  window.removeFromCart = removeFromCart;
  window.updateQuantity = updateQuantity;
  window.addToCart = addToCart;
  window.buyNow = buyNow;
  window.proceedToCheckout = proceedToCheckout;
  window.checkoutSingleItem = checkoutSingleItem;
  window.clearFullCart = clearFullCart;
  window.consumeBridgeData = consumeBridgeData;
  window.getCartStorageArea = getCartStorageArea;
  window.getCartDetails = getCartDetails;
  window.getApiUrl = getApiUrl;
  window.getApiRequestHeaders = getApiRequestHeaders;
  window.isStaticCheckoutMode = isStaticCheckoutMode;
  window.showCheckoutMessage = showCheckoutMessage;
  window.fetchWithTimeout = fetchWithTimeout;
  window.clearLocalCart = clearLocalCart;
  window.saveOrderForCurrentUser = saveOrderForCurrentUser;
});

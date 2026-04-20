const CART_STORAGE_KEY = "cart";
const CART_COUNT_STORAGE_KEY = "cart-count";

function getCartStorage() {
    try {
        return window.localStorage;
    } catch (error) {
        console.error("Storage del carrello non disponibile:", error);
        return null;
    }
}

function normalizeCart(rawCart) {
    if (!rawCart || typeof rawCart !== "object" || Array.isArray(rawCart)) {
        return {};
    }

    return Object.entries(rawCart).reduce((normalizedCart, [productId, qty]) => {
        const normalizedQty = Math.max(0, Math.floor(Number(qty || 0)));
        if (normalizedQty > 0) {
            normalizedCart[String(productId)] = normalizedQty;
        }
        return normalizedCart;
    }, {});
}

function parseCart(rawValue) {
    if (!rawValue) {
        return {};
    }

    const parsedCart = JSON.parse(rawValue);
    if (
        parsedCart &&
        typeof parsedCart === "object" &&
        !Array.isArray(parsedCart) &&
        Array.isArray(parsedCart.items)
    ) {
        return normalizeCart(
            parsedCart.items.reduce((itemsCart, item) => {
                if (item && item.id != null) {
                    itemsCart[item.id] = item.quantity;
                }
                return itemsCart;
            }, {}),
        );
    }

    return normalizeCart(parsedCart);
}

function getCart() {
    const storage = getCartStorage();
    if (!storage) {
        return {};
    }

    try {
        return parseCart(storage.getItem(CART_STORAGE_KEY));
    } catch (error) {
        console.error("Errore nel caricamento del carrello:", error);
        return {};
    }
}

function persistCart(cart) {
    const storage = getCartStorage();
    if (!storage) {
        return false;
    }

    try {
        const normalizedCart = normalizeCart(cart);
        storage.setItem(CART_STORAGE_KEY, JSON.stringify(normalizedCart));
        return true;
    } catch (error) {
        console.error("Errore nel salvataggio del carrello:", error);
        return false;
    }
}

function dispatchCartUpdated(detail = {}) {
    if (typeof window.CustomEvent !== "function") {
        return;
    }

    window.dispatchEvent(
        new window.CustomEvent("shopnow:cart-updated", {
            detail: {
                cart: getCart(),
                ...detail,
            },
        }),
    );
}

function updateCartCount() {
    const storage = getCartStorage();
    const cart = getCart();
    const count = Object.values(cart).reduce(
        (sum, qty) => sum + Number(qty || 0),
        0,
    );

    if (storage) {
        try {
            storage.setItem(CART_COUNT_STORAGE_KEY, String(count));
        } catch (error) {
            console.error("Errore nell'aggiornamento del contatore:", error);
        }
    }

    const counter = document.getElementById("cart-count");
    if (counter) {
        counter.textContent = String(count);
    }

    return count;
}

function resolveAvailableStock(productId) {
    if (typeof window.getProductById === "function") {
        const product = window.getProductById(productId);
        if (product) {
            const stock = Number(product.stock);
            return Number.isFinite(stock) ? Math.max(0, Math.floor(stock)) : null;
        }
        return null;
    }

    if (typeof window.getAllProducts === "function") {
        const product = window
            .getAllProducts()
            .find((entry) => Number(entry?.id) === Number(productId));
        if (product) {
            const stock = Number(product.stock);
            return Number.isFinite(stock) ? Math.max(0, Math.floor(stock)) : null;
        }
    }

    return null;
}

function setCart(cart, detail = {}) {
    if (!persistCart(cart)) {
        return false;
    }

    updateCartCount();
    dispatchCartUpdated(detail);
    return true;
}

function addProductQuantityToCart(productId, quantity = 1) {
    const normalizedProductId = String(productId ?? "").trim();
    const normalizedQuantity = Math.max(0, Math.floor(Number(quantity || 0)));

    if (!normalizedProductId || normalizedQuantity <= 0) {
        return 0;
    }

    const cart = getCart();
    const currentQuantity = Math.max(
        0,
        Math.floor(Number(cart[normalizedProductId] || 0)),
    );
    const availableStock = resolveAvailableStock(productId);
    const maxAddableQuantity =
        availableStock == null
            ? normalizedQuantity
            : Math.max(availableStock - currentQuantity, 0);
    const addedQuantity = Math.min(normalizedQuantity, maxAddableQuantity);

    if (addedQuantity <= 0) {
        return 0;
    }

    cart[normalizedProductId] = currentQuantity + addedQuantity;
    if (
        !setCart(cart, {
            productId: normalizedProductId,
            addedQuantity: addedQuantity,
            totalQuantity: cart[normalizedProductId],
        })
    ) {
        return 0;
    }

    return addedQuantity;
}

function addToCart(productId) {
    return addProductQuantityToCart(productId, 1) > 0;
}

function initializeCartBadge() {
    updateCartCount();
}

window.getCart = getCart;
window.setCart = setCart;
window.updateCartCount = updateCartCount;
window.addToCart = addToCart;
window.addProductQuantityToCart = addProductQuantityToCart;

window.addEventListener("storage", (event) => {
    if (
        !event ||
        event.key === null ||
        event.key === CART_STORAGE_KEY ||
        event.key === CART_COUNT_STORAGE_KEY
    ) {
        updateCartCount();
    }
});

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeCartBadge);
} else {
    initializeCartBadge();
}

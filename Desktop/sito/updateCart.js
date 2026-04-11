function getCart() {
    try {
        const data = localStorage.getItem("cart");
        const cart = data ? JSON.parse(data) : {};
        console.log("getCart:", cart);
        return cart;
    } catch (e) {
        console.error("Errore lettura carrello:", e);
        return {};
    }
}
function saveCart(cart) {
    try {
        localStorage.setItem("cart", JSON.stringify(cart));
        const count = Object.values(cart).reduce(
            (sum, qty) => sum + Number(qty || 0),
            0,
        );
        localStorage.setItem("cart-count", String(count));
        console.log("saveCart:", cart);
    } catch (e) {
        console.error("Errore salvataggio carrello:", e);
    }
}
function updateCartCount() {
    const cart = getCart();
    const count = Object.values(cart).reduce(
        (sum, qty) => sum + Number(qty || 0),
        0,
    );
    localStorage.setItem("cart-count", String(count));
    console.log("updateCartCount:", count);
    const el = document.getElementById("cart-count");
    if (el) {
        el.textContent = count;
    } else {
        console.warn("Elemento #cart-count non trovato");
    }
}
function addProductQuantityToCart(productId, quantity = 1) {
    console.log("addProductQuantityToCart chiamato con:", productId, quantity);
    if (!productId) {
        console.error("productId undefined");
        return false;
    }
    const product =
        typeof getProductById === "function" ? getProductById(productId) : null;
    const availableStock = Number.isFinite(Number(product?.stock))
        ? Math.max(0, Math.floor(Number(product.stock)))
        : Number.POSITIVE_INFINITY;
    const requestedQuantity = Math.max(1, Math.floor(Number(quantity || 1)));
    if (product && availableStock <= 0) {
        showToast("Prodotto esaurito.", "error");
        return false;
    }
    const cart = getCart();
    const currentQuantity = Math.max(
        0,
        Math.floor(Number(cart[productId] || 0)),
    );
    const nextQuantity = currentQuantity + requestedQuantity;
    if (Number.isFinite(availableStock) && currentQuantity >= availableStock) {
        showToast(
            `Disponibili solo ${availableStock} pezzi per ${product?.name || "questo prodotto"}.`,
            "error",
        );
        return false;
    }
    if (Number.isFinite(availableStock) && nextQuantity > availableStock) {
        const remainingStock = Math.max(0, availableStock - currentQuantity);
        showToast(
            `Puoi aggiungere ancora solo ${remainingStock} pezzi per ${product?.name || "questo prodotto"}.`,
            "error",
        );
        return false;
    }
    cart[productId] = nextQuantity;
    saveCart(cart);
    updateCartCount();
    showToast(
        requestedQuantity > 1
            ? `${requestedQuantity} prodotti aggiunti al carrello con successo!`
            : "Prodotto aggiunto al carrello con successo!",
        "success",
    );
    return true;
}
function addToCart(productId) {
    console.log("addToCart chiamato con:", productId);
    return addProductQuantityToCart(productId, 1);
}
function showToast(message, type = "info") {
    console.log("showToast:", message);
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
        position: fixed; top: 20px; right: 20px; background: ${type === "success" ? "#28a745" : "#dc3545"};
        color: white; padding: 1rem 1.5rem; border-radius: 5px; box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 9999; font-weight: 500; animation: slideIn 0.3s ease-out;
    `;
    toast.innerHTML = `<i class="fas fa-${type === "success" ? "check-circle" : "exclamation-circle"} me-2"></i>${message}`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 3e3);
}
document.addEventListener("DOMContentLoaded", function () {
    console.log("updateCart.js DOMContentLoaded");
    updateCartCount();
});
window.addToCart = addToCart;
window.addProductQuantityToCart = addProductQuantityToCart;
window.updateCartCount = updateCartCount;

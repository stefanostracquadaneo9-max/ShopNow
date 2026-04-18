// Funzione per aggiornare il contatore del carrello nella navbar
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

// Funzione per ottenere il carrello dal localStorage
function getCart() {
    try {
        const cart = localStorage.getItem("cart");
        return cart ? JSON.parse(cart) : {};
    } catch (e) {
        console.error("Errore nel caricamento del carrello:", e);
        return {};
    }
}

// Inizializza il contatore del carrello al caricamento della pagina
document.addEventListener("DOMContentLoaded", function() {
    updateCartCount();
});
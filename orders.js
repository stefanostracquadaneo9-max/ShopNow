document.addEventListener("DOMContentLoaded", async function () {
    if (typeof updateCartCount === "function") updateCartCount();
    await loadOrders();
});
async function loadOrders() {
    const ordersContainer = document.getElementById("orders-container");
    if (!ordersContainer) return;
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        ordersContainer.innerHTML =
            '<p class="text-muted">Devi accedere per vedere la cronologia ordini.</p>';
        return;
    }
    const orders = await getCurrentUserOrders();
    if (!orders.length) {
        ordersContainer.innerHTML =
            '<p class="text-muted">Ancora nessun ordine completato. Torna presto per controllare lo stato dei tuoi acquisti.</p>';
        return;
    }
    const products =
        typeof getAllProducts === "function" && getAllProducts().length
            ? getAllProducts()
            : getDefaultProducts();
    ordersContainer.innerHTML = orders
        .map((order) => renderOrderCard(order, products))
        .join("");
}
function renderOrderCard(order, products) {
    const items = normalizeOrderItems(order.items);
    const itemsMarkup = items.length
        ? items
              .map(
                  (item) =>
                      `<li>${getProductName(item, products)} x${item.quantity}</li>`,
              )
              .join("")
        : "<li>Nessun articolo disponibile</li>";
    const shippingText = formatShippingAddress(order.shippingAddress);
    const status = String(order.status || "paid").toLowerCase();
    const badgeClass = [
        "paid",
        "completato",
        "completed",
        "succeeded",
    ].includes(status)
        ? "bg-success"
        : "bg-warning text-dark";
    return `
        <div class="order-card">
            <div class="order-header d-flex flex-column flex-md-row justify-content-between gap-2">
                <div>
                    <h5 class="mb-1">Ordine #${escapeHtml(order.id ?? "")}</h5>
                    <p class="mb-1"><strong>Data:</strong> ${escapeHtml(formatOrderDate(order.date || order.createdAt))}</p>
                    <p class="mb-1"><strong>Cliente:</strong> ${escapeHtml(order.customer || order.userName || "")}</p>
                    <p class="mb-0"><strong>Email:</strong> ${escapeHtml(order.email || order.userEmail || "")}</p>
                </div>
                <div class="text-md-end">
                    <p class="mb-1"><strong>Totale:</strong></p>
                    <p class="product-price mb-2">${formatCurrency(order.total)}</p>
                    <span class="badge ${badgeClass}">${escapeHtml(order.status || "paid")}</span>
                </div>
            </div>
            ${shippingText ? `<p class="mb-2"><strong>Spedizione:</strong> ${escapeHtml(shippingText)}</p>` : ""}
            <div>
                <strong>Articoli:</strong>
                <ul class="mb-0 mt-2">${itemsMarkup}</ul>
            </div>
        </div>
    `;
}
function normalizeOrderItems(items) {
    if (Array.isArray(items))
        return items
            .map((item) => ({
                id: Number(item.id || 0),
                name: item.name || "",
                quantity: Number(item.quantity || 0),
            }))
            .filter((item) => item.quantity > 0);
    if (items && typeof items === "object")
        return Object.keys(items)
            .map((productId) => ({
                id: Number(productId),
                name: "",
                quantity: Number(items[productId] || 0),
            }))
            .filter((item) => item.quantity > 0);
    return [];
}
function getProductName(item, products) {
    const product = products.find((entry) => entry.id == item.id);
    return item.name || product?.name || `Prodotto #${item.id}`;
}
function formatOrderDate(value) {
    if (!value) return "Data non disponibile";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("it-IT");
}
function formatShippingAddress(shippingAddress) {
    if (!shippingAddress) return "";
    let address = shippingAddress;
    if (typeof shippingAddress === "string") {
        try {
            address = JSON.parse(shippingAddress);
        } catch (error) {
            return shippingAddress;
        }
    }
    if (!address || typeof address !== "object") return "";
    return [
        address.line1 || address.street,
        address.postalCode,
        address.city,
        address.country,
    ]
        .filter(Boolean)
        .join(", ");
}
function formatCurrency(value) {
    return new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
    }).format(Number(value || 0));
}
function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
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

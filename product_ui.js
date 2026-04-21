let currentProduct = null;
let allProducts = [];
let productZoomModal = null;
let currentViewer = null;
let productReviews = [];
const PRODUCT_FREE_SHIPPING_THRESHOLD = 30;
const PRODUCT_SHIPPING_RATE_UNDER_THRESHOLD = 0.05;

document.addEventListener("DOMContentLoaded", async function () {
    await initializeLocalDB();
    updateCartCount();
    await loadProductDetail();
});

function getProductIdFromQuery() {
    return new URLSearchParams(window.location.search).get("id");
}

function getProductZoomModalInstance() {
    if (!productZoomModal) {
        productZoomModal = new bootstrap.Modal(document.getElementById("productZoomModal"));
    }
    return productZoomModal;
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
}

function formatCurrency(value) {
    return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

function truncateReviewText(value, maxLength = 160) {
    const normalized = String(value || "").trim();
    return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function openProductZoom() {
    if (!currentProduct?.image) return;
    document.getElementById("product-zoom-title").textContent = currentProduct.name || "Anteprima prodotto";
    const image = document.getElementById("product-zoom-image");
    image.src = currentProduct.image;
    image.alt = currentProduct.name || "Anteprima prodotto";
    getProductZoomModalInstance().show();
}

function getSelectedQuantity() {
    const quantityElement = document.getElementById("product-quantity");
    return Math.max(1, Math.floor(Number(quantityElement?.value || 1)));
}

function addCurrentProductToCart(redirectToCart) {
    if (!currentProduct) return;
    const quantity = getSelectedQuantity();
    if (redirectToCart) {
        window.sessionStorage.setItem("shopnow-buy-now-cart", JSON.stringify({ [currentProduct.id]: quantity }));
        window.location.href = "cart.html?mode=buy-now&checkout=1";
        // Usa la funzione globale buyNow definita in cart.js per coerenza
        if (typeof window.buyNow === "function") {
            window.buyNow(currentProduct.id);
        }
        return;
    }
    if (typeof window.addToCart === "function") {
        let added = 0;
        for (let i = 0; i < quantity; i++) {
            if (window.addToCart(currentProduct.id) === false) break;
            added++;
        }
        if (added > 0) updateCartCount();
    }
}

function renderStars(rating) {
    const normalized = Math.max(0, Math.min(5, Number(rating || 0)));
    const full = Math.floor(normalized);
    const decimal = normalized - full;
    const half = decimal >= 0.25 && decimal < 0.75;
    const extra = decimal >= 0.75 ? 1 : 0;
    const empty = Math.max(0, 5 - full - extra - (half ? 1 : 0));
    return ['<i class="fas fa-star"></i>'.repeat(full + extra), half ? '<i class="fas fa-star-half-alt"></i>' : "", '<i class="far fa-star"></i>'.repeat(empty)].join("");
}

function getStockLabel(stock) {
    if (stock <= 0) return "Temporaneamente non disponibile";
    if (stock <= 10) return `Ultimi ${stock} rimasti`;
    return "Disponibile";
}

function getShippingDescription(price) {
    if (Number(price || 0) >= PRODUCT_FREE_SHIPPING_THRESHOLD) return `Spedizione gratuita oltre EUR ${PRODUCT_FREE_SHIPPING_THRESHOLD.toFixed(2)}`;
    return `Spedizione ${Math.round(PRODUCT_SHIPPING_RATE_UNDER_THRESHOLD * 100)}% del totale per ordini inferiori a EUR ${PRODUCT_FREE_SHIPPING_THRESHOLD.toFixed(2)}`;
}

function syncCurrentProductCache(updatedProduct) {
    if (!updatedProduct) return;
    const cached = getAllProducts();
    const idx = cached.findIndex(p => String(p.id) === String(updatedProduct.id));
    if (idx !== -1) cached[idx] = { ...cached[idx], ...updatedProduct };
    else cached.push(updatedProduct);
    saveData("products", cached);
    currentProduct = { ...updatedProduct };
}

function getLocalProductReviews(productId) {
    const p = getAllProducts().find(item => String(item.id) === String(productId));
    return Array.isArray(p?.reviews) ? p.reviews : [];
}

async function loadProductReviews(productId) {
    if (!prefersServerAuth()) {
        productReviews = getLocalProductReviews(productId);
        return productReviews;
    }
    try {
        const res = await fetch(`${getServerBaseUrl()}/api/products/${productId}/reviews`);
        const data = await res.json();
        if (res.ok) {
            productReviews = data.reviews || [];
            if (data.product) syncCurrentProductCache(data.product);
        }
    } catch (e) { console.error("Error loading reviews:", e); }
    return productReviews;
}

function setProductReviewRating(rating) {
    const normalized = Math.max(1, Math.min(5, Number(rating)));
    const input = document.getElementById("review-rating-value");
    if (input) input.value = String(normalized);
    document.querySelectorAll(".review-star-button").forEach((btn, i) => btn.classList.toggle("filled", i < normalized));
    const cap = document.getElementById("review-rating-caption");
    if (cap) cap.textContent = `${normalized} ${normalized === 1 ? "stella selezionata" : "stelle selezionate"}`;
}

async function submitProductReview(event) {
    event.preventDefault();
    if (!currentViewer) { alert("Accedi per lasciare una recensione."); return; }
    const rating = Number(document.getElementById("review-rating-value")?.value || 0);
    const comment = document.getElementById("review-comment")?.value.trim() || "";
    if (rating < 1 || rating > 5 || comment.length < 5) { alert("Compila correttamente tutti i campi."); return; }
    const btn = document.getElementById("submit-review-button");
    if (btn) btn.disabled = true;
    try {
        if (!prefersServerAuth()) {
            // Local logic
            saveProductReviewLocally({ rating, comment });
        } else {
            const res = await fetch(`${getServerBaseUrl()}/api/products/${currentProduct.id}/reviews`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${getSessionToken()}` },
                body: JSON.stringify({ rating, comment })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Errore salvataggio");
            productReviews = data.reviews || [];
            if (data.product) syncCurrentProductCache(data.product);
        }
        renderProductDetail(currentProduct);
        alert("Recensione salvata!");
    } catch (e) { alert(e.message); }
    finally { if (btn) btn.disabled = false; }
}

function saveProductReviewLocally({ rating, comment }) {
    const products = getAllProducts();
    const idx = products.findIndex(p => String(p.id) === String(currentProduct.id));
    if (idx === -1) return;
    const reviews = products[idx].reviews || [];
    const existingIdx = reviews.findIndex(r => String(r.userId) === String(currentViewer.id));
    const now = new Date().toISOString();
    const rev = { userId: currentViewer.id, authorName: currentViewer.name || "Cliente", rating, comment, updatedAt: now, createdAt: existingIdx >= 0 ? reviews[existingIdx].createdAt : now };
    if (existingIdx >= 0) reviews[existingIdx] = rev; else reviews.push(rev);
    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    products[idx].reviews = reviews;
    products[idx].rating = Number(avg.toFixed(1));
    products[idx].reviewCount = reviews.length;
    saveData("products", products);
    productReviews = reviews;
    currentProduct = products[idx];
}

async function loadProductDetail() {
    const id = getProductIdFromQuery();
    const container = document.getElementById("product-detail-container");
    try {
        currentViewer = await getCurrentUser();
        allProducts = getAllProducts();
        currentProduct = allProducts.find(p => String(p.id) === String(id));
        if (!currentProduct) {
            container.innerHTML = '<div class="empty-state"><h4>Prodotto non trovato</h4><a href="products.html" class="btn btn-amazon">Torna ai prodotti</a></div>';
            return;
        }
        await loadProductReviews(currentProduct.id);
        renderProductDetail(currentProduct);
    } catch (e) { container.innerHTML = "Errore caricamento."; }
}

function renderProductDetail(product) {
    const container = document.getElementById("product-detail-container");
    const stock = Math.max(0, Math.floor(product.stock || 0));
    const quantityOptions = Array.from({ length: Math.max(1, Math.min(stock, 10)) }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("");
    const reviewsLabel = product.reviewCount === 1 ? "1 recensione" : `${product.reviewCount || 0} recensioni`;

    document.title = `ShopNow - ${product.name}`;
    document.getElementById("product-breadcrumb-name").textContent = product.name;
    document.getElementById("product-category-link").textContent = product.category || "Prodotti";
    document.getElementById("product-category-link").href = `products.html?category=${encodeURIComponent(product.category || "all")}`;

    container.className = "";
    container.innerHTML = `
    <div class="product-detail-shell amazon-product-shell">
        <div class="row g-4 align-items-start">
            <div class="col-xl-5 col-lg-5">
                <div class="product-gallery-panel amazon-product-gallery">
                    <div class="product-gallery-main" onclick="openProductZoom()">
                        <img src="${escapeHtml(product.image || "")}" alt="${escapeHtml(product.name)}" class="product-detail-image">
                    </div>
                </div>
            </div>
            <div class="col-xl-4 col-lg-4">
                <div class="product-main-panel amazon-product-main">
                    <span class="product-category-pill">${escapeHtml(product.category || "Prodotto")}</span>
                    <h1 class="product-detail-title">${escapeHtml(product.name)}</h1>
                    <div class="product-detail-rating-row">
                        <div class="product-detail-rating">${renderStars(product.rating || 0)}</div>
                        <span class="ms-2">${Number(product.rating || 0).toFixed(1)} · ${reviewsLabel}</span>
                    </div>
                    <div class="product-detail-price">${formatCurrency(product.price)}</div>
                    <p class="product-detail-description">${escapeHtml(product.description || "")}</p>
                </div>
            </div>
            <div class="col-xl-3 col-lg-3">
                <div class="product-buy-box amazon-buy-box">
                    <div class="product-buy-price">${formatCurrency(product.price)}</div>
                    <div class="product-buy-stock ${stock <= 0 ? "out-of-stock" : ""}">${getStockLabel(stock)}</div>
                    <div class="mb-3">
                        <label class="form-label">Quantità</label>
                        <select id="product-quantity" class="form-select" ${stock <= 0 ? "disabled" : ""}>${quantityOptions}</select>
                    </div>
                    <button class="btn-amazon w-100" onclick="addCurrentProductToCart(false)" ${stock <= 0 ? "disabled" : ""}>Aggiungi al carrello</button>
                    <button class="product-buy-now-btn w-100 mt-2" onclick="addCurrentProductToCart(true)" ${stock <= 0 ? "disabled" : ""}>Acquista ora</button>
                </div>
            </div>
        </div>
    </div>
    <div id="reviews-section" class="product-section-card mt-4">
        <h3>Recensioni clienti</h3>
        <div class="row mt-3">
            <div class="col-lg-5">${renderReviewForm()}</div>
            <div class="col-lg-7">${renderReviewsList()}</div>
        </div>
    </div>`;
}

function renderReviewForm() {
    if (!currentViewer) return '<div class="alert alert-info">Accedi per lasciare una recensione.</div>';
    const existing = productReviews.find(r => String(r.userId) === String(currentViewer.id));
    return `
    <form onsubmit="submitProductReview(event)">
        <div class="mb-3">
            <input type="hidden" id="review-rating-value" value="${existing?.rating || 5}">
            <div class="review-stars-input-row">
                ${[1,2,3,4,5].map(v => `<button type="button" class="review-star-button ${v <= (existing?.rating || 5) ? 'filled' : ''}" onclick="setProductReviewRating(${v})"><i class="fas fa-star"></i></button>`).join("")}
            </div>
            <span id="review-rating-caption" class="small text-muted">5 stelle selezionate</span>
        </div>
        <div class="mb-3">
            <textarea id="review-comment" class="form-control" rows="3" required minlength="5">${escapeHtml(existing?.comment || "")}</textarea>
        </div>
        <button type="submit" id="submit-review-button" class="btn btn-amazon">${existing ? "Aggiorna" : "Invia"}</button>
    </form>`;
}

function renderReviewsList() {
    if (!productReviews.length) return "<p>Nessuna recensione.</p>";
    return productReviews.map(r => `
    <div class="product-review-card mb-3 p-2 border-bottom">
        <strong>${escapeHtml(r.authorName)}</strong>
        <div>${renderStars(r.rating)}</div>
        <p>${escapeHtml(r.comment)}</p>
    </div>`).join("");
}

window.setProductReviewRating = setProductReviewRating;
window.submitProductReview = submitProductReview;
window.addCurrentProductToCart = addCurrentProductToCart;
window.openProductZoom = openProductZoom;
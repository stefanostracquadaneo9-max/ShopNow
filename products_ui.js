let allProducts = [];
let filteredProducts = [];
let currentPage = 1;
const productsPerPage = 12;
let currentCategory = "all";
let currentSearch = "";
let currentSort = "name";
let productImagePreviewModal = null;

// Load products on page load
document.addEventListener("DOMContentLoaded", async function () {
    loadProducts();
});

async function loadProducts() {
    try {
        allProducts = getAllProducts();
        console.log("Loaded products:", allProducts);
        if (!allProducts || !allProducts.length) {
            console.log("No products in DB, using defaults");
            allProducts = getDefaultProducts();
        }
        filteredProducts = [...allProducts];
        applyInitialFiltersFromQuery();
        displayProducts(); // Forza la visualizzazione
    } catch (error) {
        console.error("Error loading products:", error);
        showEmptyState("Errore nel caricamento dei prodotti");
    }
}

function applyInitialFiltersFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const initialSearch = String(params.get("search") || "")
        .trim()
        .toLowerCase();
    const initialCategory = String(params.get("category") || "all")
        .trim()
        .toLowerCase();

    currentSearch = initialSearch;
    currentCategory = initialCategory || "all";
    filteredProducts = [...allProducts];

    const searchInput = document.getElementById("search-input");
    if (searchInput && initialSearch) {
        searchInput.value = initialSearch;
    }

    if (currentCategory !== "all") {
        filteredProducts = filteredProducts.filter(
            (product) =>
                String(product.category || "").toLowerCase() ===
                currentCategory,
        );
        document.getElementById("current-category").textContent =
            currentCategory.charAt(0).toUpperCase() +
            currentCategory.slice(1);
    } else {
        document.getElementById("current-category").textContent =
            "Tutti i prodotti";
    }

    if (currentSearch) {
        filteredProducts = filteredProducts.filter(
            (product) =>
                product.name
                    .toLowerCase()
                    .includes(currentSearch) ||
                (product.description &&
                    product.description
                        .toLowerCase()
                        .includes(currentSearch)),
        );
    }

    sortProducts();
}

function getProductImagePreviewModal() {
    if (!productImagePreviewModal) {
        productImagePreviewModal = new bootstrap.Modal(
            document.getElementById("productImagePreviewModal"),
        );
    }
    return productImagePreviewModal;
}

function openProductImage(productId) {
    const product = allProducts.find(
        (item) => String(item.id) === String(productId),
    );
    if (!product || !product.image) {
        alert("Immagine non disponibile per questo prodotto.");
        return;
    }
    document.getElementById("product-image-preview-title").textContent = product.name || "Anteprima prodotto";
    const previewImage = document.getElementById("product-image-preview-element");
    previewImage.src = product.image;
    previewImage.alt = product.name || "Anteprima prodotto";
    getProductImagePreviewModal().show();
}

function openProductPage(productId) {
    window.location.href = `product.html?id=${encodeURIComponent(productId)}`;
}

function getAvailabilityLabel(stock) {
    if (stock <= 0) return "Momentaneamente esaurito";
    if (stock <= 10) return `Ultimi ${stock} rimasti`;
    return "Disponibile";
}

function displayProducts() {
    const container = document.getElementById("products-container");
    const startIndex = (currentPage - 1) * productsPerPage;
    const endIndex = startIndex + productsPerPage;
    const productsToShow = filteredProducts.slice(startIndex, endIndex);

    if (productsToShow.length === 0) {
        showEmptyState("Non ci sono prodotti che corrispondono ai filtri selezionati. Prova a rimuovere o modificare i criteri.");
        return;
    }

    container.innerHTML = `<div class="products-grid">${productsToShow.map((product) => createProductCard(product)).join("")}</div>`;
    updateResultsCount();
    updatePagination();
}

function createProductCard(product) {
    const rating = Number(product.rating || 0);
    const reviews = Number(product.reviewCount || 0);
    const stock = Math.max(0, Math.floor(Number(product.stock || 0)));
    const isOutOfStock = stock <= 0;
    const productUrl = `product.html?id=${encodeURIComponent(product.id)}`;
    const ratingText = reviews > 0 ? `${rating.toFixed(1)} su 5 · ${reviews === 1 ? "1 recensione" : `${reviews} recensioni`}` : "Sii il primo a recensire questo prodotto";

    return `
    <div class="product-card">
        <a href="${productUrl}" class="product-media-link">
            <img src="${product.image || "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjgwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjgwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YzZjNmMyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjE4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjNjY2IiBkeT0iLjNlbSI+SW1tYWdpbmUgbm9uIGRpc3BvbmliaWxlPC90ZXh0Pjwvc3ZnPg=="}"
                 alt="${product.name}" class="product-image" onerror="this.onerror=null;this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjgwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjgwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YzZjNmMyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjE4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjNjY2IiBkeT0iLjNlbSI+SW1tYWdpbmUgbm9uIGRpc3BvbmliaWxlPC90ZXh0Pjwvc3ZnPg=='">
        </a>
        <div class="product-info">
            <a href="${productUrl}" class="product-title product-title-link">${product.name}</a>
            <div class="product-rating">
                <span class="product-stars">${renderRatingStars(rating)}</span>
                <span class="product-rating-text">${ratingText}</span>
            </div>
            <div class="product-price">EUR ${Number(product.price || 0).toFixed(2)}</div>
            <div class="product-availability ${isOutOfStock ? "out-of-stock" : stock <= 10 ? "low-stock" : ""}">
                ${getAvailabilityLabel(stock)}
            </div>
            <button type="button" class="product-open-btn w-100" onclick="openProductPage(${product.id})">
                <i class="fas fa-arrow-right me-2"></i>Dettagli prodotto
            </button>
            <button type="button" class="add-to-cart-btn mt-2" onclick="window.addToCart(${product.id})" ${isOutOfStock ? "disabled" : ""}>
                <i class="fas fa-cart-plus me-2"></i>${isOutOfStock ? "Esaurito" : "Aggiungi al carrello"}
            </button>
            <button type="button" class="btn btn-warning w-100 mt-2 fw-bold" onclick="window.buyNow(${product.id})" ${isOutOfStock ? "disabled" : ""}>Acquista ora</button>
            ${product.image ? `<button type="button" class="btn btn-link btn-sm p-0 mt-2" onclick="openProductImage(${product.id})">Visualizza immagine ingrandita</button>` : ""}
        </div>
    </div>`;
}

function showEmptyState(message) {
    const container = document.getElementById("products-container");
    container.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><h4>${message}</h4><p>Prova a modificare i filtri o la ricerca</p><button class="btn btn-primary" onclick="resetFilters()">Rimuovi filtri</button></div>`;
    updateResultsCount();
}

function updateResultsCount() {
    const count = filteredProducts.length;
    document.getElementById("results-count").textContent = count === 1 ? "1 prodotto trovato" : `${count} prodotti trovati`;
}

function updatePagination() {
    const totalPages = Math.ceil(filteredProducts.length / productsPerPage);
    const pagination = document.getElementById("pagination");
    if (totalPages <= 1) { pagination.innerHTML = ""; return; }
    let paginationHTML = "";
    if (currentPage > 1) paginationHTML += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(${currentPage - 1})">Precedente</a></li>`;
    for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 2); i++) {
        paginationHTML += `<li class="page-item ${i === currentPage ? "active" : ""}"><a class="page-link" href="#" onclick="changePage(${i})">${i}</a></li>`;
    }
    if (currentPage < totalPages) paginationHTML += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(${currentPage + 1})">Successivo</a></li>`;
    pagination.innerHTML = paginationHTML;
}

function changePage(page) {
    currentPage = page;
    displayProducts();
    window.scrollTo(0, 0);
}

function filterByCategory(category) {
    currentCategory = category;
    currentPage = 1;
    filteredProducts = category === "all" ? [...allProducts] : allProducts.filter(p => p.category && p.category.toLowerCase() === category.toLowerCase());
    document.getElementById("current-category").textContent = category === "all" ? "Tutti i prodotti" : category.charAt(0).toUpperCase() + category.slice(1);
    applyFilters();
}

function applyFilters() {
    let temp = [...allProducts];
    if (currentCategory !== "all") temp = temp.filter(p => p.category && p.category.toLowerCase() === currentCategory.toLowerCase());
    if (currentSearch !== "") temp = temp.filter(p => p.name.toLowerCase().includes(currentSearch) || (p.description && p.description.toLowerCase().includes(currentSearch)));
    const min = parseFloat(document.getElementById("min-price").value) || 0;
    const max = parseFloat(document.getElementById("max-price").value) || Infinity;
    temp = temp.filter(p => p.price >= min && p.price <= max);
    const minR = document.getElementById("rating-4").checked ? 4 : 0;
    temp = temp.filter(p => (p.rating || 0) >= minR);
    if (document.getElementById("in-stock").checked) temp = temp.filter(p => (p.stock || 0) > 0);
    filteredProducts = temp;
    sortProducts();
}

function sortProducts() {
    const sortBy = document.getElementById("sort-select").value;
    currentSort = sortBy;
    filteredProducts.sort((a, b) => {
        if (sortBy === "price-low") return a.price - b.price;
        if (sortBy === "price-high") return b.price - a.price;
        if (sortBy === "rating") return (b.rating || 0) - (a.rating || 0);
        if (sortBy === "newest") return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        return a.name.localeCompare(b.name);
    });
    currentPage = 1;
    displayProducts();
}

function resetFilters() {
    document.getElementById("search-input").value = "";
    document.getElementById("min-price").value = "";
    document.getElementById("max-price").value = "";
    document.getElementById("rating-4").checked = false;
    document.getElementById("in-stock").checked = true;
    currentCategory = "all";
    currentSearch = "";
    document.getElementById("current-category").textContent = "Tutti i prodotti";
    filteredProducts = [...allProducts];
    sortProducts();
}

window.searchProducts = function() {
    currentSearch = document.getElementById("search-input").value.toLowerCase().trim();
    currentPage = 1;
    applyFilters();
};

document.getElementById("search-input").addEventListener("keypress", (e) => e.key === "Enter" && window.searchProducts());
window.filterByCategory = filterByCategory;
window.applyPriceFilter = applyFilters;
window.applyRatingFilter = applyFilters;
window.applyStockFilter = applyFilters;
window.changePage = changePage;
window.sortProducts = sortProducts;
window.resetFilters = resetFilters;
window.openProductImage = openProductImage;
window.openProductPage = openProductPage;

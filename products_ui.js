let allProducts = [];
let filteredProducts = [];
let currentPage = 1;
const productsPerPage = 12;
let currentCategory = "all";
let currentSearch = "";
let currentSort = "name";
let productImagePreviewModal = null;

function getCatalogProducts() {
  if (typeof getAllProducts === "function") {
    const products = getAllProducts();
    if (Array.isArray(products) && products.length) {
      return products;
    }
  }
  if (typeof window.getAllProducts === "function") {
    const products = window.getAllProducts();
    if (Array.isArray(products) && products.length) {
      return products;
    }
  }
  if (typeof getDefaultProducts === "function") {
    return getDefaultProducts();
  }
  if (typeof window.getDefaultProducts === "function") {
    return window.getDefaultProducts();
  }
  return [];
}

// Load products on page load
document.addEventListener("DOMContentLoaded", async function () {
  loadProducts();
});

async function loadProducts() {
  try {
    if (window.localDBReady instanceof Promise) {
      await window.localDBReady;
    }
    allProducts = getCatalogProducts();
    if (!allProducts || !allProducts.length) {
      allProducts = getCatalogProducts();
    }
    filteredProducts = [...allProducts];
    applyInitialFiltersFromQuery();
    displayProducts();
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
        String(product.category || "").toLowerCase() === currentCategory,
    );
    document.getElementById("current-category").textContent =
      currentCategory.charAt(0).toUpperCase() + currentCategory.slice(1);
  } else {
    document.getElementById("current-category").textContent =
      "Tutti i prodotti";
  }

  if (currentSearch) {
    filteredProducts = filteredProducts.filter(
      (product) =>
        product.name.toLowerCase().includes(currentSearch) ||
        (product.description &&
          product.description.toLowerCase().includes(currentSearch)),
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
  document.getElementById("product-image-preview-title").textContent =
    product.name || "Anteprima prodotto";
  const previewImage = document.getElementById("product-image-preview-element");
  previewImage.src = product.image;
  previewImage.alt = product.name || "Anteprima prodotto";
  getProductImagePreviewModal().show();
}

function openProductPage(productId) {
  window.location.href = `product.html?id=${encodeURIComponent(productId)}`;
}

const getAvailabilityLabel = (stock) => {
  if (stock <= 0) return "Momentaneamente esaurito";
  if (stock <= 10) return `Ultimi ${stock} rimasti`;
  return "Disponibile";
};

function displayProducts() {
  const container = document.getElementById("products-container");
  const startIndex = (currentPage - 1) * productsPerPage;
  const endIndex = startIndex + productsPerPage;
  const productsToShow = filteredProducts.slice(startIndex, endIndex);

  if (productsToShow.length === 0) {
    showEmptyState(
      "Non ci sono prodotti che corrispondono ai filtri selezionati. Prova a rimuovere o modificare i criteri.",
    );
    return;
  }

  container.innerHTML = `<div class="row row-cols-1 row-cols-sm-2 row-cols-md-3 row-cols-lg-4 g-4">${productsToShow.map((product) => createProductCard(product)).join("")}</div>`;
  updateResultsCount();
  updatePagination();
}

const createProductCard = (product) => {
  const rating = Number(product.rating || 0);
  const reviews = Number(product.reviewCount || 0);
  const stock = Math.max(0, Math.floor(Number(product.stock || 0)));
  const isOutOfStock = stock <= 0;
  const productUrl = `product.html?id=${encodeURIComponent(product.id)}`;
  const ratingText =
    reviews > 0
      ? `${rating.toFixed(1)} su 5 · ${reviews === 1 ? "1 recensione" : `${reviews} recensioni`}`
      : "Sii il primo a recensire questo prodotto";

  return `
    <div class="col">
        <div class="card h-100 shadow-sm product-card-custom">
        <a href="${productUrl}" class="product-media-link">
            <img src="${window.escapeHtml(product.image || "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjgwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjgwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YzZjNmMyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjE4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjNjY2IiBkeT0iLjNlbSI+SW1tYWdpbmUgbm9uIGRpc3BvbmliaWxlPC90ZXh0Pjwvc3ZnPg==")}"
                alt="${window.escapeHtml(product.name)}" class="card-img-top product-image-custom">
        <div class="card-body d-flex flex-column">
            <a href="${productUrl}" class="card-title fw-bold text-decoration-none text-dark product-title-custom">${window.escapeHtml(product.name)}</a>
            <div class="product-rating mb-2">
                <span class="product-stars">${window.renderRatingStars(rating)}</span>
                <span class="product-rating-text small text-muted">${ratingText}</span>
            </div>
            <div class="product-price fs-5 fw-bold text-primary mb-1">${window.formatCurrency(product.price)}</div>
            <div class="small text-muted mb-2">IVA inclusa</div>
            <div class="product-availability small mb-3 ${isOutOfStock ? "text-danger" : stock <= 10 ? "text-warning" : "text-success"}">
                ${getAvailabilityLabel(stock)}
            </div>
            <div class="mt-auto d-grid gap-2">
            <button type="button" class="btn btn-outline-secondary btn-sm" onclick="window.openProductPage(${product.id})">
                <i class="fas fa-arrow-right me-1"></i>Dettagli
            </button>
            <button type="button" class="btn btn-primary btn-sm" onclick="window.addToCart(${product.id})" ${isOutOfStock ? "disabled" : ""}>
                <i class="fas fa-cart-plus me-1"></i>${isOutOfStock ? "Esaurito" : "Aggiungi al carrello"}
            </button>
            <button type="button" class="btn btn-warning btn-sm fw-bold" onclick="window.buyNow(${product.id})" ${isOutOfStock ? "disabled" : ""}>
                <i class="fas fa-bolt me-1"></i> Acquista ora
            </button>
            ${product.image ? `<button type="button" class="btn btn-link btn-sm p-0 mt-2" onclick="window.openProductImage(${product.id})">Visualizza immagine ingrandita</button>` : ""}
        </div>
    </div>
</div>
</div>`;
};

const showEmptyState = (message) => {
  const container = document.getElementById("products-container");
  container.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><h4>${message}</h4><p>Prova a modificare i filtri o la ricerca</p><button class="btn btn-primary" onclick="resetFilters()">Rimuovi filtri</button></div>`;
  updateResultsCount();
};

function updateResultsCount() {
  const count = filteredProducts.length;
  document.getElementById("results-count").textContent =
    count === 1 ? "1 prodotto trovato" : `${count} prodotti trovati`;
}

const updatePagination = () => {
  const totalPages = Math.ceil(filteredProducts.length / productsPerPage);
  const pagination = document.getElementById("pagination");
  if (totalPages <= 1) {
    pagination.innerHTML = "";
    return;
  }
  let paginationHTML = "";
  if (currentPage > 1)
    paginationHTML += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(${currentPage - 1})">Precedente</a></li>`;
  for (
    let i = Math.max(1, currentPage - 2);
    i <= Math.min(totalPages, currentPage + 2);
    i++
  ) {
    paginationHTML += `<li class="page-item ${i === currentPage ? "active" : ""}"><a class="page-link" href="#" onclick="changePage(${i})">${i}</a></li>`;
  }
  if (currentPage < totalPages)
    paginationHTML += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(${currentPage + 1})">Successivo</a></li>`;
  pagination.innerHTML = paginationHTML;
};

const changePage = (page) => {
  currentPage = page;
  displayProducts();
  window.scrollTo(0, 0);
};

const filterByCategory = (category) => {
  currentCategory = category;
  currentPage = 1;
  filteredProducts =
    category === "all"
      ? [...allProducts]
      : allProducts.filter(
          (p) =>
            p.category && p.category.toLowerCase() === category.toLowerCase(),
        );
  document.getElementById("current-category").textContent =
    category === "all"
      ? "Tutti i prodotti"
      : category.charAt(0).toUpperCase() + category.slice(1);
  applyFilters();
};

const applyFilters = () => {
  let temp = [...allProducts];
  if (currentCategory !== "all")
    temp = temp.filter(
      (p) =>
        p.category &&
        p.category.toLowerCase() === currentCategory.toLowerCase(),
    );
  if (currentSearch !== "")
    temp = temp.filter(
      (p) =>
        p.name.toLowerCase().includes(currentSearch) ||
        (p.description && p.description.toLowerCase().includes(currentSearch)),
    );
  const min = parseFloat(document.getElementById("min-price").value) || 0;
  const max =
    parseFloat(document.getElementById("max-price").value) || Infinity;
  temp = temp.filter((p) => p.price >= min && p.price <= max);
  const minR =
    document.getElementById("rating-4") &&
    document.getElementById("rating-4").checked
      ? 4
      : 0;
  temp = temp.filter((p) => (p.rating || 0) >= minR);
  if (document.getElementById("in-stock").checked)
    temp = temp.filter((p) => (p.stock || 0) > 0);
  filteredProducts = temp;
  sortProducts();
};

const sortProducts = () => {
  const sortBy = document.getElementById("sort-select").value;
  currentSort = sortBy;
  filteredProducts.sort((a, b) => {
    if (sortBy === "price-low") return (a.price || 0) - (b.price || 0);
    if (sortBy === "price-high") return (b.price || 0) - (a.price || 0);
    if (sortBy === "rating") return (b.rating || 0) - (a.rating || 0);
    if (sortBy === "newest")
      return (
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime()
      );
    return a.name.localeCompare(b.name);
  });
  currentPage = 1;
  displayProducts();
};

const resetFilters = () => {
  document.getElementById("search-input").value = "";
  document.getElementById("min-price").value = "";
  document.getElementById("max-price").value = "";
  const rating4Checkbox = document.getElementById("rating-4");
  if (rating4Checkbox) rating4Checkbox.checked = false;
  const inStockCheckbox = document.getElementById("in-stock");
  if (inStockCheckbox) inStockCheckbox.checked = true;
  currentCategory = "all";
  currentSearch = "";
  document.getElementById("current-category").textContent = "Tutti i prodotti";
  filteredProducts = [...allProducts];
  sortProducts();
};
document.addEventListener("DOMContentLoaded", () => {
  // Event listeners per i filtri
  document.getElementById("min-price")?.addEventListener("input", applyFilters);
  document.getElementById("max-price")?.addEventListener("input", applyFilters);
  document.getElementById("rating-4")?.addEventListener("change", applyFilters);
  document.getElementById("in-stock")?.addEventListener("change", applyFilters);
  document
    .getElementById("sort-select")
    ?.addEventListener("change", sortProducts);

  // Event listeners per le categorie
  document.querySelectorAll(".category-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      const category = e.target.dataset.category || "all";
      filterByCategory(category);
    });
  });

  // Event listener per i pulsanti di recensione
  document.querySelectorAll(".review-star-button").forEach((button) => {
    button.addEventListener("click", (e) =>
      setProductReviewRating(e.currentTarget.dataset.rating),
    );
  });
});
window.searchProducts = function () {
  currentSearch = document
    .getElementById("search-input")
    .value.toLowerCase()
    .trim();
  currentPage = 1;
  applyFilters();
};

const searchInputElement = document.getElementById("search-input");
if (searchInputElement) {
  searchInputElement.addEventListener(
    "keypress",
    (e) => e.key === "Enter" && window.searchProducts(),
  );
}
const searchButton = document.getElementById("search-btn");
if (searchButton) {
  searchButton.addEventListener("click", () => window.searchProducts());
}
window.changePage = changePage;
window.sortProducts = sortProducts;
window.resetFilters = resetFilters;
window.openProductImage = openProductImage;
window.openProductPage = openProductPage;

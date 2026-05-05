let allProducts = [];
let filteredProducts = [];
let currentPage = 1;
const productsPerPage = 12;
let currentCategory = "all";
let currentSearch = "";
let productImagePreviewModal = null;

const fallbackProductImage =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjgwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjgwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YzZjNmMyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjE4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjNjY2IiBkeT0iLjNlbSI+SW1tYWdpbmUgbm9uIGRpc3BvbmliaWxlPC90ZXh0Pjwvc3ZnPg==";

function escapeProductHtml(value) {
  if (typeof window.escapeHtml === "function") {
    return window.escapeHtml(value);
  }

  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
}

function formatProductCurrency(value) {
  if (typeof window.formatCurrency === "function") {
    return window.formatCurrency(value);
  }

  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value || 0));
}

function renderProductRatingStars(rating) {
  if (typeof window.renderRatingStars === "function") {
    return window.renderRatingStars(rating);
  }

  const score = Math.max(0, Math.min(5, Math.round(Number(rating || 0))));
  return Array.from({ length: 5 }, (_, index) =>
    index < score
      ? '<i class="fas fa-star text-warning"></i>'
      : '<i class="far fa-star text-warning"></i>',
  ).join("");
}

function getCatalogProductsFromGlobals() {
  if (typeof window.getAllProducts === "function") {
    const products = window.getAllProducts();
    if (Array.isArray(products) && products.length > 0) {
      return products;
    }
  }

  if (typeof window.getDefaultProducts === "function") {
    const products = window.getDefaultProducts();
    if (Array.isArray(products) && products.length > 0) {
      return products;
    }
  }

  return [];
}

async function getCatalogProducts() {
  const localProducts = getCatalogProductsFromGlobals();
  if (localProducts.length > 0) {
    return localProducts;
  }

  try {
    const response = await fetch("/api/products");
    if (response.ok) {
      const products = await response.json();
      if (Array.isArray(products) && products.length > 0) {
        return products;
      }
    }
  } catch (error) {
    console.warn("Catalogo server non disponibile:", error);
  }

  return getCatalogProductsFromGlobals();
}

document.addEventListener("DOMContentLoaded", () => {
  loadProducts();
  bindProductPageEvents();
});

async function loadProducts() {
  try {
    if (window.localDBReady instanceof Promise) {
      await window.localDBReady;
    }

    allProducts = await getCatalogProducts();
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
  currentSearch = String(params.get("search") || "").trim().toLowerCase();
  currentCategory = String(params.get("category") || "all")
    .trim()
    .toLowerCase();

  const searchInput = document.getElementById("search-input");
  if (searchInput && currentSearch) {
    searchInput.value = currentSearch;
  }

  applyFilters();
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
    showEmptyState(
      "Non ci sono prodotti che corrispondono ai filtri selezionati. Prova a rimuovere o modificare i criteri.",
    );
    return;
  }

  container.innerHTML = `<div class="row row-cols-1 row-cols-sm-2 row-cols-md-3 row-cols-lg-4 g-4">${productsToShow
    .map((product) => createProductCard(product))
    .join("")}</div>`;

  updateResultsCount();
  updatePagination();
}

function createProductCard(product) {
  const rating = Number(product.rating || 0);
  const reviews = Number(product.reviewCount || 0);
  const stock = Math.max(0, Math.floor(Number(product.stock || 0)));
  const isOutOfStock = stock <= 0;
  const productUrl = `product.html?id=${encodeURIComponent(product.id)}`;
  const imageUrl = product.image || fallbackProductImage;
  const ratingText =
    reviews > 0
      ? `${rating.toFixed(1)} su 5 - ${
          reviews === 1 ? "1 recensione" : `${reviews} recensioni`
        }`
      : "Sii il primo a recensire questo prodotto";

  return `<div class="col">
    <div class="card h-100 shadow-sm product-card-custom">
      <a href="${productUrl}" class="product-media-link">
        <img src="${escapeProductHtml(imageUrl)}" alt="${escapeProductHtml(product.name)}" class="card-img-top product-image-custom">
      </a>
      <div class="card-body d-flex flex-column">
        <a href="${productUrl}" class="card-title fw-bold text-decoration-none text-dark product-title-custom">${escapeProductHtml(product.name)}</a>
        <div class="product-rating mb-2">
          <span class="product-stars">${renderProductRatingStars(rating)}</span>
          <span class="product-rating-text small text-muted">${ratingText}</span>
        </div>
        <div class="product-price fs-5 fw-bold text-primary mb-1">${formatProductCurrency(product.price)}</div>
        <div class="small text-muted mb-2">IVA inclusa</div>
        <div class="product-availability small mb-3 ${isOutOfStock ? "text-danger" : stock <= 10 ? "text-warning" : "text-success"}">${getAvailabilityLabel(stock)}</div>
        <div class="mt-auto d-grid gap-2">
          <button type="button" class="btn btn-outline-secondary btn-sm" onclick="window.openProductPage(${Number(product.id)})">
            <i class="fas fa-arrow-right me-1"></i>Dettagli
          </button>
          <button type="button" class="btn btn-primary btn-sm" onclick="window.addToCart(${Number(product.id)})" ${isOutOfStock ? "disabled" : ""}>
            <i class="fas fa-cart-plus me-1"></i>${isOutOfStock ? "Esaurito" : "Aggiungi al carrello"}
          </button>
          <button type="button" class="btn btn-warning btn-sm fw-bold" onclick="window.buyNow(${Number(product.id)})" ${isOutOfStock ? "disabled" : ""}>
            <i class="fas fa-bolt me-1"></i>Acquista ora
          </button>
          ${
            product.image
              ? `<button type="button" class="btn btn-link btn-sm p-0 mt-2" onclick="window.openProductImage(${Number(product.id)})">Visualizza immagine ingrandita</button>`
              : ""
          }
        </div>
      </div>
    </div>
  </div>`;
}

function showEmptyState(message) {
  const container = document.getElementById("products-container");
  container.innerHTML = `<div class="empty-state">
    <i class="fas fa-search"></i>
    <h4>${escapeProductHtml(message)}</h4>
    <p>Prova a modificare i filtri o la ricerca</p>
    <button class="btn btn-primary" onclick="resetFilters()">Rimuovi filtri</button>
  </div>`;

  updateResultsCount();
  updatePagination();
}

function updateResultsCount() {
  const count = filteredProducts.length;
  document.getElementById("results-count").textContent =
    count === 1 ? "1 prodotto trovato" : `${count} prodotti trovati`;
}

function updatePagination() {
  const totalPages = Math.ceil(filteredProducts.length / productsPerPage);
  const pagination = document.getElementById("pagination");

  if (totalPages <= 1) {
    pagination.innerHTML = "";
    return;
  }

  let paginationHTML = "";
  if (currentPage > 1) {
    paginationHTML += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(${currentPage - 1})">Precedente</a></li>`;
  }

  for (
    let page = Math.max(1, currentPage - 2);
    page <= Math.min(totalPages, currentPage + 2);
    page += 1
  ) {
    paginationHTML += `<li class="page-item ${page === currentPage ? "active" : ""}"><a class="page-link" href="#" onclick="changePage(${page})">${page}</a></li>`;
  }

  if (currentPage < totalPages) {
    paginationHTML += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(${currentPage + 1})">Successivo</a></li>`;
  }

  pagination.innerHTML = paginationHTML;
}

function changePage(page) {
  currentPage = page;
  displayProducts();
  window.scrollTo(0, 0);
}

function filterByCategory(category) {
  currentCategory = category || "all";
  currentPage = 1;
  applyFilters();
}

function applyFilters() {
  let nextProducts = [...allProducts];

  if (currentCategory !== "all") {
    nextProducts = nextProducts.filter(
      (product) =>
        product.category &&
        product.category.toLowerCase() === currentCategory.toLowerCase(),
    );
  }

  if (currentSearch) {
    nextProducts = nextProducts.filter((product) => {
      const name = String(product.name || "").toLowerCase();
      const description = String(product.description || "").toLowerCase();
      return name.includes(currentSearch) || description.includes(currentSearch);
    });
  }

  const minPrice = parseFloat(document.getElementById("min-price").value) || 0;
  const maxPrice =
    parseFloat(document.getElementById("max-price").value) || Infinity;
  nextProducts = nextProducts.filter(
    (product) => product.price >= minPrice && product.price <= maxPrice,
  );

  const minRating = document.getElementById("rating-4")?.checked ? 4 : 0;
  nextProducts = nextProducts.filter(
    (product) => (product.rating || 0) >= minRating,
  );

  if (document.getElementById("in-stock")?.checked) {
    nextProducts = nextProducts.filter((product) => (product.stock || 0) > 0);
  }

  filteredProducts = nextProducts;
  sortProducts(false);
  updateCategoryLabel();
}

function sortProducts(shouldDisplay = true) {
  const sortBy = document.getElementById("sort-select").value;
  filteredProducts.sort((a, b) => {
    if (sortBy === "price-low") return (a.price || 0) - (b.price || 0);
    if (sortBy === "price-high") return (b.price || 0) - (a.price || 0);
    if (sortBy === "rating") return (b.rating || 0) - (a.rating || 0);
    if (sortBy === "newest") {
      return (
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime()
      );
    }

    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  currentPage = 1;
  if (shouldDisplay) {
    displayProducts();
  }
}

function resetFilters() {
  document.getElementById("search-input").value = "";
  document.getElementById("min-price").value = "";
  document.getElementById("max-price").value = "";

  const rating4Checkbox = document.getElementById("rating-4");
  if (rating4Checkbox) rating4Checkbox.checked = false;

  const inStockCheckbox = document.getElementById("in-stock");
  if (inStockCheckbox) inStockCheckbox.checked = true;

  currentCategory = "all";
  currentSearch = "";
  currentPage = 1;
  applyFilters();
  displayProducts();
}

function updateCategoryLabel() {
  const currentCategoryElement = document.getElementById("current-category");
  currentCategoryElement.textContent =
    currentCategory === "all"
      ? "Tutti i prodotti"
      : currentCategory.charAt(0).toUpperCase() + currentCategory.slice(1);
}

function searchProducts() {
  currentSearch = document
    .getElementById("search-input")
    .value.toLowerCase()
    .trim();
  currentPage = 1;
  applyFilters();
  displayProducts();
}

function bindProductPageEvents() {
  document.getElementById("min-price")?.addEventListener("input", () => {
    applyFilters();
    displayProducts();
  });
  document.getElementById("max-price")?.addEventListener("input", () => {
    applyFilters();
    displayProducts();
  });
  document.getElementById("rating-4")?.addEventListener("change", () => {
    applyFilters();
    displayProducts();
  });
  document.getElementById("in-stock")?.addEventListener("change", () => {
    applyFilters();
    displayProducts();
  });
  document.getElementById("sort-select")?.addEventListener("change", () => {
    sortProducts();
  });

  document.querySelectorAll(".category-item").forEach((item) => {
    item.addEventListener("click", (event) => {
      filterByCategory(event.currentTarget.dataset.category || "all");
      displayProducts();
    });
  });

  document.getElementById("search-input")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") searchProducts();
  });
  document
    .getElementById("search-btn")
    ?.addEventListener("click", () => searchProducts());
}

window.changePage = changePage;
window.sortProducts = sortProducts;
window.resetFilters = resetFilters;
window.openProductImage = openProductImage;
window.openProductPage = openProductPage;
window.searchProducts = searchProducts;

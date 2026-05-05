let currentProduct = null;
let allProducts = [];
let productZoomModal = null;
let currentViewer = null;
let productReviews = [];

const PRODUCT_FREE_SHIPPING_THRESHOLD = 30;
const PRODUCT_SHIPPING_RATE_UNDER_THRESHOLD = 0.05;
const fallbackProductImage =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQwIiBoZWlnaHQ9IjQ4MCIgdmlld0JveD0iMCAwIDY0MCA0ODAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJJbW1hZ2luZSBub24gZGlzcG9uaWJpbGUiPjxyZWN0IHdpZHRoPSI2NDAiIGhlaWdodD0iNDgwIiBmaWxsPSIjZjhmYWZjIi8+PHJlY3QgeD0iOTYiIHk9Ijk2IiB3aWR0aD0iNDQ4IiBoZWlnaHQ9IjI4OCIgcng9IjgiIGZpbGw9IiNmZmYiIHN0cm9rZT0iI2Q3ZGJlNyIgc3Ryb2tlLXdpZHRoPSIyIi8+PHBhdGggZD0iTTE4OCAzMjBoMjY0bC04MC05Mi01NiA2OC0zOC00NC05MCA2OHoiIGZpbGw9IiNlNWU3ZWIiLz48Y2lyY2xlIGN4PSIyMzYiIGN5PSIxODgiIHI9IjMyIiBmaWxsPSIjMjU2M2ViIiBvcGFjaXR5PSIwLjgiLz48dGV4dCB4PSIzMjAiIHk9IjM5NSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjIyIiBmaWxsPSIjNWQ2NjczIj5JbW1hZ2luZSBub24gZGlzcG9uaWJpbGU8L3RleHQ+PC9zdmc+";

document.addEventListener("DOMContentLoaded", () => {
  loadProductDetail();
});

function getProductIdFromQuery() {
  return new URLSearchParams(window.location.search).get("id");
}

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
      ? '<i class="fas fa-star"></i>'
      : '<i class="far fa-star"></i>',
  ).join("");
}

function showProductToast(message, type = "success") {
  if (typeof window.showToast === "function") {
    window.showToast(message, type);
    return;
  }

  if (typeof window.showNotification === "function") {
    window.showNotification(message, type);
    return;
  }

  alert(message);
}

function getServerApiBaseUrl() {
  if (typeof window.getServerBaseUrl === "function") {
    return window.getServerBaseUrl();
  }

  return window.location.origin;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || `Errore ${response.status}`);
  }

  return data;
}

async function fetchServerProducts() {
  try {
    const products = await fetchJson(`${getServerApiBaseUrl()}/api/products`);
    return Array.isArray(products) ? products : [];
  } catch (error) {
    console.warn("Catalogo server non disponibile:", error.message || error);
    return [];
  }
}

async function fetchServerProduct(productId) {
  try {
    const product = await fetchJson(
      `${getServerApiBaseUrl()}/api/products/${encodeURIComponent(productId)}`,
    );
    return product && typeof product === "object" ? product : null;
  } catch (error) {
    return null;
  }
}

function getLocalProducts() {
  if (typeof window.getAllProducts === "function") {
    const products = window.getAllProducts();
    if (Array.isArray(products)) return products;
  }

  if (typeof window.getDefaultProducts === "function") {
    const products = window.getDefaultProducts();
    if (Array.isArray(products)) return products;
  }

  return [];
}

function mergeProducts(primaryProducts, fallbackProducts) {
  const productMap = new Map();

  [...fallbackProducts, ...primaryProducts].forEach((product) => {
    if (!product || product.id === undefined || product.id === null) return;
    productMap.set(String(product.id), product);
  });

  return Array.from(productMap.values());
}

function normalizeProduct(product) {
  const reviews = Array.isArray(product.reviews) ? product.reviews : [];
  const reviewCount = Number(product.reviewCount ?? reviews.length ?? 0);
  const rating =
    Number(product.rating) ||
    (reviews.length
      ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) /
        reviews.length
      : 0);

  return {
    ...product,
    price: Number(product.price || 0),
    stock: Math.max(0, Math.floor(Number(product.stock || 0))),
    rating: Number(rating || 0),
    reviewCount,
    image: String(product.image || "").trim(),
  };
}

async function getCatalogProducts() {
  const localProducts = getLocalProducts().map(normalizeProduct);
  const serverProducts = (await fetchServerProducts()).map(normalizeProduct);

  if (serverProducts.length > 0) {
    return mergeProducts(serverProducts, localProducts);
  }

  return localProducts;
}

function findProductById(products, productId) {
  return products.find((product) => String(product.id) === String(productId));
}

function getProductZoomModalInstance() {
  if (!productZoomModal) {
    productZoomModal = new bootstrap.Modal(
      document.getElementById("productZoomModal"),
    );
  }

  return productZoomModal;
}

function openProductZoom() {
  if (!currentProduct) return;

  document.getElementById("product-zoom-title").textContent =
    currentProduct.name || "Anteprima prodotto";

  const previewImage = document.getElementById("product-zoom-image");
  previewImage.src = currentProduct.image || fallbackProductImage;
  previewImage.alt = currentProduct.name || "Anteprima prodotto";

  getProductZoomModalInstance().show();
}

function getSelectedQuantity() {
  return Math.max(
    1,
    Math.floor(Number(document.getElementById("product-quantity")?.value || 1)),
  );
}

function addCurrentProductToCart(redirectToCheckout) {
  if (!currentProduct) return;

  if (redirectToCheckout) {
    if (typeof window.buyNow === "function") {
      window.buyNow(currentProduct.id);
    }
    return;
  }

  if (typeof window.addToCart !== "function") return;

  const quantity = getSelectedQuantity();
  let added = 0;

  for (let index = 0; index < quantity; index += 1) {
    if (window.addToCart(currentProduct.id) === false) break;
    added += 1;
  }

  if (added > 0 && typeof window.updateCartCount === "function") {
    window.updateCartCount();
  }
}

function getStockLabel(stock) {
  if (stock <= 0) return "Temporaneamente non disponibile";
  if (stock <= 10) return `Ultimi ${stock} rimasti`;
  return "Disponibile";
}

function getShippingDescription(price) {
  const priceValue = Number(price || 0);
  if (priceValue >= PRODUCT_FREE_SHIPPING_THRESHOLD) {
    return "Spedizione gratuita";
  }

  return `Spedizione ${Math.round(
    PRODUCT_SHIPPING_RATE_UNDER_THRESHOLD * 100,
  )}% per ordini sotto ${formatProductCurrency(
    PRODUCT_FREE_SHIPPING_THRESHOLD,
  )}`;
}

function syncCurrentProductCache(updatedProduct) {
  if (
    !updatedProduct ||
    typeof window.getAllProducts !== "function" ||
    typeof window.saveData !== "function"
  ) {
    return;
  }

  const cached = window.getAllProducts();
  const index = cached.findIndex(
    (product) => String(product.id) === String(updatedProduct.id),
  );

  if (index !== -1) {
    cached[index] = { ...cached[index], ...updatedProduct };
  } else {
    cached.push(updatedProduct);
  }

  window.saveData("products", cached);
  currentProduct = normalizeProduct(updatedProduct);
}

function getLocalProductReviews(productId) {
  const product = getLocalProducts().find(
    (item) => String(item.id) === String(productId),
  );

  return Array.isArray(product?.reviews) ? product.reviews : [];
}

async function loadProductReviews(productId) {
  productReviews = getLocalProductReviews(productId);

  try {
    const data = await fetchJson(
      `${getServerApiBaseUrl()}/api/products/${encodeURIComponent(
        productId,
      )}/reviews`,
    );
    productReviews = Array.isArray(data.reviews) ? data.reviews : productReviews;
    if (data.product) syncCurrentProductCache(data.product);
  } catch (error) {
    // Local reviews are already available as a fallback.
  }

  return productReviews;
}

function setProductReviewRating(rating) {
  const normalized = Math.max(1, Math.min(5, Number(rating)));
  const input = document.getElementById("review-rating-value");
  if (input) input.value = String(normalized);

  document.querySelectorAll(".review-star-button").forEach((button, index) => {
    button.classList.toggle("filled", index < normalized);
    button.setAttribute("aria-pressed", index < normalized ? "true" : "false");
  });

  const caption = document.getElementById("review-rating-caption");
  if (caption) {
    caption.textContent =
      normalized === 1
        ? "1 stella selezionata"
        : `${normalized} stelle selezionate`;
  }
}

async function submitProductReview(event) {
  event.preventDefault();

  if (!currentViewer) {
    showProductToast("Accedi per lasciare una recensione.", "error");
    return;
  }

  const rating = Number(document.getElementById("review-rating-value")?.value);
  const comment = document.getElementById("review-comment")?.value.trim() || "";

  if (rating < 1 || rating > 5 || comment.length < 5) {
    showProductToast("Compila correttamente tutti i campi.", "error");
    return;
  }

  const submitButton = document.getElementById("submit-review-button");
  if (submitButton) submitButton.disabled = true;

  try {
    const token =
      typeof window.getSessionToken === "function"
        ? window.getSessionToken()
        : localStorage.getItem("ecommerce-session-token");

    if (token) {
      const data = await fetchJson(
        `${getServerApiBaseUrl()}/api/products/${encodeURIComponent(
          currentProduct.id,
        )}/reviews`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ rating, comment }),
        },
      );

      productReviews = Array.isArray(data.reviews) ? data.reviews : [];
      if (data.product) syncCurrentProductCache(data.product);
    } else {
      saveProductReviewLocally({ rating, comment });
    }

    renderProductDetail(currentProduct);
    showProductToast("Recensione salvata.");
  } catch (error) {
    saveProductReviewLocally({ rating, comment });
    renderProductDetail(currentProduct);
    showProductToast("Recensione salvata sul dispositivo.");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function saveProductReviewLocally({ rating, comment }) {
  if (
    !currentProduct ||
    !currentViewer ||
    typeof window.getAllProducts !== "function" ||
    typeof window.saveData !== "function"
  ) {
    return;
  }

  const products = window.getAllProducts();
  const productIndex = products.findIndex(
    (product) => String(product.id) === String(currentProduct.id),
  );
  if (productIndex === -1) return;

  const reviews = Array.isArray(products[productIndex].reviews)
    ? products[productIndex].reviews
    : [];
  const existingIndex = reviews.findIndex(
    (review) => String(review.userId) === String(currentViewer.id),
  );
  const now = new Date().toISOString();
  const review = {
    userId: currentViewer.id,
    authorName: currentViewer.name || "Cliente",
    rating,
    comment,
    updatedAt: now,
    createdAt: existingIndex >= 0 ? reviews[existingIndex].createdAt : now,
  };

  if (existingIndex >= 0) {
    reviews[existingIndex] = review;
  } else {
    reviews.push(review);
  }

  const average =
    reviews.reduce((sum, item) => sum + Number(item.rating || 0), 0) /
    reviews.length;
  products[productIndex].reviews = reviews;
  products[productIndex].rating = Number(average.toFixed(1));
  products[productIndex].reviewCount = reviews.length;
  window.saveData("products", products);

  productReviews = reviews;
  currentProduct = normalizeProduct(products[productIndex]);
}

async function loadProductDetail() {
  const productId = getProductIdFromQuery();
  const container = document.getElementById("product-detail-container");

  try {
    if (window.localDBReady instanceof Promise) {
      await window.localDBReady;
    }

    currentViewer =
      typeof window.getCurrentUser === "function"
        ? await window.getCurrentUser()
        : null;
    allProducts = await getCatalogProducts();
    currentProduct = findProductById(allProducts, productId);

    if (!currentProduct) {
      currentProduct = await fetchServerProduct(productId);
      if (currentProduct) {
        currentProduct = normalizeProduct(currentProduct);
        allProducts = mergeProducts([currentProduct], allProducts);
      }
    }

    if (!currentProduct) {
      container.className = "";
      container.innerHTML =
        '<div class="empty-state"><h4>Prodotto non trovato</h4><a href="products.html" class="btn btn-amazon">Torna ai prodotti</a></div>';
      return;
    }

    await loadProductReviews(currentProduct.id);
    renderProductDetail(currentProduct);
  } catch (error) {
    console.error("Errore caricamento prodotto:", error);
    container.className = "";
    container.innerHTML =
      '<div class="empty-state"><h4>Errore caricamento prodotto</h4><a href="products.html" class="btn btn-amazon">Torna ai prodotti</a></div>';
  }
}

function renderProductDetail(product) {
  const container = document.getElementById("product-detail-container");
  const stock = Math.max(0, Math.floor(Number(product.stock || 0)));
  const isOutOfStock = stock <= 0;
  const quantityOptions = Array.from(
    { length: Math.max(1, Math.min(stock || 1, 10)) },
    (_, index) => `<option value="${index + 1}">${index + 1}</option>`,
  ).join("");
  const reviewsLabel =
    product.reviewCount === 1
      ? "1 recensione"
      : `${product.reviewCount || 0} recensioni`;
  const rating = Number(product.rating || 0);
  const productImage = product.image || fallbackProductImage;

  document.title = `ShopNow - ${product.name}`;
  document.getElementById("product-breadcrumb-name").textContent =
    product.name || "Prodotto";
  document.getElementById("product-category-link").textContent =
    product.category || "Prodotti";
  document.getElementById(
    "product-category-link",
  ).href = `products.html?category=${encodeURIComponent(
    product.category || "all",
  )}`;

  container.className = "product-detail-ready";
  container.innerHTML = `
    <section class="product-detail-shell amazon-product-shell">
      <div class="product-detail-grid">
        <div class="product-gallery-panel amazon-product-gallery">
          <button type="button" class="product-gallery-main" onclick="openProductZoom()" aria-label="Ingrandisci immagine prodotto">
            <img src="${escapeProductHtml(productImage)}" alt="${escapeProductHtml(product.name)}" class="product-detail-image">
            <span class="product-zoom-hint"><i class="fas fa-up-right-and-down-left-from-center"></i> Ingrandisci</span>
          </button>
          <div class="product-gallery-meta">
            <span><i class="fas fa-shield-alt"></i> Acquisto protetto</span>
            <span><i class="fas fa-rotate-left"></i> Reso facile</span>
          </div>
        </div>

        <section class="product-main-panel amazon-product-main">
          <a class="product-category-pill" href="products.html?category=${encodeURIComponent(product.category || "all")}">
            <i class="fas fa-tag"></i>${escapeProductHtml(product.category || "Prodotto")}
          </a>
          <h1 class="product-detail-title">${escapeProductHtml(product.name)}</h1>
          <div class="product-detail-rating-row">
            <div class="product-detail-rating">${renderProductRatingStars(rating)}</div>
            <a href="#reviews-section" class="product-rating-summary">${rating.toFixed(1)} su 5 · ${reviewsLabel}</a>
          </div>
          <div class="product-detail-price">${formatProductCurrency(product.price)}</div>
          <div class="product-tax-note">IVA inclusa</div>
          <p class="product-detail-description">${escapeProductHtml(product.description || "Descrizione prodotto non disponibile.")}</p>

          <div class="product-feature-list">
            <div><i class="fas fa-truck-fast"></i><span>${getShippingDescription(product.price)}</span></div>
            <div><i class="fas fa-box-open"></i><span>${getStockLabel(stock)}</span></div>
            <div><i class="fas fa-lock"></i><span>Pagamento sicuro</span></div>
          </div>
        </section>

        <aside class="product-buy-box amazon-buy-box" aria-label="Acquisto prodotto">
          <div class="product-buy-price">${formatProductCurrency(product.price)}</div>
          <div class="product-tax-note">IVA inclusa</div>
          <div class="product-buy-stock ${isOutOfStock ? "out-of-stock" : ""}">
            <i class="fas ${isOutOfStock ? "fa-circle-xmark" : "fa-circle-check"}"></i>
            ${getStockLabel(stock)}
          </div>
          <div class="product-buy-divider"></div>
          <label class="form-label" for="product-quantity">Quantita</label>
          <select id="product-quantity" class="form-select product-quantity-select" ${isOutOfStock ? "disabled" : ""}>
            ${quantityOptions}
          </select>
          <button type="button" class="btn btn-amazon product-cart-btn" onclick="addCurrentProductToCart(false)" ${isOutOfStock ? "disabled" : ""}>
            <i class="fas fa-cart-plus"></i> Aggiungi al carrello
          </button>
          <button type="button" class="product-buy-now-btn" onclick="addCurrentProductToCart(true)" ${isOutOfStock ? "disabled" : ""}>
            <i class="fas fa-bolt"></i> Acquista ora
          </button>
          <div class="product-buy-note">
            <i class="fas fa-lock"></i>
            Transazione protetta e conferma ordine immediata.
          </div>
        </aside>
      </div>
    </section>

    <section id="reviews-section" class="product-section-card product-reviews-section">
      <div class="product-section-heading">
        <div>
          <span class="product-section-eyebrow">Esperienze clienti</span>
          <h2>Recensioni</h2>
        </div>
        <div class="product-review-score">
          <strong>${rating.toFixed(1)}</strong>
          <span>${reviewsLabel}</span>
        </div>
      </div>
      <div class="product-reviews-grid">
        <div>${renderReviewForm()}</div>
        <div>${renderReviewsList()}</div>
      </div>
    </section>

    ${renderRelatedProducts(product)}
  `;
}

function renderReviewForm() {
  if (!currentViewer) {
    return `<div class="product-review-login">
      <i class="fas fa-user-circle"></i>
      <strong>Accedi per lasciare una recensione</strong>
      <span>Racconta la tua esperienza dopo l'acquisto.</span>
      <a href="account.html" class="btn btn-outline-secondary">Vai al tuo account</a>
    </div>`;
  }

  const existing = productReviews.find(
    (review) => String(review.userId) === String(currentViewer.id),
  );
  const selectedRating = Number(existing?.rating || 5);

  return `<form class="product-review-form" onsubmit="submitProductReview(event)">
    <input type="hidden" id="review-rating-value" value="${selectedRating}">
    <label class="form-label">La tua valutazione</label>
    <div class="review-stars-input-row">
      ${[1, 2, 3, 4, 5]
        .map(
          (value) => `<button type="button" class="review-star-button ${
            value <= selectedRating ? "filled" : ""
          }" data-rating="${value}" aria-label="${value} stelle" aria-pressed="${
            value <= selectedRating ? "true" : "false"
          }" onclick="setProductReviewRating(${value})"><i class="fas fa-star"></i></button>`,
        )
        .join("")}
    </div>
    <span id="review-rating-caption" class="small text-muted">${selectedRating} stelle selezionate</span>
    <label class="form-label mt-3" for="review-comment">Recensione</label>
    <textarea id="review-comment" class="form-control" rows="4" required minlength="5" placeholder="Scrivi cosa ti e piaciuto del prodotto">${escapeProductHtml(existing?.comment || "")}</textarea>
    <button type="submit" id="submit-review-button" class="btn btn-amazon">
      <i class="fas fa-paper-plane"></i> ${existing ? "Aggiorna" : "Invia recensione"}
    </button>
  </form>`;
}

function renderReviewsList() {
  if (!productReviews.length) {
    return `<div class="product-empty-reviews">
      <i class="far fa-comment-dots"></i>
      <strong>Nessuna recensione ancora</strong>
      <span>Sii il primo cliente a condividere un'opinione.</span>
    </div>`;
  }

  return `<div class="product-reviews-list">
    ${productReviews
      .map((review) => {
        const authorName = review.authorName || review.name || "Cliente";
        const updatedAt = review.updatedAt || review.createdAt;
        const dateLabel = updatedAt
          ? new Date(updatedAt).toLocaleDateString("it-IT")
          : "";

        return `<article class="product-review-card">
          <div class="product-review-card-header">
            <div>
              <strong>${escapeProductHtml(authorName)}</strong>
              <div class="product-review-stars">${renderProductRatingStars(review.rating)}</div>
            </div>
            ${dateLabel ? `<span>${escapeProductHtml(dateLabel)}</span>` : ""}
          </div>
          <p>${escapeProductHtml(review.comment || "")}</p>
        </article>`;
      })
      .join("")}
  </div>`;
}

function renderRelatedProducts(product) {
  const relatedProducts = allProducts
    .filter(
      (item) =>
        String(item.id) !== String(product.id) &&
        String(item.category || "").toLowerCase() ===
          String(product.category || "").toLowerCase(),
    )
    .slice(0, 4);

  if (!relatedProducts.length) return "";

  return `<section class="product-section-card related-products-shell">
    <div class="product-section-heading">
      <div>
        <span class="product-section-eyebrow">Stessa categoria</span>
        <h2>Potrebbero piacerti</h2>
      </div>
    </div>
    <div class="related-products-grid">
      ${relatedProducts
        .map(
          (item) => `<a class="related-product-card" href="product.html?id=${encodeURIComponent(item.id)}">
            <img src="${escapeProductHtml(item.image || fallbackProductImage)}" alt="${escapeProductHtml(item.name)}">
            <div class="related-product-body">
              <div class="related-product-title">${escapeProductHtml(item.name)}</div>
              <div class="related-product-price">${formatProductCurrency(item.price)}</div>
            </div>
          </a>`,
        )
        .join("")}
    </div>
  </section>`;
}

function searchProducts() {
  const query = document.getElementById("search-input")?.value.trim() || "";
  window.location.href = query
    ? `products.html?search=${encodeURIComponent(query)}`
    : "products.html";
}

window.setProductReviewRating = setProductReviewRating;
window.submitProductReview = submitProductReview;
window.addCurrentProductToCart = addCurrentProductToCart;
window.openProductZoom = openProductZoom;
window.searchProducts = searchProducts;

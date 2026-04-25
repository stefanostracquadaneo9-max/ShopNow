// Protezione immediata della pagina admin
(function () {
  const role = localStorage.getItem("user-role");
  const hasSession = !!localStorage.getItem("ecommerce-session-token");
  if (!hasSession || role !== "admin") {
    window.location.href = "products.html";
  }
})();

function isServerBackedAdminMode() {
  return typeof prefersServerAuth === "function"
    ? prefersServerAuth()
    : window.location.protocol !== "file:";
}

const SERVER_BASE_URL =
  typeof getServerBaseUrl === "function"
    ? getServerBaseUrl()
    : window.location.hostname.includes("railway.app")
      ? "https://shopnow-production.up.railway.app"
      : "http://localhost:3000";
const ADMIN_DASHBOARD_CACHE_KEY = "admin-dashboard-cache";

let currentUser = null;
let users = [];
let products = [];
let orders = [];
let stripeSummary = null;
let editingProductId = null;
let pendingImageRemoval = false;
let pendingUserDeletion = null;

let imagePreviewModal = null;
let userDetailsModal = null;
let deleteUserModal = null;
let addUserModal = null;
let ordersChartInstance = null;
let salesChartInstance = null;
let usersGrowthChartInstance = null;

function getModalInstance(id, existingInstance) {
  if (existingInstance) {
    return existingInstance;
  }
  const element = document.getElementById(id);
  if (!element || typeof bootstrap === "undefined") {
    return null;
  }
  return new bootstrap.Modal(element);
}

function escapeAdminHtml(value) {
  if (typeof window.escapeHtml === "function") {
    return window.escapeHtml(value);
  }
  return String(value ?? "").replace(/[&<>\"']/g, (char) => {
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

function formatAdminCurrency(value) {
  if (typeof window.formatCurrency === "function") {
    return window.formatCurrency(value);
  }
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value || 0));
}

function parseDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

async function parseJsonResponse(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  const text = await response.text();
  return { error: text || fallbackMessage };
}

function getAdminFetchOptions(options = {}) {
  const sessionToken =
    typeof getSessionToken === "function" ? getSessionToken() : "";
  return {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    },
  };
}

async function requestJson(url, options = {}, fallbackMessage = "Errore") {
  const response = await fetch(url, getAdminFetchOptions(options));
  const data = await parseJsonResponse(response, fallbackMessage);
  if (!response.ok) {
    throw new Error(data?.error || data?.message || fallbackMessage);
  }
  return data;
}

function saveDashboardCache() {
  localStorage.setItem(
    ADMIN_DASHBOARD_CACHE_KEY,
    JSON.stringify({
      users: users,
      products: products,
      orders: orders,
      stripeSummary: stripeSummary,
      updatedAt: new Date().toISOString(),
    }),
  );
}

function loadDashboardDataFromCache() {
  try {
    const cached = localStorage.getItem(ADMIN_DASHBOARD_CACHE_KEY);
    if (!cached) {
      return false;
    }
    const parsed = JSON.parse(cached);
    users = Array.isArray(parsed.users) ? parsed.users : [];
    products = Array.isArray(parsed.products) ? parsed.products : [];
    orders = Array.isArray(parsed.orders) ? parsed.orders : [];
    stripeSummary = parsed.stripeSummary || null;
    return true;
  } catch (error) {
    console.warn("Cache dashboard non valida:", error.message);
    return false;
  }
}

function loadDashboardDataFromLocal() {
  users = Object.values(loadData("users", {}));
  products = typeof getAllProducts === "function" ? getAllProducts() : [];
  orders = users.flatMap((user) =>
    Array.isArray(user.orders)
      ? user.orders.map((order) => ({
          ...order,
          userName: user.name,
          userEmail: user.email,
        }))
      : [],
  );
  stripeSummary = null;
  saveDashboardCache();
}

async function loadDashboardDataFromServer() {
  if (!isServerBackedAdminMode()) {
    return false;
  }
  try {
    const dashboardData = await requestJson(
      `${SERVER_BASE_URL}/api/admin/dashboard`,
      {},
      "Dashboard non disponibile",
    );
    users = Array.isArray(dashboardData.users) ? dashboardData.users : [];
    products = Array.isArray(dashboardData.products)
      ? dashboardData.products
      : [];
    orders = Array.isArray(dashboardData.orders) ? dashboardData.orders : [];

    try {
      const stripeData = await requestJson(
        `${SERVER_BASE_URL}/api/admin/stripe-summary`,
        {},
        "Riepilogo Stripe non disponibile",
      );
      stripeSummary = stripeData?.success ? stripeData : null;
    } catch (error) {
      stripeSummary = null;
      console.warn("Riepilogo Stripe non disponibile:", error.message);
    }

    saveDashboardCache();
    return true;
  } catch (error) {
    console.warn("Dashboard server non disponibile:", error.message);
    return false;
  }
}

async function loadDashboardData() {
  const loadedFromServer = await loadDashboardDataFromServer();
  if (!loadedFromServer && !loadDashboardDataFromCache()) {
    loadDashboardDataFromLocal();
  }
  updateDashboardStats();
  renderUsersTable();
  renderProductsTable();
  renderOrdersTable();
  renderCharts();
}

async function checkAdminAccess() {
  try {
    currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== "admin") {
      alert("Accesso negato.");
      window.location.href = "index.html";
      return false;
    }
    localStorage.setItem("user-role", "admin");
    return true;
  } catch (error) {
    window.location.href = "index.html";
    return false;
  }
}

function updateDashboardStats() {
  const usersNode = document.getElementById("total-users");
  const productsNode = document.getElementById("total-products");
  const ordersNode = document.getElementById("total-orders");
  const revenueNode = document.getElementById("total-revenue");

  if (usersNode) {
    usersNode.textContent = String(users.length);
  }
  if (productsNode) {
    productsNode.textContent = String(products.length);
  }
  if (ordersNode) {
    ordersNode.textContent = String(orders.length);
  }

  const localRevenue = orders.reduce(
    (sum, order) => sum + Number(order.total || 0),
    0,
  );
  const finalRevenue =
    stripeSummary && Number.isFinite(Number(stripeSummary.revenue))
      ? Number(stripeSummary.revenue)
      : localRevenue;
  if (revenueNode) {
    revenueNode.textContent = formatAdminCurrency(finalRevenue);
  }
  const revenueTitle = document.querySelector("#total-revenue + .stats-title");
  if (revenueTitle) {
    revenueTitle.textContent =
      stripeSummary && Number.isFinite(Number(stripeSummary.revenue))
        ? "Ricavi Stripe"
        : "Ricavi Totali";
  }

  const stripeStatusMessageElement = document.getElementById("stripe-status-message");
  if (stripeStatusMessageElement) {
    if (stripeSummary && Number.isFinite(Number(stripeSummary.revenue))) {
      stripeStatusMessageElement.innerHTML = ''; // Clear any previous message
    } else {
      stripeStatusMessageElement.innerHTML = `
        <div class="alert alert-warning d-flex align-items-center" role="alert">
          <i class="fas fa-exclamation-triangle me-2"></i>
          <div>
            <strong>Attenzione:</strong> I dati di Stripe non sono disponibili. Assicurati che <code>STRIPE_SECRET_KEY</code> sia configurata correttamente nelle variabili d'ambiente su Railway.
          </div>
        </div>
      `;
    }
  }
}

function renderUserStatusBadge(user) {
  const isOnline =
    user?.sessionActive === true ||
    (currentUser && String(user?.id) === String(currentUser.id));
  return `<span class="admin-presence-badge ${isOnline ? "online" : "offline"}"><span class="admin-presence-dot"></span>${isOnline ? "Online" : "Offline"}</span>`;
}

function canDeleteUser(user) {
  if (!user) {
    return false;
  }
  if (String(user.role || "").toLowerCase() === "admin") {
    return false;
  }
  return !currentUser || String(user.id) !== String(currentUser.id);
}

function renderUsersTable(list = users) {
  const body = document.getElementById("users-table-body");
  if (!body) {
    return;
  }
  body.innerHTML = list
    .map((user) => {
      const deleteButton = canDeleteUser(user)
        ? `<button class="btn btn-sm btn-outline-danger" onclick="requestUserDeletion('${escapeAdminHtml(user.id)}')" title="Elimina utente"><i class="fas fa-trash"></i></button>`
        : `<button class="btn btn-sm btn-outline-secondary" disabled title="Utente non eliminabile"><i class="fas fa-trash"></i></button>`;
      return `
                <tr>
                    <td><div class="user-avatar">${escapeAdminHtml((user.name || "U").charAt(0).toUpperCase())}</div></td>
                    <td>${escapeAdminHtml(user.name || "N/D")}</td>
                    <td>${escapeAdminHtml(user.email || "N/D")}</td>
                    <td>${renderUserStatusBadge(user)}</td>
                    <td>${escapeAdminHtml(user.role || "user")}</td>
                    <td>${parseDate(user.createdAt).toLocaleDateString("it-IT")}</td>
                    <td>
                        <div class="d-flex gap-2">
                            <button class="btn btn-sm btn-outline-primary" onclick="viewUserDetails('${escapeAdminHtml(user.id)}')" title="Dettagli utente"><i class="fas fa-eye"></i></button>
                            ${deleteButton}
                        </div>
                    </td>
                </tr>
            `;
    })
    .join("");
}

function renderProductsTable(list = products) {
  const body = document.getElementById("products-table-body");
  if (!body) {
    return;
  }
  body.innerHTML = list
    .map(
      (product) => `
            <tr>
                <td>
                    ${
                      product.image
                        ? `<img src="${escapeAdminHtml(product.image)}" class="admin-product-image" style="width:40px" onclick="openProductImagePreview('${escapeAdminHtml(product.id)}')" alt="${escapeAdminHtml(product.name)}">`
                        : '<span class="text-muted small">N/D</span>'
                    }
                </td>
                <td>${escapeAdminHtml(product.name || "N/D")}</td>
                <td>${escapeAdminHtml(product.category || "N/D")}</td>
                <td>${formatAdminCurrency(product.price)}</td>
                <td>${Number(product.stock || 0)}</td>
                <td>
                    <div class="d-flex gap-2">
                        <button class="btn btn-sm btn-outline-warning" onclick="editProduct('${escapeAdminHtml(product.id)}')" title="Modifica prodotto"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteProduct('${escapeAdminHtml(product.id)}')" title="Elimina prodotto"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `,
    )
    .join("");
}

function renderOrdersTable(list = orders) {
  const body = document.getElementById("orders-table-body");
  if (!body) {
    return;
  }
  body.innerHTML = list
    .map(
      (order) => `
            <tr>
                <td>${escapeAdminHtml(order.id)}</td>
                <td>${escapeAdminHtml(order.userName || order.userEmail || "Cliente")}</td>
                <td>${parseDate(order.createdAt || order.date).toLocaleDateString("it-IT")}</td>
                <td>${formatAdminCurrency(order.total)}</td>
                <td>${escapeAdminHtml(order.status || "pending")}</td>
                <td><button class="btn btn-sm btn-outline-primary" onclick="alert('Dettagli ordine non ancora disponibili in questa vista.')"><i class="fas fa-eye"></i></button></td>
            </tr>
        `,
    )
    .join("");
}

function renderUserDetailsContent(user) {
  const addresses = Array.isArray(user?.addresses) ? user.addresses : [];
  const paymentMethods = Array.isArray(user?.paymentMethods)
    ? user.paymentMethods
    : [];
  const userOrders = Array.isArray(user?.orders) ? user.orders : [];
  const totalSpent = userOrders.reduce(
    (sum, order) => sum + Number(order.total || 0),
    0,
  );

  const addressesMarkup = addresses.length
    ? addresses
        .map(
          (address) => `
                    <li class="mb-2">
                        <strong>${escapeAdminHtml(address.line1 || address.street || "Indirizzo")}</strong><br>
                        <span class="text-muted">${escapeAdminHtml(address.city || "")} ${escapeAdminHtml(address.postalCode || "")}, ${escapeAdminHtml(address.country || "")}</span>
                    </li>
                `,
        )
        .join("")
    : '<li class="text-muted">Nessun indirizzo salvato</li>';

  const paymentMethodsMarkup = paymentMethods.length
    ? paymentMethods
        .map(
          (method) => `
                    <li class="mb-2">
                        <strong>${escapeAdminHtml(method.alias || "Metodo salvato")}</strong><br>
                        <span class="text-muted">${escapeAdminHtml(method.brand || "Carta")} • ${escapeAdminHtml(method.last4 || "----")} • ${escapeAdminHtml(method.expiry || "")}</span>
                    </li>
                `,
        )
        .join("")
    : '<li class="text-muted">Nessun metodo di pagamento salvato</li>';

  const ordersMarkup = userOrders.length
    ? userOrders
        .map(
          (order) => `
                    <tr>
                        <td>#${escapeAdminHtml(order.id)}</td>
                        <td>${parseDate(order.createdAt || order.date).toLocaleDateString("it-IT")}</td>
                        <td>${escapeAdminHtml(order.status || "pending")}</td>
                        <td>${formatAdminCurrency(order.total)}</td>
                    </tr>
                `,
        )
        .join("")
    : `<tr><td colspan="4" class="text-muted text-center">Nessun ordine</td></tr>`;

  return `
        <div class="container-fluid">
            <div class="row g-4">
                <div class="col-lg-4">
                    <div class="card border-0 bg-light h-100">
                        <div class="card-body">
                            <h4 class="mb-1">${escapeAdminHtml(user.name || "Utente")}</h4>
                            <p class="text-muted mb-3">${escapeAdminHtml(user.email || "N/D")}</p>
                            <div class="d-flex flex-column gap-2">
                                <div><strong>Ruolo:</strong> ${escapeAdminHtml(user.role || "user")}</div>
                                <div><strong>Registrato:</strong> ${parseDate(user.createdAt).toLocaleString("it-IT")}</div>
                                <div><strong>Ordini:</strong> ${userOrders.length}</div>
                                <div><strong>Spesa totale:</strong> ${formatAdminCurrency(totalSpent)}</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-lg-8">
                    <div class="row g-4">
                        <div class="col-md-6">
                            <div class="card h-100">
                                <div class="card-body">
                                    <h5 class="card-title">Indirizzi</h5>
                                    <ul class="list-unstyled mb-0">${addressesMarkup}</ul>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="card h-100">
                                <div class="card-body">
                                    <h5 class="card-title">Metodi di pagamento</h5>
                                    <ul class="list-unstyled mb-0">${paymentMethodsMarkup}</ul>
                                </div>
                            </div>
                        </div>
                        <div class="col-12">
                            <div class="card">
                                <div class="card-body">
                                    <h5 class="card-title">Ordini</h5>
                                    <div class="table-responsive">
                                        <table class="table table-sm mb-0">
                                            <thead>
                                                <tr>
                                                    <th>ID</th>
                                                    <th>Data</th>
                                                    <th>Stato</th>
                                                    <th>Totale</th>
                                                </tr>
                                            </thead>
                                            <tbody>${ordersMarkup}</tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

window.viewUserDetails = async function (userId) {
  const body = document.getElementById("user-details-modal-body");
  if (!body) {
    return;
  }
  body.innerHTML =
    '<div class="text-center py-4 text-muted">Caricamento...</div>';
  userDetailsModal = getModalInstance("userDetailsModal", userDetailsModal);
  userDetailsModal?.show();

  try {
    let user = users.find((entry) => String(entry.id) === String(userId));
    if (isServerBackedAdminMode()) {
      const response = await requestJson(
        `${SERVER_BASE_URL}/api/admin/users/${userId}`,
        {},
        "Dettaglio utente non disponibile",
      );
      user = response.user || user;
    }
    body.innerHTML = user
      ? renderUserDetailsContent(user)
      : '<div class="text-center py-4 text-muted">Utente non trovato.</div>';
  } catch (error) {
    body.innerHTML = `<div class="text-center py-4 text-danger">${escapeAdminHtml(error.message || "Errore caricamento utente")}</div>`;
  }
};

window.openProductImagePreview = function (productId) {
  const product = products.find(
    (entry) => String(entry.id) === String(productId),
  );
  if (!product || !product.image) {
    alert("Nessuna immagine disponibile per questo prodotto.");
    return;
  }
  document.getElementById("image-preview-title").textContent =
    product.name || "Anteprima immagine";
  const imageElement = document.getElementById("image-preview-element");
  imageElement.src = product.image;
  imageElement.alt = product.name || "Anteprima prodotto";
  imagePreviewModal = getModalInstance("imagePreviewModal", imagePreviewModal);
  imagePreviewModal?.show();
};

window.updateProductImagePreview = function (value = "") {
  const wrapper = document.getElementById("product-image-preview-wrapper");
  const preview = document.getElementById("product-image-preview");
  const removeButton = document.getElementById("product-remove-image-button");
  const normalizedValue = String(value || "").trim();

  if (!wrapper || !preview || !removeButton) {
    return;
  }

  if (normalizedValue) {
    preview.src = normalizedValue;
    preview.alt = "Anteprima prodotto";
    wrapper.style.display = "block";
    removeButton.style.display = "inline-block";
    return;
  }

  preview.src = "";
  preview.alt = "";
  wrapper.style.display = "none";
  removeButton.style.display = "none";
};

window.removeProductImageSelection = function () {
  pendingImageRemoval = true;
  const imageInput = document.getElementById("product-image");
  const fileInput = document.getElementById("product-image-file");
  if (imageInput) {
    imageInput.value = "";
  }
  if (fileInput) {
    fileInput.value = "";
  }
  window.updateProductImagePreview("");
};

function resetProductModalState() {
  pendingImageRemoval = false;
  const form = document.getElementById("add-product-form");
  const fileInput = document.getElementById("product-image-file");
  const title = document.getElementById("product-modal-title");
  const submitButton = document.getElementById("product-submit-button");

  form?.reset();
  if (fileInput) {
    fileInput.value = "";
  }
  if (title) {
    title.textContent = editingProductId
      ? "Modifica Prodotto"
      : "Aggiungi Prodotto";
  }
  if (submitButton) {
    submitButton.textContent = editingProductId
      ? "Salva Modifiche"
      : "Aggiungi Prodotto";
  }
  window.updateProductImagePreview("");
}

window.showAddProductModal = function () {
  editingProductId = null;
  resetProductModalState();
  const modal = getModalInstance("addProductModal");
  modal?.show();
};

window.editProduct = function (productId) {
  const product = products.find(
    (entry) => String(entry.id) === String(productId),
  );
  if (!product) {
    alert("Prodotto non trovato.");
    return;
  }

  editingProductId = productId;
  resetProductModalState();

  document.getElementById("product-name").value = product.name || "";
  document.getElementById("product-category").value = product.category || "";
  document.getElementById("product-price").value = product.price || 0;
  document.getElementById("product-stock").value = product.stock || 0;
  document.getElementById("product-image").value = product.image || "";
  document.getElementById("product-description").value =
    product.description || "";
  window.updateProductImagePreview(product.image || "");

  const title = document.getElementById("product-modal-title");
  const submitButton = document.getElementById("product-submit-button");
  if (title) {
    title.textContent = "Modifica Prodotto";
  }
  if (submitButton) {
    submitButton.textContent = "Salva Modifiche";
  }

  const modal = getModalInstance("addProductModal");
  modal?.show();
};

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",").pop() : result);
    };
    reader.onerror = () => reject(new Error("Impossibile leggere il file"));
    reader.readAsDataURL(file);
  });
}

async function saveProductServer(payload, imageFile) {
  const existingProduct = products.find(
    (entry) => String(entry.id) === String(editingProductId),
  );
  const response = await requestJson(
    editingProductId
      ? `${SERVER_BASE_URL}/admin/products/${editingProductId}`
      : `${SERVER_BASE_URL}/admin/products`,
    {
      method: editingProductId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "Errore salvataggio prodotto",
  );
  const savedProduct = response.product || response;
  const productId = savedProduct?.id || editingProductId;

  if (!productId) {
    throw new Error("Impossibile determinare il prodotto salvato");
  }

  const shouldRemoveStoredImage =
    !imageFile &&
    !String(payload.image || "").trim() &&
    existingProduct &&
    String(existingProduct.image || "").startsWith("uploads/") &&
    pendingImageRemoval;

  if (shouldRemoveStoredImage) {
    await requestJson(
      `${SERVER_BASE_URL}/admin/products/${productId}/image`,
      { method: "DELETE" },
      "Errore rimozione immagine",
    );
  }

  if (imageFile) {
    const fileDataBase64 = await readFileAsBase64(imageFile);
    await requestJson(
      `${SERVER_BASE_URL}/admin/products/${productId}/image`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: imageFile.name,
          fileDataBase64: fileDataBase64,
        }),
      },
      "Errore caricamento immagine",
    );
  }
}

async function saveProductLocal(payload, imageFile) {
  const nextProducts = [...products];
  let nextImage = String(payload.image || "").trim();

  if (imageFile) {
    nextImage = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve(event.target?.result || "");
      reader.onerror = () =>
        reject(new Error("Impossibile leggere l'immagine locale"));
      reader.readAsDataURL(imageFile);
    });
  }

  if (editingProductId) {
    const index = nextProducts.findIndex(
      (entry) => String(entry.id) === String(editingProductId),
    );
    if (index === -1) {
      throw new Error("Prodotto non trovato");
    }
    nextProducts[index] = {
      ...nextProducts[index],
      ...payload,
      image: nextImage,
    };
  } else {
    nextProducts.unshift({
      ...payload,
      id: Date.now(),
      image: nextImage,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  products = nextProducts;
  saveData("products", products);
}

window.saveProduct = async function () {
  const name = document.getElementById("product-name")?.value.trim() || "";
  const category =
    document.getElementById("product-category")?.value.trim() || "";
  const price = Number(document.getElementById("product-price")?.value || 0);
  const stock = Number(document.getElementById("product-stock")?.value || 0);
  const image = document.getElementById("product-image")?.value.trim() || "";
  const description =
    document.getElementById("product-description")?.value.trim() || "";
  const imageFile =
    document.getElementById("product-image-file")?.files?.[0] || null;

  if (!name || !category || !Number.isFinite(price) || price < 0) {
    alert("Compila correttamente nome, categoria e prezzo.");
    return;
  }

  const payload = {
    name: name,
    category: category,
    price: price,
    stock: Math.max(0, Math.floor(stock)),
    image: image,
    description: description,
  };

  try {
    if (isServerBackedAdminMode()) {
      await saveProductServer(payload, imageFile);
    } else {
      await saveProductLocal(payload, imageFile);
    }
    pendingImageRemoval = false;
    const modal = bootstrap.Modal.getInstance(
      document.getElementById("addProductModal"),
    );
    modal?.hide();
    await loadDashboardData();
  } catch (error) {
    alert(error.message || "Errore salvataggio prodotto");
  }
};

window.deleteProduct = async function (productId) {
  if (!confirm("Vuoi davvero eliminare questo prodotto?")) {
    return;
  }

  try {
    if (isServerBackedAdminMode()) {
      await requestJson(
        `${SERVER_BASE_URL}/admin/products/${productId}`,
        { method: "DELETE" },
        "Errore eliminazione prodotto",
      );
    } else {
      products = products.filter(
        (entry) => String(entry.id) !== String(productId),
      );
      saveData("products", products);
    }
    await loadDashboardData();
  } catch (error) {
    alert(error.message || "Errore eliminazione prodotto");
  }
};

function resetUserModalState() {
  const form = document.getElementById("add-user-form");
  form?.reset();
  const roleField = document.getElementById("user-role");
  if (roleField) {
    roleField.value = "user";
  }
}

window.showAddUserModal = function () {
  resetUserModalState();
  addUserModal = getModalInstance("addUserModal", addUserModal);
  addUserModal?.show();
};

async function saveUserLocal({ name, email, password, role }) {
  const localUsers = loadData("users", {});
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  if (localUsers[normalizedEmail]) {
    throw new Error("Email gia in uso");
  }

  const passwordHash =
    typeof hashPassword === "function"
      ? await hashPassword(password)
      : password;

  localUsers[normalizedEmail] = {
    id: Date.now(),
    email: normalizedEmail,
    name: name,
    role: role,
    passwordHash: passwordHash,
    createdAt: new Date().toISOString(),
    addresses: [],
    paymentMethods: [],
    orders: [],
    sessionToken: null,
  };
  saveData("users", localUsers);
}

window.saveUser = async function () {
  const name = document.getElementById("user-name")?.value.trim() || "";
  const email = document.getElementById("user-email")?.value.trim() || "";
  const password = document.getElementById("user-password")?.value.trim() || "";
  const role =
    document.getElementById("user-role")?.value === "admin" ? "admin" : "user";

  if (!name || !email || !password) {
    alert("Compila tutti i campi dell'utente.");
    return;
  }

  try {
    if (isServerBackedAdminMode()) {
      await requestJson(
        `${SERVER_BASE_URL}/api/admin/users`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name,
            email: email,
            password: password,
            role: role,
          }),
        },
        "Errore creazione utente",
      );
    } else {
      await saveUserLocal({
        name: name,
        email: email,
        password: password,
        role: role,
      });
    }

    bootstrap.Modal.getInstance(
      document.getElementById("addUserModal"),
    )?.hide();
    await loadDashboardData();
  } catch (error) {
    alert(error.message || "Errore creazione utente");
  }
};

window.cleanTestAccounts = async function () {
  const targetDomain = "example.com";
  if (
    !confirm(
      `Vuoi eliminare tutti gli account di test con dominio ${targetDomain}?`,
    )
  ) {
    return;
  }

  try {
    let message = `Eliminati gli account con dominio ${targetDomain}.`;

    if (isServerBackedAdminMode()) {
      const response = await requestJson(
        `${SERVER_BASE_URL}/api/admin/users/mass-delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: targetDomain }),
        },
        "Errore pulizia account test",
      );
      message = response.message || message;
    } else {
      const localUsers = loadData("users", {});
      let deletedCount = 0;
      Object.keys(localUsers).forEach((email) => {
        if (
          email !== "admin@gmail.com" &&
          email.toLowerCase().endsWith(`@${targetDomain}`)
        ) {
          delete localUsers[email];
          deletedCount += 1;
        }
      });
      saveData("users", localUsers);
      message = `Eliminati ${deletedCount} utenti con dominio ${targetDomain}`;
    }

    await loadDashboardData();
    alert(message);
  } catch (error) {
    alert(error.message || "Errore pulizia account test");
  }
};

window.requestUserDeletion = function (userId) {
  const user = users.find((entry) => String(entry.id) === String(userId));
  if (!user) {
    alert("Utente non trovato.");
    return;
  }
  if (!canDeleteUser(user)) {
    alert("Questo utente non puo essere eliminato.");
    return;
  }

  pendingUserDeletion = user;
  const body = document.getElementById("delete-user-modal-body");
  if (body) {
    body.innerHTML = `
            <p class="mb-2">Stai per eliminare l'utente:</p>
            <div class="p-3 rounded bg-light">
                <div><strong>${escapeAdminHtml(user.name || "Utente")}</strong></div>
                <div class="text-muted">${escapeAdminHtml(user.email || "N/D")}</div>
            </div>
            <p class="text-danger small mt-3 mb-0">L'operazione rimuovera anche ordini, recensioni, indirizzi e metodi di pagamento collegati.</p>
        `;
  }
  deleteUserModal = getModalInstance("deleteUserModal", deleteUserModal);
  deleteUserModal?.show();
};

window.confirmDeleteUser = async function () {
  if (!pendingUserDeletion) {
    return;
  }

  try {
    if (isServerBackedAdminMode()) {
      await requestJson(
        `${SERVER_BASE_URL}/api/admin/users/${pendingUserDeletion.id}`,
        { method: "DELETE" },
        "Errore eliminazione utente",
      );
    } else {
      const localUsers = loadData("users", {});
      delete localUsers[String(pendingUserDeletion.email || "").toLowerCase()];
      saveData("users", localUsers);
    }
    pendingUserDeletion = null;
    bootstrap.Modal.getInstance(
      document.getElementById("deleteUserModal"),
    )?.hide();
    await loadDashboardData();
  } catch (error) {
    alert(error.message || "Errore eliminazione utente");
  }
};

window.downloadBackup = async function () {
  try {
    const response = await fetch(
      `${SERVER_BASE_URL}/api/admin/backup`,
      getAdminFetchOptions(),
    );
    if (!response.ok) {
      const data = await parseJsonResponse(
        response,
        "Errore durante il download del backup",
      );
      throw new Error(data?.error || "Errore durante il download del backup");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `shopnow_backup_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    alert(error.message || "Errore download backup");
  }
};

window.importBackup = async function (event) {
  const file = event.target?.files?.[0];
  if (!file) {
    return;
  }

  const confirmed = confirm(
    "ATTENZIONE: questa operazione sostituisce i dati attuali con quelli del backup selezionato. Vuoi continuare?",
  );
  if (!confirmed) {
    event.target.value = "";
    return;
  }

  try {
    const fileText = await file.text();
    const payload = JSON.parse(fileText);
    await requestJson(
      `${SERVER_BASE_URL}/api/admin/restore`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      "Errore durante il ripristino",
    );
    alert("Backup ripristinato con successo.");
    window.location.reload();
  } catch (error) {
    alert(error.message || "Errore import backup");
  } finally {
    event.target.value = "";
  }
};

function buildSalesSeries() {
  const grouped = new Map();
  orders.forEach((order) => {
    const key = parseDate(order.createdAt || order.date)
      .toISOString()
      .slice(0, 10);
    grouped.set(key, (grouped.get(key) || 0) + Number(order.total || 0));
  });
  const labels = Array.from(grouped.keys()).sort();
  const values = labels.map((label) => Number(grouped.get(label) || 0));
  return {
    labels: labels.length ? labels : ["Nessun dato"],
    values: values.length ? values : [0],
  };
}

function buildUsersGrowthSeries() {
  const grouped = new Map();
  users.forEach((user) => {
    const date = parseDate(user.createdAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0",
    )}`;
    grouped.set(key, (grouped.get(key) || 0) + 1);
  });

  const labels = Array.from(grouped.keys()).sort();
  let runningTotal = 0;
  const values = labels.map((label) => {
    runningTotal += Number(grouped.get(label) || 0);
    return runningTotal;
  });

  return {
    labels: labels.length ? labels : ["Nessun dato"],
    values: values.length ? values : [0],
  };
}

function destroyChart(chartInstance) {
  if (chartInstance) {
    chartInstance.destroy();
  }
}

function renderCharts() {
  if (typeof Chart === "undefined") {
    return;
  }

  destroyChart(ordersChartInstance);
  destroyChart(salesChartInstance);
  destroyChart(usersGrowthChartInstance);

  const ordersCtx = document.getElementById("ordersChart")?.getContext("2d");
  const salesCtx = document.getElementById("salesChart")?.getContext("2d");
  const usersGrowthCtx = document
    .getElementById("usersGrowthChart")
    ?.getContext("2d");

  if (ordersCtx) {
    ordersChartInstance = new Chart(ordersCtx, {
      type: "doughnut",
      data: {
        labels: ["Pagati", "In attesa"],
        datasets: [
          {
            data: [
              orders.filter((order) => String(order.status) === "paid").length,
              orders.filter((order) => String(order.status) !== "paid").length,
            ],
            backgroundColor: ["#22c55e", "#ff9900"],
          },
        ],
      },
      options: {
        plugins: {
          legend: { position: "bottom" },
        },
      },
    });
  }

  if (salesCtx) {
    const salesSeries = buildSalesSeries();
    salesChartInstance = new Chart(salesCtx, {
      type: "bar",
      data: {
        labels: salesSeries.labels,
        datasets: [
          {
            label: "Vendite",
            data: salesSeries.values,
            backgroundColor: "#0d6efd",
            borderRadius: 8,
          },
        ],
      },
      options: {
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: {
            beginAtZero: true,
          },
        },
      },
    });
  }

  if (usersGrowthCtx) {
    const usersGrowthSeries = buildUsersGrowthSeries();
    usersGrowthChartInstance = new Chart(usersGrowthCtx, {
      type: "line",
      data: {
        labels: usersGrowthSeries.labels,
        datasets: [
          {
            label: "Utenti cumulati",
            data: usersGrowthSeries.values,
            borderColor: "#198754",
            backgroundColor: "rgba(25, 135, 84, 0.15)",
            fill: true,
            tension: 0.25,
          },
        ],
      },
      options: {
        plugins: {
          legend: { position: "bottom" },
        },
        scales: {
          y: {
            beginAtZero: true,
          },
        },
      },
    });
  }
}

window.showSection = function (sectionName, event) {
  document.querySelectorAll(".section").forEach((section) => {
    const isActive = section.id === `${sectionName}-section`;
    section.style.display = isActive ? "block" : "none";
    section.classList.toggle("admin-section-hidden", !isActive);
  });
  document.querySelectorAll(".admin-nav .nav-link").forEach((link) => {
    link.classList.remove("active");
  });
  if (event?.currentTarget) {
    event.currentTarget.classList.add("active");
  }
  if (sectionName === "dashboard" || sectionName === "analytics") {
    window.setTimeout(renderCharts, 120);
  }
};

window.searchAdmin = function () {
  const query =
    document.getElementById("search-input")?.value.trim().toLowerCase() || "";
  if (!query) {
    renderUsersTable();
    renderProductsTable();
    renderOrdersTable();
    return;
  }

  const filteredUsers = users.filter((user) =>
    [user.name, user.email, user.role]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
  const filteredProducts = products.filter((product) =>
    [product.name, product.description, product.category]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
  const filteredOrders = orders.filter((order) =>
    [order.id, order.userName, order.userEmail, order.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );

  const resultGroups = [
    { key: "products", count: filteredProducts.length },
    { key: "users", count: filteredUsers.length },
    { key: "orders", count: filteredOrders.length },
  ].sort((left, right) => right.count - left.count);

  if (resultGroups[0].count === 0) {
    alert(`Nessun risultato trovato per: ${query}`);
    return;
  }

  const bestMatch = resultGroups[0].key;
  if (bestMatch === "products") {
    window.showSection("products");
    renderProductsTable(filteredProducts);
    return;
  }
  if (bestMatch === "users") {
    window.showSection("users");
    renderUsersTable(filteredUsers);
    return;
  }
  window.showSection("orders");
  renderOrdersTable(filteredOrders);
};

document.addEventListener("DOMContentLoaded", async () => {
  if (typeof initializeLocalDB === "function") {
    await initializeLocalDB();
  }

  if (!(await checkAdminAccess())) {
    return;
  }

  await loadDashboardData();
  window.showSection("dashboard");

  const imageInput = document.getElementById("product-image");
  const fileInput = document.getElementById("product-image-file");

  imageInput?.addEventListener("input", () => {
    if (pendingImageRemoval && imageInput.value.trim()) {
      pendingImageRemoval = false;
    }
    window.updateProductImagePreview(imageInput.value.trim());
  });

  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      window.updateProductImagePreview(imageInput?.value.trim() || "");
      return;
    }
    pendingImageRemoval = false;
    const reader = new FileReader();
    reader.onload = (event) => {
      window.updateProductImagePreview(event.target?.result || "");
    };
    reader.readAsDataURL(file);
  });

  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") window.searchAdmin();
    });
  }
  const searchBtn = document.getElementById("search-admin-btn");
  if (searchBtn) searchBtn.onclick = () => window.searchAdmin();

  document.addEventListener("click", (e) => {
    if (e.target.closest(".logout-link-global")) {
      e.preventDefault();
      window.logout();
    }
  });

  // Event listeners per la navigazione
  document
    .getElementById("nav-dashboard")
    ?.addEventListener("click", (e) => window.showSection("dashboard", e));
  document
    .getElementById("nav-users")
    ?.addEventListener("click", (e) => window.showSection("users", e));
  document
    .getElementById("nav-products")
    ?.addEventListener("click", (e) => window.showSection("products", e));
  document
    .getElementById("nav-orders")
    ?.addEventListener("click", (e) => window.showSection("orders", e));
  document
    .getElementById("nav-analytics")
    ?.addEventListener("click", (e) => window.showSection("analytics", e));
  document
    .getElementById("nav-settings")
    ?.addEventListener("click", (e) => window.showSection("settings", e));

  // Event listeners per i pulsanti delle modali
  document
    .getElementById("add-user-btn")
    ?.addEventListener("click", window.showAddUserModal);
  document
    .getElementById("save-user-btn")
    ?.addEventListener("click", window.saveUser);
  document
    .getElementById("add-product-btn")
    ?.addEventListener("click", window.showAddProductModal);
  document
    .getElementById("product-submit-button")
    ?.addEventListener("click", window.saveProduct);
  document
    .getElementById("confirm-delete-user-button")
    ?.addEventListener("click", window.confirmDeleteUser);

  // Event listeners per il backup
  document
    .getElementById("import-backup-btn")
    ?.addEventListener("click", () => {
      document.getElementById("import-backup-file")?.click();
    });
  document
    .getElementById("import-backup-file")
    ?.addEventListener("change", window.importBackup);
});

// Esponi funzioni globali per l'HTML (se necessario per onclick dinamici o per compatibilità)
window.showSection = showSection;
window.requestUserDeletion = requestUserDeletion;
window.cleanTestAccounts = cleanTestAccounts;
window.viewUserDetails = viewUserDetails;
window.openProductImagePreview = openProductImagePreview;
window.updateProductImagePreview = updateProductImagePreview;
window.removeProductImageSelection = removeProductImageSelection;
window.showAddProductModal = showAddProductModal;
window.editProduct = editProduct;
window.saveProduct = saveProduct;
window.deleteProduct = deleteProduct;
window.showAddUserModal = showAddUserModal;
window.saveUser = saveUser;
window.cleanTestAccounts = cleanTestAccounts;
window.requestUserDeletion = requestUserDeletion;
window.confirmDeleteUser = confirmDeleteUser;
window.downloadBackup = downloadBackup;
window.importBackup = importBackup;
window.searchAdmin = searchAdmin;

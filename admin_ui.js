function isServerBackedAdminMode() {
    return typeof prefersServerAuth === "function" ? prefersServerAuth() : "file:" !== window.location.protocol;
}
let SERVER_BASE_URL = typeof getServerBaseUrl === "function" ? getServerBaseUrl() : (window.location.hostname.includes('railway.app') ? "https://shopnow-production.up.railway.app" : "http://localhost:3000"),
    ADMIN_DASHBOARD_CACHE_KEY = "admin-dashboard-cache",
    currentUser = null, users = [], products = [], orders = [], stripeSummary = null, editingProductId = null,
    imagePreviewModal = null, userDetailsModal = null, deleteUserModal = null, pendingUserDeletion = null,
    pendingImageRemoval = !1, ordersChartInstance = null, salesChartInstance = null, usersGrowthChartInstance = null;

async function checkAdminAccess() {
    try {
        ((currentUser = await getCurrentUser()) && "admin" === currentUser.role) || (alert("Accesso negato."), window.location.href = "index.html");
    } catch (e) { window.location.href = "index.html"; }
}

async function loadDashboardData() {
    ((await loadDashboardDataFromServer()) || loadDashboardDataFromCache() || loadDashboardDataFromLocal(),
        updateDashboardStats(), renderUsersTable(), renderProductsTable(), renderOrdersTable(), renderCharts());
}

async function parseJsonResponse(e, t) {
    if ((e.headers.get("content-type") || "").includes("application/json")) return e.json();
    let txt = await e.text(); throw new Error(txt || t);
}

function getAdminFetchOptions(e = {}) {
    let t = typeof getSessionToken === "function" ? getSessionToken() : "";
    return { ...e, headers: { ...(e.headers || {}), ...(t ? { Authorization: "Bearer " + t } : {}) } };
}

window.openProductImagePreview = function(t) {
    let e = products.find((p) => String(p.id) === String(t));
    if (e) openImagePreview(e.image, e.name); else alert("Prodotto non trovato.");
};

function openImagePreview(e, t = "Anteprima") {
    if (!e) { alert("Nessuna immagine."); return; }
    document.getElementById("image-preview-title").textContent = t;
    let img = document.getElementById("image-preview-element");
    img.src = e; img.alt = t;
    (imagePreviewModal = imagePreviewModal || new bootstrap.Modal(document.getElementById("imagePreviewModal"))).show();
}

window.updateProductImagePreview = function(e = "") {
    let wrap = document.getElementById("product-image-preview-wrapper"),
        prev = document.getElementById("product-image-preview"),
        btn = document.getElementById("product-remove-image-button");
    let val = String(e || "").trim();
    if (val) { prev.src = val; wrap.style.display = "block"; btn.style.display = "inline-block"; }
    else { wrap.style.display = "none"; btn.style.display = "none"; }
};

window.removeProductImageSelection = function() {
    pendingImageRemoval = !0;
    document.getElementById("product-image").value = "";
    document.getElementById("product-image-file").value = "";
    window.updateProductImagePreview("");
};

function formatAdminCurrency(e) {
    return window.formatCurrency(e);
}

function renderUserStatusBadge(e) {
    let online = e?.sessionActive === true || (currentUser && e?.id === currentUser.id);
    return `<span class="admin-presence-badge ${online ? "online" : "offline"}"><span class="admin-presence-dot"></span>${online ? "Online" : "Offline"}</span>`;
}

window.viewUserDetails = async function(e) {
    let body = document.getElementById("user-details-modal-body");
    body.innerHTML = 'Caricamento...';
    (userDetailsModal = userDetailsModal || new bootstrap.Modal(document.getElementById("userDetailsModal"))).show();
    try {
        let user = null;
        if (isServerBackedAdminMode()) {
            let res = await fetch(SERVER_BASE_URL + "/api/admin/users/" + e, getAdminFetchOptions());
            let data = await parseJsonResponse(res, "Errore");
            user = data.user;
        } else {
            user = users.find(u => String(u.id) === String(e));
        }
        if (user) body.innerHTML = renderUserDetailsContent(user);
        else body.innerHTML = "Utente non trovato.";
    } catch (err) { body.innerHTML = "Errore."; }
};

function renderUserDetailsContent(e) {
    return `<div class="p-3"><h4>${e.name}</h4><p>${e.email}</p><p>Ruolo: ${e.role}</p></div>`;
}

async function loadDashboardDataFromServer() {
    if (!isServerBackedAdminMode()) return !1;
    try {
        let res = await fetch(SERVER_BASE_URL + "/api/admin/dashboard", getAdminFetchOptions());
        let data = await parseJsonResponse(res, "Dashboard non disponibile");
        if (res.ok) {
            users = data.users || []; products = data.products || []; orders = data.orders || [];
            saveDashboardCache(); return !0;
        }
    } catch (e) { console.warn(e); }
    return !1;
}

function loadDashboardDataFromCache() {
    try {
        let t = localStorage.getItem(ADMIN_DASHBOARD_CACHE_KEY);
        if (t) {
            let e = JSON.parse(t);
            users = e.users || []; products = e.products || []; orders = e.orders || [];
            return !0;
        }
    } catch (e) {} return !1;
}

function loadDashboardDataFromLocal() {
    users = Object.values(loadData("users", {}));
    products = getAllProducts();
    orders = users.flatMap(u => (u.orders || []).map(o => ({ ...o, userName: u.name, userEmail: u.email })));
    saveDashboardCache();
}

function saveDashboardCache() {
    localStorage.setItem(ADMIN_DASHBOARD_CACHE_KEY, JSON.stringify({ users, products, orders, stripeSummary, updatedAt: new Date().toISOString() }));
}

function updateDashboardStats() {
    document.getElementById("total-users").textContent = users.length;
    document.getElementById("total-products").textContent = products.length;
    document.getElementById("total-orders").textContent = orders.length;
    let rev = orders.reduce((s, o) => s + parseFloat(o.total || 0), 0);
    document.getElementById("total-revenue").textContent = "€" + rev.toFixed(2);
}

window.showSection = function(e, t) {
    document.querySelectorAll(".section").forEach(s => s.style.display = "none");
    document.querySelectorAll(".admin-nav .nav-link").forEach(l => l.classList.remove("active"));
    let target = document.getElementById(e + "-section");
    if (target) target.style.display = "block";
    if (t?.currentTarget) t.currentTarget.classList.add("active");
};

function renderUsersTable() {
    let body = document.getElementById("users-table-body");
    body.innerHTML = users.map(e => `
        <tr>
            <td><div class="user-avatar">${(e.name || "U").charAt(0).toUpperCase()}</div></td>
            <td>${e.name || "N/D"}</td>
            <td>${e.email}</td>
            <td>${renderUserStatusBadge(e)}</td>
            <td>${e.role}</td>
            <td>${new Date(e.createdAt || Date.now()).toLocaleDateString("it-IT")}</td>
            <td><button class="btn btn-sm btn-outline-primary" onclick="viewUserDetails('${e.id}')"><i class="fas fa-eye"></i></button></td>
        </tr>`).join("");
}

function renderProductsTable() {
    let body = document.getElementById("products-table-body");
    body.innerHTML = products.map(e => `
        <tr>
            <td><img src="${e.image || ''}" class="admin-product-image" style="width:40px" onclick="openProductImagePreview('${e.id}')"></td>
            <td>${e.name}</td>
            <td>${window.escapeHtml(e.category)}</td>
            <td>${formatAdminCurrency(e.price)}</td>
            <td>${e.stock}</td>
            <td>
                <button class="btn btn-sm btn-outline-warning" onclick="editProduct('${e.id}')"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteProduct('${e.id}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join("");
}

function renderOrdersTable() {
    let body = document.getElementById("orders-table-body");
    body.innerHTML = orders.map(e => `
        <tr>
            <td>${e.id}</td>
            <td>${e.userName}</td>
            <td>${new Date(e.createdAt || e.date).toLocaleDateString("it-IT")}</td> 
            <td>${formatAdminCurrency(e.total)}</td>
            <td>${e.status}</td>
            <td><button class="btn btn-sm btn-outline-primary" onclick="alert('Dettagli non disponibili')"><i class="fas fa-eye"></i></button></td>
        </tr>`).join("");
}

window.showAddProductModal = function() {
    editingProductId = null;
    document.getElementById("add-product-form").reset();
    document.getElementById("product-modal-title").textContent = "Aggiungi Prodotto";
    window.updateProductImagePreview("");
    new bootstrap.Modal(document.getElementById("addProductModal")).show();
};

window.saveProduct = async function() {
    let payload = {
        name: document.getElementById("product-name").value,
        category: document.getElementById("product-category").value,
        price: parseFloat(document.getElementById("product-price").value),
        stock: parseInt(document.getElementById("product-stock").value),
        image: document.getElementById("product-image").value,
        description: document.getElementById("product-description").value
    };
    try {
        if (isServerBackedAdminMode()) {
            let url = editingProductId ? SERVER_BASE_URL + "/admin/products/" + editingProductId : SERVER_BASE_URL + "/admin/products";
            let method = editingProductId ? "PUT" : "POST";
            let res = await fetch(url, getAdminFetchOptions({
                method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
            }));
            if (!res.ok) throw new Error("Errore salvataggio");
        } else {
            if (editingProductId) {
                let idx = products.findIndex(p => String(p.id) === String(editingProductId));
                products[idx] = { ...products[idx], ...payload };
            } else {
                payload.id = Date.now();
                products.push(payload);
            }
            saveData("products", products);
        }
        bootstrap.Modal.getInstance(document.getElementById("addProductModal")).hide();
        await loadDashboardData();
    } catch (e) { alert(e.message); }
};

window.editProduct = function(id) {
    let p = products.find(x => String(x.id) === String(id));
    if (!p) return;
    editingProductId = id;
    document.getElementById("product-name").value = p.name;
    document.getElementById("product-category").value = p.category;
    document.getElementById("product-price").value = p.price;
    document.getElementById("product-stock").value = p.stock;
    document.getElementById("product-image").value = p.image || "";
    document.getElementById("product-description").value = p.description || "";
    window.updateProductImagePreview(p.image);
    new bootstrap.Modal(document.getElementById("addProductModal")).show();
};

window.deleteProduct = async function(id) {
    if (!confirm("Sicuro?")) return;
    try {
        if (isServerBackedAdminMode()) {
            await fetch(SERVER_BASE_URL + "/admin/products/" + id, getAdminFetchOptions({ method: "DELETE" }));
        } else {
            products = products.filter(p => String(p.id) !== String(id));
            saveData("products", products);
        }
        await loadDashboardData();
    } catch (e) { alert("Errore"); }
};

window.downloadBackup = async function() {
    try {
        const res = await fetch(SERVER_BASE_URL + "/api/admin/backup", getAdminFetchOptions());
        if (!res.ok) throw new Error("Errore durante il download del backup");
        
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `shopnow_backup_${new Date().getTime()}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
    } catch (e) { alert(e.message); }
};

window.importBackup = async function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const confirmMsg = "ATTENZIONE: Questa operazione cancellerà TUTTI i dati attuali (utenti, ordini, prodotti) e li sostituirà con quelli del file selezionato.\n\nVuoi procedere?";
    if (!confirm(confirmMsg)) {
        event.target.value = "";
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            const res = await fetch(SERVER_BASE_URL + "/api/admin/restore", getAdminFetchOptions({
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            }));
            const result = await res.json();
            if (res.ok) {
                alert("Database ripristinato con successo! La pagina verrà ricaricata.");
                window.location.reload();
            } else { throw new Error(result.error || "Errore durante il ripristino"); }
        } catch (err) { alert("Errore: " + err.message); }
        finally { event.target.value = ""; }
    };
    reader.readAsText(file);
};

function renderCharts() {
    if (typeof Chart === "undefined") return;
    if (ordersChartInstance) ordersChartInstance.destroy();
    let ctx = document.getElementById("ordersChart")?.getContext("2d");
    if (!ctx) return;
    ordersChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Completati', 'Pendente'],
            datasets: [{ data: [orders.filter(o => o.status === 'paid').length, orders.filter(o => o.status !== 'paid').length], backgroundColor: ['#22c55e', '#ff9900'] }]
        }
    });
}

document.addEventListener("DOMContentLoaded", async function () {
    await initializeLocalDB();
    // Assicurati che i prodotti siano disponibili prima di caricare la dashboard
    if (typeof syncProductsFromServer === "function") {
        try {
            await syncProductsFromServer();
        } catch (error) {
            console.warn("Errore sync prodotti in admin_ui:", error.message);
        }
    }
    await checkAdminAccess();
    loadDashboardData();

    // Event listeners per l'upload immagine prodotto
    document.getElementById("product-image").addEventListener("input", () => {
        if (pendingImageRemoval && document.getElementById("product-image").value.trim()) {
            pendingImageRemoval = false;
        }
        window.updateProductImagePreview(document.getElementById("product-image").value.trim());
    });

    document.getElementById("product-image-file").addEventListener("change", async () => {
        pendingImageRemoval = false;
        const file = document.getElementById("product-image-file").files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => window.updateProductImagePreview(e.target.result);
            reader.readAsDataURL(file);
        } else {
            window.updateProductImagePreview(document.getElementById("product-image").value.trim());
        }
    });

    // Ricarica i grafici quando la sezione analytics diventa visibile
    const analyticsSection = document.getElementById("analytics-section");
    if (analyticsSection) {
        new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === "attributes" && mutation.attributeName === "class" && analyticsSection.classList.contains("admin-section-hidden") === false) {
                    setTimeout(renderCharts, 100);
                }
            });
        }).observe(analyticsSection, { attributes: true });
    }
});

window.searchAdmin = function() {
    let q = document.getElementById("search-input").value.toLowerCase();
    if (!q) { renderUsersTable(); renderProductsTable(); return; }
    let filteredU = users.filter(u => u.email.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q));
    let filteredP = products.filter(p => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q));

    // Mostra la sezione con più risultati o una predefinita
    if (filteredP.length > 0 || filteredU.length === 0) {
        window.showSection("products");
        renderProductsTable(filteredP);
        // Se ci sono risultati per i prodotti, non mostrare gli utenti filtrati nella sezione utenti
        if (filteredP.length > 0) return;
    }
    if (filteredU.length > 0 || filteredP.length === 0) {
        window.showSection("users");
        renderUsersTable(filteredU);
    }

    if (filteredP.length === 0 && filteredU.length === 0) {
        alert("Nessun risultato trovato per: " + q);
        loadDashboardData(); // Ricarica tutti i dati se non ci sono risultati
    }
};

// Funzioni di rendering filtrate (per la ricerca)
function renderFilteredUsersTable(filteredUsers) {
    let body = document.getElementById("users-table-body");
    body.innerHTML = filteredUsers.map(e => `
        <tr>
            <td><div class="user-avatar">${(e.name || "U").charAt(0).toUpperCase()}</div></td>
            <td>${window.escapeHtml(e.name || "N/D")}</td>
            <td>${window.escapeHtml(e.email)}</td>
            <td>${renderUserStatusBadge(e)}</td>
            <td>${window.escapeHtml(e.role)}</td>
            <td>${new Date(e.createdAt || Date.now()).toLocaleDateString("it-IT")}</td>
            <td><button class="btn btn-sm btn-outline-primary" onclick="viewUserDetails('${e.id}')"><i class="fas fa-eye"></i></button></td>
        </tr>`).join("");
}

function renderFilteredProductsTable(filteredProducts) {
    let body = document.getElementById("products-table-body");
    body.innerHTML = filteredProducts.map(e => `
        <tr>
            <td><img src="${window.escapeHtml(e.image || '')}" class="admin-product-image" style="width:40px" onclick="openProductImagePreview('${e.id}')"></td>
            <td>${window.escapeHtml(e.name)}</td>
            <td>${window.escapeHtml(e.category)}</td>
            <td>${window.formatCurrency(e.price)}</td>
            <td>${e.stock}</td>
            <td>
                <button class="btn btn-sm btn-outline-warning" onclick="editProduct('${e.id}')"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteProduct('${e.id}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join("");
}
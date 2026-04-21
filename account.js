document.addEventListener("DOMContentLoaded", async function () {
    const currentUser = await getCurrentUser();
    const profileSection = document.getElementById("profile-section"); 
    const accountMessage = document.getElementById("account-message");
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");
    const profileForm = document.getElementById("profile-form");
    const addressForm = document.getElementById("address-form");
    const addressList = document.getElementById("address-list");
    const paymentForm = document.getElementById("payment-form-account");
    const paymentList = document.getElementById("payment-list");
    const logoutButton = document.getElementById("logout-button");
    if (currentUser) showProfile(currentUser); else showAuthSection(); // showAuthSection è una funzione locale
    if (profileForm) {
        profileForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            clearMessage();
            const name = document.getElementById("profile-name").value.trim();
            try {
                await updateCurrentUser({ name: name });
                const user = await getCurrentUser();
                showProfile(user);
                showMessage("success", "Profilo aggiornato correttamente.");
            } catch (error) {
                showMessage("danger", error.message);
            }
        });
    }
    if (addressForm) {
        addressForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            clearMessage();
            const address = {
                line1: document.getElementById("address-line1").value.trim(),
                city: document.getElementById("address-city").value.trim(),
                postalCode: document
                    .getElementById("address-postal")
                    .value.trim(),
                country: window.normalizeCountryCode( // Usiamo la funzione globale
                    document.getElementById("address-country").value,
                ),
                phone: document.getElementById("address-phone").value.trim(),
            };
            if (
                !address.line1 ||
                !address.city ||
                !address.postalCode ||
                !address.country ||
                !address.phone
            ) {
                showMessage("danger", "Compila tutti i campi dell'indirizzo.");
                return;
            }
            try {
                await addAddress(address);
                const user = await getCurrentUser();
                showProfile(user);
                addressForm.reset();
                showMessage("success", "Indirizzo salvato.");
            } catch (error) {
                showMessage("danger", error.message);
            }
        });
    }
    if (addressList) {
        addressList.addEventListener("click", async function (event) {
            const deleteButton = event.target.closest("[data-address-index]");
            if (!deleteButton) return;
            clearMessage();
            try {
                await removeAddress(Number(deleteButton.dataset.addressIndex));
                const user = await getCurrentUser();
                showProfile(user);
                showMessage("success", "Indirizzo eliminato.");
            } catch (error) {
                showMessage("danger", error.message);
            }
        });
    }
    if (paymentForm) {
        paymentForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            clearMessage();
            const method = {
                alias: document.getElementById("card-alias").value.trim(),
                brand: document.getElementById("card-brand").value.trim(),
                last4: document.getElementById("card-last4").value.trim(),
                expiry: document.getElementById("card-expiry").value.trim(),
            };
            if (
                !method.alias ||
                !method.brand ||
                !method.last4 ||
                !method.expiry
            ) {
                showMessage(
                    "danger",
                    "Compila tutti i campi del metodo di pagamento.",
                );
                return;
            }
            try {
                await addPaymentMethod(method);
                const user = await getCurrentUser();
                showProfile(user);
                paymentForm.reset();
                showMessage("success", "Metodo di pagamento salvato.");
            } catch (error) {
                showMessage("danger", error.message);
            }
        });
    }
    if (paymentList) {
        paymentList.addEventListener("click", async function (event) {
            const deleteButton = event.target.closest("[data-payment-index]");
            if (!deleteButton) return;
            clearMessage();
            try {
                await removePaymentMethod(
                    Number(deleteButton.dataset.paymentIndex),
                );
                const user = await getCurrentUser();
                showProfile(user);
                showMessage("success", "Metodo di pagamento eliminato.");
            } catch (error) {
                showMessage("danger", error.message);
            }
        });
    }
    if (logoutButton) {
        logoutButton.addEventListener("click", function () {
            logoutUser();
            window.location.reload();
        });
    }
    function showAuthSection() {
        if (authSection) authSection.style.display = "block";
        if (profileSection) profileSection.style.display = "none";
    }
    function showProfile(user) {
        if (!user) {
            showAuthSection();
            return;
        }
        if (authSection) authSection.style.display = "none";
        if (profileSection) profileSection.style.display = "block";
        document.getElementById("profile-name").value = user.name || "";
        document.getElementById("profile-email-visible").value = user.email;
        document.getElementById("profile-email").textContent =
            `Email: ${user.email}`;
        document.getElementById("profile-created").textContent =
            `Account creato il ${new Date(user.createdAt).toLocaleDateString("it-IT")}`;
        renderAddressList(user.addresses || []);
        renderPaymentMethods(user.paymentMethods || []);
        renderOrders(user.orders || []);
        updateAuthNav();
    }
    function renderAddressList(addresses) {
        const addressList = document.getElementById("address-list");
        if (!addressList) return;
        if (addresses.length === 0) {
            addressList.innerHTML =
                '<p class="text-muted">Nessun indirizzo salvato.</p>';
            return;
        }
        addressList.innerHTML = addresses
            .map(
                (address, index) => `
            <div class="card mb-2 p-2">
                <div class="d-flex justify-content-between align-items-start gap-3">
                    <div>
                        <p class="mb-1"><strong>${address.line1}</strong></p>
                        <p class="mb-1">${address.postalCode} ${address.city}, ${address.country}</p>
                        <p class="mb-1">Tel: ${address.phone}</p>
                    </div>
                    <button type="button" class="btn btn-outline-danger btn-sm" data-address-index="${index}">Elimina</button>
                </div>
            </div>
        `,
            )
            .join("");
    }
    function renderPaymentMethods(methods) {
        const paymentList = document.getElementById("payment-list");
        if (!paymentList) return;
        if (methods.length === 0) {
            paymentList.innerHTML =
                '<p class="text-muted">Nessun metodo di pagamento salvato.</p>';
            return;
        }
        paymentList.innerHTML = methods
            .map(
                (method, index) => `
            <div class="card mb-2 p-2">
                <div class="d-flex justify-content-between align-items-start gap-3">
                    <div>
                        <p class="mb-1"><strong>${method.alias}</strong></p>
                        <p class="mb-1">${method.brand} • **** ${method.last4}</p>
                        <p class="mb-0"><small>Scadenza: ${method.expiry}</small></p>
                    </div>
                    <button type="button" class="btn btn-outline-danger btn-sm" data-payment-index="${index}">Elimina</button>
                </div>
            </div>
        `,
            )
            .join("");
    }
    async function renderOrders(orders) {
        const ordersHistory = document.getElementById("orders-history");
        if (!ordersHistory) return;
        if (orders.length === 0) {
            ordersHistory.innerHTML =
                '<p class="text-muted">Nessuna cronologia ordini presente.</p>';
            return;
        }
        try {
            const products =
                typeof getAllProducts === "function" && getAllProducts().length
                    ? getAllProducts()
                    : getDefaultProducts();
            ordersHistory.innerHTML = orders
                .map((order) => {
                    const normalizedItems = normalizeOrderItems(order.items);
                    const itemsHtml = normalizedItems
                        .map((item) => {
                            const product = products.find(
                                (p) => p.id == item.id,
                            );
                            const productName =
                                item.name ||
                                (product
                                    ? product.name
                                    : `Prodotto #${item.id}`);
                            return `<li>${productName} x${item.quantity}</li>`;
                        })
                        .join("");
                    const orderDate =
                        order.date || formatOrderDate(order.createdAt);
                    const orderTotal = Number(order.total || 0);
                    const orderStatus = order.status || "In lavorazione";
                    const shippingText = formatShippingAddress(
                        order.shippingAddress,
                    );
                    return `
                    <div class="card mb-3">
                        <div class="card-body">
                            <h5 class="card-title">Ordine #${order.id}</h5>
                            <p class="mb-1"><strong>Data:</strong> ${orderDate}</p>
                            <p class="mb-1"><strong>Totale:</strong> €${orderTotal.toFixed(2)}</p>
                            <p class="mb-1"><strong>Stato:</strong> ${orderStatus}</p>
                            ${shippingText ? `<p class="mb-2"><strong>Spedizione:</strong> ${shippingText}</p>` : ""}
                            <ul>${itemsHtml || "<li>Nessun articolo disponibile</li>"}</ul>
                        </div>
                    </div>
                `;
                })
                .join("");
        } catch (error) {
            console.error("Errore caricamento prodotti:", error);
            ordersHistory.innerHTML =
                '<p class="text-muted">Errore caricamento cronologia ordini.</p>';
        }
    }
    function showMessage(type, text) {
        if (!accountMessage) return;
        accountMessage.style.display = "block";
        accountMessage.className = `alert alert-${type}`;
        accountMessage.textContent = text;
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
    function clearMessage() {
        if (!accountMessage) return;
        accountMessage.style.display = "none";
        accountMessage.textContent = "";
    }

    // Funzioni di utilità locali (se non già globali, ora molte sono globali in auth.js)
    const normalizeOrderItems = (items) => {
        if (!Array.isArray(items)) return [];
        return items.map(item => ({ id: Number(item.id), name: item.name || "", quantity: Number(item.quantity || 0) })).filter(item => item.id && item.quantity > 0);
    };

    const formatOrderDate = (value) => {
        if (!value) return "Data non disponibile";
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("it-IT");
    };

    const formatShippingAddress = (shippingAddress) => {
        if (!shippingAddress) return "";
        let address = typeof shippingAddress === "string" ? JSON.parse(shippingAddress) : shippingAddress;
        if (!address || typeof address !== "object") return "";
        return [address.line1, address.postalCode, address.city, address.country].filter(Boolean).join(", ");
    };
});

document.addEventListener("DOMContentLoaded", async function () {
  const currentUser = await getCurrentUser();
  const authSection = document.getElementById("auth-section");
  const profileSection = document.getElementById("profile-section");
  const accountMessage = document.getElementById("account-message");
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const profileForm = document.getElementById("profile-form");
  const passwordForm = document.getElementById("password-form");
  const addressForm = document.getElementById("address-form");
  const addressList = document.getElementById("address-list");
  const paymentForm = document.getElementById("payment-form-account");
  const paymentList = document.getElementById("payment-list");
  const logoutButton = document.getElementById("logout-button");
  let addressAutofillTimer = null;
  let addressAutofillSequence = 0;
  let lastAutoFilledAddressCity = "";

  function combineStreetLine(street, streetNumber) {
    return [street, streetNumber]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" ");
  }

  function getAddressStreet(address) {
    const street = String(address?.street || address?.line1 || "").trim();
    const streetNumber = String(address?.streetNumber || "").trim();
    if (streetNumber && street.endsWith(` ${streetNumber}`)) {
      return street.slice(0, -streetNumber.length).trim();
    }
    if (!streetNumber) {
      const legacyMatch = street.match(
        /^(.*?)[,\s]+(\d+[A-Za-z]?(?:\/[A-Za-z0-9]+)?)$/,
      );
      if (legacyMatch) return legacyMatch[1].trim();
    }
    return street;
  }

  function getAddressStreetNumber(address) {
    const streetNumber = String(address?.streetNumber || "").trim();
    if (streetNumber) return streetNumber;
    const street = String(address?.street || address?.line1 || "").trim();
    const legacyMatch = street.match(
      /^(.*?)[,\s]+(\d+[A-Za-z]?(?:\/[A-Za-z0-9]+)?)$/,
    );
    return legacyMatch ? legacyMatch[2].trim() : "";
  }

  function normalizeCardLast4(value) {
    return String(value || "")
      .replace(/\D/g, "")
      .slice(-4);
  }

  function normalizeCardExpiry(value) {
    const digits = String(value || "")
      .replace(/\D/g, "")
      .slice(0, 4);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  function isValidCardExpiry(value) {
    const match = String(value || "").match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
    if (!match) return false;
    const month = Number(match[1]);
    const year = 2000 + Number(match[2]);
    const lastDay = new Date(year, month, 0);
    const today = new Date();
    today.setDate(1);
    today.setHours(0, 0, 0, 0);
    return lastDay >= today;
  }

  function initPaymentMethodInputs() {
    const last4Input = document.getElementById("card-last4");
    const expiryInput = document.getElementById("card-expiry");

    last4Input?.addEventListener("input", () => {
      last4Input.value = normalizeCardLast4(last4Input.value);
    });
    expiryInput?.addEventListener("input", () => {
      expiryInput.value = normalizeCardExpiry(expiryInput.value);
    });
  }

  function getAddressAutofillUrl(country, postalCode) {
    const query = new URLSearchParams({ country, postalCode });
    const path = `/api/address-autofill?${query.toString()}`;
    if (typeof window.getApiUrl === "function") return window.getApiUrl(path);
    if (typeof window.getServerBaseUrl === "function") {
      return `${window.getServerBaseUrl()}${path}`;
    }
    return path;
  }

  function canReplaceAddressCity(cityInput) {
    const currentCity = cityInput.value.trim();
    return !currentCity || currentCity === lastAutoFilledAddressCity;
  }

  async function runAddressAutofill() {
    const postalInput = document.getElementById("address-postal");
    const cityInput = document.getElementById("address-city");
    const countryInput = document.getElementById("address-country");
    if (!postalInput || !cityInput || !countryInput) return;

    const country =
      typeof window.normalizeCountryCode === "function"
        ? window.normalizeCountryCode(countryInput.value)
        : String(countryInput.value || "")
            .trim()
            .toUpperCase();
    const postalCode = postalInput.value.trim();
    if (!country || postalCode.length < 3) return;

    const sequence = ++addressAutofillSequence;
    postalInput.setAttribute("aria-busy", "true");

    try {
      const headers =
        typeof window.getApiRequestHeaders === "function"
          ? window.getApiRequestHeaders()
          : typeof window.getBackendRequestHeaders === "function"
            ? window.getBackendRequestHeaders()
            : {};
      const url = getAddressAutofillUrl(country, postalCode);
      const request =
        typeof window.fetchWithTimeout === "function"
          ? window.fetchWithTimeout(url, { headers }, 10000)
          : fetch(url, { headers });
      const response = await request;
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return;
      if (sequence !== addressAutofillSequence) return;

      const match = Array.isArray(data?.matches) ? data.matches[0] : null;
      if (match?.city && canReplaceAddressCity(cityInput)) {
        cityInput.value = match.city;
        lastAutoFilledAddressCity = match.city;
      }
    } catch (error) {
      // Auto-fill is optional; keep the form usable when the lookup fails.
    } finally {
      if (sequence === addressAutofillSequence) {
        postalInput.removeAttribute("aria-busy");
      }
    }
  }

  function scheduleAddressAutofill() {
    window.clearTimeout(addressAutofillTimer);
    addressAutofillTimer = window.setTimeout(runAddressAutofill, 350);
  }

  function initAddressAutofill() {
    const postalInput = document.getElementById("address-postal");
    const countryInput = document.getElementById("address-country");
    if (!postalInput || !countryInput) return;

    postalInput.addEventListener("input", scheduleAddressAutofill);
    postalInput.addEventListener("change", scheduleAddressAutofill);
    countryInput.addEventListener("input", scheduleAddressAutofill);
    countryInput.addEventListener("change", scheduleAddressAutofill);
  }

  initAddressAutofill();
  initPaymentMethodInputs();

  if (currentUser) showProfile(currentUser);
  else showAuthSection(); // showAuthSection è una funzione locale
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
  if (passwordForm) {
    passwordForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearMessage();
      const currentPassword = document
        .getElementById("current-password")
        .value.trim();
      const newPassword = document.getElementById("new-password").value.trim();
      const confirmPassword = document
        .getElementById("confirm-new-password")
        .value.trim();
      if (!currentPassword || !newPassword || !confirmPassword) {
        showMessage("danger", "Compila tutti i campi password.");
        return;
      }
      try {
        await changePassword(currentPassword, newPassword, confirmPassword);
        passwordForm.reset();
        showMessage("success", "Password aggiornata correttamente.");
      } catch (error) {
        showMessage("danger", error.message);
      }
    });
  }
  if (addressForm) {
    addressForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearMessage();
      const street = document.getElementById("address-street").value.trim();
      const streetNumber = document
        .getElementById("address-street-number")
        .value.trim();
      const address = {
        line1: combineStreetLine(street, streetNumber),
        street: street,
        streetNumber: streetNumber,
        city: document.getElementById("address-city").value.trim(),
        postalCode: document.getElementById("address-postal").value.trim(),
        country: window.normalizeCountryCode(
          document.getElementById("address-country").value,
        ),
        phone: document.getElementById("address-phone").value.trim(),
        isDefault: document.getElementById("address-default")?.checked === true,
      };
      if (
        !address.street ||
        !address.streetNumber ||
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
        last4: normalizeCardLast4(document.getElementById("card-last4").value),
        expiry: normalizeCardExpiry(
          document.getElementById("card-expiry").value,
        ),
        isDefault: document.getElementById("payment-default")?.checked === true,
      };
      if (!method.alias || !method.brand || !method.last4 || !method.expiry) {
        showMessage("danger", "Compila tutti i campi del metodo di pagamento.");
        return;
      }
      if (!/^\d{4}$/.test(method.last4)) {
        showMessage("danger", "Inserisci esattamente le ultime 4 cifre.");
        return;
      }
      if (!isValidCardExpiry(method.expiry)) {
        showMessage(
          "danger",
          "Inserisci una scadenza valida nel formato MM/AA.",
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
        await removePaymentMethod(Number(deleteButton.dataset.paymentIndex));
        const user = await getCurrentUser();
        showProfile(user);
        showMessage("success", "Metodo di pagamento eliminato.");
      } catch (error) {
        showMessage("danger", error.message);
      }
    });
  }
  if (logoutButton) {
    logoutButton.addEventListener("click", async function () {
      await logout();
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
      .map((address, index) => {
        const defaultBadge = address.isDefault
          ? '<span class="badge bg-success mb-2">Predefinito</span>'
          : "";
        return `
            <div class="card mb-2 p-2">
                <div class="d-flex justify-content-between align-items-start gap-3">
                    <div>
                        ${defaultBadge}
                        <p class="mb-1"><strong>${combineStreetLine(getAddressStreet(address), getAddressStreetNumber(address))}</strong></p>
                        <p class="mb-1">${address.postalCode} ${address.city}, ${address.country}</p>
                        <p class="mb-1">Tel: ${address.phone}</p>
                    </div>
                    <button type="button" class="btn btn-outline-danger btn-sm" data-address-index="${index}">Elimina</button>
                </div>
            </div>
        `;
      })
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
      .map((method, index) => {
        const defaultBadge = method.isDefault
          ? '<span class="badge bg-success mb-2">Predefinito</span>'
          : "";
        return `
            <div class="card mb-2 p-2">
                <div class="d-flex justify-content-between align-items-start gap-3">
                    <div>
                        ${defaultBadge}
                        <p class="mb-1"><strong>${method.alias}</strong></p>
                        <p class="mb-1">${method.brand} • **** ${method.last4}</p>
                        <p class="mb-0"><small>Scadenza: ${method.expiry}</small></p>
                    </div>
                    <button type="button" class="btn btn-outline-danger btn-sm" data-payment-index="${index}">Elimina</button>
                </div>
            </div>
        `;
      })
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
        .map((order, index) => {
          const normalizedItems = normalizeOrderItems(order.items);
          const itemsHtml = normalizedItems
            .map((item) => {
              const product = products.find((p) => p.id == item.id);
              const productName =
                item.name || (product ? product.name : `Prodotto #${item.id}`);
              return `<li>${productName} x${item.quantity}</li>`;
            })
            .join("");
          const orderDate = order.date || formatOrderDate(order.createdAt);
          const orderTotal = Number(order.total || 0);
          const orderStatus = order.status || "In lavorazione";
          const shippingText = formatShippingAddress(order.shippingAddress);
          const orderSequence = order.id;
          return `
                    <div class="card mb-3">
                        <div class="card-body">
                            <h5 class="card-title">Ordine personale #${orderSequence} <small class="text-muted">(ID: ${order.id})</small></h5>
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
    if (typeof items === "string") {
      try {
        items = JSON.parse(items);
      } catch (error) {
        return [];
      }
    }
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => ({
        id: Number(item.id),
        name: item.name || "",
        quantity: Number(item.quantity || 0),
      }))
      .filter((item) => item.id && item.quantity > 0);
  };

  const formatOrderDate = (value) => {
    if (!value) return "Data non disponibile";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleString("it-IT");
  };

  const formatShippingAddress = (shippingAddress) => {
    if (!shippingAddress) return "";
    let address =
      typeof shippingAddress === "string"
        ? JSON.parse(shippingAddress)
        : shippingAddress;
    if (!address || typeof address !== "object") return "";
    const line1 = combineStreetLine(
      getAddressStreet(address),
      getAddressStreetNumber(address),
    );
    return [line1, address.postalCode, address.city, address.country]
      .filter(Boolean)
      .join(", ");
  };
});

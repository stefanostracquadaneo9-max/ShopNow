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
  const paymentCount = document.getElementById("payment-count");
  const logoutButton = document.getElementById("logout-button");
  let addressAutofillTimer = null;
  let addressAutofillSequence = 0;
  let lastAutoFilledAddressCity = "";
  let accountStripeInstance = null;
  let accountStripeElements = null;
  let accountPaymentElement = null;
  let accountStripeScriptPromise = null;

  function escapeAccountHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

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

  function normalizePaymentBrand(value) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    const brands = {
      visa: "Visa",
      mastercard: "Mastercard",
      "master card": "Mastercard",
      amex: "American Express",
      "american express": "American Express",
      maestro: "Maestro",
      carta: "Carta",
    };
    return brands[normalized] || String(value || "").trim();
  }

  function getPaymentBrandClass(brand) {
    const normalized = String(brand || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-");
    if (
      ["visa", "mastercard", "american-express", "maestro"].includes(normalized)
    ) {
      return normalized;
    }
    return "generic";
  }

  function getPaymentBrandMark(brand) {
    const normalizedBrand = normalizePaymentBrand(brand);
    if (normalizedBrand === "American Express") return "AMEX";
    if (normalizedBrand === "Mastercard") return "MC";
    return normalizedBrand ? normalizedBrand.slice(0, 4).toUpperCase() : "CARD";
  }

  function getPaymentCountLabel(count) {
    if (count === 1) return "1 carta";
    return `${count} carte`;
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

  function getAccountApiUrl(path) {
    if (typeof window.getAuthApiUrl === "function") {
      return window.getAuthApiUrl(path);
    }
    if (typeof getAuthApiUrl === "function") {
      return getAuthApiUrl(path);
    }
    if (typeof window.getApiUrl === "function") return window.getApiUrl(path);
    return path;
  }

  function getAccountAuthHeaders(extraHeaders = {}) {
    if (typeof window.getAuthRequestHeaders === "function") {
      return window.getAuthRequestHeaders(extraHeaders);
    }
    if (typeof getAuthRequestHeaders === "function") {
      return getAuthRequestHeaders(extraHeaders);
    }
    return extraHeaders;
  }

  async function loadAccountStripeScript() {
    if (typeof window.Stripe === "function") return;
    if (accountStripeScriptPromise) return accountStripeScriptPromise;

    accountStripeScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://js.stripe.com/v3/";
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Errore caricamento Stripe SDK"));
      document.head.appendChild(script);
    });
    return accountStripeScriptPromise;
  }

  function showAccountPaymentError(message) {
    const errorBox = document.getElementById("account-payment-errors");
    if (errorBox) errorBox.textContent = message || "";
  }

  function normalizeAccountBillingCountry(value) {
    const normalized =
      typeof window.normalizeCountryCode === "function"
        ? window.normalizeCountryCode(value)
        : String(value || "")
            .trim()
            .toUpperCase();
    return /^[A-Z]{2}$/.test(normalized) ? normalized : "IT";
  }

  async function getAccountBillingCountry() {
    const user =
      typeof getCurrentUser === "function"
        ? await getCurrentUser()
        : currentUser;
    const addresses = Array.isArray(user?.addresses) ? user.addresses : [];
    const defaultAddress =
      addresses.find((address) => address.isDefault) || addresses[0];
    return normalizeAccountBillingCountry(
      defaultAddress?.country ||
        document.getElementById("address-country")?.value,
    );
  }

  async function initializeAccountPaymentElement() {
    const paymentElementContainer = document.getElementById(
      "account-payment-element",
    );
    if (!paymentForm || !paymentElementContainer || !currentUser) return;

    try {
      await loadAccountStripeScript();
      const configResponse = await fetch(getAccountApiUrl("/config"), {
        headers:
          typeof window.getApiRequestHeaders === "function"
            ? window.getApiRequestHeaders()
            : {},
      });
      const config = await configResponse.json().catch(() => ({}));
      if (
        !configResponse.ok ||
        !config.stripePublicKey ||
        String(config.stripePublicKey).includes("placeholder")
      ) {
        throw new Error("Stripe non configurato correttamente.");
      }

      const setupResponse = await fetch(
        getAccountApiUrl("/api/profile/setup-intent"),
        {
          method: "POST",
          headers: getAccountAuthHeaders({
            "Content-Type": "application/json",
          }),
        },
      );
      const setupData = await setupResponse.json().catch(() => ({}));
      if (!setupResponse.ok || !setupData.clientSecret) {
        throw new Error(
          setupData.error || "Impossibile inizializzare il salvataggio carta.",
        );
      }

      accountStripeInstance = window.Stripe(config.stripePublicKey);
      accountStripeElements = accountStripeInstance.elements({
        clientSecret: setupData.clientSecret,
        locale: "it",
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#e77600",
            colorBackground: "#ffffff",
            colorText: "#111111",
            fontFamily: '"Amazon Ember", Arial, sans-serif',
            fontSizeBase: "15px",
          },
        },
      });

      if (accountPaymentElement) {
        accountPaymentElement.destroy();
      }
      paymentElementContainer.classList.add("stripe-payment-element");
      paymentElementContainer.replaceChildren();
      accountPaymentElement = accountStripeElements.create("payment", {
        fields: {
          billingDetails: {
            name: "never",
            email: "never",
            address: "never",
          },
        },
        wallets: {
          applePay: "never",
          googlePay: "never",
        },
      });
      accountPaymentElement.mount(paymentElementContainer);
      showAccountPaymentError("");
    } catch (error) {
      const submitButton = paymentForm.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;
      showAccountPaymentError(
        error.message || "Pagamento non disponibile in questo momento.",
      );
    }
  }

  async function saveStripePaymentMethodFromAccount(method) {
    if (!accountStripeInstance || !accountStripeElements) {
      throw new Error("Sistema di pagamento non pronto.");
    }

    const submitResult = await accountStripeElements.submit();
    if (submitResult.error) {
      throw new Error(submitResult.error.message);
    }

    const billingCountry = await getAccountBillingCountry();
    const setupResult = await accountStripeInstance.confirmSetup({
      elements: accountStripeElements,
      redirect: "if_required",
      confirmParams: {
        payment_method_data: {
          billing_details: {
            name: method.alias,
            email: currentUser.email,
            address: {
              country: billingCountry,
            },
          },
        },
      },
    });
    if (setupResult.error) {
      throw new Error(setupResult.error.message);
    }
    if (
      !setupResult.setupIntent ||
      setupResult.setupIntent.status !== "succeeded"
    ) {
      throw new Error("Carta non confermata da Stripe.");
    }

    const response = await fetch(
      getAccountApiUrl("/api/profile/payment-methods/attach"),
      {
        method: "POST",
        headers: getAccountAuthHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          setupIntentId: setupResult.setupIntent.id,
          alias: method.alias,
          isDefault: method.isDefault,
        }),
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Errore salvataggio metodo pagamento");
    }
    if (
      typeof fetchCurrentUserFromServer === "function" &&
      typeof getSessionToken === "function"
    ) {
      await fetchCurrentUserFromServer(getSessionToken());
    }
    return data.paymentMethod;
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

  function getAddressCitySelect() {
    return document.getElementById("address-city-select");
  }

  function getUniqueAddressMatches(matches) {
    const unique = new Map();
    (Array.isArray(matches) ? matches : []).forEach((match) => {
      const city = String(match?.city || "").trim();
      if (!city) return;
      const key = [
        city.toLowerCase(),
        String(match?.state || match?.region || "")
          .trim()
          .toLowerCase(),
        String(match?.postalCode || "")
          .trim()
          .toUpperCase(),
      ].join("|");
      if (!unique.has(key)) unique.set(key, { ...match, city });
    });
    return Array.from(unique.values()).sort((a, b) =>
      String(a.city || "").localeCompare(String(b.city || ""), "it", {
        sensitivity: "base",
      }),
    );
  }

  function getAddressMatchLabel(match) {
    return [match.city, match.state || match.region]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" - ");
  }

  function resetAddressCityChoice(options = {}) {
    const select = getAddressCitySelect();
    const cityInput = document.getElementById("address-city");
    if (select) {
      select.replaceChildren();
      select.style.display = "none";
      select.required = false;
      select.value = "";
    }
    if (cityInput) {
      cityInput.readOnly = false;
      if (options.clearCity) cityInput.value = "";
    }
  }

  function renderAddressCityChoices(cityInput, matches) {
    const select = getAddressCitySelect();
    const uniqueMatches = getUniqueAddressMatches(matches);
    if (!select || uniqueMatches.length <= 1) {
      resetAddressCityChoice();
      return false;
    }

    const currentCity = cityInput.value.trim();
    const matchedCurrent = uniqueMatches.find(
      (match) => match.city.toLowerCase() === currentCity.toLowerCase(),
    );
    select.replaceChildren(
      new Option("Scegli comune o frazione", ""),
      ...uniqueMatches.map((match, index) => {
        const option = new Option(getAddressMatchLabel(match), String(index));
        option.dataset.city = match.city;
        return option;
      }),
    );
    select.required = true;
    select.style.display = "block";
    cityInput.readOnly = true;

    if (
      matchedCurrent &&
      currentCity &&
      currentCity !== lastAutoFilledAddressCity
    ) {
      select.value = String(uniqueMatches.indexOf(matchedCurrent));
      lastAutoFilledAddressCity = currentCity;
      return true;
    }

    if (canReplaceAddressCity(cityInput) || !matchedCurrent) {
      cityInput.value = "";
      lastAutoFilledAddressCity = "";
    }
    select.value = "";
    return true;
  }

  function handleAddressCityChoiceChange(event) {
    const cityInput = document.getElementById("address-city");
    const selectedOption =
      event.currentTarget?.options[event.currentTarget.selectedIndex];
    const city = selectedOption?.dataset?.city || "";
    if (!cityInput || !city) return;
    cityInput.value = city;
    lastAutoFilledAddressCity = city;
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

      const matches = Array.isArray(data?.matches) ? data.matches : [];
      if (renderAddressCityChoices(cityInput, matches)) return;

      const match = matches[0] || null;
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
    const cityInput = document.getElementById("address-city");
    const citySelect = getAddressCitySelect();
    if (!postalInput || !countryInput) return;

    postalInput.addEventListener("input", scheduleAddressAutofill);
    postalInput.addEventListener("change", scheduleAddressAutofill);
    countryInput.addEventListener("input", () => {
      resetAddressCityChoice();
      scheduleAddressAutofill();
    });
    countryInput.addEventListener("change", () => {
      resetAddressCityChoice();
      scheduleAddressAutofill();
    });
    cityInput?.addEventListener("input", () => {
      lastAutoFilledAddressCity = "";
    });
    citySelect?.addEventListener("change", handleAddressCityChoiceChange);
  }

  initAddressAutofill();
  initPaymentMethodInputs();

  if (currentUser) {
    showProfile(currentUser);
    await initializeAccountPaymentElement();
  } else showAuthSection(); // showAuthSection è una funzione locale
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
        resetAddressCityChoice({ clearCity: true });
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
      const submitButton = paymentForm.querySelector('button[type="submit"]');
      const method = {
        alias: document.getElementById("card-alias").value.trim(),
        isDefault: document.getElementById("payment-default")?.checked === true,
      };
      if (!method.alias) {
        showMessage("danger", "Inserisci il nome sulla carta.");
        return;
      }
      try {
        if (submitButton) {
          submitButton.disabled = true;
          submitButton.innerHTML =
            '<i class="fas fa-circle-notch fa-spin me-2"></i>Salvataggio...';
        }
        showAccountPaymentError("");
        await saveStripePaymentMethodFromAccount(method);
        const user = await getCurrentUser();
        showProfile(user);
        paymentForm.reset();
        await initializeAccountPaymentElement();
        showMessage("success", "Metodo di pagamento salvato.");
      } catch (error) {
        showAccountPaymentError(error.message);
        showMessage("danger", error.message);
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.innerHTML =
            '<i class="fas fa-plus me-2"></i>Aggiungi metodo';
        }
      }
    });
  }
  if (paymentList) {
    paymentList.addEventListener("click", async function (event) {
      const actionButton = event.target.closest("[data-payment-action]");
      if (!actionButton) return;
      const paymentIndex = Number(actionButton.dataset.paymentIndex);
      const paymentAction = actionButton.dataset.paymentAction;
      clearMessage();
      try {
        if (paymentAction === "default") {
          await setDefaultPaymentMethod(paymentIndex);
        } else if (paymentAction === "delete") {
          await removePaymentMethod(paymentIndex);
        } else {
          return;
        }
        const user = await getCurrentUser();
        showProfile(user);
        showMessage(
          "success",
          paymentAction === "default"
            ? "Metodo di pagamento predefinito aggiornato."
            : "Metodo di pagamento eliminato.",
        );
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
    if (paymentCount) {
      paymentCount.textContent = getPaymentCountLabel(methods.length);
    }
    if (methods.length === 0) {
      paymentList.innerHTML =
        '<div class="payment-empty-state"><i class="fas fa-credit-card"></i><span>Nessun metodo di pagamento salvato.</span></div>';
      return;
    }
    paymentList.innerHTML = methods
      .map((method, index) => {
        const alias = escapeAccountHtml(method.alias || "Carta salvata");
        const brand = normalizePaymentBrand(method.brand || "Carta");
        const brandText = escapeAccountHtml(brand);
        const last4 = escapeAccountHtml(normalizeCardLast4(method.last4));
        const expiry = escapeAccountHtml(normalizeCardExpiry(method.expiry));
        const brandClass = getPaymentBrandClass(brand);
        const brandMark = escapeAccountHtml(getPaymentBrandMark(brand));
        const defaultBadge = method.isDefault
          ? '<span class="payment-default-badge"><i class="fas fa-check"></i>Predefinito</span>'
          : "";
        const checkoutBadge = method.canUseInCheckout
          ? '<span class="payment-ready-badge"><i class="fas fa-shield-alt"></i>Checkout</span>'
          : '<span class="payment-legacy-badge">Aggiorna con Stripe</span>';
        const defaultAction = method.isDefault
          ? ""
          : `<button type="button" class="btn btn-link payment-action-link" data-payment-action="default" data-payment-index="${index}">Imposta come predefinito</button>`;
        return `
            <div class="payment-method-row ${method.isDefault ? "is-default" : ""}">
                <div class="payment-card-mark ${brandClass}" aria-hidden="true">${brandMark}</div>
                <div class="payment-method-main">
                    <div class="payment-method-title">
                        <strong>${alias}</strong>
                        ${defaultBadge}
                        ${checkoutBadge}
                    </div>
                    <div class="payment-method-meta">
                        ${brandText} terminante in ${last4}
                    </div>
                    <div class="payment-method-expiry">
                        Scadenza ${expiry}
                    </div>
                    <div class="payment-method-actions">
                        ${defaultAction}
                        <button type="button" class="btn btn-link payment-action-link text-danger" data-payment-action="delete" data-payment-index="${index}">Rimuovi</button>
                    </div>
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

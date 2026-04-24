/**
 * Gestione specifica della pagina Checkout
 */
let stripeInstance = null;
let stripeCardElement = null;

const ZIP_PATTERNS = {
  IT: /^\d{5}$/,
  US: /^\d{5}(-\d{4})?$/,
  GB: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i, // UK Postcode
  FR: /^\d{5}$/,
  DE: /^\d{5}$/,
  ES: /^\d{5}$/,
  CA: /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i, // Canada Postal Code
  AU: /^\d{4}$/,
  CH: /^\d{4}$/, // Switzerland
  AT: /^\d{4}$/, // Austria
  BE: /^\d{4}$/, // Belgium
  DK: /^\d{4}$/, // Denmark
  FI: /^\d{5}$/, // Finland
  NL: /^\d{4} ?[A-Z]{2}$/i, // Netherlands
  NO: /^\d{4}$/, // Norway
  SE: /^\d{3} ?\d{2}$/, // Sweden
  PT: /^\d{4}-\d{3}$/, // Portugal
  PL: /^\d{2}-\d{3}$/, // Poland
  BR: /^\d{5}-\d{3}$/, // Brazil
  MX: /^\d{5}$/, // Mexico
  JP: /^\d{3}-\d{4}$/, // Japan
  CN: /^\d{6}$/, // China
  IN: /^\d{6}$/, // India
  RU: /^\d{6}$/, // Russia
  ZA: /^\d{4}$/, // South Africa
  NZ: /^\d{4}$/, // New Zealand
  IE: /^([AC-FHKNPRTVW-Y]\d{2}|D6W)[ ,|\\-]?([0-9AC-FHKNPRTVW-Y]{4})$/i, // Irlanda (Eircode)
  IL: /^\d{5}(\d{2})?$/, // Israele
  KR: /^\d{5}$/, // Corea del Sud
};

function validatePostalCode() {
  const countryCode = document.getElementById("checkout-country")?.value;
  const postalInput = document.getElementById("checkout-postal");
  const feedback = document.getElementById("postal-feedback");

  if (!postalInput || !countryCode) return true;

  const pattern = ZIP_PATTERNS[countryCode];
  const value = postalInput.value.trim();

  // Se non abbiamo un pattern per il paese, accettiamo tutto (o mettiamo un check generico)
  if (!pattern) {
    postalInput.classList.remove("is-invalid");
    return true;
  }

  if (pattern.test(value)) {
    postalInput.classList.remove("is-invalid");
    postalInput.classList.add("is-valid");
    return true;
  } else {
    postalInput.classList.remove("is-valid");
    postalInput.classList.add("is-invalid");
    return false;
  }
}

async function initializeStripeCheckout() {
  if (
    typeof window.isStaticCheckoutMode === "function" &&
    window.isStaticCheckoutMode()
  ) {
    configureStaticCheckoutUi();
    return;
  }

  try {
    await loadStripeScript(); // Questa funzione è ora definita localmente
    const configResponse = await window.fetchWithTimeout(
      window.getApiUrl("/config"),
      {
        headers: window.getApiRequestHeaders(),
      },
    );
    const config = await configResponse.json();

    if (
      !configResponse.ok ||
      !config.stripePublicKey ||
      config.stripePublicKey.includes("placeholder")
    ) {
      throw new Error("Stripe non configurato correttamente sul server.");
    }

    const checkoutForm = document.getElementById("checkout-form");
    const cardElementContainer = document.getElementById("card-element");

    if (checkoutForm && cardElementContainer) {
      stripeInstance = window.Stripe(config.stripePublicKey);
      cardElementContainer.classList.add("stripe-card-element");

      const elements = stripeInstance.elements({
        locale: "it",
        appearance: {
          theme: "none",
          variables: {
            colorPrimary: "#e77600",
            colorBackground: "#ffffff",
            colorText: "#111111",
            fontFamily: '"Amazon Ember", Arial, sans-serif',
            fontSizeBase: "15px",
          },
        },
      });

      stripeCardElement = elements.create("card", {
        hidePostalCode: true,
        style: { base: { fontSize: "16px", color: "#111" } },
      });

      stripeCardElement.mount(cardElementContainer);
      stripeCardElement.on("focus", () =>
        cardElementContainer.classList.add("stripe-card-element--focus"),
      );
      stripeCardElement.on("blur", () =>
        cardElementContainer.classList.remove("stripe-card-element--focus"),
      );
    }
  } catch (err) {
    console.error("Errore Stripe:", err);
    window.showCheckoutMessage(
      "danger",
      "Impossibile caricare il sistema di pagamento.",
    );
  }
}

async function handleCheckoutSubmit(event) {
  event.preventDefault();

  if (!validatePostalCode()) {
    window.showCheckoutMessage(
      "danger",
      "Il CAP inserito non è valido per il paese selezionato.",
    );
    document.getElementById("checkout-postal").focus();
    return;
  }

  const name = document.getElementById("checkout-name")?.value.trim();
  const email = document.getElementById("checkout-email")?.value.trim();
  const street = document.getElementById("checkout-address")?.value.trim();
  const city = document.getElementById("checkout-city")?.value.trim();
  const postalCode = document.getElementById("checkout-postal")?.value.trim();
  const country = document.getElementById("checkout-country")?.value;

  if (!name || !email || !street || !city || !postalCode || !country) {
    window.showCheckoutMessage("danger", "Tutti i campi sono obbligatori.");
    return;
  }

  // Procedi con la logica di pagamento originale (ora chiamando le funzioni globali di cart.js)
  const { items, total } = window.getCartDetails();
  if (!items.length) {
    window.showCheckoutMessage("warning", "Il carrello è vuoto.");
    return;
  }

  window.setCheckoutLoading(true);
  document.getElementById("prog-step-2")?.classList.add("active");

  try {
    if (window.isStaticCheckoutMode()) {
      throw new Error("Stripe richiede un backend attivo.");
    }

    // 1. Creazione Payment Intent sul server
    const intentResponse = await window.fetchWithTimeout(
      window.getApiUrl("/create-payment-intent"),
      {
        method: "POST",
        headers: window.getApiRequestHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          amount: total,
          items,
          customerName: name,
          customerEmail: email,
        }),
      },
    );
    const intentData = await intentResponse.json();
    if (!intentResponse.ok)
      throw new Error(intentData.error || "Errore inizializzazione pagamento.");

    // 2. Conferma pagamento con Stripe
    const paymentResult = await stripeInstance.confirmCardPayment(
      intentData.clientSecret,
      {
        payment_method: {
          card: stripeCardElement,
          billing_details: {
            name,
            email,
            address: {
              line1: street,
              city: city,
              postal_code: postalCode,
              country: window.normalizeCountryCode(country),
            },
          },
        },
      },
    );

    if (paymentResult.error) throw new Error(paymentResult.error.message);

    // 3. Registrazione ordine nel DB
    const checkoutResponse = await window.fetchWithTimeout(
      window.getApiUrl("/api/checkout"),
      {
        method: "POST",
        headers: window.getApiRequestHeaders({
          "Content-Type": "application/json",
          Authorization: `Bearer ${typeof getSessionToken === "function" ? getSessionToken() : ""}`,
        }),
        body: JSON.stringify({
          paymentIntentId: paymentResult.paymentIntent.id,
          items,
          total,
          shippingAddress: { line1: street, city, postalCode, country },
          customerName: name,
          customerEmail: email,
        }),
      },
    );

    const data = await checkoutResponse.json();
    if (!checkoutResponse.ok)
      throw new Error(data.error || "Errore registrazione ordine.");

    // Successo!
    if (typeof clearLocalCart === "function") clearLocalCart();

    document.getElementById("prog-step-1")?.classList.add("completed");
    document.getElementById("prog-step-2")?.classList.add("completed");
    document.getElementById("prog-step-3")?.classList.add("active");

    if (typeof renderCart === "function") renderCart();
    if (typeof updateCartCount === "function") updateCartCount();

    window.showCheckoutMessage(
      "success",
      `Ordine #${data.order.id} confermato con successo!`,
    );
    if (typeof window.showToast === "function")
      window.showToast("Pagamento completato!");
  } catch (error) {
    window.showCheckoutMessage("danger", error.message);
  } finally {
    window.setCheckoutLoading(false);
  }
}

async function prefillCheckoutForm() {
  const user =
    typeof getCurrentUser === "function" ? await getCurrentUser() : null;
  if (!user) return;

  const fields = {
    "checkout-name": user.name,
    "checkout-email": user.email,
  };

  if (user.addresses && user.addresses.length > 0) {
    const addr = user.addresses[0];
    fields["checkout-address"] = addr.line1 || addr.street;
    fields["checkout-city"] = addr.city;
    fields["checkout-postal"] = addr.postalCode;

    if (addr.country) {
      const countryVal = window.normalizeCountryCode(addr.country); // Già corretto
      $("#checkout-country").val(countryVal).trigger("change");
    }
  }

  Object.keys(fields).forEach((id) => {
    const el = document.getElementById(id);
    if (el && !el.value && fields[id]) el.value = fields[id];
  });
}

// Funzioni ripristinate localmente per checkout.js
async function loadStripeScript() {
  if (typeof window.Stripe === "function") return;
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Errore caricamento Stripe SDK"));
    document.head.appendChild(script);
  });
}

function configureStaticCheckoutUi() {
  const btn = document.getElementById("checkout-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Modalità statica: Stripe disabilitato";
  }
  window.showCheckoutMessage(
    "warning",
    "Stripe richiede un backend configurato.",
  );
}

// Inizializzazione pagina
$(document).ready(async function () {
  // 1. Inizializza Select2
  $(".select2-enable").select2({
    placeholder: "Cerca un paese...",
    allowClear: true,
    width: "100%",
    language: { noResults: () => "Nessun paese trovato" },
  });

  // 2. Event Listeners per validazione CAP
  $("#checkout-country").on("change", validatePostalCode);
  $("#checkout-postal").on("input", validatePostalCode);

  // 3. Caricamento Stripe e Dati
  const checkoutForm = document.getElementById("checkout-form");
  if (checkoutForm) {
    checkoutForm.addEventListener("submit", handleCheckoutSubmit);
    await initializeStripeCheckout();
  }

  await prefillCheckoutForm();

  // 4. Gestione ricerca (rimossa da HTML inline)
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") window.searchProducts();
    });
  }
  const searchBtn = document.getElementById("search-btn");
  if (searchBtn) searchBtn.onclick = () => window.searchProducts();
});

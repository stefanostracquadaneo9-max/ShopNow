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

const CAP_TO_CITY = {
  // ITALIA
  "00100": "Roma",
  "20100": "Milano",
  "30100": "Venezia",
  "40100": "Bologna",
  "50100": "Firenze",
  "60100": "Ancona",
  "70100": "Bari",
  "80100": "Napoli",
  "90100": "Palermo",
  "95100": "Catania",
  "10100": "Torino",
  "16100": "Genova",
  "35100": "Padova",
  "37100": "Verona",
  "25100": "Brescia",
  "24100": "Bergamo",
  "21100": "Varese",
  "22100": "Como",
  "23100": "Lecco",
  "27100": "Pavia",
  "26100": "Cremona",
  "46100": "Mantova",
  "41100": "Modena",
  "42100": "Reggio Emilia",
  "43100": "Parma",
  "29100": "Piacenza",
  "51100": "Pistoia",
  "52100": "Arezzo",
  "53100": "Siena",
  "56100": "Pisa",
  "57100": "Livorno",
  "59100": "Prato",
  "62100": "Macerata",
  "63100": "Ascoli Piceno",
  "64100": "Teramo",
  "65100": "Pescara",
  "66100": "Chieti",
  "67100": "L'Aquila",
  "69100": "Frosinone",
  "03100": "Frosinone",
  "02100": "Rieti",
  "01100": "Viterbo",
  "04100": "Latina",
  "05100": "Terni",
  "06100": "Perugia",
  "06135": "Assisi",
  "07100": "Sassari",
  "08100": "Nuoro",
  "09100": "Cagliari",
  // FRANCIA
  "75001": "Parigi",
  "75008": "Parigi",
  "75016": "Parigi",
  "13000": "Marsiglia",
  "69000": "Lione",
  "31000": "Tolosa",
  "33000": "Bordeaux",
  "59000": "Lilla",
  "06000": "Nizza",
  "83000": "Tolone",
  "13100": "Aix-en-Provence",
  "38000": "Grenoble",
  "67000": "Strasburgo",
  "25000": "Besançon",
  "21000": "Digione",
  "49000": "Angers",
  "44000": "Nantes",
  "37000": "Tours",
  "45000": "Orléans",
  "41000": "Blois",
  "18000": "Bourges",
  "36000": "Châteauroux",
  "58000": "Nevers",
  "71000": "Mâcon",
  "86000": "Poitiers",
  "16000": "Angoulême",
  "87000": "Limoges",
  "23000": "Guéret",
  "19000": "Tulle",
  "24000": "Périgueux",
  "47000": "Agen",
  "40000": "Mont-de-Marsan",
  "64000": "Pau",
  "65000": "Tarbes",
  "81000": "Albi",
  "82000": "Montauban",
  "12000": "Rodez",
  "09000": "Foix",
  "66000": "Perpignano",
  "34000": "Montpellier",
  "30000": "Nîmes",
  "84000": "Avignone",
  "26000": "Valenza",
  "73000": "Chambéry",
  "74000": "Annecy",
  "05000": "Gap",
  "04000": "Digne-les-Bains",
  // GERMANIA
  "10115": "Berlino",
  "20095": "Monaco",
  "50667": "Colonia",
  "40213": "Düsseldorf",
  "45127": "Essen",
  "45130": "Essen",
  "60311": "Francoforte",
  "38100": "Hannover",
  "68161": "Mannheim",
  "69115": "Heidelberg",
  "70173": "Stoccarda",
  "72076": "Tubinga",
  "89073": "Ulma",
  "87435": "Kempten",
  "86150": "Augsburgo",
  "80331": "Monaco",
  "82319": "Starnberg",
  "83043": "Bad Aibling",
  "83646": "Bad Tölz",
  "81667": "Monaco",
  "85774": "Unterföhring",
  "91522": "Ansbach",
  "90402": "Norimberga",
  "90478": "Norimberga",
  "97070": "Würzburg",
  "97074": "Würzburg",
  "96047": "Bamberga",
  "96049": "Bamberga",
  "95444": "Bayreuth",
  "95448": "Bayreuth",
  "94028": "Passavia",
  "94032": "Passavia",
  "93047": "Ratisbona",
  "93049": "Ratisbona",
  "07745": "Jena",
  "07748": "Jena",
  "07743": "Jena",
  "99084": "Erfurt",
  "99085": "Erfurt",
  "99086": "Erfurt",
  "01067": "Dresda",
  "01069": "Dresda",
  "01307": "Dresda",
  "02826": "Görlitz",
  "02828": "Görlitz",
  "04109": "Lipsia",
  "04109": "Lipsia",
  "06108": "Halle",
  "06110": "Halle",
  "09111": "Chemnitz",
  "09113": "Chemnitz",
  // SPAGNA
  "28001": "Madrid",
  "28003": "Madrid",
  "28013": "Madrid",
  "08002": "Barcellona",
  "08003": "Barcellona",
  "08015": "Barcellona",
  "08041": "Barcellona",
  "46001": "Valencia",
  "46004": "Valencia",
  "41001": "Siviglia",
  "41002": "Siviglia",
  "41003": "Siviglia",
  "29005": "Malaga",
  "29009": "Malaga",
  "14001": "Cordova",
  "14005": "Cordova",
  "37001": "Salamanca",
  "37002": "Salamanca",
  "37008": "Salamanca",
  "40001": "Segovia",
  "40002": "Segovia",
  "47001": "Valladolid",
  "47002": "Valladolid",
  "49001": "Zamora",
  "49002": "Zamora",
  "39001": "Santander",
  "39003": "Santander",
  "39004": "Santander",
  "48001": "Bilbao",
  "48005": "Bilbao",
  "48008": "Bilbao",
  "20002": "San Sebastián",
  "20003": "San Sebastián",
  "20005": "San Sebastián",
  "31001": "Pamplona",
  "31002": "Pamplona",
  "22001": "Huesca",
  "22002": "Huesca",
  "50001": "Saragozza",
  "50003": "Saragozza",
  "50004": "Saragozza",
  "16001": "Cuenca",
  "16002": "Cuenca",
  "45001": "Toledo",
  "45002": "Toledo",
  "45003": "Toledo",
  "13001": "Ciudad Real",
  "13002": "Ciudad Real",
  "19001": "Guadalajara",
  "19002": "Guadalajara",
  "02001": "Albacete",
  "02002": "Albacete",
  "16260": "Buenache de la Sierra",
  "03001": "Alicante",
  "03002": "Alicante",
  "03003": "Alicante",
  "04001": "Almería",
  "04002": "Almería",
  "04003": "Almería",
  // REGNO UNITO
  "SW1A 1AA": "Londra",
  "SW1A 2AA": "Londra",
  "EC1A 1BB": "Londra",
  "W1A 1AA": "Londra",
  "WC2A 2AE": "Londra",
  "SE1 7AA": "Londra",
  "M1 1AD": "Manchester",
  "M2 3AB": "Manchester",
  "B1 1AA": "Birmingham",
  "B5 4SA": "Birmingham",
  "LS1 1PL": "Leeds",
  "LS2 8NG": "Leeds",
  "CF10 1SN": "Cardiff",
  "CF10 2EQ": "Cardiff",
  "EH1 3AA": "Edimburgo",
  "EH3 5AA": "Edimburgo",
  "BT1 5AA": "Belfast",
  "BT1 5GG": "Belfast",
  "E1 6AN": "Londra",
  "E14 5AB": "Londra",
  "CB1 1AA": "Cambridge",
  "CB2 1TN": "Cambridge",
  "OX1 1AA": "Oxford",
  "OX2 6GG": "Oxford",
  // STATI UNITI
  "10001": "New York",
  "10002": "New York",
  "10003": "New York",
  "10007": "New York",
  "90210": "Los Angeles",
  "90001": "Los Angeles",
  "90002": "Los Angeles",
  "90015": "Los Angeles",
  "60601": "Chicago",
  "60602": "Chicago",
  "60603": "Chicago",
  "75201": "Dallas",
  "75202": "Dallas",
  "75203": "Dallas",
  "77001": "Houston",
  "77002": "Houston",
  "77003": "Houston",
  "85001": "Phoenix",
  "85002": "Phoenix",
  "85003": "Phoenix",
  "19101": "Philadelphia",
  "19102": "Philadelphia",
  "19103": "Philadelphia",
  "78201": "San Antonio",
  "78202": "San Antonio",
  "92101": "San Diego",
  "92102": "San Diego",
  "92103": "San Diego",
  "75001": "Arlington",
  "75010": "Arlington",
  "94102": "San Francisco",
  "94103": "San Francisco",
  "94104": "San Francisco",
  "32801": "Orlando",
  "32802": "Orlando",
  "33101": "Miami",
  "33102": "Miami",
  "33103": "Miami",
  "77010": "Houston",
  "77011": "Houston",
  "75008": "Arlington",
  "75013": "Arlington",
  "60606": "Chicago",
  "60607": "Chicago",
  "98101": "Seattle",
  "98102": "Seattle",
  "98103": "Seattle",
  "80202": "Denver",
  "80203": "Denver",
  "80204": "Denver",
  "02101": "Boston",
  "02102": "Boston",
  "02103": "Boston",
  "55401": "Minneapolis",
  "55402": "Minneapolis",
  "55403": "Minneapolis",
  "37201": "Nashville",
  "37202": "Nashville",
  "37203": "Nashville",
  "70112": "New Orleans",
  "70113": "New Orleans",
  "70114": "New Orleans",
  "85004": "Phoenix",
  "85005": "Phoenix",
  "65101": "Jefferson City",
  "65102": "Jefferson City",
  "63101": "St. Louis",
  "63102": "St. Louis",
  "63103": "St. Louis",
  "64101": "Kansas City",
  "64102": "Kansas City",
  "64103": "Kansas City",
  "27601": "Raleigh",
  "27602": "Raleigh",
  "30301": "Atlanta",
  "30302": "Atlanta",
  "30303": "Atlanta",
  "60610": "Chicago",
  "60611": "Chicago",
};

const CITY_TO_CAP = {};
for (const [cap, city] of Object.entries(CAP_TO_CITY)) {
  CITY_TO_CAP[city.toLowerCase()] = cap;
}

function autoFillCityFromZipMultiCountry() {
  const country = document.getElementById("checkout-country")?.value;
  const zip = document.getElementById("checkout-postal")?.value.trim();
  const cityInput = document.getElementById("checkout-city");
  
  if (zip && CAP_TO_CITY[zip]) {
    cityInput.value = CAP_TO_CITY[zip];
  }
}

function autoFillZipFromCityMultiCountry() {
  const city = document.getElementById("checkout-city")?.value.trim().toLowerCase();
  const zipInput = document.getElementById("checkout-postal");
  
  if (city && CITY_TO_CAP[city]) {
    zipInput.value = CITY_TO_CAP[city];
  }
}

function autoFillCityFromZip() {
  const country = document.getElementById("checkout-country")?.value;
  if (country !== "IT") return;
  const zip = document.getElementById("checkout-postal")?.value.trim();
  const cityInput = document.getElementById("checkout-city");
  if (zip && CAP_TO_CITY[zip]) {
    cityInput.value = CAP_TO_CITY[zip];
  }
}

function autoFillZipFromCity() {
  const country = document.getElementById("checkout-country")?.value;
  if (country !== "IT") return;
  const city = document.getElementById("checkout-city")?.value.trim().toLowerCase();
  const zipInput = document.getElementById("checkout-postal");
  if (city && CITY_TO_CAP[city]) {
    zipInput.value = CITY_TO_CAP[city];
  }
}
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
    if (feedback) feedback.textContent = "";
    return true;
  } else {
    postalInput.classList.remove("is-valid");
    postalInput.classList.add("is-invalid");
    if (feedback) feedback.textContent = "Formato CAP non valido per questo paese.";
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
      const submitBtn = document.getElementById("checkout-btn");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Pagamento non disponibile";
      }
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

  // Verifica carrello vuoto subito
  const { items, total } = window.getCartDetails();
  if (!items || !items.length) {
    window.showCheckoutMessage("warning", "Il carrello è vuoto.");
    return;
  }

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
  // Funzione per formattare le opzioni di Select2 con le bandiere
  function formatCountry(country) {
    if (!country.id) return country.text;
    
    const code = country.id.toLowerCase();
    // Utilizziamo flagcdn.com per le immagini delle bandiere basate sul codice ISO
    return $(
      `<span><img src="https://flagcdn.com/20x15/${code}.png" 
            class="img-flag" 
            style="margin-right: 10px; border-radius: 2px; vertical-align: middle; box-shadow: 0 1px 2px rgba(0,0,0,0.1);" /> 
        ${country.text}</span>`
    );
  }

  // 1. Inizializza Select2
  $(".select2-enable").select2({
    placeholder: "Cerca un paese...",
    allowClear: true,
    width: "100%",
    language: { noResults: () => "Nessun paese trovato" },
    templateResult: formatCountry,
    templateSelection: formatCountry
  });

  // 2. Event Listeners per validazione CAP
  $("#checkout-country").on("change", validatePostalCode);
  $("#checkout-postal").on("input", validatePostalCode);
  $("#checkout-postal").on("input", autoFillCityFromZipMultiCountry);
  $("#checkout-city").on("input", autoFillZipFromCityMultiCountry);
  $("#checkout-country").on("change", function() {
    document.getElementById("checkout-postal").value = "";
    document.getElementById("checkout-city").value = "";
  });

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

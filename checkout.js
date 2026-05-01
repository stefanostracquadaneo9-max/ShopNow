/**
 * Gestione specifica della pagina Checkout
 */
let stripeInstance = null;
let stripeElements = null;
let stripePaymentElement = null;
let stripePaymentIntentId = null;
let stripePaymentIntentClientSecret = null;
let stripePaymentFingerprint = "";
let checkoutAutoFillLock = false;
let checkoutAddressLookupTimer = null;
let checkoutAddressLookupSequence = 0;
let checkoutLastAutoFilledCity = "";
let checkoutLastAutoFilledPostal = "";
let checkoutPageInitialized = false;
let stripeScriptPromise = null;
let checkoutCurrentUser = null;
let checkoutSavedPaymentMethods = [];
let checkoutPaymentConfig = null;
let checkoutSelectedPaymentType = "";
const CHECKOUT_ADDRESS_LOOKUP_DEBOUNCE_MS = 350;
const CHECKOUT_ADDRESS_LOOKUP_CACHE = new Map();
const PENDING_CHECKOUT_KEY = "shopnow-pending-checkout";
const PENDING_CHECKOUT_MAX_AGE_MS = 3 * 60 * 60 * 1000;

function getCountryFlagEmoji(code) {
  if (!code || typeof code !== "string") return "";
  const normalized = String(code).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return "";
  return String.fromCodePoint(
    ...[...normalized].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65),
  );
}

function getJQuery() {
  return typeof window.jQuery === "function"
    ? window.jQuery
    : typeof window.$ === "function"
      ? window.$
      : null;
}

function getCountryLabel(country) {
  const code = String(country.id || "").toUpperCase();
  const name = String(country.text || "").trim();
  return `${code} ${name}`.trim();
}

function getCountryFlagImageUrl(code, size = "24x18") {
  const normalizedCode = String(code || "")
    .trim()
    .toLowerCase();
  if (!/^[a-z]{2}$/.test(normalizedCode)) return "";
  return `https://flagcdn.com/${size}/${normalizedCode}.png`;
}

function createCountryFlagElement($, code) {
  const normalizedCode = String(code || "").toUpperCase();
  const wrapper = $("<span>").addClass("country-flag-wrap");
  const fallback = $("<span>")
    .addClass("country-code-badge country-code-badge--fallback")
    .text(normalizedCode);
  const flagUrl = getCountryFlagImageUrl(normalizedCode);

  if (!flagUrl) {
    fallback.addClass("is-visible");
    return wrapper.append(fallback);
  }

  const image = $("<img>")
    .addClass("country-flag-image")
    .attr({
      src: flagUrl,
      srcset: `${getCountryFlagImageUrl(normalizedCode, "48x36")} 2x`,
      alt: "",
      loading: "lazy",
      decoding: "async",
    })
    .on("error", function () {
      $(this).addClass("is-hidden");
      fallback.addClass("is-visible");
    });

  return wrapper.append(image).append(fallback);
}

function formatCountry(country) {
  if (!country.id) return country.text;
  const $ = getJQuery();
  if (!$) return getCountryLabel(country);
  return $("<span>")
    .addClass("country-option")
    .append(createCountryFlagElement($, country.id))
    .append($("<span>").text(String(country.text || "").trim()));
}

function formatCountrySelection(country) {
  return country.id ? formatCountry(country) : country.text;
}

function initializeCountrySelect() {
  const countrySelect = document.getElementById("checkout-country");
  const $ = getJQuery();
  if (!countrySelect || !$ || !$.fn.select2) return;

  const options = Array.from(countrySelect.options);
  const placeholder = options.find((option) => !option.value);
  const countryOptions = options
    .filter((option) => option.value)
    .sort((a, b) =>
      a.textContent.trim().localeCompare(b.textContent.trim(), "it", {
        sensitivity: "base",
      }),
    );

  countrySelect.replaceChildren(
    ...[placeholder].filter(Boolean),
    ...countryOptions,
  );
  $(countrySelect).select2({
    placeholder: "Cerca un paese...",
    allowClear: true,
    width: "100%",
    language: { noResults: () => "Nessun paese trovato" },
    templateResult: formatCountry,
    templateSelection: formatCountrySelection,
  });
}

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

function normalizeCheckoutCountryCode(value) {
  if (typeof window.normalizeCountryCode === "function") {
    return window.normalizeCountryCode(value);
  }
  return String(value || "")
    .trim()
    .toUpperCase();
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

function canReplaceCheckoutCity(cityInput) {
  const currentCity = cityInput.value.trim();
  return !currentCity || currentCity === checkoutLastAutoFilledCity;
}

function canReplaceCheckoutPostal(postalInput) {
  const currentPostal = postalInput.value.trim();
  return !currentPostal || currentPostal === checkoutLastAutoFilledPostal;
}

function applyCheckoutCityAutofill(cityInput, city) {
  const normalizedCity = String(city || "").trim();
  if (!normalizedCity || !canReplaceCheckoutCity(cityInput)) return false;

  checkoutAutoFillLock = true;
  cityInput.value = normalizedCity;
  checkoutLastAutoFilledCity = normalizedCity;
  cityInput.dispatchEvent(new Event("change", { bubbles: true }));
  checkoutAutoFillLock = false;
  return true;
}

function applyCheckoutPostalAutofill(postalInput, postalCode) {
  const normalizedPostalCode = String(postalCode || "").trim();
  if (!normalizedPostalCode || !canReplaceCheckoutPostal(postalInput)) {
    return false;
  }

  checkoutAutoFillLock = true;
  postalInput.value = normalizedPostalCode;
  checkoutLastAutoFilledPostal = normalizedPostalCode;
  postalInput.dispatchEvent(new Event("change", { bubbles: true }));
  checkoutAutoFillLock = false;
  return true;
}

function clearCheckoutAutoFilledCity(cityInput) {
  resetCheckoutCityChoice(cityInput, { clearCity: false });
  if (!checkoutLastAutoFilledCity) return;
  if (cityInput.value.trim() !== checkoutLastAutoFilledCity) return;

  checkoutAutoFillLock = true;
  cityInput.value = "";
  cityInput.dispatchEvent(new Event("change", { bubbles: true }));
  checkoutAutoFillLock = false;
  checkoutLastAutoFilledCity = "";
}

function clearCheckoutAutoFilledPostal(postalInput) {
  if (!checkoutLastAutoFilledPostal) return;
  if (postalInput.value.trim() !== checkoutLastAutoFilledPostal) return;

  checkoutAutoFillLock = true;
  postalInput.value = "";
  postalInput.dispatchEvent(new Event("change", { bubbles: true }));
  checkoutAutoFillLock = false;
  checkoutLastAutoFilledPostal = "";
}

function getCheckoutCitySelect() {
  return document.getElementById("checkout-city-select");
}

function normalizeAddressMatchKey(match) {
  return [
    String(match?.city || "")
      .trim()
      .toLowerCase(),
    String(match?.state || match?.region || "")
      .trim()
      .toLowerCase(),
    String(match?.postalCode || "")
      .trim()
      .toUpperCase(),
  ].join("|");
}

function getUniqueAddressMatches(matches) {
  const unique = new Map();
  (Array.isArray(matches) ? matches : []).forEach((match) => {
    const city = String(match?.city || "").trim();
    if (!city) return;
    const key = normalizeAddressMatchKey(match);
    if (!unique.has(key)) unique.set(key, { ...match, city });
  });
  return Array.from(unique.values()).sort((a, b) =>
    String(a.city || "").localeCompare(String(b.city || ""), "it", {
      sensitivity: "base",
    }),
  );
}

function getAddressMatchLabel(match, options = {}) {
  const parts = [match.city, match.state || match.region];
  if (options.includePostalCode && match.postalCode) {
    parts.push(match.postalCode);
  }
  return parts
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" - ");
}

function resetCheckoutCityChoice(cityInput, options = {}) {
  const select = getCheckoutCitySelect();
  if (select) {
    select.replaceChildren();
    select.style.display = "none";
    select.required = false;
    select.value = "";
  }
  if (cityInput) {
    cityInput.readOnly = false;
    if (options.clearCity) {
      checkoutAutoFillLock = true;
      cityInput.value = "";
      cityInput.dispatchEvent(new Event("change", { bubbles: true }));
      checkoutAutoFillLock = false;
    }
  }
}

function renderCheckoutCityChoices(cityInput, matches, options = {}) {
  const select = getCheckoutCitySelect();
  const uniqueMatches = getUniqueAddressMatches(matches);
  if (!select || uniqueMatches.length <= 1) {
    resetCheckoutCityChoice(cityInput, { clearCity: false });
    return false;
  }

  const currentCity = cityInput.value.trim();
  const matchedCurrent = uniqueMatches.find(
    (match) => match.city.toLowerCase() === currentCity.toLowerCase(),
  );
  const placeholder = new Option("Scegli comune o frazione", "");
  select.replaceChildren(
    placeholder,
    ...uniqueMatches.map((match, index) => {
      const option = new Option(
        getAddressMatchLabel(match, {
          includePostalCode: Boolean(options.includePostalCode),
        }),
        String(index),
      );
      option.dataset.city = match.city;
      option.dataset.postalCode = match.postalCode || "";
      return option;
    }),
  );
  select.required = true;
  select.style.display = "block";
  cityInput.readOnly = true;

  if (
    matchedCurrent &&
    currentCity &&
    currentCity !== checkoutLastAutoFilledCity
  ) {
    select.value = String(uniqueMatches.indexOf(matchedCurrent));
    checkoutLastAutoFilledCity = currentCity;
    return true;
  }

  if (
    !options.keepCurrentCity &&
    (canReplaceCheckoutCity(cityInput) || !matchedCurrent)
  ) {
    checkoutAutoFillLock = true;
    cityInput.value = "";
    cityInput.dispatchEvent(new Event("change", { bubbles: true }));
    checkoutAutoFillLock = false;
    checkoutLastAutoFilledCity = "";
  }
  select.value = "";
  return true;
}

function handleCheckoutCityChoiceChange(event) {
  const select = event.currentTarget;
  const cityInput = document.getElementById("checkout-city");
  const postalInput = document.getElementById("checkout-postal");
  if (!select || !cityInput) return;
  const selectedOption = select.options[select.selectedIndex];
  const city = selectedOption?.dataset?.city || "";
  const postalCode = selectedOption?.dataset?.postalCode || "";
  if (!city) return;
  checkoutAutoFillLock = true;
  cityInput.value = city;
  checkoutLastAutoFilledCity = city;
  cityInput.dispatchEvent(new Event("change", { bubbles: true }));
  if (postalInput && postalCode) {
    postalInput.value = postalCode;
    checkoutLastAutoFilledPostal = postalCode;
    postalInput.dispatchEvent(new Event("change", { bubbles: true }));
  }
  checkoutAutoFillLock = false;
}

function setCheckoutAddressLookupBusy(postalInput, isBusy) {
  if (!postalInput) return;
  if (isBusy) {
    postalInput.setAttribute("aria-busy", "true");
  } else {
    postalInput.removeAttribute("aria-busy");
  }
}

async function fetchCheckoutAddressLookup(country, postalCode) {
  const cacheKey = `${country}:${postalCode.toUpperCase()}`;
  if (CHECKOUT_ADDRESS_LOOKUP_CACHE.has(cacheKey)) {
    return CHECKOUT_ADDRESS_LOOKUP_CACHE.get(cacheKey);
  }

  const query = new URLSearchParams({
    country,
    postalCode,
  });
  const url =
    typeof window.getApiUrl === "function"
      ? window.getApiUrl(`/api/address-autofill?${query.toString()}`)
      : `/api/address-autofill?${query.toString()}`;
  const headers =
    typeof window.getApiRequestHeaders === "function"
      ? window.getApiRequestHeaders()
      : {};
  const request =
    typeof window.fetchWithTimeout === "function"
      ? window.fetchWithTimeout(url, { headers }, 10000)
      : fetch(url, { headers });

  const response = await request;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Auto-fill indirizzo non disponibile");
  }

  CHECKOUT_ADDRESS_LOOKUP_CACHE.set(cacheKey, data);
  return data;
}

async function fetchCheckoutCityLookup(country, city) {
  const normalizedCity = String(city || "").trim();
  const cacheKey = `city:${country}:${normalizedCity.toUpperCase()}`;
  if (CHECKOUT_ADDRESS_LOOKUP_CACHE.has(cacheKey)) {
    return CHECKOUT_ADDRESS_LOOKUP_CACHE.get(cacheKey);
  }

  const query = new URLSearchParams({
    country,
    city: normalizedCity,
  });
  const url =
    typeof window.getApiUrl === "function"
      ? window.getApiUrl(`/api/address-autofill?${query.toString()}`)
      : `/api/address-autofill?${query.toString()}`;
  const headers =
    typeof window.getApiRequestHeaders === "function"
      ? window.getApiRequestHeaders()
      : {};
  const request =
    typeof window.fetchWithTimeout === "function"
      ? window.fetchWithTimeout(url, { headers }, 10000)
      : fetch(url, { headers });

  const response = await request;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Auto-fill indirizzo non disponibile");
  }

  CHECKOUT_ADDRESS_LOOKUP_CACHE.set(cacheKey, data);
  return data;
}

async function runCheckoutAddressLookup(
  country,
  postalCode,
  postalInput,
  cityInput,
) {
  const sequence = ++checkoutAddressLookupSequence;
  setCheckoutAddressLookupBusy(postalInput, true);

  try {
    const data = await fetchCheckoutAddressLookup(country, postalCode);
    if (sequence !== checkoutAddressLookupSequence) return;

    const matches = Array.isArray(data?.matches) ? data.matches : [];
    if (renderCheckoutCityChoices(cityInput, matches)) return;

    const match = matches[0] || null;
    if (match?.city) {
      applyCheckoutCityAutofill(cityInput, match.city);
      return;
    }

    clearCheckoutAutoFilledCity(cityInput);
  } catch (error) {
    if (sequence !== checkoutAddressLookupSequence) return;
  } finally {
    if (sequence === checkoutAddressLookupSequence) {
      setCheckoutAddressLookupBusy(postalInput, false);
    }
  }
}

async function runCheckoutCityLookup(country, city, cityInput, postalInput) {
  const sequence = ++checkoutAddressLookupSequence;
  setCheckoutAddressLookupBusy(postalInput, true);

  try {
    const data = await fetchCheckoutCityLookup(country, city);
    if (sequence !== checkoutAddressLookupSequence) return;

    const matches = Array.isArray(data?.matches) ? data.matches : [];
    if (
      renderCheckoutCityChoices(cityInput, matches, {
        includePostalCode: true,
        keepCurrentCity: true,
      })
    ) {
      clearCheckoutAutoFilledPostal(postalInput);
      return;
    }

    const match = matches[0] || null;
    if (match?.postalCode) {
      applyCheckoutPostalAutofill(postalInput, match.postalCode);
      if (match.city && canReplaceCheckoutCity(cityInput)) {
        applyCheckoutCityAutofill(cityInput, match.city);
      }
      return;
    }

    clearCheckoutAutoFilledPostal(postalInput);
  } catch (error) {
    if (sequence !== checkoutAddressLookupSequence) return;
  } finally {
    if (sequence === checkoutAddressLookupSequence) {
      setCheckoutAddressLookupBusy(postalInput, false);
    }
  }
}

function autoFillCityFromZipMultiCountry() {
  const postalInput = document.getElementById("checkout-postal");
  const cityInput = document.getElementById("checkout-city");
  const countrySelect = document.getElementById("checkout-country");

  if (!postalInput || !cityInput || !countrySelect) return;
  if (checkoutAutoFillLock) return;

  const country = normalizeCheckoutCountryCode(countrySelect.value);
  const postalCode = postalInput.value.trim();

  window.clearTimeout(checkoutAddressLookupTimer);
  if (!country || !postalCode) {
    clearCheckoutAutoFilledCity(cityInput);
    return;
  }

  if (!isPostalCodeValidForCountry(country, postalCode)) {
    clearCheckoutAutoFilledCity(cityInput);
    return;
  }

  checkoutAddressLookupTimer = window.setTimeout(
    () => runCheckoutAddressLookup(country, postalCode, postalInput, cityInput),
    CHECKOUT_ADDRESS_LOOKUP_DEBOUNCE_MS,
  );
}

function autoFillPostalFromCityMultiCountry() {
  const postalInput = document.getElementById("checkout-postal");
  const cityInput = document.getElementById("checkout-city");
  const countrySelect = document.getElementById("checkout-country");

  if (!postalInput || !cityInput || !countrySelect) return;
  if (checkoutAutoFillLock) return;

  const country = normalizeCheckoutCountryCode(countrySelect.value);
  const city = cityInput.value.trim();

  window.clearTimeout(checkoutAddressLookupTimer);
  if (!country || city.length < 3) {
    clearCheckoutAutoFilledPostal(postalInput);
    return;
  }

  checkoutAddressLookupTimer = window.setTimeout(
    () => runCheckoutCityLookup(country, city, cityInput, postalInput),
    CHECKOUT_ADDRESS_LOOKUP_DEBOUNCE_MS,
  );
}

function isPostalCodeValidForCountry(countryCode, value) {
  const pattern = ZIP_PATTERNS[countryCode];
  if (!pattern) return true;
  return pattern.test(value.trim());
}

function clearPostalCodeValidation(postalInput, feedback) {
  if (postalInput) {
    postalInput.classList.remove("is-valid", "is-invalid");
  }
  if (feedback) {
    feedback.textContent = "Formato CAP non valido per il paese selezionato.";
  }
}

function validatePostalCode() {
  const countryCode = document.getElementById("checkout-country")?.value;
  const postalInput = document.getElementById("checkout-postal");
  const feedback = document.getElementById("postal-feedback");

  if (!postalInput) return true;

  const pattern = ZIP_PATTERNS[countryCode];
  const value = postalInput.value.trim();

  if (!countryCode || !value) {
    clearPostalCodeValidation(postalInput, feedback);
    return true;
  }

  if (!pattern) {
    postalInput.classList.remove("is-invalid");
    postalInput.classList.add("is-valid");
    if (feedback) feedback.textContent = "";
    return true;
  }

  if (pattern.test(value)) {
    postalInput.classList.remove("is-invalid");
    postalInput.classList.add("is-valid");
    if (feedback) feedback.textContent = "";
    return true;
  }

  postalInput.classList.remove("is-valid");
  postalInput.classList.add("is-invalid");
  if (feedback)
    feedback.textContent = "Formato CAP non valido per questo paese.";
  return false;
}

function resetCheckoutAddressLookup() {
  window.clearTimeout(checkoutAddressLookupTimer);
  checkoutAddressLookupSequence += 1;
  checkoutLastAutoFilledCity = "";
  checkoutLastAutoFilledPostal = "";
  resetCheckoutCityChoice(document.getElementById("checkout-city"), {
    clearCity: false,
  });
  setCheckoutAddressLookupBusy(
    document.getElementById("checkout-postal"),
    false,
  );
}

function handleCheckoutCountryChange() {
  const postalInput = document.getElementById("checkout-postal");
  const cityInput = document.getElementById("checkout-city");
  const feedback = document.getElementById("postal-feedback");

  resetCheckoutAddressLookup();
  if (postalInput) postalInput.value = "";
  if (cityInput) cityInput.value = "";
  clearPostalCodeValidation(postalInput, feedback);
}

function setCheckoutCountryValue(countryCode) {
  const countrySelect = document.getElementById("checkout-country");
  if (!countrySelect) return;

  countrySelect.value = normalizeCheckoutCountryCode(countryCode);
  const $ = getJQuery();
  if ($) {
    $(countrySelect).trigger("change");
  } else {
    countrySelect.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function getCheckoutPaymentFingerprint(items, total) {
  const normalizedItems = Array.isArray(items)
    ? items
        .map((item) => ({
          id: Number(item.id),
          quantity: Number(item.quantity || 0),
        }))
        .sort((a, b) => a.id - b.id)
    : [];
  return JSON.stringify({
    total: Number(total || 0).toFixed(2),
    items: normalizedItems,
  });
}

function clearPaymentElementError() {
  const errorBox = document.getElementById("payment-errors");
  if (errorBox) errorBox.textContent = "";
}

function showPaymentElementError(message) {
  const errorBox = document.getElementById("payment-errors");
  if (errorBox) errorBox.textContent = message || "";
}

function updatePaypalCheckoutNote() {
  const note = document.getElementById("paypal-payment-note");
  if (!note) return;
  const paypalEnabled = Boolean(checkoutPaymentConfig?.paypalEnabled);
  const isPaypalSelected = checkoutSelectedPaymentType === "paypal";
  note.style.display = paypalEnabled && isPaypalSelected ? "flex" : "none";
}

function handlePaymentElementChange(event) {
  checkoutSelectedPaymentType = String(event?.value?.type || "");
  updatePaypalCheckoutNote();
}

function showPaypalRedirectState() {
  const note = document.getElementById("paypal-payment-note");
  if (note) {
    note.style.display = "flex";
    note.classList.add("is-active");
    note.querySelector(".paypal-payment-note-title").textContent =
      "Apro PayPal in modo sicuro";
    note.querySelector(".paypal-payment-note-text").textContent =
      "Completa l'autorizzazione nella finestra sicura. Poi tornerai su ShopNow per la conferma.";
  }
}

function escapeCheckoutHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeCheckoutPaymentBrand(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const brands = {
    visa: "Visa",
    mastercard: "Mastercard",
    amex: "American Express",
    "american express": "American Express",
    maestro: "Maestro",
    discover: "Discover",
    "diners club": "Diners Club",
    carta: "Carta",
  };
  return brands[normalized] || String(value || "").trim() || "Carta";
}

function getCheckoutPaymentBrandMark(brand) {
  const normalizedBrand = normalizeCheckoutPaymentBrand(brand);
  if (normalizedBrand === "American Express") return "AMEX";
  if (normalizedBrand === "Mastercard") return "MC";
  return normalizedBrand.slice(0, 4).toUpperCase();
}

function getCheckoutPaymentBrandClass(brand) {
  return normalizeCheckoutPaymentBrand(brand)
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function getCheckoutSavedMethodsForPayment() {
  return checkoutSavedPaymentMethods.filter(
    (method) => method.canUseInCheckout,
  );
}

function getSelectedCheckoutPaymentChoice() {
  return document.querySelector('input[name="checkout-payment-choice"]:checked')
    ?.value;
}

function getSelectedSavedPaymentMethod() {
  const selectedValue = getSelectedCheckoutPaymentChoice();
  if (!selectedValue || !selectedValue.startsWith("saved:")) return null;
  const methodId = Number(selectedValue.replace("saved:", ""));
  return getCheckoutSavedMethodsForPayment().find(
    (method) => Number(method.id) === methodId,
  );
}

function updateCheckoutPaymentMode() {
  const stripeSection = document.getElementById("stripe-payment-section");
  const saveOptions = document.getElementById("checkout-save-payment-options");
  const savedMethod = getSelectedSavedPaymentMethod();
  if (stripeSection) {
    stripeSection.style.display = savedMethod ? "none" : "block";
  }
  if (saveOptions) {
    saveOptions.style.display =
      checkoutCurrentUser && !savedMethod ? "block" : "none";
  }
}

function renderCheckoutSavedPaymentMethods() {
  const section = document.getElementById("saved-payment-methods-section");
  const list = document.getElementById("saved-payment-methods-list");
  const newChoice = document.getElementById("payment-choice-new");
  if (!section || !list || !newChoice) return;

  const usableMethods = getCheckoutSavedMethodsForPayment();
  if (!usableMethods.length) {
    section.style.display = "none";
    newChoice.checked = true;
    updateCheckoutPaymentMode();
    return;
  }

  const defaultMethod =
    usableMethods.find((method) => method.isDefault) || usableMethods[0];
  list.innerHTML = usableMethods
    .map((method) => {
      const brand = normalizeCheckoutPaymentBrand(method.brand);
      const alias = escapeCheckoutHtml(method.alias || "Carta salvata");
      const last4 = escapeCheckoutHtml(
        String(method.last4 || "")
          .replace(/\D/g, "")
          .slice(-4),
      );
      const expiry = escapeCheckoutHtml(method.expiry || "");
      const checked =
        Number(method.id) === Number(defaultMethod.id) ? "checked" : "";
      return `
        <label class="payment-choice-row" for="payment-choice-saved-${method.id}">
          <input
            class="form-check-input"
            type="radio"
            name="checkout-payment-choice"
            id="payment-choice-saved-${method.id}"
            value="saved:${method.id}"
            ${checked}
          />
          <span class="payment-card-mark ${getCheckoutPaymentBrandClass(brand)}" aria-hidden="true">${escapeCheckoutHtml(getCheckoutPaymentBrandMark(brand))}</span>
          <span class="payment-choice-main">
            <span class="payment-choice-name">${alias}</span>
            <span class="payment-choice-meta">${escapeCheckoutHtml(brand)} terminante in ${last4}${expiry ? ` - Scadenza ${expiry}` : ""}</span>
          </span>
        </label>
      `;
    })
    .join("");
  newChoice.checked = false;
  section.style.display = "block";
  updateCheckoutPaymentMode();
}

function updateCheckoutEmailUi(user) {
  const emailInput = document.getElementById("checkout-email");
  const emailRow = document.getElementById("checkout-email-row");
  const emailSummary = document.getElementById(
    "checkout-account-email-summary",
  );
  const email = String(user?.email || "").trim();
  if (!emailInput || !emailRow || !emailSummary) return;

  if (email) {
    emailInput.value = email;
    emailRow.style.display = "none";
    emailSummary.style.display = "flex";
    emailSummary.innerHTML = `<i class="fas fa-envelope"></i><span>Email account: <strong>${escapeCheckoutHtml(email)}</strong></span>`;
  } else {
    emailRow.style.display = "block";
    emailSummary.style.display = "none";
    emailSummary.replaceChildren();
  }
}

function buildCheckoutPayload({
  paymentIntentId,
  items,
  total,
  shippingAddress,
  customerName,
  customerEmail,
  savePaymentMethod = false,
  savePaymentMethodAsDefault = false,
}) {
  return {
    paymentIntentId,
    items,
    total,
    shippingAddress,
    customerName,
    customerEmail,
    savePaymentMethod,
    savePaymentMethodAsDefault,
    createdAt: Date.now(),
  };
}

function savePendingCheckout(payload) {
  try {
    window.localStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Impossibile salvare il checkout in sospeso:", error);
  }
}

function loadPendingCheckout(paymentIntentId = "") {
  try {
    const raw = window.localStorage.getItem(PENDING_CHECKOUT_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== "object") return null;
    if (
      payload.createdAt &&
      Date.now() - Number(payload.createdAt) > PENDING_CHECKOUT_MAX_AGE_MS
    ) {
      window.localStorage.removeItem(PENDING_CHECKOUT_KEY);
      return null;
    }
    if (
      paymentIntentId &&
      payload.paymentIntentId &&
      payload.paymentIntentId !== paymentIntentId
    ) {
      return null;
    }
    return payload;
  } catch (error) {
    window.localStorage.removeItem(PENDING_CHECKOUT_KEY);
    return null;
  }
}

function clearPendingCheckout(paymentIntentId = "") {
  const pending = loadPendingCheckout();
  if (!paymentIntentId || pending?.paymentIntentId === paymentIntentId) {
    window.localStorage.removeItem(PENDING_CHECKOUT_KEY);
  }
}

function getCheckoutRequestHeaders(extraHeaders = {}) {
  return typeof getAuthRequestHeaders === "function"
    ? getAuthRequestHeaders(extraHeaders)
    : window.getApiRequestHeaders(extraHeaders);
}

async function registerCheckoutOrder(payload) {
  const checkoutResponse = await window.fetchWithTimeout(
    window.getApiUrl("/api/checkout"),
    {
      method: "POST",
      headers: getCheckoutRequestHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(payload),
    },
  );

  const data = await checkoutResponse.json();
  if (!checkoutResponse.ok) {
    throw new Error(data.error || "Errore registrazione ordine.");
  }
  return data;
}

async function confirmSavedCheckoutPayment(paymentIntentId, paymentMethodId) {
  const response = await window.fetchWithTimeout(
    window.getApiUrl("/api/checkout/confirm-saved-payment"),
    {
      method: "POST",
      headers: getCheckoutRequestHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        paymentIntentId,
        paymentMethodId,
      }),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Errore conferma metodo salvato.");
  }

  if (data.status === "requires_action" && data.clientSecret) {
    const actionResult = await stripeInstance.confirmCardPayment(
      data.clientSecret,
    );
    if (actionResult.error) {
      throw new Error(actionResult.error.message);
    }
    if (actionResult.paymentIntent?.status !== "succeeded") {
      throw new Error("Pagamento non completato.");
    }
    return actionResult.paymentIntent;
  }
  if (data.status !== "succeeded") {
    throw new Error("Pagamento non completato.");
  }
  return {
    id: data.paymentIntentId || paymentIntentId,
    status: data.status,
  };
}

function clearCheckoutCartAfterSuccess() {
  if (typeof clearLocalCart === "function") clearLocalCart();
  try {
    window.sessionStorage.removeItem("shopnow-buy-now-cart");
  } catch (error) {
    // Non bloccare la conferma ordine per un errore di storage locale.
  }
  if (typeof renderCart === "function") renderCart();
  if (typeof updateCartCount === "function") updateCartCount();
}

function redirectToOrderConfirmation(order, total, customerName) {
  const confirmationParams = new URLSearchParams({
    orderId: String(order?.id || ""),
    total: String(order?.total || total || ""),
    customerName: String(customerName || ""),
  });
  window.location.href = `order-confirmation.html?${confirmationParams.toString()}`;
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
    await loadStripeScript();
    const configResponse = await window.fetchWithTimeout(
      window.getApiUrl("/config"),
      {
        headers: window.getApiRequestHeaders(),
      },
    );
    const config = await configResponse.json();
    checkoutPaymentConfig = config?.paymentMethods || null;

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
    const paymentElementContainer = document.getElementById("payment-element");

    if (checkoutForm && paymentElementContainer) {
      const { items, total } = window.getCartDetails();
      if (!items || !items.length || !total) {
        const submitBtn = document.getElementById("checkout-btn");
        if (submitBtn) submitBtn.disabled = true;
        return;
      }

      const paymentFingerprint = getCheckoutPaymentFingerprint(items, total);
      stripeInstance = window.Stripe(config.stripePublicKey);
      paymentElementContainer.classList.add("stripe-payment-element");

      const intentResponse = await window.fetchWithTimeout(
        window.getApiUrl("/create-payment-intent"),
        {
          method: "POST",
          headers: getCheckoutRequestHeaders({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            amount: total,
            items,
            customerName: document
              .getElementById("checkout-name")
              ?.value.trim(),
            customerEmail: document
              .getElementById("checkout-email")
              ?.value.trim(),
          }),
        },
      );
      const intentData = await intentResponse.json();
      if (!intentResponse.ok || !intentData.clientSecret) {
        throw new Error(
          intentData.error || "Errore inizializzazione pagamento.",
        );
      }

      stripePaymentIntentClientSecret = intentData.clientSecret;
      stripePaymentIntentId = intentData.paymentIntentId;
      stripePaymentFingerprint = paymentFingerprint;
      stripeElements = stripeInstance.elements({
        clientSecret: stripePaymentIntentClientSecret,
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

      if (stripePaymentElement) {
        stripePaymentElement.destroy();
      }
      paymentElementContainer.replaceChildren();
      stripePaymentElement = stripeElements.create("payment", {
        fields: {
          billingDetails: {
            name: "never",
            email: "never",
            address: "auto",
          },
        },
        wallets: {
          applePay: "never",
          googlePay: "never",
        },
      });

      stripePaymentElement.mount(paymentElementContainer);
      stripePaymentElement.on("focus", () =>
        paymentElementContainer.classList.add("stripe-payment-element--focus"),
      );
      stripePaymentElement.on("blur", () =>
        paymentElementContainer.classList.remove(
          "stripe-payment-element--focus",
        ),
      );
      stripePaymentElement.on("change", handlePaymentElementChange);
    }
  } catch (err) {
    console.error("Errore Stripe:", err);
    const submitBtn = document.getElementById("checkout-btn");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Pagamento non disponibile";
    }
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
  const email =
    String(checkoutCurrentUser?.email || "").trim() ||
    document.getElementById("checkout-email")?.value.trim();
  const street = document.getElementById("checkout-street")?.value.trim();
  const streetNumber = document
    .getElementById("checkout-street-number")
    ?.value.trim();
  const city = document.getElementById("checkout-city")?.value.trim();
  const postalCode = document.getElementById("checkout-postal")?.value.trim();
  const country = document.getElementById("checkout-country")?.value;

  if (
    !name ||
    !email ||
    !street ||
    !streetNumber ||
    !city ||
    !postalCode ||
    !country
  ) {
    window.showCheckoutMessage("danger", "Tutti i campi sono obbligatori.");
    return;
  }

  window.setCheckoutLoading(true);
  document.getElementById("prog-step-2")?.classList.add("active");

  try {
    if (
      typeof window.isStaticCheckoutMode === "function" &&
      window.isStaticCheckoutMode()
    ) {
      throw new Error("Stripe richiede un backend attivo.");
    }

    const savedPaymentMethod = getSelectedSavedPaymentMethod();
    if (!stripeInstance || !stripePaymentIntentId) {
      throw new Error(
        "Pagamento non disponibile. Ricarica la pagina e riprova.",
      );
    }
    if (!savedPaymentMethod && (!stripeElements || !stripePaymentElement)) {
      throw new Error(
        "Pagamento non disponibile. Ricarica la pagina e riprova.",
      );
    }

    clearPaymentElementError();
    const currentPaymentFingerprint = getCheckoutPaymentFingerprint(
      items,
      total,
    );
    if (currentPaymentFingerprint !== stripePaymentFingerprint) {
      throw new Error(
        "Il carrello e cambiato. Ricarica il checkout e riprova.",
      );
    }

    const line1 = combineStreetLine(street, streetNumber);
    const shippingAddress = {
      line1,
      street,
      streetNumber,
      city,
      postalCode,
      country: normalizeCheckoutCountryCode(country),
    };
    const checkoutPayload = buildCheckoutPayload({
      paymentIntentId: stripePaymentIntentId,
      items,
      total,
      shippingAddress,
      customerName: name,
      customerEmail: email,
      savePaymentMethod: Boolean(checkoutCurrentUser && !savedPaymentMethod),
      savePaymentMethodAsDefault:
        document.getElementById("checkout-new-payment-default")?.checked ===
        true,
    });

    savePendingCheckout(checkoutPayload);

    if (savedPaymentMethod) {
      const savedPaymentIntent = await confirmSavedCheckoutPayment(
        stripePaymentIntentId,
        savedPaymentMethod.id,
      );
      if (!savedPaymentIntent || savedPaymentIntent.status !== "succeeded") {
        throw new Error("Pagamento non confermato da Stripe.");
      }
      checkoutPayload.paymentIntentId =
        savedPaymentIntent.id || stripePaymentIntentId;
    } else {
      const submitResult = await stripeElements.submit();
      if (submitResult.error) {
        showPaymentElementError(submitResult.error.message);
        throw new Error(submitResult.error.message);
      }
      if (checkoutSelectedPaymentType === "paypal") {
        showPaypalRedirectState();
      }

      // 1. Conferma pagamento con Stripe Payment Element
      const paymentResult = await stripeInstance.confirmPayment({
        elements: stripeElements,
        redirect: "if_required",
        confirmParams: {
          return_url: `${window.location.origin}/order-confirmation.html?checkout_return=1`,
          payment_method_data: {
            billing_details: {
              name,
              email,
              address: {
                line1,
                city: city,
                postal_code: postalCode,
                country: normalizeCheckoutCountryCode(country),
              },
            },
          },
        },
      });

      if (paymentResult.error) {
        clearPendingCheckout(checkoutPayload.paymentIntentId);
        showPaymentElementError(paymentResult.error.message);
        throw new Error(paymentResult.error.message);
      }

      if (!paymentResult.paymentIntent) {
        throw new Error("Pagamento non confermato da Stripe.");
      }

      if (paymentResult.paymentIntent.status !== "succeeded") {
        throw new Error(
          "Pagamento in elaborazione. Attendi la conferma prima di riprovare.",
        );
      }

      checkoutPayload.paymentIntentId =
        paymentResult.paymentIntent.id || stripePaymentIntentId;
    }

    const data = await registerCheckoutOrder(checkoutPayload);
    clearPendingCheckout(checkoutPayload.paymentIntentId);

    // Successo!
    clearCheckoutCartAfterSuccess();

    document.getElementById("prog-step-1")?.classList.add("completed");
    document.getElementById("prog-step-2")?.classList.add("completed");
    document.getElementById("prog-step-3")?.classList.add("active");

    window.showCheckoutMessage(
      "success",
      `Ordine #${data.order.id} confermato con successo!`,
    );
    if (typeof window.showToast === "function")
      window.showToast("Pagamento completato!");
    redirectToOrderConfirmation(data.order, total, name);
  } catch (error) {
    window.showCheckoutMessage("danger", error.message);
  } finally {
    window.setCheckoutLoading(false);
  }
}

async function prefillCheckoutForm() {
  const user =
    typeof getCurrentUser === "function" ? await getCurrentUser() : null;
  checkoutCurrentUser = user || null;
  checkoutSavedPaymentMethods = Array.isArray(user?.paymentMethods)
    ? user.paymentMethods
    : [];
  updateCheckoutEmailUi(user);
  renderCheckoutSavedPaymentMethods();
  if (!user) return;

  const fields = {
    "checkout-name": user.name,
    "checkout-email": user.email,
  };

  if (user.addresses && user.addresses.length > 0) {
    const addr = user.addresses[0];
    fields["checkout-street"] = getAddressStreet(addr);
    fields["checkout-street-number"] = getAddressStreetNumber(addr);
    fields["checkout-city"] = addr.city;
    fields["checkout-postal"] = addr.postalCode;

    if (addr.country) {
      setCheckoutCountryValue(addr.country);
    }
  }

  Object.keys(fields).forEach((id) => {
    const el = document.getElementById(id);
    if (el && !el.value && fields[id]) el.value = fields[id];
  });
  validatePostalCode();
}

async function loadStripeScript() {
  if (typeof window.Stripe === "function") return;

  if (stripeScriptPromise) return stripeScriptPromise;

  stripeScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Errore caricamento Stripe SDK"));
    document.head.appendChild(script);
  });
  return stripeScriptPromise;
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
async function initCheckoutPage() {
  if (checkoutPageInitialized) return;
  checkoutPageInitialized = true;

  initializeCountrySelect();

  const countrySelect = document.getElementById("checkout-country");
  const postalInput = document.getElementById("checkout-postal");
  const $ = getJQuery();

  if (countrySelect) {
    if ($) {
      $(countrySelect).on("change.checkout", handleCheckoutCountryChange);
    } else {
      countrySelect.addEventListener("change", handleCheckoutCountryChange);
    }
  }

  if (postalInput) {
    postalInput.addEventListener("input", () => {
      if (!checkoutAutoFillLock && !postalInput.value.trim()) {
        clearCheckoutAutoFilledCity(document.getElementById("checkout-city"));
        const cityInputForClear = document.getElementById("checkout-city");
        if (cityInputForClear?.value.trim()) {
          checkoutAutoFillLock = true;
          cityInputForClear.value = "";
          cityInputForClear.dispatchEvent(
            new Event("change", { bubbles: true }),
          );
          checkoutAutoFillLock = false;
          checkoutLastAutoFilledCity = "";
        }
      }
      validatePostalCode();
      autoFillCityFromZipMultiCountry();
    });
    postalInput.addEventListener("change", autoFillCityFromZipMultiCountry);
  }

  const cityInput = document.getElementById("checkout-city");
  if (cityInput) {
    cityInput.addEventListener("input", () => {
      if (!checkoutAutoFillLock) {
        checkoutLastAutoFilledCity = "";
        resetCheckoutCityChoice(cityInput, { clearCity: false });
        if (!cityInput.value.trim()) {
          const postalInputForClear =
            document.getElementById("checkout-postal");
          clearCheckoutAutoFilledPostal(postalInputForClear);
          if (postalInputForClear?.value.trim()) {
            checkoutAutoFillLock = true;
            postalInputForClear.value = "";
            postalInputForClear.dispatchEvent(
              new Event("change", { bubbles: true }),
            );
            checkoutAutoFillLock = false;
            checkoutLastAutoFilledPostal = "";
          }
        } else {
          autoFillPostalFromCityMultiCountry();
        }
      }
    });
    cityInput.addEventListener("change", autoFillPostalFromCityMultiCountry);
  }
  const citySelect = getCheckoutCitySelect();
  if (citySelect) {
    citySelect.addEventListener("change", handleCheckoutCityChoiceChange);
  }

  const checkoutForm = document.getElementById("checkout-form");
  if (checkoutForm) {
    checkoutForm.addEventListener("submit", handleCheckoutSubmit);
  }
  const savedPaymentSection = document.getElementById(
    "saved-payment-methods-section",
  );
  if (savedPaymentSection) {
    savedPaymentSection.addEventListener("change", updateCheckoutPaymentMode);
  }

  await prefillCheckoutForm();
  await initializeStripeCheckout();

  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("keydown", (event) => {
      if (
        event.key === "Enter" &&
        typeof window.searchProducts === "function"
      ) {
        event.preventDefault();
        window.searchProducts();
      }
    });
  }
  const searchBtn = document.getElementById("search-btn");
  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      if (typeof window.searchProducts === "function") window.searchProducts();
    });
  }
}

if (document.readyState === "complete") {
  initCheckoutPage();
} else {
  window.addEventListener("load", initCheckoutPage, { once: true });
}

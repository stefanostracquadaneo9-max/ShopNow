const POSTAL_CODE_PATTERNS = {
    'IT': /^\d{5}$/, // Italy: 5 digits
    'US': /^\d{5}(?:[-\s]\d{4})?$/, // USA: 5 digits, optional -4 digits
    'GB': /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i, // UK: simplified, e.g., SW1A 0AA
    'DE': /^\d{5}$/, // Germany: 5 digits
    'FR': /^\d{5}$/, // France: 5 digits
    'ES': /^\d{5}$/, // Spain: 5 digits
    'CA': /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i, // Canada: A1A 1A1
    'AU': /^\d{4}$/, // Australia: 4 digits
    'JP': /^\d{3}-?\d{4}$/, // Japan: 7 digits or 3-4 with hyphen
    'CN': /^\d{6}$/, // China: 6 digits
    'IN': /^\d{6}$/, // India: 6 digits
    'BR': /^\d{5}-?\d{3}$/, // Brazil: 5-3 digits
    'NL': /^\d{4}\s?[A-Z]{2}$/i, // Netherlands: 4 digits, 2 letters
    'BE': /^\d{4}$/, // Belgium: 4 digits
    'CH': /^\d{4}$/, // Switzerland: 4 digits
    'AT': /^\d{4}$/, // Austria: 4 digits
    'SE': /^\d{3}\s?\d{2}$/, // Sweden: 5 digits, optional space
    'NO': /^\d{4}$/, // Norway: 4 digits
    'DK': /^\d{4}$/, // Denmark: 4 digits
    'PT': /^\d{4}-?\d{3}$/, // Portugal: 4-3 digits
    'IE': /^[A-Z0-9]{3}\s?[A-Z0-9]{4}$/i, // Ireland: 7 chars, optional space
    'FI': /^\d{5}$/, // Finland: 5 digits
    'PL': /^\d{2}-?\d{3}$/, // Poland: 2-3 digits
    'CZ': /^\d{3}\s?\d{2}$/, // Czech Republic: 3-2 digits
    'HU': /^\d{4}$/, // Hungary: 4 digits
    'GR': /^\d{3}\s?\d{2}$/, // Greece: 3-2 digits
    'MX': /^\d{5}$/, // Mexico: 5 digits
    'AR': /^\d{4}[A-Z]{3}$/i, // Argentina: 4 digits, 3 letters
    'CL': /^\d{7}$/, // Chile: 7 digits
    'CO': /^\d{6}$/, // Colombia: 6 digits
    'PE': /^\d{5}$/, // Peru: 5 digits
    'VE': /^\d{4}$/, // Venezuela: 4 digits
    'UY': /^\d{5}$/, // Uruguay: 5 digits
    'PY': /^\d{4}$/, // Paraguay: 4 digits
    'BO': /^\d{4}$/, // Bolivia: 4 digits
    'EC': /^\d{6}$/, // Ecuador: 6 digits
    // Default for countries not explicitly listed (e.g., 4-6 digits, alphanumeric)
    'DEFAULT': /^[A-Z0-9\s-]{2,10}$/i
};

let stripeInstance = null;
let stripeCardElement = null;
let bridgedCheckoutPrefill = null;

function showCheckoutMessage(type, text) {
    const box = document.getElementById("checkout-message");
    if (!box) {
        return;
    }
    if (!text) {
        box.style.display = "none";
        box.textContent = "";
        box.className = "mb-3";
        return;
    }
    box.style.display = "block";
    box.className = `alert alert-${type} mb-3`;
    box.textContent = text;
}

function setCheckoutLoading(isLoading) {
    const button = document.getElementById("checkout-btn");
    if (!button) {
        return;
    }
    button.disabled = isLoading;
    button.textContent = isLoading
        ? isStaticCheckoutMode()
            ? "Conferma ordine in corso..."
            : "Pagamento in corso..."
        : isStaticCheckoutMode()
        ? "Conferma ordine"
        : "Procedi al pagamento";
}

function configureStaticCheckoutUi() {
    const checkoutButton = document.getElementById("checkout-btn");
    const stripeCardSection = document.getElementById("stripe-card-section");
    const cardElement = document.getElementById("card-element");
    const cardErrors = document.getElementById("card-errors");
    const paymentHint = stripeCardSection?.querySelector(".payment-hint");
    const paymentLabel = stripeCardSection?.querySelector(".form-label");
    if (checkoutButton) {
        checkoutButton.disabled = true;
        checkoutButton.textContent = "Stripe richiede backend";
    }
    if (paymentLabel) {
        paymentLabel.textContent = "Stripe non disponibile";
    }
    if (cardElement) {
        cardElement.style.display = "none";
        cardElement.innerHTML = "";
    }
    if (paymentHint) {
        paymentHint.textContent =
            "Per usare Stripe da GitHub Pages devi configurare un backend sicuro e controllare l'URL API centrale definito in `auth.js`.";
    }
    if (cardErrors) {
        cardErrors.textContent = "";
    }
    showCheckoutMessage(
        "warning",
        "Stripe reale e disattivato finche non colleghi un backend sicuro.",
    );
}

async function loadStripeScript() {
    if (typeof window.Stripe === "function") {
        return;
    }
    await new Promise((resolve, reject) => {
        const existing = document.querySelector(
            'script[data-stripe-js="true"]',
        );
        if (existing) {
            if (typeof window.Stripe === "function") {
                resolve();
                return;
            }
            existing.addEventListener("load", resolve, { once: true });
            existing.addEventListener("error", reject, { once: true });
            return;
        }
        const script = document.createElement("script");
        script.src = "https://js.stripe.com/v3/";
        script.async = true;
        script.dataset.stripeJs = "true";
        script.onload = resolve;
        script.onerror = () => reject(new Error("Stripe non disponibile."));
        document.head.appendChild(script);
    });
}

async function initializeStripeCheckout() {
    if (isStaticCheckoutMode()) {
        configureStaticCheckoutUi();
        return;
    }
    await loadStripeScript();
    const configResponse = await fetchWithTimeout(getApiUrl("/config"), {
        headers: getApiRequestHeaders(),
    });
    const config = await configResponse.json();
    if (
        !configResponse.ok ||
        !config.stripePublicKey ||
        config.stripePublicKey.includes("placeholder")
    ) {
        throw new Error(
            config.error || "Stripe non configurato correttamente.",
        );
    }
    const checkoutForm = document.getElementById("checkout-form");
    const cardElementContainer = document.getElementById("card-element");

    if (checkoutForm && cardElementContainer) {
        stripeInstance = window.Stripe(config.stripePublicKey);
        
        cardElementContainer.classList.add('stripe-card-element');

        const elements = stripeInstance.elements({
            locale: 'it',
            appearance: {
                theme: 'none',
                variables: {
                    colorPrimary: '#e77600',
                    colorBackground: '#ffffff',
                    colorText: '#111111',
                    colorDanger: '#ba000d',
                    fontFamily: '"Amazon Ember", Arial, sans-serif',
                    fontSizeBase: '15px',
                    spacingUnit: '4px',

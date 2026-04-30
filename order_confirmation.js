const PENDING_CHECKOUT_KEY = "shopnow-pending-checkout";
const PENDING_CHECKOUT_MAX_AGE_MS = 3 * 60 * 60 * 1000;

function getConfirmationRequestHeaders(extraHeaders = {}) {
  return typeof getAuthRequestHeaders === "function"
    ? getAuthRequestHeaders(extraHeaders)
    : window.getApiRequestHeaders(extraHeaders);
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

function setConfirmationMessage(message) {
  const confirmationMessage = document.getElementById("confirmation-message");
  if (confirmationMessage) confirmationMessage.textContent = message;
}

function buildConfirmationMessage({ orderId, total, customerName, emailSent }) {
  let message = "Il tuo ordine \u00e8 stato ricevuto con successo.";
  if (orderId) {
    message = `Ordine #${orderId} confermato con successo.`;
  }
  if (total) {
    const amount = Number(total);
    if (!Number.isNaN(amount)) {
      message += ` Importo pagato: \u20ac${amount.toFixed(2)}.`;
    }
  }
  if (customerName) {
    message = `Ciao ${customerName}, ${message}`;
  }
  if (emailSent === false) {
    message +=
      " L'ordine e presente nel tuo account, ma l'email di conferma non e stata inviata.";
  }
  return message;
}

function clearCartsAfterConfirmation() {
  if (typeof clearLocalCart === "function") clearLocalCart();
  try {
    window.sessionStorage.removeItem("shopnow-buy-now-cart");
  } catch (error) {
    // La conferma ordine non dipende dalla pulizia dello storage locale.
  }
  if (typeof updateCartCount === "function") updateCartCount();
}

async function finalizeReturnedCheckout(params) {
  const paymentIntentId = params.get("payment_intent");
  const redirectStatus = params.get("redirect_status");
  if (!paymentIntentId) {
    throw new Error("Ritorno pagamento non valido.");
  }
  if (redirectStatus && redirectStatus !== "succeeded") {
    throw new Error("Pagamento non completato. Puoi riprovare dal checkout.");
  }

  const pendingCheckout = loadPendingCheckout(paymentIntentId);
  if (!pendingCheckout) {
    throw new Error(
      "Non riesco a recuperare i dati del checkout. Torna al checkout e riprova.",
    );
  }

  const response = await window.fetchWithTimeout(
    window.getApiUrl("/api/checkout"),
    {
      method: "POST",
      headers: getConfirmationRequestHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        ...pendingCheckout,
        paymentIntentId,
      }),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Errore registrazione ordine.");
  }

  clearPendingCheckout(paymentIntentId);
  clearCartsAfterConfirmation();

  const order = data.order || {};
  const confirmationParams = new URLSearchParams({
    orderId: String(order.id || ""),
    total: String(order.total || pendingCheckout.total || ""),
    customerName: String(pendingCheckout.customerName || ""),
    emailSent: data.emailSent ? "1" : "0",
  });
  window.history.replaceState(
    {},
    "",
    `order-confirmation.html?${confirmationParams.toString()}`,
  );
  return {
    orderId: order.id,
    total: order.total || pendingCheckout.total,
    customerName: pendingCheckout.customerName,
    emailSent: Boolean(data.emailSent),
  };
}

async function showOrdersLinkForLoggedUser() {
  if (typeof getCurrentUser !== "function") return;
  const user = await getCurrentUser();
  if (user) {
    document.getElementById("orders-link")?.classList.remove("d-none");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const isStripeReturn =
    params.get("checkout_return") === "1" || params.has("payment_intent");
  if (!isStripeReturn) return;

  setConfirmationMessage(
    "Stiamo finalizzando il tuo ordine, attendi qualche secondo...",
  );

  try {
    const confirmation = await finalizeReturnedCheckout(params);
    setConfirmationMessage(buildConfirmationMessage(confirmation));
  } catch (error) {
    setConfirmationMessage(error.message);
  }

  await showOrdersLinkForLoggedUser();
});

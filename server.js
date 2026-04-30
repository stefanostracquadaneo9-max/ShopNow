require("dotenv").config();
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const stripeSecretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
const stripe = stripeSecretKey ? require("stripe")(stripeSecretKey) : null;
if (!stripe) {
  console.log(
    "[WARN] Stripe non configurato: STRIPE_SECRET_KEY non trovato in .env o nelle variabili d'ambiente.",
  );
}
const db_module = require("./db");
const app = express();
const PORT = process.env.PORT || 3000;
const RAILWAY_VOLUME_MOUNT_PATH = String(
  process.env.RAILWAY_VOLUME_MOUNT_PATH || "",
).trim();
const BUNDLED_UPLOADS_DIR = path.join(__dirname, "uploads");
const RUNTIME_UPLOADS_DIR = path.resolve(
  process.env.UPLOADS_DIR ||
    (RAILWAY_VOLUME_MOUNT_PATH
      ? path.join(RAILWAY_VOLUME_MOUNT_PATH, "uploads")
      : BUNDLED_UPLOADS_DIR),
);
const PUBLIC_STATIC_FILES = new Set([
  "account.html",
  "account.js",
  "admin.html",
  "admin_ui.js",
  "auth.js",
  "auth_ui.js",
  "cart.html",
  "cart.js",
  "checkout.html",
  "checkout.js",
  "favicon.png",
  "forgot-password.html",
  "forgot_password_ui.js",
  "index.html",
  "order-confirmation.html",
  "order_confirmation.js",
  "orders.html",
  "orders.js",
  "product.html",
  "product_ui.js",
  "products.html",
  "products_ui.js",
  "register.html",
  "reset-password.html",
  "reset_password_ui.js",
  "site_boot.js",
  "style.css",
]);
const STATIC_MAX_AGE = process.env.NODE_ENV === "production" ? "1d" : 0;
const NO_STORE_STATIC_FILES = new Set([
  "admin.html",
  "admin_ui.js",
  "auth.js",
  "auth_ui.js",
  "site_boot.js",
  "style.css",
]);

const FREE_SHIPPING_THRESHOLD = 30;
const SHIPPING_RATE_UNDER_THRESHOLD = 0.05;
const CHECKOUT_VAT_RATE = 0.22;
const DEFAULT_PUBLIC_SITE_URL = "https://shopnow-production.up.railway.app";
let sentEmails = [];
const {
  db,
  createUser,
  getUserByEmail,
  getUserBySessionToken,
  getUserByRefreshToken,
  getUserById,
  authenticateUser,
  verifyPassword,
  validatePasswordStrength,
  issueSessionTokens,
  setResetPasswordToken,
  getUserByResetToken,
  clearUserSession,
  updateUserPassword,
  getAllUsers,
  updateUser,
  deleteUser,
  deleteUsersByDomain,
  createProduct,
  getProductById,
  getAllProducts,
  updateProduct,
  deleteProduct,
  getReviewsByProductId,
  addOrUpdateProductReview,
  consumeProductStock,
  createOrder,
  getOrderById,
  getOrderByStripePaymentIntentId,
  getOrdersByUserId,
  getAllOrders,
  getAllOrdersWithUsers,
  updateOrderStatus,
  addAddress,
  getAddressById,
  getAddressesByUserId,
  deleteAddress,
  addPaymentMethod,
  getPaymentMethodById,
  getPaymentMethodsByUserId,
  deletePaymentMethod,
  getCart,
  updateCart,
  clearCart,
  hashPassword,
} = db_module;
app.use(cors());
app.use(express.json());
fs.mkdirSync(RUNTIME_UPLOADS_DIR, { recursive: true });

function setNoStoreHeaders(res) {
  res.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("Surrogate-Control", "no-store");
}

function setStaticResponseHeaders(res, fileName) {
  if (
    fileName.endsWith(".html") ||
    NO_STORE_STATIC_FILES.has(fileName) ||
    (process.env.NODE_ENV !== "production" && fileName.endsWith(".js"))
  ) {
    setNoStoreHeaders(res);
    if (fileName.endsWith(".html")) {
      res.set("Clear-Site-Data", '"cache"');
    }
  }
}

function sendPublicStaticFile(res, fileName) {
  setStaticResponseHeaders(res, fileName);
  res.sendFile(path.join(__dirname, fileName), {
    dotfiles: "deny",
    maxAge:
      fileName.endsWith(".html") || NO_STORE_STATIC_FILES.has(fileName)
        ? 0
        : STATIC_MAX_AGE,
  });
}

function setCacheClearHeaders(res) {
  setNoStoreHeaders(res);
  res.set("Clear-Site-Data", '"cache"');
}

function sendCacheResetPage(req, res) {
  setCacheClearHeaders(res);
  const targetPath = String(req.query.to || "/");
  const safeTargetPath = targetPath.startsWith("/") ? targetPath : "/";
  const redirectUrl = `${safeTargetPath}${safeTargetPath.includes("?") ? "&" : "?"}cacheReset=${Date.now()}`;
  res.type("html").send(`<!doctype html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta http-equiv="refresh" content="1;url=${escapeSvgText(redirectUrl)}" />
    <title>ShopNow - Aggiornamento cache</title>
  </head>
  <body style="font-family: Arial, sans-serif; padding: 32px; color: #111;">
    <h1>Sto aggiornando il sito...</h1>
    <p>La cache del browser per ShopNow viene svuotata. Verrai riportato alla pagina corretta tra un secondo.</p>
    <p><a href="${escapeSvgText(redirectUrl)}">Continua su ShopNow</a></p>
    <script>
      window.setTimeout(function () {
        window.location.replace(${JSON.stringify(redirectUrl)});
      }, 300);
    </script>
  </body>
</html>`);
}

function escapeSvgText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sendMissingUploadPlaceholder(req, res) {
  const label = escapeSvgText(
    path.basename(String(req.params.fileName || "Immagine prodotto")),
  );
  res.set(
    "Cache-Control",
    STATIC_MAX_AGE ? `public, max-age=86400` : "no-store",
  );
  res.type("image/svg+xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480" role="img" aria-label="Immagine prodotto non disponibile">
  <rect width="640" height="480" fill="#f3f4f6"/>
  <rect x="72" y="72" width="496" height="336" rx="18" fill="#ffffff" stroke="#d5d9d9" stroke-width="3"/>
  <path d="M174 326h292l-88-104-62 72-42-48-100 80z" fill="#e3e6e6"/>
  <circle cx="238" cy="174" r="34" fill="#ff9900"/>
  <text x="320" y="374" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#565959">Immagine non disponibile</text>
  <text x="320" y="406" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#8a8f94">${label}</text>
</svg>`);
}

function normalizePublicBaseUrl(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";
  const withProtocol = /^https?:\/\//i.test(rawValue)
    ? rawValue
    : `https://${rawValue}`;
  return withProtocol.replace(/\/+$/, "");
}

function isLocalPublicBaseUrl(value) {
  try {
    const hostname = new URL(
      normalizePublicBaseUrl(value),
    ).hostname.toLowerCase();
    return (
      hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
    );
  } catch (error) {
    return false;
  }
}

function getRequestPublicBaseUrl(req) {
  const forwardedHost = String(req?.headers?.["x-forwarded-host"] || "")
    .split(",")[0]
    .trim();
  const host = forwardedHost || String(req?.headers?.host || "").trim();
  if (!host) return "";
  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim();
  const protocol = forwardedProto || req?.protocol || "https";
  return normalizePublicBaseUrl(`${protocol}://${host}`);
}

function getConfiguredPublicSiteBaseUrl() {
  const railwayUrl = normalizePublicBaseUrl(
    process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL,
  );
  if (railwayUrl) return railwayUrl;
  return normalizePublicBaseUrl(
    process.env.PUBLIC_SITE_URL ||
      process.env.APP_URL ||
      process.env.SHOP_URL ||
      process.env.FRONTEND_URL ||
      DEFAULT_PUBLIC_SITE_URL,
  );
}

function getPublicSiteBaseUrl(req) {
  const requestUrl = getRequestPublicBaseUrl(req);
  if (requestUrl && !isLocalPublicBaseUrl(requestUrl)) return requestUrl;

  const configuredUrl = getConfiguredPublicSiteBaseUrl();
  if (configuredUrl && !isLocalPublicBaseUrl(configuredUrl))
    return configuredUrl;

  return requestUrl || configuredUrl || DEFAULT_PUBLIC_SITE_URL;
}

function buildPublicUrl(baseUrl, pathName = "") {
  const normalizedBaseUrl =
    normalizePublicBaseUrl(baseUrl) || DEFAULT_PUBLIC_SITE_URL;
  const normalizedPath = String(pathName || "").replace(/^\/+/, "");
  return normalizedPath
    ? `${normalizedBaseUrl}/${normalizedPath}`
    : normalizedBaseUrl;
}

function calculateIncludedVatAmount(grossAmount) {
  const amount = Number(grossAmount || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Number((amount - amount / (1 + CHECKOUT_VAT_RATE)).toFixed(2));
}

function isExplicitTrue(value) {
  return value === true || String(value || "").toLowerCase() === "true";
}

function isCheckoutTestBypassAllowed() {
  return isExplicitTrue(process.env.ALLOW_TEST_CHECKOUT_BYPASS);
}

function isStripeTestSecretKey() {
  return /^sk_test_/i.test(stripeSecretKey);
}

function isPaypalPaymentEnabled() {
  return (
    isExplicitTrue(process.env.ENABLE_PAYPAL) ||
    (isExplicitTrue(process.env.ENABLE_PAYPAL_TEST) && isStripeTestSecretKey())
  );
}

function getCheckoutPaymentMethodTypes() {
  return isPaypalPaymentEnabled() ? ["card", "paypal"] : ["card"];
}

// Rotte prioritarie per Healthcheck e UI
app.get("/cache-reset", sendCacheResetPage);

app.get("/", (req, res) => {
  if (req.query.cacheReset) {
    setCacheClearHeaders(res);
  }
  sendPublicStaticFile(res, "index.html");
});

app.use("/uploads", express.static(RUNTIME_UPLOADS_DIR));
if (RUNTIME_UPLOADS_DIR !== BUNDLED_UPLOADS_DIR) {
  app.use("/uploads", express.static(BUNDLED_UPLOADS_DIR));
}
app.get("/uploads/:fileName", sendMissingUploadPlaceholder);

app.get("/:publicFile", (req, res, next) => {
  const fileName = String(req.params.publicFile || "");
  if (!PUBLIC_STATIC_FILES.has(fileName)) return next();
  sendPublicStaticFile(res, fileName);
});

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    status: "healthy",
    uptime: process.uptime(),
    databasePath: db_module.DB_PATH || path.join(__dirname, "app.db"),
    uploadsPath: RUNTIME_UPLOADS_DIR,
    persistentVolumePath: RAILWAY_VOLUME_MOUNT_PATH || null,
  });
});

function isAdminDataPath(pathname) {
  return (
    pathname.startsWith("/api/admin") ||
    pathname === "/api/auth/users" ||
    pathname === "/admin/users" ||
    pathname.startsWith("/admin/users/") ||
    pathname === "/admin/orders" ||
    pathname === "/admin/products" ||
    pathname.startsWith("/admin/products/")
  );
}

app.use((req, res, next) => {
  if (isAdminDataPath(req.path)) {
    setNoStoreHeaders(res);
  }
  next();
});

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token)
    return res.status(401).json({ error: "Token di sessione mancante" });
  const user = getUserBySessionToken(token);
  if (!user) return res.status(401).json({ error: "Sessione non valida" });
  req.user = user;
  next();
}
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== "admin")
      return res.status(403).json({
        error: "Accesso negato - Richiesto ruolo amministratore",
      });
    next();
  });
}
let transporter = null;
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || "").trim();
const EMAIL_FROM_ADDRESS = String(
  process.env.EMAIL_FROM || process.env.EMAIL_USER || "",
).trim();
const hasSmtpCredentials = Boolean(
  process.env.EMAIL_USER && process.env.EMAIL_PASSWORD,
);
const hasResendCredentials = Boolean(RESEND_API_KEY && EMAIL_FROM_ADDRESS);
let isEmailConfigured = hasSmtpCredentials || hasResendCredentials;
let emailReady = false;
let lastEmailError = null;
let lastEmailCheckAt = null;
const EMAIL_SERVICE = String(process.env.EMAIL_SERVICE || "gmail")
  .trim()
  .toLowerCase();
const SMTP_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.SMTP_TIMEOUT_MS || process.env.EMAIL_TIMEOUT_MS || 12000),
);

function buildEmailTransportOptions() {
  const smtpHost =
    process.env.SMTP_HOST ||
    process.env.EMAIL_HOST ||
    (EMAIL_SERVICE === "gmail" ? "smtp.gmail.com" : "");
  const smtpPort = Number(
    process.env.SMTP_PORT ||
      process.env.EMAIL_PORT ||
      (EMAIL_SERVICE === "gmail" ? 587 : 465),
  );
  const smtpSecure =
    process.env.SMTP_SECURE !== undefined
      ? isExplicitTrue(process.env.SMTP_SECURE)
      : smtpPort === 465;

  const options = {
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
    family: 4,
  };

  if (smtpHost) {
    options.host = smtpHost;
    options.port = smtpPort;
    options.secure = smtpSecure;
    if (!smtpSecure) {
      options.requireTLS = true;
    }
  } else if (EMAIL_SERVICE) {
    options.service = EMAIL_SERVICE;
  }

  if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
    options.tls = {
      rejectUnauthorized: false,
      servername: smtpHost || undefined,
    };
  } else if (smtpHost) {
    options.tls = { servername: smtpHost };
  }

  return options;
}

function markEmailFailure(error) {
  emailReady = false;
  lastEmailError = error?.message || String(error || "Errore email");
  lastEmailCheckAt = new Date().toISOString();
}

async function sendResendEmail(mailOptions) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: mailOptions.from,
      to: [mailOptions.to],
      subject: mailOptions.subject,
      html: mailOptions.html,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      data?.message || data?.error || "Invio email Resend non riuscito",
    );
  }
  return data;
}

async function sendMailMessage(mailOptions) {
  if (hasResendCredentials) {
    await sendResendEmail(mailOptions);
    return "resend";
  }
  if (!transporter) {
    throw new Error("Email non configurata");
  }
  await transporter.sendMail(mailOptions);
  return "smtp";
}

if (hasResendCredentials) {
  emailReady = true;
  lastEmailError = null;
  lastEmailCheckAt = new Date().toISOString();
}

if (hasSmtpCredentials && !hasResendCredentials) {
  transporter = nodemailer.createTransport(buildEmailTransportOptions());
  transporter.verify((error, success) => {
    if (error) {
      console.log("[WARN] Errore configurazione email (SMTP):", error.message);
      markEmailFailure(error);
    } else {
      console.log("[OK] Email configurato e pronto");
      emailReady = true;
      lastEmailError = null;
      lastEmailCheckAt = new Date().toISOString();
    }
  });
}
function getOptionalAuthUser(req) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return null;
  return getUserBySessionToken(token) || null;
}

function combineStreetLine(street, streetNumber) {
  return [street, streetNumber]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

function splitLegacyStreetLine(value) {
  const line = String(value || "").trim();
  const match = line.match(/^(.*?)[,\s]+(\d+[A-Za-z]?(?:\/[A-Za-z0-9]+)?)$/);
  if (!match) {
    return { street: line, streetNumber: "" };
  }
  return { street: match[1].trim(), streetNumber: match[2].trim() };
}

function normalizeProfileAddress(address) {
  if (!address) return null;
  const street = String(address.street || address.line1 || "").trim();
  const streetNumber = String(address.streetNumber || "").trim();
  return {
    id: address.id,
    line1: combineStreetLine(street, streetNumber),
    street: street,
    streetNumber: streetNumber,
    city: address.city || "",
    postalCode: address.postalCode || "",
    country: address.country || "",
    phone: address.phone || "",
    isDefault: Boolean(address.isDefault),
    createdAt: address.createdAt,
  };
}
function normalizeProfilePaymentMethod(method) {
  if (!method) return null;
  return {
    id: method.id,
    alias: method.alias || method.cardHolder || "",
    brand: method.brand || "",
    last4: method.last4 || method.cardNumber || "",
    expiry: method.expiry || method.expiryDate || "",
    isDefault: Boolean(method.isDefault),
    createdAt: method.createdAt,
  };
}
function buildProfilePayload(userId) {
  const user = getUserById(userId);
  const addresses = getAddressesByUserId(userId).map(normalizeProfileAddress);
  const paymentMethods = getPaymentMethodsByUserId(userId).map(
    normalizeProfilePaymentMethod,
  );
  const orders = getOrdersByUserId(userId).map((order) => ({
    ...order,
    customerName: user.name,
    customerEmail: user.email,
  }));
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    addresses: addresses,
    paymentMethods: paymentMethods,
    orders: orders,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt || null,
    passwordUpdatedAt: user.passwordUpdatedAt || null,
  };
}
function normalizeAdminShippingAddress(shippingAddress) {
  if (!shippingAddress) return null;
  if (typeof shippingAddress === "string") {
    try {
      return JSON.parse(shippingAddress);
    } catch (error) {
      return {
        line1: shippingAddress,
        city: "",
        postalCode: "",
        country: "",
      };
    }
  }
  return shippingAddress;
}
function buildAdminUserPayload(userId) {
  const user = getUserById(userId);
  if (!user) return null;
  const addresses = getAddressesByUserId(userId).map(normalizeProfileAddress);
  const paymentMethods = getPaymentMethodsByUserId(userId).map(
    normalizeProfilePaymentMethod,
  );
  const orders = getOrdersByUserId(userId).map((order) => ({
    ...order,
    shippingAddress: normalizeAdminShippingAddress(order.shippingAddress),
  }));
  const totalSpent = orders.reduce(
    (sum, order) => sum + Number(order.total || 0),
    0,
  );
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt || null,
    passwordUpdatedAt: user.passwordUpdatedAt || null,
    sessionActive: Boolean(user.sessionToken),
    addresses: addresses,
    paymentMethods: paymentMethods,
    orders: orders,
    stats: {
      ordersCount: orders.length,
      addressesCount: addresses.length,
      paymentMethodsCount: paymentMethods.length,
      totalSpent: Number(totalSpent.toFixed(2)),
    },
  };
}
function sanitizeFileSegment(value) {
  return (
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "product"
  );
}
function getProductImageAbsolutePath(imagePath) {
  if (!imagePath || !String(imagePath).startsWith("uploads/")) return null;
  const relativePath = String(imagePath).replace(/^uploads[\\/]/, "");
  const runtimePath = path.join(RUNTIME_UPLOADS_DIR, relativePath);
  if (
    fs.existsSync(runtimePath) ||
    RUNTIME_UPLOADS_DIR === BUNDLED_UPLOADS_DIR
  ) {
    return runtimePath;
  }
  return null;
}
function ensureCheckoutUser(customerEmail, customerName) {
  let user = getUserByEmail(customerEmail);
  if (user) return user;
  const randomPassword = `checkout_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  createUser(
    customerEmail,
    customerName || customerEmail.split("@")[0],
    randomPassword,
    "user",
  );
  return getUserByEmail(customerEmail);
}
function getStripeCustomerEmail(paymentIntent) {
  return (
    paymentIntent.receipt_email ||
    paymentIntent.metadata?.customer_email ||
    paymentIntent.latest_charge?.billing_details?.email ||
    paymentIntent.charges?.data?.[0]?.billing_details?.email ||
    ""
  );
}
function getStripeCustomerName(paymentIntent, customerEmail) {
  return (
    paymentIntent.metadata?.customer_name ||
    paymentIntent.latest_charge?.billing_details?.name ||
    paymentIntent.charges?.data?.[0]?.billing_details?.name ||
    customerEmail.split("@")[0] ||
    "Cliente"
  );
}
function getStripeClient() {
  if (!stripe) {
    const error = new Error(
      "Stripe non configurato. Imposta STRIPE_SECRET_KEY nel file .env o nelle variabili ambiente.",
    );
    error.code = "STRIPE_CONFIG_ERROR";
    throw error;
  }
  return stripe;
}
function buildImportedItems(paymentIntent) {
  const metadataItems = paymentIntent.metadata?.items;
  if (metadataItems) {
    try {
      const parsed = JSON.parse(metadataItems);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch (error) {
      console.warn("Metadata items Stripe non validi:", error.message);
    }
  }
  return [
    {
      id: 0,
      name: paymentIntent.description || "Ordine importato da Stripe",
      quantity: 1,
      price:
        Number(paymentIntent.amount_received || paymentIntent.amount || 0) /
        100,
    },
  ];
}
function buildImportedShippingAddress(paymentIntent) {
  const metadataShipping = paymentIntent.metadata?.shipping_address;
  if (metadataShipping) {
    try {
      return JSON.parse(metadataShipping);
    } catch (error) {
      console.warn("Shipping address Stripe non valido:", error.message);
    }
  }
  const shipping = paymentIntent.shipping?.address;
  if (shipping) {
    return {
      line1: shipping.line1 || "",
      city: shipping.city || "",
      postalCode: shipping.postal_code || "",
      country: shipping.country || "",
    };
  }
  return { line1: "Non disponibile", city: "", postalCode: "", country: "" };
}
function calculateShippingCost(subtotal) {
  const normalizedSubtotal = Number(subtotal || 0);
  if (normalizedSubtotal <= 0 || normalizedSubtotal >= FREE_SHIPPING_THRESHOLD)
    return 0;
  return Number(
    (normalizedSubtotal * SHIPPING_RATE_UNDER_THRESHOLD).toFixed(2),
  );
}

const ADDRESS_LOOKUP_TIMEOUT_MS = Math.max(
  1500,
  Number(process.env.ADDRESS_LOOKUP_TIMEOUT_MS || 8000),
);
const ADDRESS_LOOKUP_CACHE_TTL_MS = Math.max(
  60 * 1000,
  Number(process.env.ADDRESS_LOOKUP_CACHE_TTL_MS || 6 * 60 * 60 * 1000),
);
const ADDRESS_LOOKUP_MAX_CACHE_ITEMS = Math.max(
  50,
  Number(process.env.ADDRESS_LOOKUP_MAX_CACHE_ITEMS || 500),
);
const ADDRESS_LOOKUP_USER_AGENT =
  String(process.env.ADDRESS_LOOKUP_USER_AGENT || "").trim() ||
  "ShopNow/1.0 (address-autofill; contact: configure ADDRESS_LOOKUP_CONTACT_EMAIL)";
const ADDRESS_LOOKUP_CONTACT_EMAIL = String(
  process.env.ADDRESS_LOOKUP_CONTACT_EMAIL || process.env.EMAIL_USER || "",
).trim();
const NOMINATIM_REQUEST_INTERVAL_MS = Math.max(
  1000,
  Number(process.env.NOMINATIM_REQUEST_INTERVAL_MS || 1000),
);
const ADDRESS_LOOKUP_ATTRIBUTION =
  "Postal data from Zippopotam.us/GeoNames and OpenStreetMap contributors.";
const addressLookupCache = new Map();
let lastNominatimRequestAt = 0;
let nominatimQueue = Promise.resolve();

function normalizeAddressLookupCountry(country) {
  const normalized = String(country || "")
    .trim()
    .toUpperCase();
  const aliases = {
    UK: "GB",
  };
  return aliases[normalized] || normalized;
}

function normalizeAddressLookupValue(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeAddressLookupPostalCode(value) {
  return normalizeAddressLookupValue(value).toUpperCase();
}

function isSafeAddressLookupText(value) {
  return !/[\u0000-\u001f\u007f<>]/.test(String(value || ""));
}

function getAddressLookupCache(cacheKey) {
  const cached = addressLookupCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > ADDRESS_LOOKUP_CACHE_TTL_MS) {
    addressLookupCache.delete(cacheKey);
    return null;
  }
  return cached.value;
}

function setAddressLookupCache(cacheKey, value) {
  if (addressLookupCache.size >= ADDRESS_LOOKUP_MAX_CACHE_ITEMS) {
    const oldestKey = addressLookupCache.keys().next().value;
    if (oldestKey) addressLookupCache.delete(oldestKey);
  }
  addressLookupCache.set(cacheKey, {
    createdAt: Date.now(),
    value,
  });
  return value;
}

async function waitForNominatimSlot() {
  const previousRequest = nominatimQueue.catch(() => {});
  let releaseSlot = () => {};
  nominatimQueue = new Promise((resolve) => {
    releaseSlot = resolve;
  });

  await previousRequest;

  try {
    const now = Date.now();
    const waitMs = Math.max(
      0,
      NOMINATIM_REQUEST_INTERVAL_MS - (now - lastNominatimRequestAt),
    );
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    lastNominatimRequestAt = Date.now();
  } finally {
    releaseSlot();
  }
}

async function fetchAddressLookupJson(url, options = {}) {
  if (options.rateLimit === "nominatim") {
    await waitForNominatimSlot();
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    ADDRESS_LOOKUP_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": ADDRESS_LOOKUP_USER_AGENT,
        ...(ADDRESS_LOOKUP_CONTACT_EMAIL
          ? { From: ADDRESS_LOOKUP_CONTACT_EMAIL }
          : {}),
      },
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Address lookup API error: ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeZippopotamPostalResult(country, postalCode, data) {
  const places = Array.isArray(data?.places) ? data.places : [];
  const seen = new Set();
  const matches = places
    .map((place) => ({
      city: normalizeAddressLookupValue(place["place name"]),
      postalCode: normalizeAddressLookupValue(
        data?.["post code"] || postalCode,
      ),
      state: normalizeAddressLookupValue(place.state),
      stateCode: normalizeAddressLookupValue(place["state abbreviation"]),
      country: normalizeAddressLookupCountry(
        data?.["country abbreviation"] || country,
      ),
      latitude: place.latitude || "",
      longitude: place.longitude || "",
      source: "zippopotam.us",
    }))
    .filter((place) => place.city && place.postalCode)
    .filter((place) => {
      const key = `${place.postalCode}:${place.city}:${place.state}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return {
    success: matches.length > 0,
    source: "zippopotam.us",
    matches,
  };
}

function normalizeNominatimPostalResult(country, postalCode, data) {
  const places = Array.isArray(data) ? data : [];
  const seen = new Set();
  const matches = places
    .map((place) => {
      const address = place.address || {};
      const city =
        address.city ||
        address.town ||
        address.village ||
        address.municipality ||
        address.county ||
        address.suburb ||
        place.name;
      return {
        city: normalizeAddressLookupValue(city),
        postalCode: normalizeAddressLookupValue(address.postcode || postalCode),
        state: normalizeAddressLookupValue(address.state || address.region),
        stateCode: "",
        country: normalizeAddressLookupCountry(address.country_code || country),
        latitude: place.lat || "",
        longitude: place.lon || "",
        source: "nominatim.openstreetmap.org",
      };
    })
    .filter((place) => place.city && place.postalCode)
    .filter((place) => {
      const key = `${place.postalCode}:${place.city}:${place.state}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return {
    success: matches.length > 0,
    source: "nominatim.openstreetmap.org",
    matches,
  };
}

function normalizeZippopotamCityResult(country, region, city, data) {
  const places = Array.isArray(data?.places) ? data.places : [];
  const seen = new Set();
  const matches = places
    .map((place) => ({
      city: normalizeAddressLookupValue(
        place["place name"] || data?.["place name"] || city,
      ),
      postalCode: normalizeAddressLookupValue(place["post code"]),
      state: normalizeAddressLookupValue(data?.state || region),
      stateCode: normalizeAddressLookupValue(data?.["state abbreviation"]),
      country: normalizeAddressLookupCountry(
        data?.["country abbreviation"] || country,
      ),
      latitude: place.latitude || "",
      longitude: place.longitude || "",
      source: "zippopotam.us",
    }))
    .filter((place) => place.city && place.postalCode)
    .filter((place) => {
      const key = `${place.postalCode}:${place.city}:${place.state}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return {
    success: matches.length > 0,
    source: "zippopotam.us",
    matches,
  };
}

async function lookupAddressByPostalCode(country, postalCode) {
  const normalizedPostalCode = normalizeAddressLookupPostalCode(postalCode);
  const providerAttempts = [];
  const cacheKey = `postal:${country}:${normalizedPostalCode}`;
  const cached = getAddressLookupCache(cacheKey);
  if (cached) {
    return {
      ...cached,
      cached: true,
    };
  }

  const zippopotamUrl = `https://api.zippopotam.us/${encodeURIComponent(country)}/${encodeURIComponent(normalizedPostalCode)}`;
  let result = {
    success: false,
    source: "none",
    matches: [],
    providerAttempts,
    cached: false,
  };

  try {
    const data = await fetchAddressLookupJson(zippopotamUrl);
    providerAttempts.push("zippopotam.us");
    if (data) {
      result = {
        ...normalizeZippopotamPostalResult(country, normalizedPostalCode, data),
        providerAttempts,
        cached: false,
      };
    }
  } catch (error) {
    providerAttempts.push("zippopotam.us:error");
    console.warn("Zippopotam lookup non disponibile:", error.message);
  }

  if (!result.success) {
    try {
      const nominatimUrl = new URL(
        "https://nominatim.openstreetmap.org/search",
      );
      nominatimUrl.searchParams.set("format", "jsonv2");
      nominatimUrl.searchParams.set("addressdetails", "1");
      nominatimUrl.searchParams.set("limit", "3");
      nominatimUrl.searchParams.set("countrycodes", country.toLowerCase());
      nominatimUrl.searchParams.set("postalcode", normalizedPostalCode);
      if (ADDRESS_LOOKUP_CONTACT_EMAIL) {
        nominatimUrl.searchParams.set("email", ADDRESS_LOOKUP_CONTACT_EMAIL);
      }
      const data = await fetchAddressLookupJson(nominatimUrl.toString(), {
        rateLimit: "nominatim",
      });
      providerAttempts.push("nominatim.openstreetmap.org");
      if (data) {
        result = {
          ...normalizeNominatimPostalResult(
            country,
            normalizedPostalCode,
            data,
          ),
          providerAttempts,
          cached: false,
        };
      }
    } catch (error) {
      providerAttempts.push("nominatim.openstreetmap.org:error");
      console.warn("Nominatim lookup non disponibile:", error.message);
    }
  }

  return setAddressLookupCache(cacheKey, result);
}

async function lookupAddressByCity(country, region, city) {
  const normalizedRegion = normalizeAddressLookupValue(region).toUpperCase();
  const normalizedCity = normalizeAddressLookupValue(city);
  const providerAttempts = [];
  const cacheKey = `city:${country}:${normalizedRegion}:${normalizedCity.toUpperCase()}`;
  const cached = getAddressLookupCache(cacheKey);
  if (cached) {
    return {
      ...cached,
      cached: true,
    };
  }

  const url = `https://api.zippopotam.us/${encodeURIComponent(country)}/${encodeURIComponent(normalizedRegion)}/${encodeURIComponent(normalizedCity)}`;
  const data = await fetchAddressLookupJson(url);
  providerAttempts.push("zippopotam.us");
  const result = data
    ? {
        ...normalizeZippopotamCityResult(
          country,
          normalizedRegion,
          normalizedCity,
          data,
        ),
        providerAttempts,
        cached: false,
      }
    : {
        success: false,
        source: "zippopotam.us",
        matches: [],
        providerAttempts,
        cached: false,
      };

  return setAddressLookupCache(cacheKey, result);
}
function buildCheckoutStockSnapshot(items) {
  if (!Array.isArray(items) || !items.length) {
    const error = new Error("Il carrello e vuoto");
    error.code = "INVALID_ORDER_ITEMS";
    throw error;
  }

  // Ottieni tutti gli ID dei prodotti necessari
  const productIds = [
    ...new Set(
      items
        .map((item) => Number(item?.id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];

  if (productIds.length === 0) {
    const error = new Error("Nessun prodotto valido nel carrello");
    error.code = "INVALID_ORDER_ITEMS";
    throw error;
  }

  // Carica tutti i prodotti necessari in una sola query
  const placeholders = productIds.map(() => "?").join(",");
  const productsStmt = db.prepare(
    `SELECT * FROM products WHERE id IN (${placeholders})`,
  );
  const products = productsStmt.all(...productIds);

  // Crea una mappa per accesso rapido
  const productsMap = new Map(products.map((p) => [p.id, p]));

  const aggregatedItems = new Map();
  items.forEach((item) => {
    const productId = Number(item?.id);
    const quantity = Math.floor(Number(item?.quantity || 0));
    if (
      !Number.isInteger(productId) ||
      productId <= 0 ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      const error = new Error("Articoli ordine non validi");
      error.code = "INVALID_ORDER_ITEMS";
      throw error;
    }
    aggregatedItems.set(
      productId,
      (aggregatedItems.get(productId) || 0) + quantity,
    );
  });

  const normalizedItems = [];
  let subtotal = 0;
  aggregatedItems.forEach((quantity, productId) => {
    const product = productsMap.get(productId);
    if (!product) {
      const error = new Error(`Prodotto con ID ${productId} non trovato`);
      error.code = "PRODUCT_NOT_FOUND";
      error.productId = productId;
      throw error;
    }
    const availableStock = Math.max(0, Math.floor(Number(product.stock || 0)));
    if (availableStock < quantity) {
      const error = new Error(
        `Stock insufficiente per ${product.name}. Disponibili: ${availableStock}.`,
      );
      error.code = "INSUFFICIENT_STOCK";
      error.productId = product.id;
      error.productName = product.name;
      error.availableStock = availableStock;
      throw error;
    }
    const price = Number(product.price || 0);
    subtotal += price * quantity;
    normalizedItems.push({
      id: product.id,
      name: product.name,
      price: price,
      quantity: quantity,
      image: product.image || "",
      stock: availableStock,
    });
  });
  const shipping = normalizedItems.length ? calculateShippingCost(subtotal) : 0;
  const vat = calculateIncludedVatAmount(subtotal);
  const total = Number((subtotal + shipping).toFixed(2));
  return {
    items: normalizedItems,
    subtotal: Number(subtotal.toFixed(2)),
    vat: vat,
    shipping: Number(shipping.toFixed(2)),
    total: total,
  };
}
async function syncStripeHistory(limit = 100) {
  const stripeClient = getStripeClient();
  const paymentIntents = await stripeClient.paymentIntents.list({
    limit: limit,
    expand: ["data.latest_charge"],
  });
  let imported = 0;
  let skipped = 0;
  for (const paymentIntent of paymentIntents.data) {
    if (paymentIntent.status !== "succeeded") {
      skipped += 1;
      continue;
    }
    if (getOrderByStripePaymentIntentId(paymentIntent.id)) {
      skipped += 1;
      continue;
    }
    const customerEmail = getStripeCustomerEmail(paymentIntent);
    if (!customerEmail) {
      skipped += 1;
      continue;
    }
    const customerName = getStripeCustomerName(paymentIntent, customerEmail);
    const checkoutUser = ensureCheckoutUser(customerEmail, customerName);
    const items = buildImportedItems(paymentIntent);
    const shippingAddress = buildImportedShippingAddress(paymentIntent);
    const createdAt = new Date(paymentIntent.created * 1e3).toISOString();
    const order = createOrder(
      checkoutUser.id,
      Number(paymentIntent.amount_received || paymentIntent.amount || 0) / 100,
      items,
      JSON.stringify(shippingAddress),
      paymentIntent.id,
      createdAt,
    );
    updateOrderStatus(order.id, "paid");
    imported += 1;
  }
  return {
    imported: imported,
    skipped: skipped,
    fetched: paymentIntents.data.length,
  };
}
async function getStripeDashboardSummary(limit = 100) {
  try {
    const stripeClient = getStripeClient();
    const paymentIntents = await stripeClient.paymentIntents.list({
      limit: limit,
      expand: ["data.latest_charge"],
    });
    const succeededPaymentIntents = paymentIntents.data.filter(
      (paymentIntent) => paymentIntent.status === "succeeded",
    );
    const stripeRevenue = succeededPaymentIntents.reduce(
      (sum, paymentIntent) => {
        return (
          sum +
          Number(paymentIntent.amount_received || paymentIntent.amount || 0) /
            100
        );
      },
      0,
    );
    console.log(
      `Stripe: ${succeededPaymentIntents.length} ordini, EUR ${stripeRevenue.toFixed(2)} di ricavi`,
    );
    return {
      ordersCount: succeededPaymentIntents.length,
      revenue: stripeRevenue,
      paymentIntents: succeededPaymentIntents,
    };
  } catch (error) {
    console.error("Errore caricamento Stripe:", error.message);
    throw error;
  }
}
async function sendOrderConfirmationEmail({
  customerName,
  customerEmail,
  orderId,
  amount,
  items,
  orderDate,
  shippingAddress,
  siteBaseUrl,
}) {
  // Crea tabella HTML per gli articoli
  let itemsHTML = `
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
                <tr style="background-color: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 12px; text-align: left; font-weight: bold; color: #131921;">Articolo</th>
                    <th style="padding: 12px; text-align: center; font-weight: bold; color: #131921;">Quantita</th>
                    <th style="padding: 12px; text-align: right; font-weight: bold; color: #131921;">Prezzo</th>
                </tr>
            </thead>
            <tbody>
    `;
  let subtotal = 0;
  for (const item of items) {
    const itemTotal = item.price * item.quantity;
    subtotal += itemTotal;
    itemsHTML += `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 12px; color: #131921;">${item.name}</td>
                    <td style="padding: 12px; text-align: center; color: #131921;">${item.quantity}</td>
                    <td style="padding: 12px; text-align: right; color: #131921;">&euro;${itemTotal.toFixed(2)}</td>
                </tr>
        `;
  }
  itemsHTML += `
            </tbody>
        </table>
    `;
  const shippingText = shippingAddress
    ? `${shippingAddress.line1}, ${shippingAddress.postalCode} ${shippingAddress.city}, ${shippingAddress.country}`
    : "Non specificato";
  const shippingAmount = Math.max(
    0,
    Number((Number(amount || 0) - subtotal).toFixed(2)),
  );
  const includedVat = calculateIncludedVatAmount(subtotal);
  const publicSiteBaseUrl = siteBaseUrl || getPublicSiteBaseUrl();
  const shopUrl = buildPublicUrl(publicSiteBaseUrl);
  const accountUrl = buildPublicUrl(publicSiteBaseUrl, "account.html");
  const privacyUrl = buildPublicUrl(publicSiteBaseUrl, "privacy");
  if (!isEmailConfigured) {
    console.log(
      "[WARN] Email non configurato (mancano credenziali), ordine salvato normalmente",
    );
    return {
      success: true,
      emailSent: false,
      message: "Ordine confermato (email non configurata)",
    };
  }
  const mailOptions = {
    from: EMAIL_FROM_ADDRESS,
    to: customerEmail,
    subject: `Ordine Confermato #${orderId} - ShopNow`,
    html: `
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #131921; background-color: #f3f3f3; }
        .email-container { max-width: 600px; margin: 0 auto; background-color: white; }
        .header { background: linear-gradient(135deg, #ff9900 0%, #ff7700 100%); color: white; padding: 30px 20px; text-align: center; }
        .header h1 { font-size: 28px; margin-bottom: 5px; font-weight: 700; }
        .header p { font-size: 14px; opacity: 0.95; }
        .content { padding: 30px 20px; }
        .greeting { font-size: 16px; color: #131921; margin-bottom: 20px; line-height: 1.5; }
        .status-badge { background-color: #31a24c; color: white; padding: 12px 20px; border-radius: 5px; display: inline-block; font-weight: 600; margin: 10px 0; }
        .order-details { background-color: #f8f9fa; border-left: 4px solid #ff9900; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .order-details h3 { color: #131921; margin-bottom: 12px; font-size: 16px; }
        .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e0e0e0; }
        .detail-row:last-child { border-bottom: none; }
        .detail-label { color: #565959; font-weight: 500; }
        .detail-value { color: #131921; font-weight: 600; }
        .items-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .items-table thead tr { background-color: #f8f9fa; border-bottom: 2px solid #ddd; }
        .items-table th { padding: 12px; text-align: left; font-weight: 700; color: #131921; font-size: 14px; }
        .items-table td { padding: 12px; border-bottom: 1px solid #eee; color: #131921; }
        .items-table tbody tr:hover { background-color: #f9f9f9; }
        .summary { background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .summary-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; }
        .summary-row.total { border-top: 2px solid #ddd; padding-top: 12px; font-size: 18px; font-weight: 700; color: #131921; }
        .shipping-info { background-color: #e8f5e9; border-left: 4px solid #31a24c; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .shipping-info h3 { color: #131921; margin-bottom: 10px; font-size: 16px; }
        .shipping-info p { color: #424242; line-height: 1.6; }
        .next-steps { margin: 20px 0; }
        .next-steps h3 { color: #131921; margin-bottom: 12px; font-size: 16px; }
        .next-steps ul { margin-left: 20px; }
        .next-steps li { color: #424242; margin: 8px 0; line-height: 1.5; }
        .cta-button { background-color: #ff9900; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 15px 0; font-weight: 600; }
        .footer { background-color: #232f3e; color: #b0b0b0; padding: 30px 20px; text-align: center; font-size: 12px; border-top: 1px solid #ddd; }
        .footer p { margin: 8px 0; line-height: 1.5; }
        .footer-links { margin: 15px 0; }
        .footer-links a { color: #b0b0b0; text-decoration: none; margin: 0 10px; }
        .divider { border-top: 1px solid #ddd; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="email-container">
        <!-- Header -->
        <div class="header">
            <h1>ShopNow</h1>
            <p>Ordine Confermato con Successo</p>
        </div>

        <!-- Content -->
        <div class="content">
            <!-- Greeting -->
            <div class="greeting">
                Ciao <strong>${customerName}</strong>,
                <div class="status-badge">Pagamento confermato</div>
            </div>

            <p style="color: #424242; margin-bottom: 15px;">Grazie per aver acquistato su ShopNow! Il tuo ordine &egrave; stato confermato e sar&agrave; elaborato al pi&ugrave; presto.</p>

            <!-- Order Details -->
            <div class="order-details">
                <h3>Dettagli Ordine</h3>
                <div class="detail-row">
                    <span class="detail-label">Numero Ordine:</span>
                    <span class="detail-value">#${orderId}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Data Ordine:</span>
                    <span class="detail-value">${orderDate}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Email:</span>
                    <span class="detail-value">${customerEmail}</span>
                </div>
            </div>

            <!-- Items -->
            <h3 style="color: #131921; margin: 20px 0 15px 0; font-size: 16px;">Articoli acquistati</h3>
            ${itemsHTML}

            <!-- Order Summary -->
            <div class="summary">
                <div class="summary-row">
                    <span>Subtotale prodotti (IVA inclusa):</span>
                    <span>&euro;${subtotal.toFixed(2)}</span>
                </div>
                <div class="summary-row">
                    <span>Spedizione:</span>
                    <span>${shippingAmount > 0 ? `&euro;${shippingAmount.toFixed(2)}` : "Gratis"}</span>
                </div>
                <div class="summary-row">
                    <span>Di cui IVA prodotti (22%):</span>
                    <span>&euro;${includedVat.toFixed(2)}</span>
                </div>
                <div class="summary-row total">
                    <span>Totale Pagato:</span>
                    <span>&euro;${amount.toFixed(2)}</span>
                </div>
            </div>

            <!-- Shipping Information -->
            <div class="shipping-info">
                <h3>Informazioni spedizione</h3>
                <p><strong>Indirizzo di Spedizione:</strong><br/>${shippingText}</p>
                <p style="margin-top: 10px; font-size: 13px;">Questo &egrave; un ambiente di test. In produzione, riceverai aggiornamenti sullo stato della spedizione.</p>
            </div>

            <!-- Next Steps -->
            <div class="next-steps">
                <h3>Cosa Fare Adesso</h3>
                <ul>
                    <li>Controlla il tuo account per vedere lo stato dell'ordine</li>
                    <li>Visita il tuo account per eventuali aggiornamenti</li>
                    <li>Contatta il nostro supporto se hai domande sul tuo ordine</li>
                </ul>
            </div>

            <p style="color: #424242; margin-top: 20px; line-height: 1.6; font-size: 14px;">
                Se hai domande riguardanti il tuo ordine, non esitare a visitare il nostro centro assistenza o contattarci direttamente. Siamo qui per aiutarti!
            </p>
        </div>

        <!-- Divider -->
        <div class="divider"></div>

        <!-- Footer -->
        <div class="footer">
            <p><strong>ShopNow - Il tuo marketplace di fiducia</strong></p>
            <div class="footer-links">
                <a href="${shopUrl}">Shop</a> |
                <a href="${accountUrl}">Account</a> |
                <a href="${shopUrl}">Chi Siamo</a> |
                <a href="${privacyUrl}">Privacy</a>
            </div>
            <p>&copy; 2026 ShopNow. Tutti i diritti riservati.</p>
            <p style="margin-top: 15px; opacity: 0.8;">
                Questa &egrave; una email automatica. Non rispondere direttamente a questo indirizzo.
            </p>
        </div>
    </div>
</body>
</html>
        `,
  };
  const emailProvider = await sendMailMessage(mailOptions);
  emailReady = true;
  lastEmailError = null;
  lastEmailCheckAt = new Date().toISOString();
  sentEmails.push({
    subject: mailOptions.subject,
    to: customerEmail,
    text: `Ordine #${orderId} confermato - Totale EUR ${amount.toFixed(2)}`,
    timestamp: new Date().toLocaleString("it-IT"),
    orderId: orderId,
    provider: emailProvider,
  });
  console.log(`[OK] Email inviata a ${customerEmail} via ${emailProvider}`);
  return {
    success: true,
    emailSent: true,
    message: "Email inviata con successo",
  };
}

async function sendOrderConfirmationEmailSafely(payload) {
  try {
    return await sendOrderConfirmationEmail(payload);
  } catch (error) {
    markEmailFailure(error);
    console.error(
      `[EMAIL ERROR] Fallimento per ordine #${payload.orderId}:`,
      error.message,
    );
    return {
      success: false,
      emailSent: false,
      message: error.message || "Email non inviata",
    };
  }
}

app.post("/create-payment-intent", async (req, res) => {
  try {
    const { amount, customerName, customerEmail, items } = req.body;
    const stripeClient = getStripeClient();
    let payableAmount = Number(amount || 0);
    if (Array.isArray(items) && items.length) {
      const checkoutSnapshot = buildCheckoutStockSnapshot(items);
      payableAmount = checkoutSnapshot.total;
      if (amount && Math.abs(Number(amount) - payableAmount) > 0.01) {
        return res.status(400).json({
          error: "Totale ordine non coerente con i prezzi correnti",
        });
      }
    }
    if (!payableAmount || payableAmount <= 0) {
      return res.status(400).json({ error: "Amount non valido" });
    }
    const paymentIntentParams = {
      amount: Math.round(payableAmount * 100),
      currency: "eur",
      description: customerName
        ? `Ordine da ${customerName}`
        : "Ordine ShopNow",
      payment_method_types: getCheckoutPaymentMethodTypes(),
      metadata: {
        customer_name: String(customerName || ""),
        customer_email: String(customerEmail || ""),
      },
    };
    if (customerEmail) {
      paymentIntentParams.receipt_email = String(customerEmail).trim();
    }
    const paymentIntent =
      await stripeClient.paymentIntents.create(paymentIntentParams);
    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: payableAmount,
      paymentMethodTypes: paymentIntent.payment_method_types,
    });
  } catch (error) {
    console.error("Errore Payment Intent:", error);
    const statusCode = ["INVALID_ORDER_ITEMS", "PRODUCT_NOT_FOUND"].includes(
      error.code,
    )
      ? 400
      : error.code === "INSUFFICIENT_STOCK"
        ? 409
        : 500;
    res.status(statusCode).json({
      error: error.message,
      productId: error.productId,
      availableStock: error.availableStock,
    });
  }
});
app.post("/confirm-payment", async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    const stripeClient = getStripeClient();
    const paymentIntent =
      await stripeClient.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status === "succeeded") {
      res.json({
        success: true,
        orderId: paymentIntent.id,
        amount: paymentIntent.amount / 100,
        message: "Pagamento completato con successo!",
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Pagamento non completato",
      });
    }
  } catch (error) {
    console.error("Errore conferma pagamento:", error);
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/checkout", requireAuth, async (req, res) => {
  try {
    const {
      paymentIntentId,
      items,
      total,
      shippingAddress,
      customerName,
      customerEmail,
      fileModeCheckout,
      cardSummary,
      skipStripe, // Nuovo parametro per saltare Stripe nei test
      skipEmail, // Nuovo parametro per saltare l'invio email nei test
      skipValidation, // Nuovo parametro per saltare la validazione completa nei test
    } = req.body;
    const checkoutTestBypassAllowed = isCheckoutTestBypassAllowed();
    const wantsSkipStripe = isExplicitTrue(skipStripe);
    const wantsSkipEmail = isExplicitTrue(skipEmail);
    const wantsSkipValidation = isExplicitTrue(skipValidation);
    const wantsFileModeCheckout =
      isExplicitTrue(fileModeCheckout) || !paymentIntentId;

    if (
      (wantsSkipStripe || wantsSkipValidation || wantsFileModeCheckout) &&
      !checkoutTestBypassAllowed
    ) {
      return res.status(403).json({
        error: "Modalita di test checkout disabilitata",
      });
    }

    const shouldSkipEmail = wantsSkipEmail && checkoutTestBypassAllowed;
    const isFileModeCheckout =
      wantsFileModeCheckout && checkoutTestBypassAllowed;
    if (
      !Array.isArray(items) ||
      !items.length ||
      !total ||
      !shippingAddress ||
      !customerEmail ||
      !customerName
    ) {
      console.error(
        "[ERROR] Checkout fallito: dati incompleti ricevuti dal client.",
      );
      return res.status(400).json({ error: "Dati checkout incompleti" });
    }
    // Salta la validazione completa se richiesto per test rapidi
    let checkoutSnapshot = null;
    if (wantsSkipValidation && checkoutTestBypassAllowed) {
      console.log("[INFO] Skipping validation (test mode)");
      checkoutSnapshot = {
        items: items.map((item) => ({
          id: item.id,
          name: `Product ${item.id}`,
          price: 100,
          quantity: item.quantity,
          image: "",
          stock: 100,
        })),
        subtotal: 200,
        vat: calculateIncludedVatAmount(200),
        shipping: 0,
        total: total || 200,
      };
    } else {
      checkoutSnapshot = buildCheckoutStockSnapshot(items);
      if (Math.abs(checkoutSnapshot.total - Number(total)) > 0.01) {
        console.error(
          `[ERROR] Checkout fallito: discrepanza totale. Client: ${total}, Server: ${checkoutSnapshot.total}`,
        );
        return res.status(400).json({
          error: "Totale ordine non coerente con i prezzi correnti",
        });
      }
    }
    const expectedAmount = Math.round(checkoutSnapshot.total * 100);
    let confirmedPaymentIntent = null;

    // Se skipStripe e true, salta completamente Stripe per i test
    if (wantsSkipStripe && checkoutTestBypassAllowed) {
      console.log("[INFO] Stripe bypassato tramite skipStripe flag.");
      confirmedPaymentIntent = {
        id: `pi_test_${Date.now()}`,
        status: "succeeded",
        amount: expectedAmount,
        currency: "eur",
        client_secret: "test_secret",
        metadata: {
          customer_name: customerName,
          customer_email: customerEmail,
          checkout_mode: "test_skip_stripe",
        },
      };
    } else if (isFileModeCheckout) {
      const stripeClient = getStripeClient();
      confirmedPaymentIntent = await stripeClient.paymentIntents.create({
        amount: expectedAmount,
        currency: "eur",
        payment_method: "pm_card_visa",
        confirm: true,
        payment_method_types: ["card"],
        receipt_email: customerEmail,
        description: `Ordine file mode - ${customerName}`,
        metadata: {
          customer_name: customerName,
          customer_email: customerEmail,
          card_brand: cardSummary?.brand || "Carta",
          card_last4: cardSummary?.last4 || "0000",
          checkout_mode: "file",
        },
      });
    } else {
      const stripeClient = getStripeClient();
      const paymentIntent =
        await stripeClient.paymentIntents.retrieve(paymentIntentId);
      if (!paymentIntent || paymentIntent.status !== "succeeded") {
        console.error(
          `[ERROR] Checkout fallito: PaymentIntent ${paymentIntentId} non riuscito.`,
        );
        return res
          .status(400)
          .json({ error: "Pagamento non confermato da Stripe" });
      }
      if (paymentIntent.amount !== expectedAmount) {
        console.error(
          `[ERROR] Checkout fallito: l'importo Stripe (${paymentIntent.amount}) non corrisponde all'ordine (${expectedAmount})`,
        );
        return res.status(400).json({
          error: "Importo pagamento non coerente con l'ordine",
        });
      }
      confirmedPaymentIntent = paymentIntent;
    }
    const authUser = getOptionalAuthUser(req);
    const checkoutUser =
      authUser || ensureCheckoutUser(customerEmail, customerName);
    const purchasedItems = checkoutSnapshot.items.map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      image: item.image,
    }));
    const existingOrder = getOrderByStripePaymentIntentId(
      confirmedPaymentIntent.id,
    );
    if (existingOrder) {
      if (authUser && Number(existingOrder.userId) !== Number(authUser.id)) {
        return res.status(409).json({
          error: "Pagamento gia associato a un altro ordine",
        });
      }
      let emailResult = {
        success: true,
        emailSent: false,
        message: "Ordine gia registrato",
      };
      if (isEmailConfigured && !shouldSkipEmail) {
        emailResult = await sendOrderConfirmationEmailSafely({
          customerName: customerName,
          customerEmail: customerEmail,
          orderId: existingOrder.id,
          amount: Number(existingOrder.total || checkoutSnapshot.total),
          items: existingOrder.items?.length
            ? existingOrder.items
            : purchasedItems,
          orderDate: new Date(existingOrder.createdAt).toLocaleString("it-IT"),
          shippingAddress: shippingAddress,
          siteBaseUrl: getPublicSiteBaseUrl(req),
        });
      }
      return res.json({
        success: true,
        order: existingOrder,
        alreadyProcessed: true,
        emailSent: Boolean(emailResult.emailSent),
        emailMessage: emailResult.message,
        paymentIntentId: confirmedPaymentIntent.id,
        updatedProducts:
          wantsSkipStripe && checkoutTestBypassAllowed ? [] : getAllProducts(),
      });
    }

    let updatedOrder = null;
    if (!wantsSkipStripe || !checkoutTestBypassAllowed) {
      updatedOrder = db_module.executeCheckoutTransaction(
        checkoutUser.id,
        checkoutSnapshot.total,
        purchasedItems,
        JSON.stringify(shippingAddress),
        confirmedPaymentIntent.id,
      );
      updatedOrder = updateOrderStatus(updatedOrder.id, "paid");
    } else {
      // Crea ordine fittizio per i test
      updatedOrder = {
        id: Date.now(),
        userId: checkoutUser.id,
        total: checkoutSnapshot.total,
        status: "paid",
        items: purchasedItems,
        shippingAddress: JSON.stringify(shippingAddress),
        createdAt: new Date().toISOString(),
        stripePaymentIntentId: confirmedPaymentIntent.id,
      };
    }
    // Invia email di conferma ordine (salta se richiesto per i test)
    let emailResult = {
      success: true,
      emailSent: false,
      message: shouldSkipEmail
        ? "Email saltata in modalita test"
        : "Email non configurata",
    };
    if (isEmailConfigured && !shouldSkipEmail) {
      console.log(
        `[EMAIL] Inizio procedura invio email per ordine #${updatedOrder.id} a ${customerEmail}`,
      );
      emailResult = await sendOrderConfirmationEmailSafely({
        customerName: customerName,
        customerEmail: customerEmail,
        orderId: updatedOrder.id,
        amount: checkoutSnapshot.total,
        items: purchasedItems,
        orderDate: new Date(updatedOrder.createdAt).toLocaleString("it-IT"),
        shippingAddress: shippingAddress,
        siteBaseUrl: getPublicSiteBaseUrl(req),
      });
    }
    console.log(
      `[OK] Ordine #${updatedOrder.id} completato con successo per ${customerEmail}`,
    );
    res.json({
      success: true,
      order: updatedOrder,
      emailSent: Boolean(emailResult.emailSent),
      emailMessage: emailResult.message,
      paymentIntentId: confirmedPaymentIntent.id,
      // Salta l'aggiornamento prodotti se richiesto per i test
      updatedProducts:
        wantsSkipStripe && checkoutTestBypassAllowed ? [] : getAllProducts(),
    });
  } catch (error) {
    console.error(
      "[ERROR] Errore fatale durante il processo di checkout:",
      error.message,
      error.stack,
    );
    const statusCode = ["INVALID_ORDER_ITEMS", "PRODUCT_NOT_FOUND"].includes(
      error.code,
    )
      ? 400
      : error.code === "INSUFFICIENT_STOCK"
        ? 409
        : 500;
    res.status(statusCode).json({
      error: error.message || "Errore interno del server",
      productId: error.productId,
      availableStock: error.availableStock,
    });
  }
});
app.post("/send-order-email", async (req, res) => {
  try {
    const {
      customerName,
      customerEmail,
      orderId,
      amount,
      items,
      orderDate,
      shippingAddress,
    } = req.body;
    const result = await sendOrderConfirmationEmail({
      customerName: customerName,
      customerEmail: customerEmail,
      orderId: orderId,
      amount: amount,
      items: items,
      orderDate: orderDate,
      shippingAddress: shippingAddress,
    });
    res.json(result);
  } catch (error) {
    console.error("Errore invio email:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      emailSent: false,
    });
  }
});
app.get("/config", (req, res) =>
  res.json({
    stripePublicKey: process.env.STRIPE_PUBLIC_KEY || "pk_test_placeholder",
    emailConfigured: isEmailConfigured,
    emailReady: emailReady,
    emailLastError: lastEmailError ? "Email non pronta" : null,
    emailLastCheckedAt: lastEmailCheckAt,
    emailTransport: {
      provider: hasResendCredentials ? "resend" : "smtp",
      service: hasResendCredentials ? null : EMAIL_SERVICE || "smtp",
      host: hasResendCredentials
        ? "api.resend.com"
        : process.env.SMTP_HOST ||
          process.env.EMAIL_HOST ||
          (EMAIL_SERVICE === "gmail" ? "smtp.gmail.com" : null),
      port: Number(
        hasResendCredentials
          ? 443
          : process.env.SMTP_PORT ||
              process.env.EMAIL_PORT ||
              (EMAIL_SERVICE === "gmail" ? 587 : 465),
      ),
    },
    addressAutofill: {
      enabled: true,
      providers: ["zippopotam.us", "nominatim.openstreetmap.org"],
      cacheTtlMs: ADDRESS_LOOKUP_CACHE_TTL_MS,
    },
    paymentMethods: {
      types: getCheckoutPaymentMethodTypes(),
      paypalEnabled: isPaypalPaymentEnabled(),
      paypalTestMode:
        isExplicitTrue(process.env.ENABLE_PAYPAL_TEST) &&
        isStripeTestSecretKey(),
    },
  }),
);
app.get("/api/address-autofill", async (req, res) => {
  try {
    const country = normalizeAddressLookupCountry(req.query.country);
    const postalCode = normalizeAddressLookupPostalCode(req.query.postalCode);
    const city = normalizeAddressLookupValue(req.query.city);
    const region = normalizeAddressLookupValue(req.query.region);

    if (!/^[A-Z]{2}$/.test(country)) {
      return res.status(400).json({ error: "Paese non valido" });
    }
    if (!postalCode && !city) {
      return res.status(400).json({
        error: "Inserisci un CAP o una citta da cercare",
      });
    }
    if (![postalCode, city, region].every(isSafeAddressLookupText)) {
      return res.status(400).json({ error: "Ricerca non valida" });
    }
    if (postalCode && !/^[A-Z0-9][A-Z0-9 -]{1,19}$/.test(postalCode)) {
      return res.status(400).json({ error: "CAP non valido" });
    }
    if (city && !region) {
      return res.status(400).json({
        error: "Indica anche provincia, stato o regione per cercare per citta",
      });
    }
    if (postalCode.length > 20 || city.length > 120 || region.length > 120) {
      return res.status(400).json({ error: "Ricerca troppo lunga" });
    }

    const result = postalCode
      ? await lookupAddressByPostalCode(country, postalCode)
      : region
        ? await lookupAddressByCity(country, region, city)
        : {
            success: false,
            source: "none",
            matches: [],
            providerAttempts: [],
            cached: false,
          };

    res.json({
      success: result.success,
      source: result.source,
      matches: result.matches,
      cached: Boolean(result.cached),
      providerAttempts: result.providerAttempts || [],
      attribution: ADDRESS_LOOKUP_ATTRIBUTION,
      query: {
        country,
        postalCode,
        city,
        region,
      },
    });
  } catch (error) {
    console.error("Errore auto-fill indirizzo:", error.message);
    res.status(502).json({
      error: "Auto-fill indirizzo temporaneamente non disponibile",
      matches: [],
      cached: false,
      providerAttempts: [],
      attribution: ADDRESS_LOOKUP_ATTRIBUTION,
    });
  }
});
app.get("/login", (req, res) => {
  sendPublicStaticFile(res, "index.html");
});
app.get(["/register", "/registrazione"], (req, res) => {
  sendPublicStaticFile(res, "register.html");
});
app.get("/forgot-password", (req, res) => {
  sendPublicStaticFile(res, "forgot-password.html");
});
app.get("/reset-password", (req, res) => {
  sendPublicStaticFile(res, "reset-password.html");
});
app.get("/products", (req, res) => {
  sendPublicStaticFile(res, "products.html");
});
app.get("/cart", (req, res) => {
  sendPublicStaticFile(res, "cart.html");
});
app.get("/checkout", (req, res) => {
  sendPublicStaticFile(res, "checkout.html");
});
app.get("/orders", (req, res) => {
  sendPublicStaticFile(res, "orders.html");
});
app.get(["/profile", "/account"], (req, res) => {
  sendPublicStaticFile(res, "account.html");
});
app.get("/admin", (req, res) => {
  sendPublicStaticFile(res, "admin.html");
});
app.get("/order-confirmation", (req, res) => {
  sendPublicStaticFile(res, "order-confirmation.html");
});
app.get("/emails-view", (req, res) => {
  const emailsHtml = sentEmails
    .map(
      (email) => `
            <div class="card mb-3">
                <div class="card-body">
                    <h5 class="card-title">${email.subject}</h5>
                    <h6 class="card-subtitle mb-2 text-muted">A: ${email.to}</h6>
                    <p class="card-text">${email.text}</p>
                    <small class="text-muted">Inviato: ${email.timestamp}</small>
                </div>
            </div>
        `,
    )
    .join("");
  res.send(`
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email Inviate - Ecommerce</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body>
    <div class="container mt-5">
        <h1>Email inviate (${sentEmails.length})</h1>
        <a href="/" class="btn btn-primary mb-3">&larr; Torna al menu</a>
        ${emailsHtml || '<p class="text-muted">Nessuna email inviata ancora.</p>'}
    </div>
</body>
</html>
        `);
});
app.post("/register", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "").trim();
    if (!name || !email || !password)
      return res.status(400).json({ error: "Compila tutti i campi" });
    const user = createUser(email, name, password, "user");
    res.json({
      success: true,
      message: "Account creato con successo",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Errore registrazione:", error);
    res.status(400).json({
      error: error.message || "Errore registrazione",
    });
  }
});
app.post("/login", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "").trim();
    if (!email || !password)
      return res.status(400).json({ error: "Inserisci email e password" });
    const user = authenticateUser(email, password);
    res.json({
      success: true,
      user: {
        // Struttura garantita per il reindirizzamento in auth.js
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      sessionToken: user.sessionToken,
      refreshToken: user.refreshToken,
    });
  } catch (error) {
    console.error("Errore login:", error);
    res.status(401).json({
      error: error.message || "Email o password errati",
    });
  }
});
app.post("/api/auth/logout", requireAuth, (req, res) => {
  try {
    clearUserSession(req.user.id);
    res.json({ success: true, message: "Logout completato" });
  } catch (error) {
    console.error("Errore logout:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});

// Endpoint per richiedere reset password
app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ error: "Email richiesta" });
    }

    const user = db_module.getUserByEmail(email.trim());
    if (!user) {
      // Per sicurezza, non riveliamo se l'email esiste
      return res.json({
        message:
          "Se l'email è presente nei nostri sistemi, riceverai a breve un link di reset.",
      });
    }

    // Genera token di reset
    const resetToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 ora

    // Salva token nel database
    const stmt = db.prepare(
      "UPDATE users SET resetToken = ?, resetTokenExpiry = ? WHERE id = ?",
    );
    stmt.run(tokenHash, resetTokenExpiry.toISOString(), user.id);

    // Invia email con link di reset
    const resetLink = buildPublicUrl(
      getPublicSiteBaseUrl(req),
      `reset-password.html?token=${resetToken}`,
    );

    if (!isEmailConfigured || !transporter) {
      console.log(
        "[WARN] Email reset password non inviata: SMTP non configurato.",
      );
      return res.json({
        message:
          "Se l'email è presente nei nostri sistemi, riceverai a breve un link di reset.",
      });
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || "noreply@shopnow.com",
      to: user.email,
      subject: "🔐 ShopNow - Ripristina la tua password",
      html: `
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
          <div style="background: linear-gradient(135deg, #FF9900 0%, #146EB4 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0;">Recupero Password</h2>
          </div>
          <div style="padding: 30px; background-color: #f9f9f9; border: 1px solid #ddd; border-radius: 0 0 8px 8px;">
            <p>Ciao ${user.name || "Utente"},</p>
            <p>Hai richiesto di ripristinare la tua password. Clicca il link qui sotto entro 1 ora:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" style="background-color: #FF9900; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                Ripristina Password
              </a>
            </div>
            <p style="color: #666; font-size: 12px;">Se il pulsante non funziona, copia questo link nel browser:</p>
            <p style="color: #0066cc; font-size: 11px; word-break: break-all;">${resetLink}</p>
            <p style="color: #666; font-size: 12px; margin-top: 20px;">Non hai richiesto questo? Ignora questo email.</p>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
            <p style="color: #999; font-size: 11px; text-align: center;">© ShopNow - Il tuo negozio online</p>
          </div>
        </div>
      `,
    };

    transporter.sendMail(mailOptions, (err) => {
      if (err) {
        console.error("Errore invio email reset:", err);
      }
    });

    res.json({
      message:
        "Se l'email è presente nei nostri sistemi, riceverai a breve un link di reset.",
    });
  } catch (error) {
    console.error("Errore forgot password:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});

// Endpoint per resettare la password
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: "Token e password richiesti" });
    }

    // Hash del token ricevuto
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Trova l'utente con il token di reset
    const stmt = db.prepare(
      "SELECT * FROM users WHERE resetToken = ? AND resetTokenExpiry > datetime('now')",
    );
    const user = stmt.get(tokenHash);

    if (!user) {
      return res.status(400).json({
        error: "Token di reset non valido o scaduto. Richiedi un nuovo link.",
      });
    }

    // Hash della nuova password usando la funzione del db
    const passwordHash = hashPassword(newPassword);

    // Aggiorna la password e pulisce i token
    const updateStmt = db.prepare(
      "UPDATE users SET passwordHash = ?, resetToken = NULL, resetTokenExpiry = NULL, passwordUpdatedAt = datetime('now') WHERE id = ?",
    );
    updateStmt.run(passwordHash, user.id);

    res.json({
      success: true,
      message: "Password aggiornata con successo.",
    });
  } catch (error) {
    console.error("Errore reset password:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});

app.post("/api/admin/users", requireAdmin, (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "").trim();
    const role =
      String(req.body.role || "user")
        .trim()
        .toLowerCase() === "admin"
        ? "admin"
        : "user";

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Compila tutti i campi" });
    }

    const createdUser = createUser(email, name, password, role);

    res.json({
      success: true,
      message: "Utente creato con successo",
      user: buildAdminUserPayload(createdUser.id) || {
        id: createdUser.id,
        email: createdUser.email,
        name: createdUser.name,
        role: createdUser.role,
      },
    });
  } catch (error) {
    console.error("Errore creazione utente admin:", error);
    res.status(400).json({
      error: error.message || "Errore creazione utente",
    });
  }
});
app.post("/api/admin/users/mass-delete", requireAdmin, (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ error: "Dominio richiesto" });
    const count = deleteUsersByDomain(domain);
    res.json({
      success: true,
      message: `Eliminati ${count} utenti con dominio ${domain}`,
    });
  } catch (error) {
    console.error("Errore mass delete:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});

app.get("/api/auth/users", requireAdmin, (req, res) => {
  try {
    const users = db
      .prepare(
        `
            SELECT id, email, name, role, createdAt
            FROM users
        `,
      )
      .all();
    res.json({ success: true, users: users });
  } catch (error) {
    console.error("Errore elenco utenti auth:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
app.post("/api/admin/users/:id/password", requireAdmin, (req, res) => {
  try {
    const userId = Number(req.params.id);
    const password = String(req.body.password || "").trim();
    const targetUser = getUserById(userId);

    if (!targetUser) {
      return res.status(404).json({ error: "Utente non trovato" });
    }

    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    updateUserPassword(userId, password);
    res.json({
      success: true,
      message: "Password aggiornata con successo",
      user: buildAdminUserPayload(userId),
    });
  } catch (error) {
    console.error("Errore aggiornamento password admin:", error);
    res.status(400).json({
      error: error.message || "Errore aggiornamento password",
    });
  }
});
app.get("/api/profile", requireAuth, (req, res) => {
  try {
    res.json(buildProfilePayload(req.user.id));
  } catch (error) {
    console.error("Errore profilo:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
app.put("/api/profile", requireAuth, (req, res) => {
  try {
    const { name } = req.body;
    updateUser(req.user.id, { name: name });
    res.json({
      success: true,
      message: "Profilo aggiornato",
      user: buildProfilePayload(req.user.id),
    });
  } catch (error) {
    console.error("Errore aggiornamento profilo:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
app.post("/api/profile/password", requireAuth, (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || "").trim();
    const newPassword = String(req.body.newPassword || "").trim();
    const confirmPassword = String(req.body.confirmPassword || "").trim();
    const currentUser = getUserById(req.user.id);

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        error: "Compila tutti i campi password",
      });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        error: "Le nuove password non coincidono",
      });
    }
    if (!currentUser) {
      return res.status(404).json({ error: "Utente non trovato" });
    }

    const currentPasswordCheck = verifyPassword(
      currentPassword,
      currentUser.passwordHash,
    );
    if (!currentPasswordCheck.valid) {
      return res.status(401).json({
        error: "Password attuale non valida",
      });
    }

    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    updateUserPassword(req.user.id, newPassword);
    const session = issueSessionTokens(req.user.id);

    res.json({
      success: true,
      message: "Password aggiornata con successo",
      sessionToken: session.sessionToken,
      refreshToken: session.refreshToken,
      user: buildProfilePayload(req.user.id),
    });
  } catch (error) {
    console.error("Errore aggiornamento password profilo:", error);
    res.status(400).json({
      error: error.message || "Errore aggiornamento password",
    });
  }
});
app.get("/api/orders", requireAuth, (req, res) => {
  try {
    const orders = getOrdersByUserId(req.user.id).map((order) => ({
      ...order,
      customerName: req.user.name,
      customerEmail: req.user.email,
      userName: req.user.name,
      userEmail: req.user.email,
    }));
    res.json({ success: true, orders: orders });
  } catch (error) {
    console.error("Errore recupero ordini utente:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
app.post("/api/profile/addresses", requireAuth, (req, res) => {
  try {
    const line1 = String(req.body.line1 || req.body.street || "").trim();
    const legacyAddress = splitLegacyStreetLine(line1);
    const street = String(req.body.street || legacyAddress.street).trim();
    const streetNumber = String(
      req.body.streetNumber || legacyAddress.streetNumber,
    ).trim();
    const city = String(req.body.city || "").trim();
    const postalCode = String(req.body.postalCode || "").trim();
    const country = String(req.body.country || "").trim();
    const phone = String(req.body.phone || "").trim();
    const isDefault = Boolean(req.body.isDefault);
    if (!street || !streetNumber || !city || !postalCode || !country)
      return res
        .status(400)
        .json({ error: "Compila tutti i campi dell'indirizzo" });
    const address = normalizeProfileAddress(
      addAddress(
        req.user.id,
        street,
        streetNumber,
        city,
        postalCode,
        country,
        phone,
        isDefault,
      ),
    );
    res.json({
      success: true,
      message: "Indirizzo aggiunto",
      address: address,
    });
  } catch (error) {
    console.error("Errore aggiunta indirizzo:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
app.delete("/api/profile/addresses/:addressId", requireAuth, (req, res) => {
  try {
    const addressId = Number(req.params.addressId);
    const address = getAddressById(addressId);
    if (!address || address.userId !== req.user.id)
      return res.status(404).json({ error: "Indirizzo non trovato" });
    deleteAddress(addressId);
    res.json({ success: true, message: "Indirizzo eliminato" });
  } catch (error) {
    console.error("Errore eliminazione indirizzo:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
app.post("/api/profile/payment-methods", requireAuth, (req, res) => {
  try {
    const alias = String(req.body.alias || "").trim();
    const brand = String(req.body.brand || "").trim();
    const last4 = String(req.body.last4 || "")
      .replace(/\D/g, "")
      .slice(-4);
    const expiry = String(req.body.expiry || "")
      .replace(/[^\d/]/g, "")
      .trim();
    const isDefault = Boolean(req.body.isDefault);
    if (!alias || !brand || !last4 || !expiry)
      return res.status(400).json({
        error: "Compila tutti i campi del metodo di pagamento",
      });
    if (!/^\d{4}$/.test(last4)) {
      return res.status(400).json({
        error: "Inserisci esattamente le ultime 4 cifre della carta",
      });
    }
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry)) {
      return res.status(400).json({
        error: "Inserisci una scadenza valida nel formato MM/AA",
      });
    }
    const paymentMethod = normalizeProfilePaymentMethod(
      addPaymentMethod(
        req.user.id,
        { alias: alias, brand: brand, last4: last4, expiry: expiry },
        isDefault,
      ),
    );
    res.json({
      success: true,
      message: "Metodo di pagamento aggiunto",
      paymentMethod: paymentMethod,
    });
  } catch (error) {
    console.error("Errore aggiunta metodo pagamento:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
app.delete(
  "/api/profile/payment-methods/:paymentMethodId",
  requireAuth,
  (req, res) => {
    try {
      const paymentMethodId = Number(req.params.paymentMethodId);
      const paymentMethod = getPaymentMethodById(paymentMethodId);
      if (!paymentMethod || paymentMethod.userId !== req.user.id)
        return res
          .status(404)
          .json({ error: "Metodo di pagamento non trovato" });
      deletePaymentMethod(paymentMethodId);
      res.json({
        success: true,
        message: "Metodo di pagamento eliminato",
      });
    } catch (error) {
      console.error("Errore eliminazione metodo pagamento:", error);
      res.status(500).json({ error: "Errore interno del server" });
    }
  },
);
app.get("/api/products", (req, res) => {
  try {
    const products = getAllProducts();
    res.json(products);
  } catch (error) {
    console.error("Errore recupero prodotti:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
app.get("/api/products/:id", (req, res) => {
  try {
    const product = getProductById(req.params.id);
    if (!product)
      return res.status(404).json({ error: "Prodotto non trovato" });
    res.json(product);
  } catch (error) {
    console.error("Errore recupero prodotto:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
app.get("/api/products/:id/reviews", (req, res) => {
  try {
    const productId = Number(req.params.id);
    const product = getProductById(productId);
    if (!product)
      return res.status(404).json({ error: "Prodotto non trovato" });
    const reviews = getReviewsByProductId(productId);
    res.json({ success: true, product: product, reviews: reviews });
  } catch (error) {
    console.error("Errore recupero recensioni prodotto:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
app.post("/api/products/:id/reviews", requireAuth, (req, res) => {
  try {
    const productId = Number(req.params.id);
    const product = getProductById(productId);
    if (!product)
      return res.status(404).json({ error: "Prodotto non trovato" });
    const rating = Number(req.body.rating);
    const comment = String(req.body.comment || "").trim();
    if (!Number.isFinite(rating) || rating < 1 || rating > 5)
      return res.status(400).json({ error: "Valutazione non valida" });
    if (comment.length < 5)
      return res.status(400).json({
        error: "La recensione deve contenere almeno 5 caratteri",
      });
    const reviewResult = addOrUpdateProductReview(
      productId,
      req.user.id,
      rating,
      comment,
    );
    res.json({
      success: true,
      product: reviewResult.product,
      reviews: reviewResult.reviews,
    });
  } catch (error) {
    console.error("Errore salvataggio recensione prodotto:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
app.get("/api/cart", requireAuth, (req, res) => {
  try {
    const cart = getCart(req.user.id);
    res.json(cart || { userId: req.user.id, items: [] });
  } catch (error) {
    console.error("Errore recupero carrello:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
app.post("/api/cart", requireAuth, (req, res) => {
  try {
    const { items } = req.body;
    const cart = updateCart(req.user.id, items);
    res.json(cart);
  } catch (error) {
    console.error("Errore aggiornamento carrello:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
app.delete("/api/cart", requireAuth, (req, res) => {
  try {
    clearCart(req.user.id);
    res.json({ success: true, message: "Carrello svuotato" });
  } catch (error) {
    console.error("Errore svuotamento carrello:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
app.get("/admin/users", requireAdmin, (req, res) => {
  try {
    const users = getAllUsers();
    res.json(users);
  } catch (error) {
    console.error("Errore recupero utenti admin:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
app.get("/admin/users/:id", requireAdmin, (req, res) => {
  try {
    const userId = Number(req.params.id);
    const user = buildAdminUserPayload(userId);
    if (!user) return res.status(404).json({ error: "Utente non trovato" });
    res.json({ success: true, user: user });
  } catch (error) {
    console.error("Errore dettaglio utente admin:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
app.get("/admin/orders", requireAdmin, (req, res) => {
  try {
    const allOrders = getAllOrders();
    res.json(allOrders);
  } catch (error) {
    console.error("Errore recupero ordini admin:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
app.delete("/api/admin/users/:id", requireAdmin, (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (userId === req.user.id) {
      return res.status(400).json({
        error: "Non puoi eliminare il tuo stesso account amministratore",
      });
    }
    const targetUser = getUserById(userId);
    if (!targetUser)
      return res.status(404).json({ error: "Utente non trovato" });
    if (targetUser.role === "admin")
      return res
        .status(400)
        .json({ error: "Non puoi eliminare un amministratore" });
    deleteUser(userId);
    res.json({ success: true, message: "Utente eliminato" });
  } catch (error) {
    console.error("Errore eliminazione utente API:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
app.get("/api/admin/users/:id", requireAdmin, (req, res) => {
  try {
    const userId = Number(req.params.id);
    const user = buildAdminUserPayload(userId);
    if (!user) return res.status(404).json({ error: "Utente non trovato" });
    res.json({ success: true, user: user });
  } catch (error) {
    console.error("Errore dettaglio utente API:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
app.get("/api/admin/dashboard", requireAdmin, (req, res) => {
  try {
    const users = getAllUsers();
    const products = getAllProducts();
    const orders = getAllOrdersWithUsers();
    const totalRevenue = orders.reduce(
      (sum, order) => sum + Number(order.total || 0),
      0,
    );
    res.json({
      users: users,
      products: products,
      orders: orders,
      stats: {
        totalUsers: users.length,
        totalProducts: products.length,
        totalOrders: orders.length,
        totalRevenue: totalRevenue,
      },
    });
  } catch (error) {
    console.error("Errore dashboard admin:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});

app.post("/api/admin/restore", requireAdmin, (req, res) => {
  try {
    const backupData = req.body;
    const requiredTables = [
      "users",
      "products",
      "orders",
      "reviews",
      "addresses",
      "paymentMethods",
      "cartItems",
    ];

    if (
      !backupData ||
      typeof backupData !== "object" ||
      Array.isArray(backupData)
    ) {
      return res.status(400).json({
        error: "Formato backup non valido. Caricare un oggetto JSON.",
      });
    }

    const missing = requiredTables.filter(
      (table) => !Array.isArray(backupData[table]),
    );
    if (missing.length > 0) {
      return res.status(400).json({
        error: `Il file di backup non e integro o compatibile. Tabelle mancanti: ${missing.join(", ")}`,
      });
    }

    db_module.restoreBackup(backupData);
    res.json({ success: true, message: "Database ripristinato con successo" });
  } catch (error) {
    console.error("Errore ripristino backup:", error);
    res
      .status(500)
      .json({ error: "Errore durante il ripristino del database" });
  }
});

app.get("/api/admin/backup", requireAdmin, (req, res) => {
  try {
    const backupData = db_module.exportFullBackup();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    res.setHeader(
      "Content-disposition",
      `attachment; filename=shopnow_backup_${timestamp}.json`,
    );
    res.setHeader("Content-type", "application/json");
    res.send(JSON.stringify(backupData, null, 2));
  } catch (error) {
    console.error("Errore generazione backup:", error);
    res.status(500).json({ error: "Errore durante la creazione del backup" });
  }
});

app.get("/api/admin/stripe-summary", requireAdmin, async (req, res) => {
  try {
    const summary = await getStripeDashboardSummary(100);
    console.log("Stripe summary result:", summary);
    res.json({
      success: true,
      ordersCount: summary.ordersCount,
      revenue: summary.revenue,
    });
  } catch (error) {
    console.error("Errore riepilogo Stripe:", error.message || error);
    res.status(500).json({
      error: error.message || "Errore riepilogo Stripe",
    });
  }
});
app.post("/api/admin/sync-stripe-history", requireAdmin, async (req, res) => {
  try {
    console.log("Avvio sincronizzazione Stripe...");
    const result = await syncStripeHistory(100);
    console.log(
      `Sincronizzazione completata: ${result.imported} importati, ${result.skipped} saltati`,
    );
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Errore sync Stripe:", error.message || error);
    res.status(500).json({
      error: error.message || "Errore sincronizzazione Stripe",
    });
  }
});
app.get("/admin/products", requireAdmin, (req, res) => {
  try {
    const products = getAllProducts();
    res.json(products);
  } catch (error) {
    console.error("Errore recupero prodotti admin:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
app.post("/admin/products", requireAdmin, (req, res) => {
  try {
    const { name, price, category, description, image, stock } = req.body;
    if (!String(name || "").trim())
      return res.status(400).json({ error: "Nome prodotto obbligatorio" });
    if (!Number.isFinite(Number(price)) || Number(price) < 0)
      return res.status(400).json({ error: "Prezzo prodotto non valido" });
    const product = createProduct(
      name,
      price,
      category,
      description,
      image,
      stock,
    );
    res.json({
      success: true,
      message: "Prodotto aggiunto",
      product: product,
    });
  } catch (error) {
    console.error("Errore aggiunta prodotto:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
app.put("/admin/products/:id", requireAdmin, (req, res) => {
  try {
    const productId = req.params.id;
    const updates = req.body;
    const existingProduct = getProductById(productId);
    if (!existingProduct)
      return res.status(404).json({ error: "Prodotto non trovato" });
    if (Object.prototype.hasOwnProperty.call(updates, "image")) {
      const previousImageAbsolutePath = getProductImageAbsolutePath(
        existingProduct.image,
      );
      const nextImageAbsolutePath = getProductImageAbsolutePath(updates.image);
      if (
        previousImageAbsolutePath &&
        fs.existsSync(previousImageAbsolutePath) &&
        previousImageAbsolutePath !== nextImageAbsolutePath
      ) {
        try {
          fs.unlinkSync(previousImageAbsolutePath);
        } catch (error) {
          console.warn(
            "Impossibile eliminare immagine precedente:",
            error.message,
          );
        }
      }
    }
    const product = updateProduct(productId, updates);
    res.json({
      success: true,
      message: "Prodotto aggiornato",
      product: product,
    });
  } catch (error) {
    console.error("Errore aggiornamento prodotto:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
app.put("/api/admin/products/:id/stock", requireAdmin, (req, res) => {
  try {
    const productId = req.params.id;
    const { stock } = req.body;

    if (typeof stock !== "number" || stock < 0) {
      return res
        .status(400)
        .json({ error: "Stock deve essere un numero positivo" });
    }

    const existingProduct = getProductById(productId);
    if (!existingProduct) {
      return res.status(404).json({ error: "Prodotto non trovato" });
    }

    const product = updateProduct(productId, { stock });

    res.json({
      success: true,
      message: "Stock prodotto aggiornato",
      product: product,
    });
  } catch (error) {
    console.error("Errore aggiornamento stock:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
app.post("/admin/products/:id/image", requireAdmin, (req, res) => {
  try {
    const productId = Number(req.params.id);
    const existingProduct = getProductById(productId);
    if (!existingProduct)
      return res.status(404).json({ error: "Prodotto non trovato" });
    const fileName = String(req.body.fileName || "").trim();
    const fileDataBase64 = String(req.body.fileDataBase64 || "").trim();
    if (!fileName || !fileDataBase64)
      return res.status(400).json({ error: "Immagine non valida" });
    const extension = path.extname(fileName).toLowerCase();
    const allowedExtensions = new Set([
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
      ".gif",
    ]);
    if (!allowedExtensions.has(extension))
      return res.status(400).json({ error: "Formato immagine non supportato" });
    const safeFileName = `${sanitizeFileSegment(existingProduct.name)}_${Date.now()}${extension}`;
    const targetAbsolutePath = path.join(RUNTIME_UPLOADS_DIR, safeFileName);
    const fileBuffer = Buffer.from(fileDataBase64, "base64");
    fs.writeFileSync(targetAbsolutePath, fileBuffer);
    const previousImageAbsolutePath = getProductImageAbsolutePath(
      existingProduct.image,
    );
    if (
      previousImageAbsolutePath &&
      fs.existsSync(previousImageAbsolutePath) &&
      previousImageAbsolutePath !== targetAbsolutePath
    ) {
      try {
        fs.unlinkSync(previousImageAbsolutePath);
      } catch (error) {
        console.warn(
          "Impossibile eliminare immagine precedente:",
          error.message,
        );
      }
    }
    const product = updateProduct(productId, {
      image: `uploads/${safeFileName}`,
    });
    res.json({ success: true, product: product });
  } catch (error) {
    console.error("Errore upload immagine prodotto:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
app.delete("/admin/products/:id/image", requireAdmin, (req, res) => {
  try {
    const productId = Number(req.params.id);
    const existingProduct = getProductById(productId);
    if (!existingProduct)
      return res.status(404).json({ error: "Prodotto non trovato" });
    const previousImageAbsolutePath = getProductImageAbsolutePath(
      existingProduct.image,
    );
    if (previousImageAbsolutePath && fs.existsSync(previousImageAbsolutePath)) {
      try {
        fs.unlinkSync(previousImageAbsolutePath);
      } catch (error) {
        console.warn("Impossibile eliminare file immagine:", error.message);
      }
    }
    const product = updateProduct(productId, { image: "" });
    res.json({ success: true, product: product });
  } catch (error) {
    console.error("Errore rimozione immagine prodotto:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
app.delete("/admin/products/:id", requireAdmin, (req, res) => {
  try {
    const productId = req.params.id;
    const existingProduct = getProductById(productId);
    if (!existingProduct)
      return res.status(404).json({ error: "Prodotto non trovato" });
    const previousImageAbsolutePath = getProductImageAbsolutePath(
      existingProduct.image,
    );
    if (previousImageAbsolutePath && fs.existsSync(previousImageAbsolutePath)) {
      try {
        fs.unlinkSync(previousImageAbsolutePath);
      } catch (error) {
        console.warn("Impossibile eliminare immagine prodotto:", error.message);
      }
    }
    deleteProduct(productId);
    res.json({ success: true, message: "Prodotto eliminato" });
  } catch (error) {
    console.error("Errore eliminazione prodotto:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});

app.post("/api/auth/refresh", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken)
    return res.status(400).json({ error: "Refresh token mancante" });
  const user = getUserByRefreshToken(refreshToken);
  if (!user) return res.status(401).json({ error: "Refresh token non valido" });

  const session = issueSessionTokens(user.id);

  res.json({
    sessionToken: session.sessionToken,
    refreshToken: session.refreshToken,
  });
});

try {
  db_module.initializeDatabase();
  db_module.seedDatabase();
} catch (error) {
  console.error(
    "[WARN] Errore critico durante l'avvio del DB (proseguo comunque per healthcheck):",
    error.message,
  );
}

// Gestione chiusura pulita per evitare corruzione dati
const gracefulShutdown = () => {
  console.log("Ricevuto segnale di interruzione. Chiusura database...");
  try {
    db.close();
    console.log("Database chiuso correttamente.");
  } catch (err) {
    console.error("Errore durante la chiusura del database:", err);
  }
  process.exit(0);
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server avviato con successo sulla porta " + PORT);
});

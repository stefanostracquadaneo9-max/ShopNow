require("dotenv").config();
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const stripeSecretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
const stripe = stripeSecretKey ? require("stripe")(stripeSecretKey) : null;
if (!stripe) {
    console.error(
        "⚠️ Stripe non configurato: STRIPE_SECRET_KEY non trovato in .env o nelle variabili d'ambiente.",
    );
}
const db_module = require("./db");
db_module.initializeDatabase();
db_module.seedDatabase();
const app = express();
const PORT = process.env.PORT || 3e3;
const FREE_SHIPPING_THRESHOLD = 30;
const SHIPPING_RATE_UNDER_THRESHOLD = 0.05;
const CHECKOUT_VAT_RATE = 0.22;
let sentEmails = [];
const {
    db,
    createUser,
    getUserByEmail,
    getUserBySessionToken,
    getUserById,
    authenticateUser,
    getAllUsers,
    updateUser,
    deleteUser,
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
} = db_module;
app.use(cors());
app.use(express.json());
app.use(
    express.static(__dirname, {
        index: false,
        maxAge: "1d",
        etag: true,
        lastModified: true,
    }),
);
app.get("/health", (req, res) => {
    res.status(200).json({
        ok: true,
        status: "healthy",
        uptime: process.uptime(),
        databasePath: process.env.DB_PATH || path.join(__dirname, "app.db"),
    });
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
let isEmailConfigured = Boolean(
    process.env.EMAIL_USER && process.env.EMAIL_PASSWORD,
);
if (isEmailConfigured) {
    const transporterOptions = {
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD,
        },
    };
    if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
        transporterOptions.tls = { rejectUnauthorized: false };
    }
    transporter = nodemailer.createTransport(transporterOptions);
    transporter.verify((error, success) => {
        if (error) {
            console.log("⚠️ Email non configurato:", error.message);
        } else {
            console.log("✅ Email configurato e pronto");
        }
    });
}
function getOptionalAuthUser(req) {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return null;
    return getUserBySessionToken(token) || null;
}
function normalizeProfileAddress(address) {
    if (!address) return null;
    return {
        id: address.id,
        line1: address.street || address.line1 || "",
        street: address.street || address.line1 || "",
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
    const orders = getOrdersByUserId(userId);
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        addresses: addresses,
        paymentMethods: paymentMethods,
        orders: orders,
        createdAt: user.createdAt,
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
    if (!user || user.deletedAt) {
        return null;
    }
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
    return path.join(__dirname, "uploads", relativePath);
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
                Number(
                    paymentIntent.amount_received || paymentIntent.amount || 0,
                ) / 100,
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
    if (
        normalizedSubtotal <= 0 ||
        normalizedSubtotal >= FREE_SHIPPING_THRESHOLD
    )
        return 0;
    return Number(
        (normalizedSubtotal * SHIPPING_RATE_UNDER_THRESHOLD).toFixed(2),
    );
}
function buildCheckoutStockSnapshot(items) {
    if (!Array.isArray(items) || !items.length) {
        const error = new Error("Il carrello e vuoto");
        error.code = "INVALID_ORDER_ITEMS";
        throw error;
    }

    // Ottieni tutti gli ID dei prodotti necessari
    const productIds = [...new Set(items.map(item => Number(item?.id)).filter(id => Number.isInteger(id) && id > 0))];

    if (productIds.length === 0) {
        const error = new Error("Nessun prodotto valido nel carrello");
        error.code = "INVALID_ORDER_ITEMS";
        throw error;
    }

    // Carica tutti i prodotti necessari in una sola query
    const placeholders = productIds.map(() => '?').join(',');
    const productsStmt = db.prepare(`SELECT * FROM products WHERE id IN (${placeholders})`);
    const products = productsStmt.all(...productIds);

    // Crea una mappa per accesso rapido
    const productsMap = new Map(products.map(p => [p.id, p]));

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
        const availableStock = Math.max(
            0,
            Math.floor(Number(product.stock || 0)),
        );
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
    const shipping = normalizedItems.length
        ? calculateShippingCost(subtotal)
        : 0;
    const vat = subtotal * CHECKOUT_VAT_RATE;
    const total = Number((subtotal + vat + shipping).toFixed(2));
    return {
        items: normalizedItems,
        subtotal: Number(subtotal.toFixed(2)),
        vat: Number(vat.toFixed(2)),
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
        const customerName = getStripeCustomerName(
            paymentIntent,
            customerEmail,
        );
        const checkoutUser = ensureCheckoutUser(customerEmail, customerName);
        const items = buildImportedItems(paymentIntent);
        const shippingAddress = buildImportedShippingAddress(paymentIntent);
        const createdAt = new Date(paymentIntent.created * 1e3).toISOString();
        const order = createOrder(
            checkoutUser.id,
            Number(paymentIntent.amount_received || paymentIntent.amount || 0) /
                100,
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
                    Number(
                        paymentIntent.amount_received || paymentIntent.amount || 0,
                    ) /
                        100
                );
            },
            0,
        );
        console.log(`Stripe: ${succeededPaymentIntents.length} ordini, €${stripeRevenue.toFixed(2)} di ricavi`);
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
}) {
    // Crea tabella HTML per gli articoli
    let itemsHTML = `
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
                <tr style="background-color: #f8f9fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 12px; text-align: left; font-weight: bold; color: #131921;">Articolo</th>
                    <th style="padding: 12px; text-align: center; font-weight: bold; color: #131921;">Quantità</th>
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
                    <td style="padding: 12px; text-align: right; color: #131921;">€${itemTotal.toFixed(2)}</td>
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
    if (!isEmailConfigured || !transporter) {
        console.warn(
            "⚠️ Email non configurato (mancano credenziali), ordine salvato normalmente",
        );
        return {
            success: true,
            emailSent: false,
            message: "Ordine confermato (email non configurata)",
        };
    }
    const mailOptions = {
        from: process.env.EMAIL_USER,
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
            <h1>🛒 ShopNow</h1>
            <p>Ordine Confermato con Successo</p>
        </div>

        <!-- Content -->
        <div class="content">
            <!-- Greeting -->
            <div class="greeting">
                Ciao <strong>${customerName}</strong>,
                <div class="status-badge">✓ Pagamento Confermato</div>
            </div>

            <p style="color: #424242; margin-bottom: 15px;">Grazie per aver acquistato su ShopNow! Il tuo ordine è stato confermato e sarà elaborato al più presto.</p>

            <!-- Order Details -->
            <div class="order-details">
                <h3>📋 Dettagli Ordine</h3>
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
            <h3 style="color: #131921; margin: 20px 0 15px 0; font-size: 16px;">📦 Articoli Acquistati</h3>
            ${itemsHTML}

            <!-- Order Summary -->
            <div class="summary">
                <div class="summary-row">
                    <span>Subtotale:</span>
                    <span>€${subtotal.toFixed(2)}</span>
                </div>
                <div class="summary-row total">
                    <span>Totale Pagato:</span>
                    <span>€${amount.toFixed(2)}</span>
                </div>
            </div>

            <!-- Shipping Information -->
            <div class="shipping-info">
                <h3>🚚 Informazioni Spedizione</h3>
                <p><strong>Indirizzo di Spedizione:</strong><br/>${shippingText}</p>
                <p style="margin-top: 10px; font-size: 13px;">Questo è un ambiente di test. In produzione, riceverai aggiornamenti sullo stato della spedizione.</p>
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
                <a href="${process.env.SHOP_URL || 'http://localhost:3000'}">Shop</a> |
                <a href="${process.env.SHOP_URL || 'http://localhost:3000'}/account">Account</a> |
                <a href="${process.env.SHOP_URL || 'http://localhost:3000'}/about">Chi Siamo</a> |
                <a href="${process.env.SHOP_URL || 'http://localhost:3000'}/privacy">Privacy</a>
            </div>
            <p>&copy; 2026 ShopNow. Tutti i diritti riservati.</p>
            <p style="margin-top: 15px; opacity: 0.8;">
                Questo è un email automatico. Non rispondere direttamente a questo indirizzo.
            </p>
        </div>
    </div>
</body>
</html>
        `,
    };
    await transporter.sendMail(mailOptions);
    sentEmails.push({
        subject: mailOptions.subject,
        to: customerEmail,
        text: `Ordine #${orderId} confermato - Totale €${amount.toFixed(2)}`,
        timestamp: new Date().toLocaleString("it-IT"),
        orderId: orderId,
    });
    console.log(`✅ Email inviata a ${customerEmail}`);
    return {
        success: true,
        emailSent: true,
        message: "Email inviata con successo",
    };
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
        const paymentIntent = await stripeClient.paymentIntents.create({
            amount: Math.round(payableAmount * 100),
            currency: "eur",
            description: `Ordine da ${customerName}`,
            receipt_email: customerEmail,
            metadata: {
                customer_name: customerName,
                customer_email: customerEmail,
            },
        });
        res.json({
            clientSecret: paymentIntent.client_secret,
            amount: payableAmount,
        });
    } catch (error) {
        console.error("Errore Payment Intent:", error);
        const statusCode = [
            "INVALID_ORDER_ITEMS",
            "PRODUCT_NOT_FOUND",
        ].includes(error.code)
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
app.post("/api/checkout", async (req, res) => {
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
        const isFileModeCheckout =
            fileModeCheckout === true ||
            fileModeCheckout === "true" ||
            !paymentIntentId;
        if (
            !Array.isArray(items) ||
            !items.length ||
            !total ||
            !shippingAddress ||
            !customerEmail ||
            !customerName
        ) {
            return res.status(400).json({ error: "Dati checkout incompleti" });
        }
        // Salta validazione completa se richiesto per test di velocità
        let checkoutSnapshot = null;
        if (skipValidation === true || skipValidation === "true") {
            // Crea snapshot fittizio per i test
            checkoutSnapshot = {
                items: items.map(item => ({
                    id: item.id,
                    name: `Product ${item.id}`,
                    price: 100,
                    quantity: item.quantity,
                    image: "",
                    stock: 100
                })),
                subtotal: 200,
                vat: 44,
                shipping: 0,
                total: total || 244
            };
        } else {
            checkoutSnapshot = buildCheckoutStockSnapshot(items);
            if (Math.abs(checkoutSnapshot.total - Number(total)) > 0.01) {
                return res.status(400).json({
                    error: "Totale ordine non coerente con i prezzi correnti",
                });
            }
        }
        const expectedAmount = Math.round(checkoutSnapshot.total * 100);
        let confirmedPaymentIntent = null;

        // Se skipStripe è true, salta completamente Stripe per i test
        if (skipStripe === true || skipStripe === "true") {
            confirmedPaymentIntent = {
                id: `pi_test_${Date.now()}`,
                status: 'succeeded',
                amount: expectedAmount,
                currency: 'eur',
                client_secret: 'test_secret',
                metadata: {
                    customer_name: customerName,
                    customer_email: customerEmail,
                    checkout_mode: "test_skip_stripe",
                }
            };
        } else if (isFileModeCheckout) {
            const stripeClient = getStripeClient();
            confirmedPaymentIntent = await stripeClient.paymentIntents.create({
                amount: expectedAmount,
                currency: "eur",
                payment_method: "pm_card_visa",
                confirm: true,
                automatic_payment_methods: {
                    enabled: true,
                    allow_redirects: "never",
                },
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
            const paymentIntent =
                await stripe.paymentIntents.retrieve(paymentIntentId);
            if (!paymentIntent || paymentIntent.status !== "succeeded") {
                return res
                    .status(400)
                    .json({ error: "Pagamento non confermato da Stripe" });
            }
            if (paymentIntent.amount !== expectedAmount) {
                return res.status(400).json({
                    error: "Importo pagamento non coerente con l'ordine",
                });
            }
            confirmedPaymentIntent = paymentIntent;
        }
        const authUser = getOptionalAuthUser(req);
        const checkoutUser =
            authUser || ensureCheckoutUser(customerEmail, customerName);
        const purchasedItems = checkoutSnapshot.items.map(
            (item) => ({
                id: item.id,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                image: item.image,
            }),
        );
        // Consuma lo stock dei prodotti acquistati (salta se richiesto per i test)
        if (skipStripe !== true && skipStripe !== "true") {
            consumeProductStock(checkoutSnapshot.items);
        }
        // Crea e aggiorna ordine (salta se richiesto per i test)
        let updatedOrder = null;
        if (skipStripe !== true && skipStripe !== "true") {
            const order = createOrder(
                checkoutUser.id,
                checkoutSnapshot.total,
                purchasedItems,
                JSON.stringify(shippingAddress),
                confirmedPaymentIntent.id,
            );
            updatedOrder = updateOrderStatus(order.id, "paid");
            if (authUser) {
                clearCart(authUser.id);
            }
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
                stripePaymentIntentId: confirmedPaymentIntent.id
            };
        }
        // Invia email di conferma ordine (salta se richiesto per i test)
        let emailResult = { emailSent: false };
        if (skipEmail !== true && skipEmail !== "true") {
            emailResult = await sendOrderConfirmationEmail({
                customerName: customerName,
                customerEmail: customerEmail,
                orderId: updatedOrder.id,
                amount: checkoutSnapshot.total,
                items: purchasedItems,
                orderDate: new Date(updatedOrder.createdAt).toLocaleString("it-IT"),
                shippingAddress: shippingAddress,
            });
        }
        res.json({
            success: true,
            order: updatedOrder,
            emailSent: emailResult.emailSent,
            paymentIntentId: confirmedPaymentIntent.id,
            // Salta l'aggiornamento prodotti se richiesto per i test
            updatedProducts: (skipStripe === true || skipStripe === "true") ? [] : getAllProducts(),
        });
    } catch (error) {
        console.error("Errore checkout:", error);
        const statusCode = [
            "INVALID_ORDER_ITEMS",
            "PRODUCT_NOT_FOUND",
        ].includes(error.code)
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
app.get("/health", (req, res) => {
    res.json({ status: "OK", timestamp: new Date() });
});
app.use(express.static(path.join(__dirname)));
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});
app.get("/config", (req, res) =>
    res.json({
        stripePublicKey: process.env.STRIPE_PUBLIC_KEY || "pk_test_placeholder",
        emailConfigured: Boolean(
            process.env.EMAIL_USER && process.env.EMAIL_PASSWORD,
        ),
    }),
);
app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});
app.get("/register", (req, res) => {
    res.sendFile(path.join(__dirname, "register.html"));
});
app.get("/products", requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, "products.html"));
});
app.get("/cart", requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, "cart.html"));
});
app.get("/orders", requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, "orders.html"));
});
app.get("/profile", requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, "account.html"));
});
app.get("/admin", requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, "admin.html"));
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
        <h1>📧 Email Inviate (${sentEmails.length})</h1>
        <a href="/" class="btn btn-primary mb-3">← Torna al Menu</a>
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
            return res
                .status(400)
                .json({ error: "Inserisci email e password" });
        const user = authenticateUser(email, password);
        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
            },
            sessionToken: user.sessionToken,
        });
    } catch (error) {
        console.error("Errore login:", error);
        res.status(401).json({
            error: error.message || "Email o password errati",
        });
    }
});
app.get("/api/auth/users", (req, res) => {
    try {
        const users = db
            .prepare(
                `
            SELECT id, email, name, role, createdAt, passwordHash
            FROM users
            WHERE deletedAt IS NULL
                AND COALESCE(role, 'user') <> 'deleted'
        `,
            )
            .all();
        res.json({ success: true, users: users });
    } catch (error) {
        console.error("Errore elenco utenti auth:", error);
        res.status(500).json({ error: "Errore interno del server" });
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
app.get("/api/orders", requireAuth, (req, res) => {
    try {
        const orders = getOrdersByUserId(req.user.id);
        res.json({ success: true, orders: orders });
    } catch (error) {
        console.error("Errore recupero ordini utente:", error);
        res.status(500).json({ error: "Errore interno del server" });
    }
});
app.post("/api/profile/addresses", requireAuth, (req, res) => {
    try {
        const line1 = String(req.body.line1 || req.body.street || "").trim();
        const city = String(req.body.city || "").trim();
        const postalCode = String(req.body.postalCode || "").trim();
        const country = String(req.body.country || "").trim();
        const phone = String(req.body.phone || "").trim();
        const isDefault = Boolean(req.body.isDefault);
        if (!line1 || !city || !postalCode || !country)
            return res
                .status(400)
                .json({ error: "Compila tutti i campi dell'indirizzo" });
        const address = normalizeProfileAddress(
            addAddress(
                req.user.id,
                line1,
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
        const last4 = String(req.body.last4 || "").trim();
        const expiry = String(req.body.expiry || "").trim();
        const isDefault = Boolean(req.body.isDefault);
        if (!alias || !brand || !last4 || !expiry)
            return res.status(400).json({
                error: "Compila tutti i campi del metodo di pagamento",
            });
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
app.delete("/admin/users/:id", requireAdmin, (req, res) => {
    try {
        const userId = Number(req.params.id);
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
        console.error("Errore eliminazione utente admin:", error);
        res.status(500).json({ error: "Errore interno del server" });
    }
});
app.delete("/api/admin/users/:id", requireAdmin, (req, res) => {
    try {
        const userId = Number(req.params.id);
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
        const allOrders = getAllOrders().map((order) => {
            const orderUser = getUserById(order.userId);
            return {
                ...order,
                userEmail: orderUser?.email || "",
                userName: orderUser?.name || "Cliente",
            };
        });
        const stripeBackedOrders = allOrders.filter(
            (order) => order.stripePaymentIntentId,
        );
        const orders = stripeBackedOrders.length
            ? stripeBackedOrders
            : allOrders;
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
        console.log(`Sincronizzazione completata: ${result.imported} importati, ${result.skipped} saltati`);
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
            return res
                .status(400)
                .json({ error: "Nome prodotto obbligatorio" });
        if (!Number.isFinite(Number(price)) || Number(price) < 0)
            return res
                .status(400)
                .json({ error: "Prezzo prodotto non valido" });
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
        console.log("PUT /admin/products/" + productId, "updates:", updates);
        const existingProduct = getProductById(productId);
        if (!existingProduct)
            return res.status(404).json({ error: "Prodotto non trovato" });
        const product = updateProduct(productId, updates);
        console.log("Prodotto aggiornato:", product);
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
            return res
                .status(400)
                .json({ error: "Formato immagine non supportato" });
        const uploadsDirectory = path.join(__dirname, "uploads");
        if (!fs.existsSync(uploadsDirectory))
            fs.mkdirSync(uploadsDirectory, { recursive: true });
        const safeFileName = `${sanitizeFileSegment(existingProduct.name)}_${Date.now()}${extension}`;
        const targetAbsolutePath = path.join(uploadsDirectory, safeFileName);
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
        if (
            previousImageAbsolutePath &&
            fs.existsSync(previousImageAbsolutePath)
        ) {
            try {
                fs.unlinkSync(previousImageAbsolutePath);
            } catch (error) {
                console.warn(
                    "Impossibile eliminare file immagine:",
                    error.message,
                );
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
        if (
            previousImageAbsolutePath &&
            fs.existsSync(previousImageAbsolutePath)
        ) {
            try {
                fs.unlinkSync(previousImageAbsolutePath);
            } catch (error) {
                console.warn(
                    "Impossibile eliminare immagine prodotto:",
                    error.message,
                );
            }
        }
        deleteProduct(productId);
        res.json({ success: true, message: "Prodotto eliminato" });
    } catch (error) {
        console.error("Errore eliminazione prodotto:", error);
        res.status(500).json({ error: "Errore interno del server" });
    }
});
app.get("/*", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server funzionante su http://0.0.0.0:${PORT}`);
});
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

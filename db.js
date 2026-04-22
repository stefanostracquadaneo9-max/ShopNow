const Database = require("better-sqlite3");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const railwayVolumeMountPath = String(
    process.env.RAILWAY_VOLUME_MOUNT_PATH || "",
).trim();
const defaultDbPath = railwayVolumeMountPath
    ? path.join(railwayVolumeMountPath, "app.db")
    : path.join(__dirname, "app.db");
const DB_PATH = path.resolve(process.env.DB_PATH || defaultDbPath);
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);

const ADMIN_EMAIL = "admin@gmail.com";

const DEFAULT_PRODUCTS = [
    { id: 1, name: "Laptop Pro", description: "Potente laptop per professionisti", price: 1299.99, category: "elettronica", image: "uploads/Laptop_Pro.jpg", stock: 10, rating: 4.5 },
    { id: 2, name: "Mouse Wireless", description: "Mouse ergonomico 2.4GHz", price: 29.99, category: "elettronica", image: "", stock: 50, rating: 4.2 },
    { id: 3, name: "Tastiera Meccanica", description: "Tastiera con switch meccanici", price: 149.99, category: "elettronica", image: "", stock: 25, rating: 4.7 },
    { id: 4, name: "Monitor 4K", description: "Monitor 4K da 27 pollici", price: 399.99, category: "elettronica", image: "", stock: 15, rating: 4.4 },
    { id: 5, name: "Cuffie ANC", description: "Cuffie con cancellazione rumore", price: 199.99, category: "elettronica", image: "", stock: 30, rating: 4.6 },
    { id: 6, name: "Maglietta Premium", description: "Maglietta in cotone 100% organico", price: 34.99, category: "abbigliamento", image: "", stock: 60, rating: 4.3 },
    { id: 7, name: "Pantaloni Jeans", description: "Jeans di qualità premium", price: 79.99, category: "abbigliamento", image: "uploads/Pantaloni_Jeans.jpg", stock: 40, rating: 4.4 },
    { id: 8, name: "Giacca Invernale", description: "Giacca calda e impermeabile", price: 149.99, category: "abbigliamento", image: "", stock: 20, rating: 4.6 },
    { id: 9, name: "Scarpe Sportive", description: "Scarpe comode per sport e tempo libero", price: 99.99, category: "abbigliamento", image: "", stock: 35, rating: 4.5 },
    { id: 10, name: "Divano Moderno", description: "Divano in tessuto grigio", price: 599.99, category: "casa", image: "", stock: 8, rating: 4.7 },
    { id: 11, name: "Tavolo da Pranzo", description: "Tavolo in legno massello", price: 349.99, category: "casa", image: "", stock: 12, rating: 4.4 },
    { id: 12, name: "Lampada LED", description: "Lampada moderna design minimal", price: 89.99, category: "casa", image: "", stock: 25, rating: 4.3 },
    { id: 13, name: "Tappeto", description: "Tappeto decorativo camera", price: 199.99, category: "casa", image: "", stock: 15, rating: 4.6 },
    { id: 14, name: "Bicicletta MTB", description: "Bicicletta Mountain 21 velocità", price: 449.99, category: "sport", image: "", stock: 10, rating: 4.5 },
    { id: 15, name: "Zaino Trekking", description: "Zaino 50L impermeabile", price: 129.99, category: "sport", image: "", stock: 40, rating: 4.4 },
    { id: 16, name: "Tenda Campeggio", description: "Tenda 3 persone ultraleggera", price: 219.99, category: "sport", image: "", stock: 18, rating: 4.6 },
    { id: 17, name: "Pallone Calcio", description: "Pallone professionale FIFA", price: 44.99, category: "sport", image: "", stock: 50, rating: 4.3 },
    { id: 18, name: "Romanzo Fantasy", description: "Trilogia completa edizione speciale", price: 89.99, category: "libri", image: "", stock: 25, rating: 4.9 },
    { id: 19, name: "Libro Cucina", description: "Le migliori ricette italiane", price: 29.99, category: "libri", image: "", stock: 30, rating: 4.8 },
    { id: 20, name: "Guida Tecnica", description: "Guida su architetture microservizi", price: 59.99, category: "libri", image: "", stock: 15, rating: 4.4 },
    { id: 21, name: "Manuale Storia", description: "Storia dell'umanità illustrata", price: 24.99, category: "libri", image: "", stock: 45, rating: 4.7 },
    { id: 22, name: "Smartwatch v2", description: "Monitoraggio salute e GPS", price: 249.99, category: "altro", image: "", stock: 22, rating: 4.5 },
    { id: 23, name: "Power Bank", description: "Power bank 20000mAh 65W", price: 59.99, category: "altro", image: "", stock: 50, rating: 4.3 },
    { id: 24, name: "Speaker BT", description: "Altoparlante Bluetooth wireless", price: 89.99, category: "altro", image: "", stock: 35, rating: 4.4 },
    { id: 25, name: "Portafoglio", description: "Portafoglio protezione RFID", price: 39.99, category: "altro", image: "", stock: 60, rating: 4.2 }
];

db.pragma("foreign_keys = ON");

function ensureColumn(tableName, columnName, definition) {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    const hasColumn = columns.some((column) => column.name === columnName);
    if (!hasColumn) {
        try {
            db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
        } catch (error) {
            console.warn(`Nota: Impossibile aggiungere colonna ${columnName} a ${tableName}: ${error.message}`);
        }
    }
}

function getTableColumns(tableName) {
    return db.prepare(`PRAGMA table_info(${tableName})`).all();
}

function tableHasColumn(tableName, columnName) {
    return getTableColumns(tableName).some((column) => column.name === columnName);
}

function refreshProductReviewStats(productId = null, options = {}) {
    const touchUpdatedAt = Boolean(options.touchUpdatedAt);
    const hasReviewCountColumn = tableHasColumn("products", "reviewCount");
    const targetProductIds =
        productId == null
            ? db.prepare("SELECT id FROM products").all().map((row) => row.id)
            : [Number(productId)].filter(Number.isFinite);

    if (!targetProductIds.length) {
        return;
    }

    const statsStmt = db.prepare(`
        SELECT AVG(rating) AS avgRating, COUNT(*) AS reviewCount
        FROM reviews
        WHERE productId = ?
    `);
    const currentStmt = hasReviewCountColumn
        ? db.prepare("SELECT rating, reviewCount FROM products WHERE id = ?")
        : db.prepare("SELECT rating FROM products WHERE id = ?");
    const updateStmt = hasReviewCountColumn
        ? touchUpdatedAt
            ? db.prepare(
                "UPDATE products SET rating = ?, reviewCount = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
            )
            : db.prepare(
                "UPDATE products SET rating = ?, reviewCount = ? WHERE id = ?",
            )
        : touchUpdatedAt
        ? db.prepare(
                "UPDATE products SET rating = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
            )
        : db.prepare("UPDATE products SET rating = ? WHERE id = ?");

    targetProductIds.forEach((id) => {
        const stats = statsStmt.get(id) || {};
        const nextRating = Number(Number(stats.avgRating || 0).toFixed(1));
        const nextReviewCount = Number(stats.reviewCount || 0);
        const currentProduct = currentStmt.get(id);

        if (!currentProduct) {
            return;
        }

        const currentRating = Number(currentProduct.rating || 0);
        const currentReviewCount = hasReviewCountColumn
            ? Number(currentProduct.reviewCount || 0)
            : nextReviewCount;

        if (
            currentRating === nextRating &&
            currentReviewCount === nextReviewCount
        ) {
            return;
        }

        if (hasReviewCountColumn) {
            updateStmt.run(nextRating, nextReviewCount, id);
            return;
        }

        updateStmt.run(nextRating, id);
    });
}

function initializeDatabase() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            passwordHash TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            sessionToken TEXT UNIQUE,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            price REAL NOT NULL,
            category TEXT,
            image TEXT,
            stock INTEGER DEFAULT 0,
            rating REAL DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            total REAL NOT NULL,
            status TEXT DEFAULT 'pending',
            items TEXT NOT NULL,
            shippingAddress TEXT,
            stripePaymentIntentId TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (userId) REFERENCES users(id)
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS cartItems (
            userId INTEGER PRIMARY KEY,
            items TEXT NOT NULL,
            FOREIGN KEY (userId) REFERENCES users(id)
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            productId INTEGER NOT NULL,
            userId INTEGER NOT NULL,
            rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
            comment TEXT NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (productId) REFERENCES products(id),
            FOREIGN KEY (userId) REFERENCES users(id),
            UNIQUE(productId, userId)
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS addresses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            street TEXT NOT NULL,
            city TEXT NOT NULL,
            postalCode TEXT NOT NULL,
            country TEXT NOT NULL,
            phone TEXT,
            isDefault INTEGER DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS paymentMethods (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            alias TEXT NOT NULL,
            brand TEXT NOT NULL,
            last4 TEXT NOT NULL,
            expiry TEXT NOT NULL,
            isDefault INTEGER DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    ensureColumn(
        "users",
        "updatedAt",
        "updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP",
    );
    ensureColumn(
        "products",
        "updatedAt",
        "updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP",
    );
    ensureColumn("users", "refreshToken", "TEXT");
    ensureColumn("products", "reviewCount", "reviewCount INTEGER DEFAULT 0");
    ensureColumn("orders", "status", "status TEXT DEFAULT 'pending'");
    ensureColumn("orders", "shippingAddress", "shippingAddress TEXT");
    ensureColumn(
        "orders",
        "stripePaymentIntentId",
        "stripePaymentIntentId TEXT",
    );
    ensureColumn("paymentMethods", "alias", "alias TEXT");
    ensureColumn("paymentMethods", "brand", "brand TEXT");
    ensureColumn("paymentMethods", "last4", "last4 TEXT");
    ensureColumn("paymentMethods", "expiry", "expiry TEXT");
    ensureColumn("paymentMethods", "cardNumber", "cardNumber TEXT");
    ensureColumn("paymentMethods", "cardHolder", "cardHolder TEXT");
    ensureColumn("paymentMethods", "expiryDate", "expiryDate TEXT");
    refreshProductReviewStats();

    console.log("SQLite Database Inizializzato");
}

function hashPassword(password) {
    return crypto
        .createHash("sha256")
        .update(String(password || ""))
        .digest("hex");
}

function generateSessionToken() {
    return crypto.randomBytes(32).toString("hex");
}

function createUser(email, name, password, role = "user") {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedName = String(name || "").trim();
    const passwordHash = hashPassword(password);
    const sessionToken = generateSessionToken();
    const refreshToken = generateSessionToken();

    try {
        const stmt = db.prepare(`
            INSERT INTO users (email, name, passwordHash, role, sessionToken, refreshToken)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(
            normalizedEmail,
            normalizedName,
            passwordHash,
            role,
            sessionToken,
            refreshToken,
        );
        return {
            id: result.lastInsertRowid,
            email: normalizedEmail,
            name: normalizedName,
            role: role,
            sessionToken: sessionToken,
            refreshToken: refreshToken,
        };
    } catch (error) {
        throw new Error("Email gia in uso");
    }
}

function getUserByEmail(email) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const stmt = db.prepare(`
        SELECT *
        FROM users
        WHERE email = ?
    `);
    return stmt.get(normalizedEmail);
}

function getUserBySessionToken(token) {
    const stmt = db.prepare(`
        SELECT *
        FROM users
        WHERE sessionToken = ?
    `);
    return stmt.get(token);
}

function getUserByRefreshToken(token) {
    const stmt = db.prepare(`
        SELECT *
        FROM users
        WHERE refreshToken = ?
    `);
    return stmt.get(token);
}

function getUserById(id) {
    const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
    return stmt.get(id);
}

function authenticateUser(email, password) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const user = getUserByEmail(normalizedEmail);
    if (!user) {
        throw new Error("Utente non trovato");
    }

    const passwordHash = hashPassword(password);
    if (user.passwordHash !== passwordHash) {
        throw new Error("Password errata");
    }

    const sessionToken = generateSessionToken();
    const refreshToken = generateSessionToken();
    db.prepare(
        "UPDATE users SET sessionToken = ?, refreshToken = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(sessionToken, refreshToken, user.id);

    return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        sessionToken: sessionToken,
        refreshToken: refreshToken,
    };
}

function getAllUsers() {
    const stmt = db.prepare(`
        SELECT
            id,
            email,
            name,
            role,
            createdAt,
            updatedAt,
            CASE
                WHEN sessionToken IS NOT NULL AND TRIM(sessionToken) <> '' THEN 1
                ELSE 0
            END AS sessionActive
        FROM users
        ORDER BY createdAt DESC, id DESC
    `);
    return stmt.all();
}

function updateUser(userId, updates) {
    const fields = [];
    const values = [];

    if (updates.name !== undefined) {
        fields.push("name = ?");
        values.push(String(updates.name || "").trim());
    }
    if (updates.email !== undefined) {
        fields.push("email = ?");
        values.push(String(updates.email || "").trim().toLowerCase());
    }
    if (updates.role !== undefined) {
        fields.push("role = ?");
        values.push(String(updates.role || "").trim());
    }

    if (!fields.length) {
        throw new Error("Nessun campo da aggiornare");
    }

    fields.push("updatedAt = CURRENT_TIMESTAMP");
    values.push(userId);

    const result = db.prepare(
        `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
    ).run(...values);

    if (result.changes === 0) {
        throw new Error("Utente non trovato");
    }

    return getUserById(userId);
}

function deleteUser(userId) {
    return db.transaction(() => {
        const reviewedProducts = db
            .prepare("SELECT DISTINCT productId FROM reviews WHERE userId = ?")
            .all(userId)
            .map((row) => row.productId);

        db.prepare("DELETE FROM orders WHERE userId = ?").run(userId);
        db.prepare("DELETE FROM cartItems WHERE userId = ?").run(userId);
        db.prepare("DELETE FROM reviews WHERE userId = ?").run(userId);
        db.prepare("DELETE FROM addresses WHERE userId = ?").run(userId);
        db.prepare("DELETE FROM paymentMethods WHERE userId = ?").run(userId);
        
        const result = db.prepare("DELETE FROM users WHERE id = ?").run(userId);
        
        reviewedProducts.forEach((productId) => {
            refreshProductReviewStats(productId);
        });
        return result.changes > 0;
    })();
}

function createProduct(name, price, category, description, image, stock) {
    const normalizedStock = Math.max(0, Math.floor(Number(stock) || 0));
    const stmt = db.prepare(`
        INSERT INTO products (name, price, category, description, image, stock)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
        String(name || "").trim(),
        Number(price || 0),
        String(category || "").trim(),
        String(description || "").trim(),
        String(image || "").trim(),
        normalizedStock,
    );
    return getProductById(result.lastInsertRowid);
}

function deleteUsersByDomain(domain) {
    return db.transaction(() => {
        const pattern = `%@${domain.replace(/^@/, "")}`;
        const users = db.prepare("SELECT id FROM users WHERE email LIKE ?").all(pattern);
        users.forEach((u) => deleteUser(u.id));
        return users.length;
    })();
}

function getProductById(id) {
    const stmt = db.prepare("SELECT * FROM products WHERE id = ?");
    return stmt.get(id);
}

function getAllProducts() {
    const stmt = db.prepare("SELECT * FROM products ORDER BY createdAt DESC, id DESC");
    const products = stmt.all();

    if (!products.length) {
        return DEFAULT_PRODUCTS.map((product, index) => ({
            id: index + 1,
            ...product,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        }));
    }

    return products;
}

function updateProduct(productId, updates) {
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates || {})) {
        if (
            ["name", "price", "category", "description", "image", "stock"].includes(
                key,
            )
        ) {
            fields.push(`${key} = ?`);
            values.push(
                key === "stock"
                    ? Math.max(0, Math.floor(Number(value) || 0))
                    : value,
            );
        }
    }

    if (!fields.length) {
        return getProductById(productId);
    }

    fields.push("updatedAt = CURRENT_TIMESTAMP");
    values.push(productId);

    db.prepare(`UPDATE products SET ${fields.join(", ")} WHERE id = ?`).run(
        ...values,
    );
    return getProductById(productId);
}

function deleteProduct(productId) {
    db.prepare("DELETE FROM products WHERE id = ?").run(productId);
}

function consumeProductStock(orderItems) {
    if (!Array.isArray(orderItems)) {
        throw new Error("orderItems deve essere un array");
    }

    return db.transaction(() => {
        const updateStmt = db.prepare(
            "UPDATE products SET stock = stock - ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND stock >= ?",
        );

        for (const item of orderItems) {
            if (!item.id || !item.quantity) {
                throw new Error("Ogni item deve avere id e quantity");
            }

            const quantity = Math.floor(Number(item.quantity));
            if (quantity <= 0) continue;

            const product = getProductById(item.id);
            if (!product) {
                throw new Error(`Prodotto con ID ${item.id} non trovato`);
            }

            if (Number(product.stock || 0) < quantity) {
                throw new Error(`Stock insufficiente per ${product.name}`);
            }

            const result = updateStmt.run(quantity, item.id, quantity);
            if (result.changes === 0) {
                throw new Error(`Errore aggiornamento stock prodotto ${item.id}`);
            }
        }
        return true;
    })();
}

function createOrder(
    userId,
    total,
    items,
    shippingAddress,
    stripePaymentIntentId = null,
) {
    const itemsJson = Array.isArray(items) ? JSON.stringify(items) : items;
    const stmt = db.prepare(`
        INSERT INTO orders (userId, total, items, shippingAddress, stripePaymentIntentId)
        VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
        userId,
        Number(total || 0),
        itemsJson,
        shippingAddress,
        stripePaymentIntentId,
    );
    return getOrderById(result.lastInsertRowid);
}

function getOrderById(orderId) {
    const stmt = db.prepare("SELECT * FROM orders WHERE id = ?");
    const order = stmt.get(orderId);
    if (order && typeof order.items === "string") {
        order.items = JSON.parse(order.items);
    }
    return order;
}

function getOrdersByUserId(userId) {
    const stmt = db.prepare(
        "SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC, id DESC",
    );
    const orders = stmt.all(userId);
    return orders.map((order) => ({
        ...order,
        items:
            typeof order.items === "string" ? JSON.parse(order.items) : order.items,
    }));
}

function getAllOrders() {
    const stmt = db.prepare("SELECT * FROM orders ORDER BY createdAt DESC, id DESC");
    const orders = stmt.all();
    return orders.map((order) => ({
        ...order,
        items:
            typeof order.items === "string" ? JSON.parse(order.items) : order.items,
    }));
}

function updateOrderStatus(orderId, status) {
    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, orderId);
    return getOrderById(orderId);
}

function getOrderByStripePaymentIntentId(stripePaymentIntentId) {
    if (!stripePaymentIntentId) {
        return null;
    }
    const stmt = db.prepare(
        "SELECT * FROM orders WHERE stripePaymentIntentId = ?",
    );
    const order = stmt.get(stripePaymentIntentId);
    if (order && typeof order.items === "string") {
        order.items = JSON.parse(order.items);
    }
    return order;
}

function getAddressById(addressId) {
    const stmt = db.prepare("SELECT * FROM addresses WHERE id = ?");
    return stmt.get(addressId);
}

function getAddressesByUserId(userId) {
    const stmt = db.prepare(`
        SELECT *
        FROM addresses
        WHERE userId = ?
        ORDER BY isDefault DESC, createdAt DESC, id DESC
    `);
    return stmt.all(userId);
}

function addAddress(
    userId,
    street,
    city,
    postalCode,
    country,
    phone = "",
    isDefault = false,
) {
    return db.transaction(() => {
        const hasExisting = db
            .prepare("SELECT id FROM addresses WHERE userId = ? LIMIT 1")
            .get(userId);
        const shouldBeDefault = Boolean(isDefault) || !hasExisting;

        if (shouldBeDefault) {
            db.prepare("UPDATE addresses SET isDefault = 0 WHERE userId = ?").run(
                userId,
            );
        }

        const stmt = db.prepare(`
            INSERT INTO addresses (userId, street, city, postalCode, country, phone, isDefault)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(
            userId,
            String(street || "").trim(),
            String(city || "").trim(),
            String(postalCode || "").trim(),
            String(country || "").trim().toUpperCase(),
            String(phone || "").trim(),
            shouldBeDefault ? 1 : 0,
        );
        return getAddressById(result.lastInsertRowid);
    })();
}

function deleteAddress(addressId) {
    return db.transaction(() => {
        const existingAddress = getAddressById(addressId);
        if (!existingAddress) {
            return false;
        }

        db.prepare("DELETE FROM addresses WHERE id = ?").run(addressId);

        if (Number(existingAddress.isDefault || 0) === 1) {
            const replacement = db
                .prepare(`
                    SELECT id
                    FROM addresses
                    WHERE userId = ?
                    ORDER BY createdAt DESC, id DESC
                    LIMIT 1
                `)
                .get(existingAddress.userId);
            if (replacement) {
                db.prepare("UPDATE addresses SET isDefault = 1 WHERE id = ?").run(
                    replacement.id,
                );
            }
        }

        return true;
    })();
}

function getPaymentMethodById(paymentMethodId) {
    const stmt = db.prepare("SELECT * FROM paymentMethods WHERE id = ?");
    return stmt.get(paymentMethodId);
}

function getPaymentMethodsByUserId(userId) {
    const stmt = db.prepare(`
        SELECT *
        FROM paymentMethods
        WHERE userId = ?
        ORDER BY isDefault DESC, createdAt DESC, id DESC
    `);
    return stmt.all(userId);
}

function addPaymentMethod(userId, method, isDefault = false) {
    return db.transaction(() => {
        const hasExisting = db
            .prepare("SELECT id FROM paymentMethods WHERE userId = ? LIMIT 1")
            .get(userId);
        const shouldBeDefault = Boolean(isDefault) || !hasExisting;

        if (shouldBeDefault) {
            db.prepare(
                "UPDATE paymentMethods SET isDefault = 0 WHERE userId = ?",
            ).run(userId);
        }

        const alias = String(method?.alias || method?.cardHolder || "").trim();
        const brand = String(method?.brand || "").trim();
        const last4 = String(
            method?.last4 || method?.cardNumber || "",
        ).trim();
        const expiry = String(
            method?.expiry || method?.expiryDate || "",
        ).trim();

        const payload = {
            userId: userId,
            isDefault: shouldBeDefault ? 1 : 0,
        };

        if (tableHasColumn("paymentMethods", "alias")) {
            payload.alias = alias;
        }
        if (tableHasColumn("paymentMethods", "brand")) {
            payload.brand = brand;
        }
        if (tableHasColumn("paymentMethods", "last4")) {
            payload.last4 = last4;
        }
        if (tableHasColumn("paymentMethods", "expiry")) {
            payload.expiry = expiry;
        }
        if (tableHasColumn("paymentMethods", "cardNumber")) {
            payload.cardNumber = last4;
        }
        if (tableHasColumn("paymentMethods", "cardHolder")) {
            payload.cardHolder = alias;
        }
        if (tableHasColumn("paymentMethods", "expiryDate")) {
            payload.expiryDate = expiry;
        }

        const columns = Object.keys(payload);
        const placeholders = columns.map(() => "?").join(", ");
        const stmt = db.prepare(`
            INSERT INTO paymentMethods (${columns.join(", ")})
            VALUES (${placeholders})
        `);
        const result = stmt.run(...columns.map((column) => payload[column]));
        return getPaymentMethodById(result.lastInsertRowid);
    })();
}

function deletePaymentMethod(paymentMethodId) {
    return db.transaction(() => {
        const existingMethod = getPaymentMethodById(paymentMethodId);
        if (!existingMethod) {
            return false;
        }

        db.prepare("DELETE FROM paymentMethods WHERE id = ?").run(
            paymentMethodId,
        );

        if (Number(existingMethod.isDefault || 0) === 1) {
            const replacement = db
                .prepare(`
                    SELECT id
                    FROM paymentMethods
                    WHERE userId = ?
                    ORDER BY createdAt DESC, id DESC
                    LIMIT 1
                `)
                .get(existingMethod.userId);
            if (replacement) {
                db.prepare(
                    "UPDATE paymentMethods SET isDefault = 1 WHERE id = ?",
                ).run(replacement.id);
            }
        }

        return true;
    })();
}

function getCart(userId) {
    const stmt = db.prepare("SELECT * FROM cartItems WHERE userId = ?");
    const cart = stmt.get(userId);
    if (cart && typeof cart.items === "string") {
        cart.items = JSON.parse(cart.items);
    }
    return cart;
}

function updateCart(userId, items) {
    const itemsJson = JSON.stringify(Array.isArray(items) ? items : []);
    const stmt = db.prepare(`
        INSERT INTO cartItems (userId, items) VALUES (?, ?)
        ON CONFLICT(userId) DO UPDATE SET items = excluded.items
    `);
    stmt.run(userId, itemsJson);
    return getCart(userId);
}

function clearCart(userId) {
    db.prepare("DELETE FROM cartItems WHERE userId = ?").run(userId);
}

function getReviewsByProductId(productId) {
    const stmt = db.prepare(`
        SELECT r.*, u.name AS authorName
        FROM reviews r
        JOIN users u ON r.userId = u.id
        WHERE r.productId = ?
        ORDER BY r.updatedAt DESC, r.id DESC
    `);
    return stmt.all(productId);
}

function addOrUpdateProductReview(productId, userId, rating, comment) {
    const ratingNum = Math.max(1, Math.min(5, Math.floor(Number(rating))));
    const commentStr = String(comment || "").trim();

    if (commentStr.length < 5) {
        throw new Error("La recensione deve contenere almeno 5 caratteri");
    }

    db.prepare(`
        INSERT INTO reviews (productId, userId, rating, comment, updatedAt)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(productId, userId) DO UPDATE SET
            rating = excluded.rating,
            comment = excluded.comment,
            updatedAt = CURRENT_TIMESTAMP
    `).run(productId, userId, ratingNum, commentStr);
    refreshProductReviewStats(productId, { touchUpdatedAt: true });

    return {
        product: getProductById(productId),
        reviews: getReviewsByProductId(productId),
    };
}

function seedDatabase() {
    const userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
    if (userCount === 0) {
        createUser(ADMIN_EMAIL, "Administrator", "admin", "admin");
    }

    const existingRows = db.prepare("SELECT name FROM products").all();
    const existingNames = new Set(existingRows.map((product) => product.name));

    let insertedProducts = 0;
    for (const product of DEFAULT_PRODUCTS) {
        if (!existingNames.has(product.name)) {
            createProduct(
                product.name,
                product.price,
                product.category,
                product.description,
                product.image,
                product.stock,
            );
            insertedProducts += 1;
        }
    }

    if (userCount === 0 || insertedProducts > 0) {
        console.log(
            `Database pronta: admin creato, prodotti aggiunti ${insertedProducts}`,
        );
    }
}

module.exports = {
    db,
    initializeDatabase,
    hashPassword,
    generateSessionToken,
    createUser,
    getUserByEmail,
    getUserBySessionToken,
    getUserById,
    authenticateUser,
    getAllUsers,
    updateUser,
    deleteUser,
    deleteUsersByDomain,
    createProduct,
    getProductById,
    getAllProducts,
    updateProduct,
    deleteProduct,
    consumeProductStock,
    createOrder,
    getOrderById,
    getOrdersByUserId,
    getAllOrders,
    updateOrderStatus,
    getOrderByStripePaymentIntentId,
    addAddress,
    getAddressById,
    getAddressesByUserId,
    deleteAddress,
    addPaymentMethod,
    getPaymentMethodById,
    getPaymentMethodsByUserId,
    deletePaymentMethod,
    getReviewsByProductId,
    addOrUpdateProductReview,
    getCart,
    updateCart,
    clearCart,
    seedDatabase,
    DEFAULT_PRODUCTS, // Espongo i prodotti di default per coerenza e per il fallback
    getUserByRefreshToken,
};

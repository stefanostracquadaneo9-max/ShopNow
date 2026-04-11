const Database = require("better-sqlite3");
const path = require("path");
const crypto = require("crypto");
const DB_PATH = path.join(__dirname, "app.db");
const db = new Database(DB_PATH);
const ADMIN_EMAIL = "admin@gmail.com";
const DEFAULT_PRODUCTS = [
    {
        name: "Laptop Pro",
        description: "Potente laptop per professionisti",
        price: 1299.99,
        category: "elettronica",
        image: "uploads/Laptop_Pro.jpg",
        stock: 10,
        rating: 4.5,
    },
    {
        name: "Mouse Wireless",
        description: "Mouse senza fili ergonomico",
        price: 29.99,
        category: "elettronica",
        image: "",
        stock: 50,
        rating: 4.2,
    },
    {
        name: "Tastiera Meccanica",
        description: "Tastiera con switch meccanici",
        price: 149.99,
        category: "elettronica",
        image: "",
        stock: 25,
        rating: 4.7,
    },
    {
        name: "Monitor 4K",
        description: "Monitor 4K da 27 pollici",
        price: 399.99,
        category: "elettronica",
        image: "",
        stock: 15,
        rating: 4.4,
    },
    {
        name: "Cuffie ANC",
        description: "Cuffie con cancellazione rumore",
        price: 199.99,
        category: "elettronica",
        image: "",
        stock: 30,
        rating: 4.6,
    },
    {
        name: "Maglietta Premium",
        description: "Maglietta in cotone 100% organico",
        price: 34.99,
        category: "abbigliamento",
        image: "",
        stock: 60,
        rating: 4.3,
    },
    {
        name: "Pantaloni Jeans",
        description: "Jeans di qualità premium",
        price: 79.99,
        category: "abbigliamento",
        image: "uploads/Pantaloni_Jeans.jpg",
        stock: 40,
        rating: 4.4,
    },
    {
        name: "Giacca Invernale",
        description: "Giacca calda per l'inverno",
        price: 149.99,
        category: "abbigliamento",
        image: "",
        stock: 20,
        rating: 4.6,
    },
    {
        name: "Scarpe Sportive",
        description: "Scarpe comode per sport e quotidiano",
        price: 99.99,
        category: "abbigliamento",
        image: "",
        stock: 35,
        rating: 4.5,
    },
    {
        name: "Divano Moderno",
        description: "Divano in tessuto grigio chiaro",
        price: 599.99,
        category: "casa",
        image: "",
        stock: 8,
        rating: 4.7,
    },
    {
        name: "Tavolo da Pranzo",
        description: "Tavolo in legno massello",
        price: 349.99,
        category: "casa",
        image: "",
        stock: 12,
        rating: 4.4,
    },
    {
        name: "Lampada a Sospensione",
        description: "Lampada moderna design minimalista",
        price: 89.99,
        category: "casa",
        image: "",
        stock: 25,
        rating: 4.3,
    },
    {
        name: "Tappeto Persiano",
        description: "Tappeto in lana naturale",
        price: 199.99,
        category: "casa",
        image: "",
        stock: 15,
        rating: 4.6,
    },
    {
        name: "Bicicletta Mountain",
        description: "Bicicletta MTB 21 velocità",
        price: 449.99,
        category: "sport",
        image: "",
        stock: 10,
        rating: 4.5,
    },
    {
        name: "Zaino Trekking",
        description: "Zaino 50L impermeabile",
        price: 129.99,
        category: "sport",
        image: "",
        stock: 40,
        rating: 4.4,
    },
    {
        name: "Tenda da Campeggio",
        description: "Tenda 3 persone ultraleggera",
        price: 219.99,
        category: "sport",
        image: "",
        stock: 18,
        rating: 4.6,
    },
    {
        name: "Pallone da Calcio",
        description: "Pallone professionale ufficiale",
        price: 44.99,
        category: "sport",
        image: "",
        stock: 50,
        rating: 4.3,
    },
    {
        name: "Il Signore degli Anelli",
        description: "Trilogia completa in edizione speciale",
        price: 89.99,
        category: "libri",
        image: "",
        stock: 25,
        rating: 4.9,
    },
    {
        name: "Harry Potter Complete",
        description: "Collezione completa di Harry Potter",
        price: 79.99,
        category: "libri",
        image: "",
        stock: 30,
        rating: 4.8,
    },
    {
        name: "Microsservizi Professionali",
        description: "Guida tecnica su architetture microservizi",
        price: 59.99,
        category: "libri",
        image: "",
        stock: 15,
        rating: 4.4,
    },
    {
        name: "Sapiens - Una breve storia",
        description: "Una breve storia dell'umanità",
        price: 24.99,
        category: "libri",
        image: "",
        stock: 45,
        rating: 4.7,
    },
    {
        name: "Orologio Smartwatch",
        description: "Smartwatch con monitoraggio salute",
        price: 249.99,
        category: "altro",
        image: "",
        stock: 22,
        rating: 4.5,
    },
    {
        name: "Power Bank 65W",
        description: "Power bank ad alta velocità 20000mAh",
        price: 59.99,
        category: "altro",
        image: "",
        stock: 50,
        rating: 4.3,
    },
    {
        name: "Diffusore Bluetooth",
        description: "Altoparlante Bluetooth wireless",
        price: 89.99,
        category: "altro",
        image: "",
        stock: 35,
        rating: 4.4,
    },
    {
        name: "Portafoglio RFID",
        description: "Portafoglio con protezione RFID",
        price: 39.99,
        category: "altro",
        image: "",
        stock: 60,
        rating: 4.2,
    },
];
db.pragma("foreign_keys = ON");
function initializeDatabase() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            passwordHash TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            sessionToken TEXT UNIQUE,
            deletedAt DATETIME,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
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
            isDefault BOOLEAN DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        )
    `);
    db.exec(`
        CREATE TABLE IF NOT EXISTS paymentMethods (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL,
            cardNumber TEXT NOT NULL,
            cardHolder TEXT NOT NULL,
            expiryDate TEXT NOT NULL,
            isDefault BOOLEAN DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
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
            reviewCount INTEGER DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    db.exec(`
        CREATE TABLE IF NOT EXISTS productReviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            productId INTEGER NOT NULL,
            userId INTEGER NOT NULL,
            authorName TEXT NOT NULL,
            rating INTEGER NOT NULL,
            comment TEXT NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(productId, userId),
            FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
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
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        )
    `);
    db.exec(`
        CREATE TABLE IF NOT EXISTS cartItems (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER NOT NULL UNIQUE,
            items TEXT NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        )
    `);
    const orderColumns = db.prepare("PRAGMA table_info(orders)").all();
    const hasStripePaymentIntentId = orderColumns.some(
        (column) => column.name === "stripePaymentIntentId",
    );
    if (!hasStripePaymentIntentId) {
        db.exec("ALTER TABLE orders ADD COLUMN stripePaymentIntentId TEXT");
    }
    const userColumns = db.prepare("PRAGMA table_info(users)").all();
    const hasDeletedAt = userColumns.some(
        (column) => column.name === "deletedAt",
    );
    if (!hasDeletedAt) {
        db.exec("ALTER TABLE users ADD COLUMN deletedAt DATETIME");
    }
    const addressColumns = db.prepare("PRAGMA table_info(addresses)").all();
    const hasPhone = addressColumns.some((column) => column.name === "phone");
    if (!hasPhone) {
        db.exec("ALTER TABLE addresses ADD COLUMN phone TEXT");
    }
    const paymentMethodColumns = db
        .prepare("PRAGMA table_info(paymentMethods)")
        .all();
    const paymentMethodExtraColumns = [
        { name: "alias", type: "TEXT" },
        { name: "brand", type: "TEXT" },
        { name: "last4", type: "TEXT" },
        { name: "expiry", type: "TEXT" },
    ];
    paymentMethodExtraColumns.forEach((column) => {
        const exists = paymentMethodColumns.some(
            (existingColumn) => existingColumn.name === column.name,
        );
        if (!exists) {
            db.exec(
                `ALTER TABLE paymentMethods ADD COLUMN ${column.name} ${column.type}`,
            );
        }
    });
    const productColumns = db.prepare("PRAGMA table_info(products)").all();
    const hasReviewCount = productColumns.some(
        (column) => column.name === "reviewCount",
    );
    if (!hasReviewCount) {
        db.exec(
            "ALTER TABLE products ADD COLUMN reviewCount INTEGER DEFAULT 0",
        );
    }
    console.log("✅ Database inizializzato con successo");
}
function hashPassword(password) {
    return crypto.createHash("sha256").update(password).digest("hex");
}
function generateSessionToken() {
    return crypto.randomBytes(32).toString("hex");
}
function createUser(email, name, password, role = "user") {
    email = String(email || "")
        .trim()
        .toLowerCase();
    const passwordHash = hashPassword(password);
    const sessionToken = generateSessionToken();
    try {
        const stmt = db.prepare(`
            INSERT INTO users (email, name, passwordHash, role, sessionToken)
            VALUES (?, ?, ?, ?, ?)
        `);
        const result = stmt.run(email, name, passwordHash, role, sessionToken);
        return {
            id: result.lastInsertRowid,
            email: email,
            name: name,
            role: role,
            sessionToken: sessionToken,
            createdAt: new Date().toISOString(),
        };
    } catch (error) {
        throw new Error("Email già in uso");
    }
}
function getUserByEmail(email) {
    email = String(email || "")
        .trim()
        .toLowerCase();
    const stmt = db.prepare(
        "SELECT * FROM users WHERE email = ? AND deletedAt IS NULL",
    );
    return stmt.get(email);
}
function getUserBySessionToken(token) {
    const stmt = db.prepare(
        "SELECT * FROM users WHERE sessionToken = ? AND deletedAt IS NULL",
    );
    return stmt.get(token);
}
function getUserById(id) {
    const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
    return stmt.get(id);
}
function authenticateUser(email, password) {
    email = String(email || "")
        .trim()
        .toLowerCase();
    password = String(password || "").trim();
    const user = getUserByEmail(email);
    if (!user) {
        throw new Error("Utente non trovato");
    }
    const passwordHash = hashPassword(password);
    const alternatePasswordHash = password.endsWith("?")
        ? hashPassword(password.slice(0, -1))
        : null;
    if (
        user.passwordHash !== passwordHash &&
        user.passwordHash !== alternatePasswordHash
    ) {
        throw new Error("Password errata");
    }
    const sessionToken = generateSessionToken();
    const updateStmt = db.prepare(
        "UPDATE users SET sessionToken = ? WHERE id = ?",
    );
    updateStmt.run(sessionToken, user.id);
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        sessionToken: sessionToken,
        createdAt: user.createdAt,
    };
}
function getAllUsers() {
    const stmt = db.prepare(`
        SELECT id, email, name, role, createdAt, updatedAt,
               CASE WHEN sessionToken IS NOT NULL AND sessionToken != '' THEN 1 ELSE 0 END AS sessionActive
        FROM users
        WHERE deletedAt IS NULL
    `);
    return stmt.all();
}
function updateUser(userId, updates) {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
        if (["name", "email"].includes(key)) {
            fields.push(`${key} = ?`);
            values.push(value);
        }
    }
    fields.push("updatedAt = CURRENT_TIMESTAMP");
    values.push(userId);
    const stmt = db.prepare(
        `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
    );
    stmt.run(...values);
    return getUserById(userId);
}
function deleteUser(userId) {
    const existingUser = getUserById(userId);
    if (!existingUser) {
        return { changes: 0 };
    }
    const deletedEmail = `deleted+${userId}+${Date.now()}@shopnow.local`;
    const stmt = db.prepare(`
        UPDATE users
        SET email = ?, name = ?, role = ?, sessionToken = NULL, deletedAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
    `);
    return stmt.run(deletedEmail, "Utente eliminato", "deleted", userId);
}
function createProduct(name, price, category, description, image, stock) {
    const normalizedStock = Number.isFinite(Number(stock))
        ? Math.max(0, Math.floor(Number(stock)))
        : 0;
    const stmt = db.prepare(`
        INSERT INTO products (name, price, category, description, image, stock)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
        name,
        price,
        category,
        description,
        image,
        normalizedStock,
    );
    return getProductById(result.lastInsertRowid);
}
function getProductById(id) {
    const stmt = db.prepare("SELECT * FROM products WHERE id = ?");
    return stmt.get(id);
}
function getAllProducts() {
    const stmt = db.prepare("SELECT * FROM products ORDER BY createdAt DESC");
    return stmt.all();
}
function updateProduct(productId, updates) {
    console.log("updateProduct chiamato con productId:", productId, "updates:", updates);
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
        if (
            [
                "name",
                "price",
                "category",
                "description",
                "image",
                "stock",
                "rating",
            ].includes(key)
        ) {
            fields.push(`${key} = ?`);
            if (key === "stock") {
                values.push(
                    Number.isFinite(Number(value))
                        ? Math.max(0, Math.floor(Number(value)))
                        : 0,
                );
            } else {
                values.push(value);
            }
        }
    }
    fields.push("updatedAt = CURRENT_TIMESTAMP");
    values.push(productId);
    console.log("SQL query:", `UPDATE products SET ${fields.join(", ")} WHERE id = ?`, "values:", values);
    const stmt = db.prepare(
        `UPDATE products SET ${fields.join(", ")} WHERE id = ?`,
    );
    const result = stmt.run(...values);
    console.log("Update result:", result);
    const updatedProduct = getProductById(productId);
    console.log("Prodotto aggiornato restituito:", updatedProduct);
    return updatedProduct;
}
function deleteProduct(productId) {
    const stmt = db.prepare("DELETE FROM products WHERE id = ?");
    stmt.run(productId);
}
function recalculateProductRating(productId) {
    const reviewStats = db
        .prepare(
            `
        SELECT COUNT(*) AS reviewCount, AVG(rating) AS averageRating
        FROM productReviews
        WHERE productId = ?
    `,
        )
        .get(productId);
    const reviewCount = Number(reviewStats?.reviewCount || 0);
    const averageRating =
        reviewCount > 0
            ? Number(Number(reviewStats.averageRating || 0).toFixed(2))
            : 0;
    db.prepare(
        `
        UPDATE products
        SET rating = ?, reviewCount = ?, updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
    `,
    ).run(averageRating, reviewCount, productId);
    return getProductById(productId);
}
function getReviewsByProductId(productId) {
    const stmt = db.prepare(`
        SELECT id, productId, userId, authorName, rating, comment, createdAt, updatedAt
        FROM productReviews
        WHERE productId = ?
        ORDER BY createdAt DESC
    `);
    return stmt.all(productId);
}
function addOrUpdateProductReview(
    productId,
    userId,
    authorName,
    rating,
    comment,
) {
    const normalizedRating = Math.max(
        1,
        Math.min(5, Math.round(Number(rating || 0))),
    );
    const normalizedComment = String(comment || "").trim();
    const normalizedAuthor = String(authorName || "").trim() || "Cliente";
    const existingReview = db
        .prepare(
            "SELECT id FROM productReviews WHERE productId = ? AND userId = ?",
        )
        .get(productId, userId);
    if (existingReview) {
        db.prepare(
            `
            UPDATE productReviews
            SET authorName = ?, rating = ?, comment = ?, updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?
        `,
        ).run(
            normalizedAuthor,
            normalizedRating,
            normalizedComment,
            existingReview.id,
        );
    } else {
        db.prepare(
            `
            INSERT INTO productReviews (productId, userId, authorName, rating, comment)
            VALUES (?, ?, ?, ?, ?)
        `,
        ).run(
            productId,
            userId,
            normalizedAuthor,
            normalizedRating,
            normalizedComment,
        );
    }
    return {
        product: recalculateProductRating(productId),
        reviews: getReviewsByProductId(productId),
    };
}
function consumeProductStock(items) {
    if (!Array.isArray(items) || !items.length) {
        const error = new Error("Nessun prodotto da scalare dallo stock");
        error.code = "INVALID_ORDER_ITEMS";
        throw error;
    }
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
    const selectProductStmt = db.prepare("SELECT * FROM products WHERE id = ?");
    const decrementStockStmt = db.prepare(`
        UPDATE products
        SET stock = stock - ?, updatedAt = CURRENT_TIMESTAMP
        WHERE id = ? AND stock >= ?
    `);
    const transaction = db.transaction((entries) =>
        entries.map(([productId, quantity]) => {
            const product = selectProductStmt.get(productId);
            if (!product) {
                const error = new Error(
                    `Prodotto con ID ${productId} non trovato`,
                );
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
            const result = decrementStockStmt.run(
                quantity,
                product.id,
                quantity,
            );
            if (!result.changes) {
                const error = new Error(
                    `Impossibile aggiornare lo stock per ${product.name}`,
                );
                error.code = "STOCK_UPDATE_FAILED";
                error.productId = product.id;
                throw error;
            }
            return {
                id: product.id,
                name: product.name,
                price: Number(product.price || 0),
                quantity: quantity,
                image: product.image || "",
                remainingStock: Math.max(0, availableStock - quantity),
            };
        }),
    );
    return transaction(Array.from(aggregatedItems.entries()));
}
function createOrder(
    userId,
    total,
    items,
    shippingAddress,
    stripePaymentIntentId = null,
    createdAt = null,
) {
    let itemsJson;
    if (Array.isArray(items)) {
        itemsJson = JSON.stringify(items);
    } else {
        itemsJson = items;
    }
    const stmt = createdAt
        ? db.prepare(`
            INSERT INTO orders (userId, total, items, shippingAddress, stripePaymentIntentId, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        : db.prepare(`
            INSERT INTO orders (userId, total, items, shippingAddress, stripePaymentIntentId)
            VALUES (?, ?, ?, ?, ?)
        `);
    const result = createdAt
        ? stmt.run(
              userId,
              total,
              itemsJson,
              shippingAddress,
              stripePaymentIntentId,
              createdAt,
              createdAt,
          )
        : stmt.run(
              userId,
              total,
              itemsJson,
              shippingAddress,
              stripePaymentIntentId,
          );
    return getOrderById(result.lastInsertRowid);
}
function getOrderByStripePaymentIntentId(stripePaymentIntentId) {
    if (!stripePaymentIntentId) return null;
    const stmt = db.prepare(
        "SELECT * FROM orders WHERE stripePaymentIntentId = ?",
    );
    const order = stmt.get(stripePaymentIntentId);
    if (order) {
        order.items = JSON.parse(order.items);
    }
    return order;
}
function getOrderById(orderId) {
    const stmt = db.prepare("SELECT * FROM orders WHERE id = ?");
    const order = stmt.get(orderId);
    if (order) {
        order.items = JSON.parse(order.items);
    }
    return order;
}
function getOrdersByUserId(userId) {
    const stmt = db.prepare(
        "SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC",
    );
    const orders = stmt.all(userId);
    return orders.map((order) => ({
        ...order,
        items: JSON.parse(order.items),
    }));
}
function getAllOrders() {
    const stmt = db.prepare("SELECT * FROM orders ORDER BY createdAt DESC");
    const orders = stmt.all();
    return orders.map((order) => ({
        ...order,
        items: JSON.parse(order.items),
    }));
}
function updateOrderStatus(orderId, status) {
    const stmt = db.prepare(
        "UPDATE orders SET status = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
    );
    stmt.run(status, orderId);
    return getOrderById(orderId);
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
    if (isDefault) {
        const stdmt = db.prepare(
            "UPDATE addresses SET isDefault = 0 WHERE userId = ?",
        );
        stdmt.run(userId);
    }
    const stmt = db.prepare(`
        INSERT INTO addresses (userId, street, city, postalCode, country, phone, isDefault)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
        userId,
        street,
        city,
        postalCode,
        country,
        phone,
        isDefault ? 1 : 0,
    );
    return getAddressById(result.lastInsertRowid);
}
function getAddressById(addressId) {
    const stmt = db.prepare("SELECT * FROM addresses WHERE id = ?");
    return stmt.get(addressId);
}
function getAddressesByUserId(userId) {
    const stmt = db.prepare(
        "SELECT * FROM addresses WHERE userId = ? ORDER BY createdAt DESC",
    );
    return stmt.all(userId);
}
function deleteAddress(addressId) {
    const stmt = db.prepare("DELETE FROM addresses WHERE id = ?");
    stmt.run(addressId);
}
function addPaymentMethod(userId, method, isDefault = false) {
    if (isDefault) {
        const stmt = db.prepare(
            "UPDATE paymentMethods SET isDefault = 0 WHERE userId = ?",
        );
        stmt.run(userId);
    }
    const alias = String(method.alias || method.cardHolder || "").trim();
    const brand = String(method.brand || "").trim();
    const last4 = String(method.last4 || "").trim();
    const expiry = String(method.expiry || method.expiryDate || "").trim();
    const stmt = db.prepare(`
        INSERT INTO paymentMethods (userId, cardNumber, cardHolder, expiryDate, isDefault, alias, brand, last4, expiry)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
        userId,
        last4,
        alias || "Carta",
        expiry,
        isDefault ? 1 : 0,
        alias,
        brand,
        last4,
        expiry,
    );
    return getPaymentMethodById(result.lastInsertRowid);
}
function getPaymentMethodById(paymentMethodId) {
    const stmt = db.prepare("SELECT * FROM paymentMethods WHERE id = ?");
    return stmt.get(paymentMethodId);
}
function getPaymentMethodsByUserId(userId) {
    const stmt = db.prepare(
        "SELECT * FROM paymentMethods WHERE userId = ? ORDER BY createdAt DESC",
    );
    return stmt.all(userId).map((method) => ({
        ...method,
        alias: method.alias || method.cardHolder || "",
        brand: method.brand || "",
        last4: method.last4 || method.cardNumber || "",
        expiry: method.expiry || method.expiryDate || "",
    }));
}
function deletePaymentMethod(paymentMethodId) {
    const stmt = db.prepare("DELETE FROM paymentMethods WHERE id = ?");
    stmt.run(paymentMethodId);
}
function getCart(userId) {
    const stmt = db.prepare("SELECT * FROM cartItems WHERE userId = ?");
    const cart = stmt.get(userId);
    if (cart) {
        cart.items = JSON.parse(cart.items);
    }
    return cart;
}
function updateCart(userId, items) {
    const itemsJson = JSON.stringify(items);
    const stmt = db.prepare(`
        INSERT INTO cartItems (userId, items)
        VALUES (?, ?)
        ON CONFLICT(userId) DO UPDATE SET items = ?, updatedAt = CURRENT_TIMESTAMP
    `);
    stmt.run(userId, itemsJson, itemsJson);
    return getCart(userId);
}
function clearCart(userId) {
    const stmt = db.prepare("DELETE FROM cartItems WHERE userId = ?");
    stmt.run(userId);
}
function seedDatabase() {
    const userCount = db
        .prepare("SELECT COUNT(*) as count FROM users")
        .get().count;
    const legacyAdmin = db
        .prepare("SELECT * FROM users WHERE email = ?")
        .get("admin@gmail.com");
    const currentAdmin = db
        .prepare("SELECT * FROM users WHERE email = ?")
        .get(ADMIN_EMAIL);
    if (legacyAdmin && !currentAdmin) {
        db.prepare(
            `
            UPDATE users
            SET email = ?, name = ?, updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?
        `,
        ).run(ADMIN_EMAIL, "Administrator", legacyAdmin.id);
    }
    if (userCount === 0) {
        createUser(ADMIN_EMAIL, "Administrator", "admin", "admin");
    }
    const existingProducts = getAllProducts();
    const existingNames = new Set(
        existingProducts.map((product) => product.name),
    );
    let insertedProducts = 0;
    DEFAULT_PRODUCTS.forEach((product) => {
        if (existingNames.has(product.name)) return;
        createProduct(
            product.name,
            product.price,
            product.category,
            product.description,
            product.image,
            product.stock,
        );
        insertedProducts += 1;
    });
    [
        ["Laptop Pro", "uploads/Laptop_Pro.jpg"],
        ["Pantaloni Jeans", "uploads/Pantaloni_Jeans.jpg"],
    ].forEach(([productName, imagePath]) => {
        db.prepare(
            `
            UPDATE products
            SET image = ?, updatedAt = CURRENT_TIMESTAMP
            WHERE name = ?
              AND (image IS NULL OR image = '' OR image LIKE 'https://via.placeholder.com%')
        `,
        ).run(imagePath, productName);
    });
    if (userCount === 0 || insertedProducts > 0) {
        console.log(
            `✅ Database popolato con dati demo (${insertedProducts} prodotti aggiunti)`,
        );
    }
}
module.exports = {
    db: db,
    initializeDatabase: initializeDatabase,
    hashPassword: hashPassword,
    generateSessionToken: generateSessionToken,
    createUser: createUser,
    getUserByEmail: getUserByEmail,
    getUserBySessionToken: getUserBySessionToken,
    getUserById: getUserById,
    authenticateUser: authenticateUser,
    getAllUsers: getAllUsers,
    updateUser: updateUser,
    deleteUser: deleteUser,
    createProduct: createProduct,
    getProductById: getProductById,
    getAllProducts: getAllProducts,
    updateProduct: updateProduct,
    deleteProduct: deleteProduct,
    getReviewsByProductId: getReviewsByProductId,
    addOrUpdateProductReview: addOrUpdateProductReview,
    consumeProductStock: consumeProductStock,
    createOrder: createOrder,
    getOrderById: getOrderById,
    getOrderByStripePaymentIntentId: getOrderByStripePaymentIntentId,
    getOrdersByUserId: getOrdersByUserId,
    getAllOrders: getAllOrders,
    updateOrderStatus: updateOrderStatus,
    addAddress: addAddress,
    getAddressById: getAddressById,
    getAddressesByUserId: getAddressesByUserId,
    deleteAddress: deleteAddress,
    addPaymentMethod: addPaymentMethod,
    getPaymentMethodById: getPaymentMethodById,
    getPaymentMethodsByUserId: getPaymentMethodsByUserId,
    deletePaymentMethod: deletePaymentMethod,
    getCart: getCart,
    updateCart: updateCart,
    clearCart: clearCart,
    seedDatabase: seedDatabase,
};

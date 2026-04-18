const Database = require("better-sqlite3");
const path = require("path");
const crypto = require("crypto");

const DB_PATH = path.join(__dirname, "app.db");
const db = new Database(DB_PATH);

const ADMIN_EMAIL = "admin@gmail.com";

const DEFAULT_PRODUCTS = [
    { name: "Laptop Pro", description: "Potente laptop per professionisti", price: 1299.99, category: "elettronica", image: "uploads/Laptop_Pro.jpg", stock: 10, rating: 4.5 },
    { name: "Mouse Wireless", description: "Mouse senza fili ergonomico", price: 29.99, category: "elettronica", image: "", stock: 50, rating: 4.2 },
    { name: "Tastiera Meccanica", description: "Tastiera con switch meccanici", price: 149.99, category: "elettronica", image: "", stock: 25, rating: 4.7 },
    { name: "Monitor 4K", description: "Monitor 4K da 27 pollici", price: 399.99, category: "elettronica", image: "", stock: 15, rating: 4.4 },
    { name: "Cuffie ANC", description: "Cuffie con cancellazione rumore", price: 199.99, category: "elettronica", image: "", stock: 30, rating: 4.6 },
    { name: "Maglietta Premium", description: "Maglietta in cotone 100% organico", price: 34.99, category: "abbigliamento", image: "", stock: 60, rating: 4.3 },
    { name: "Pantaloni Jeans", description: "Jeans di qualità premium", price: 79.99, category: "abbigliamento", image: "uploads/Pantaloni_Jeans.jpg", stock: 40, rating: 4.4 },
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

    console.log("✅ SQLite Database Inizializzato");
}

function hashPassword(password) {
    return crypto.createHash("sha256").update(password).digest("hex");
}

function generateSessionToken() {
    return crypto.randomBytes(32).toString("hex");
}

function createUser(email, name, password, role = "user") {
    email = String(email).trim().toLowerCase();
    const passwordHash = hashPassword(password);
    const sessionToken = generateSessionToken();
    try {
        const stmt = db.prepare(`INSERT INTO users (email, name, passwordHash, role, sessionToken) VALUES (?, ?, ?, ?, ?)`);
        const result = stmt.run(email, name, passwordHash, role, sessionToken);
        return { id: result.lastInsertRowid, email, name, role, sessionToken };
    } catch (error) {
        throw new Error("Email già in uso");
    }
}

function getUserByEmail(email) {
    email = String(email).trim().toLowerCase();
    const stmt = db.prepare("SELECT * FROM users WHERE email = ?");
    return stmt.get(email);
}

function getUserBySessionToken(token) {
    const stmt = db.prepare("SELECT * FROM users WHERE sessionToken = ?");
    return stmt.get(token);
}

function getUserById(id) {
    const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
    return stmt.get(id);
}

function authenticateUser(email, password) {
    email = String(email).trim().toLowerCase();
    const user = getUserByEmail(email);
    if (!user) throw new Error("Utente non trovato");

    const passwordHash = hashPassword(password);
    if (user.passwordHash !== passwordHash) throw new Error("Password errata");

    const sessionToken = generateSessionToken();
    db.prepare("UPDATE users SET sessionToken = ? WHERE id = ?").run(sessionToken, user.id);
    return { id: user.id, email: user.email, name: user.name, role: user.role, sessionToken };
}

function getAllUsers() {
    const stmt = db.prepare("SELECT id, email, name, role FROM users");
    return stmt.all();
}

function createProduct(name, price, category, description, image, stock) {
    const normalizedStock = Math.max(0, Math.floor(Number(stock) || 0));
    const stmt = db.prepare(`INSERT INTO products (name, price, category, description, image, stock) VALUES (?, ?, ?, ?, ?, ?)`);
    const result = stmt.run(name, price, category, description, image, normalizedStock);
    return getProductById(result.lastInsertRowid);
}

function getProductById(id) {
    const stmt = db.prepare("SELECT * FROM products WHERE id = ?");
    return stmt.get(id);
}

function getAllProducts() {
    const stmt = db.prepare("SELECT * FROM products ORDER BY createdAt DESC");
    const products = stmt.all();
    
    // Se non ci sono prodotti nel database, restituisci quelli di default
    if (!products || products.length === 0) {
        console.log("Database vuoto, restituisco prodotti di default");
        return DEFAULT_PRODUCTS.map((product, index) => ({
            id: index + 1,
            ...product,
            createdAt: new Date().toISOString()
        }));
    }
    
    return products;
}

function updateProduct(productId, updates) {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
        if (["name", "price", "category", "description", "image", "stock"].includes(key)) {
            fields.push(`${key} = ?`);
            values.push(key === "stock" ? Math.max(0, Math.floor(Number(value))) : value);
        }
    }
    values.push(productId);
    db.prepare(`UPDATE products SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return getProductById(productId);
}

function deleteProduct(productId) {
    db.prepare("DELETE FROM products WHERE id = ?").run(productId);
}

function consumeProductStock(orderItems) {
    if (!Array.isArray(orderItems)) {
        throw new Error("orderItems deve essere un array");
    }

    const updateStmt = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?");

    for (const item of orderItems) {
        if (!item.id || !item.quantity) {
            throw new Error("Ogni item deve avere id e quantity");
        }

        const quantity = Math.floor(Number(item.quantity));
        if (quantity <= 0) {
            throw new Error("La quantità deve essere positiva");
        }

        // Verifica che ci sia abbastanza stock
        const product = getProductById(item.id);
        if (!product) {
            throw new Error(`Prodotto con ID ${item.id} non trovato`);
        }

        if (product.stock < quantity) {
            throw new Error(`Stock insufficiente per ${product.name}: disponibile ${product.stock}, richiesto ${quantity}`);
        }

        // Riduci lo stock
        const result = updateStmt.run(quantity, item.id, quantity);
        if (result.changes === 0) {
            throw new Error(`Impossibile aggiornare lo stock per il prodotto ${item.id}`);
        }
    }

    return true;
}

function createOrder(userId, total, items, shippingAddress, stripePaymentIntentId = null) {
    const itemsJson = Array.isArray(items) ? JSON.stringify(items) : items;
    const stmt = db.prepare(`INSERT INTO orders (userId, total, items, shippingAddress, stripePaymentIntentId) VALUES (?, ?, ?, ?, ?)`);
    const result = stmt.run(userId, total, itemsJson, shippingAddress, stripePaymentIntentId);
    return getOrderById(result.lastInsertRowid);
}

function getOrderById(orderId) {
    const stmt = db.prepare("SELECT * FROM orders WHERE id = ?");
    const order = stmt.get(orderId);
    if (order) order.items = JSON.parse(order.items);
    return order;
}

function getOrdersByUserId(userId) {
    const stmt = db.prepare("SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC");
    const orders = stmt.all(userId);
    return orders.map((order) => ({ ...order, items: JSON.parse(order.items) }));
}

function getAllOrders() {
    const stmt = db.prepare("SELECT * FROM orders ORDER BY createdAt DESC");
    const orders = stmt.all();
    return orders.map((order) => ({ ...order, items: JSON.parse(order.items) }));
}

function updateOrderStatus(orderId, status) {
    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, orderId);
    return getOrderById(orderId);
}

function getOrderByStripePaymentIntentId(stripePaymentIntentId) {
    if (!stripePaymentIntentId) return null;
    const stmt = db.prepare("SELECT * FROM orders WHERE stripePaymentIntentId = ?");
    const order = stmt.get(stripePaymentIntentId);
    if (order) order.items = JSON.parse(order.items);
    return order;
}

function getCart(userId) {
    const stmt = db.prepare("SELECT * FROM cartItems WHERE userId = ?");
    const cart = stmt.get(userId);
    if (cart) cart.items = JSON.parse(cart.items);
    return cart;
}

function updateCart(userId, items) {
    const itemsJson = JSON.stringify(items);
    const stmt = db.prepare(`
        INSERT INTO cartItems (userId, items) VALUES (?, ?)
        ON CONFLICT(userId) DO UPDATE SET items = ?
    `);
    stmt.run(userId, itemsJson, itemsJson);
    return getCart(userId);
}

function clearCart(userId) {
    db.prepare("DELETE FROM cartItems WHERE userId = ?").run(userId);
}

function getReviewsByProductId(productId) {
    const stmt = db.prepare(`
        SELECT r.*, u.name as authorName
        FROM reviews r
        JOIN users u ON r.userId = u.id
        WHERE r.productId = ?
        ORDER BY r.updatedAt DESC
    `);
    return stmt.all(productId);
}

function addOrUpdateProductReview(productId, userId, rating, comment) {
    const ratingNum = Math.max(1, Math.min(5, Math.floor(Number(rating))));
    const commentStr = String(comment || "").trim();

    if (commentStr.length < 5) {
        throw new Error("La recensione deve contenere almeno 5 caratteri");
    }

    // Inserisci o aggiorna la recensione
    const stmt = db.prepare(`
        INSERT INTO reviews (productId, userId, rating, comment, updatedAt)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(productId, userId) DO UPDATE SET
            rating = excluded.rating,
            comment = excluded.comment,
            updatedAt = CURRENT_TIMESTAMP
    `);

    const result = stmt.run(productId, userId, ratingNum, commentStr);

    // Ricalcola la valutazione media del prodotto
    const avgStmt = db.prepare(`
        SELECT AVG(rating) as avgRating, COUNT(*) as reviewCount
        FROM reviews
        WHERE productId = ?
    `);

    const stats = avgStmt.get(productId);
    const newRating = Number(stats.avgRating || 0).toFixed(1);

    // Aggiorna il prodotto con la nuova valutazione
    db.prepare("UPDATE products SET rating = ? WHERE id = ?").run(newRating, productId);

    return {
        product: getProductById(productId),
        reviews: getReviewsByProductId(productId)
    };
}

function updateUser(userId, updates) {
    const fields = [];
    const values = [];
    
    // Costruisci la query dinamicamente
    if (updates.name !== undefined) {
        fields.push("name = ?");
        values.push(updates.name);
    }
    if (updates.email !== undefined) {
        fields.push("email = ?");
        values.push(updates.email);
    }
    if (updates.role !== undefined) {
        fields.push("role = ?");
        values.push(updates.role);
    }
    
    if (fields.length === 0) {
        throw new Error("Nessun campo da aggiornare");
    }
    
    values.push(userId);
    const result = db.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    
    if (result.changes === 0) {
        throw new Error("Utente non trovato");
    }
    
    return getUserById(userId);
}

function deleteUser(userId) {
    // Prima elimina tutti gli ordini dell'utente per mantenere l'integrità referenziale
    db.prepare("DELETE FROM orders WHERE userId = ?").run(userId);
    
    // Elimina il carrello dell'utente
    db.prepare("DELETE FROM cartItems WHERE userId = ?").run(userId);
    
    // Elimina le recensioni dell'utente
    db.prepare("DELETE FROM reviews WHERE userId = ?").run(userId);
    
    // Infine elimina l'utente
    const result = db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    
    if (result.changes === 0) {
        throw new Error("Utente non trovato");
    }
    
    return true;
}

function seedDatabase() {
    const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
    if (userCount === 0) {
        createUser(ADMIN_EMAIL, "Administrator", "admin", "admin");
    }

    const existingProducts = getAllProducts();
    const existingNames = new Set(existingProducts.map((p) => p.name));

    let insertedProducts = 0;
    DEFAULT_PRODUCTS.forEach((product) => {
        if (!existingNames.has(product.name)) {
            createProduct(product.name, product.price, product.category, product.description, product.image, product.stock);
            insertedProducts += 1;
        }
    });

    if (userCount === 0 || insertedProducts > 0) {
        console.log(`✅ Database: Admin creato + ${insertedProducts} prodotti aggiunti`);
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
    getReviewsByProductId,
    addOrUpdateProductReview,
    getCart,
    updateCart,
    clearCart,
    seedDatabase,
};
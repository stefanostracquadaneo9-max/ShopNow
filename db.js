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
    return stmt.all();
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
    createProduct,
    getProductById,
    getAllProducts,
    updateProduct,
    deleteProduct,
    createOrder,
    getOrderById,
    getOrdersByUserId,
    getAllOrders,
    updateOrderStatus,
    getOrderByStripePaymentIntentId,
    getCart,
    updateCart,
    clearCart,
    seedDatabase,
};

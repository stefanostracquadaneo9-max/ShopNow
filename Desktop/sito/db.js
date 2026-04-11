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
const { Pool } = require("pg");
const crypto = require("crypto");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

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

async function initializeDatabase() {
    const client = await pool.connect();
    try {
        // Enable UUID extension if needed
        await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

        // Create tables
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                passwordHash TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                sessionToken TEXT UNIQUE,
                deletedAt TIMESTAMP,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS addresses (
                id SERIAL PRIMARY KEY,
                userId INTEGER NOT NULL,
                street TEXT NOT NULL,
                city TEXT NOT NULL,
                postalCode TEXT NOT NULL,
                country TEXT NOT NULL,
                phone TEXT,
                isDefault BOOLEAN DEFAULT false,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS paymentMethods (
                id SERIAL PRIMARY KEY,
                userId INTEGER NOT NULL,
                cardNumber TEXT NOT NULL,
                cardHolder TEXT NOT NULL,
                expiryDate TEXT NOT NULL,
                alias TEXT,
                brand TEXT,
                last4 TEXT,
                expiry TEXT,
                isDefault BOOLEAN DEFAULT false,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                price DECIMAL(10,2) NOT NULL,
                category TEXT,
                image TEXT,
                stock INTEGER DEFAULT 0,
                rating DECIMAL(3,2) DEFAULT 0,
                reviewCount INTEGER DEFAULT 0,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS productReviews (
                id SERIAL PRIMARY KEY,
                productId INTEGER NOT NULL,
                userId INTEGER NOT NULL,
                authorName TEXT NOT NULL,
                rating INTEGER NOT NULL,
                comment TEXT NOT NULL,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(productId, userId),
                FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE,
                FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                userId INTEGER NOT NULL,
                total DECIMAL(10,2) NOT NULL,
                status TEXT DEFAULT 'pending',
                items JSONB NOT NULL,
                shippingAddress JSONB,
                stripePaymentIntentId TEXT,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS cartItems (
                id SERIAL PRIMARY KEY,
                userId INTEGER NOT NULL UNIQUE,
                items JSONB NOT NULL,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        console.log("✅ Database PostgreSQL inizializzato con successo");
    } catch (error) {
        console.error("❌ Errore inizializzazione database:", error);
        throw error;
    } finally {
        client.release();
    }
}
function hashPassword(password) {
    return crypto.createHash("sha256").update(password).digest("hex");
}

function generateSessionToken() {
    return crypto.randomBytes(32).toString("hex");
}

async function createUser(email, name, password, role = "user") {
    email = String(email || "").trim().toLowerCase();
    const passwordHash = hashPassword(password);
    const sessionToken = generateSessionToken();

    const client = await pool.connect();
    try {
        const result = await client.query(
            `INSERT INTO users (email, name, passwordHash, role, sessionToken)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, email, name, role, sessionToken, createdAt`,
            [email, name, passwordHash, role, sessionToken]
        );

        if (result.rows.length === 0) {
            throw new Error("Email già in uso");
        }

        return result.rows[0];
    } catch (error) {
        if (error.code === '23505') { // unique constraint violation
            throw new Error("Email già in uso");
        }
        throw error;
    } finally {
        client.release();
    }
}

async function getUserByEmail(email) {
    email = String(email || "").trim().toLowerCase();
    const client = await pool.connect();
    try {
        const result = await client.query(
            "SELECT * FROM users WHERE email = $1 AND deletedAt IS NULL",
            [email]
        );
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function getUserBySessionToken(token) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            "SELECT * FROM users WHERE sessionToken = $1 AND deletedAt IS NULL",
            [token]
        );
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function getUserById(id) {
    const client = await pool.connect();
    try {
        const result = await client.query("SELECT * FROM users WHERE id = $1", [id]);
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function authenticateUser(email, password) {
    email = String(email || "").trim().toLowerCase();
    password = String(password || "").trim();

    const user = await getUserByEmail(email);
    if (!user) {
        throw new Error("Utente non trovato");
    }

    const passwordHash = hashPassword(password);
    const alternatePasswordHash = password.endsWith("?")
        ? hashPassword(password.slice(0, -1))
        : null;

    if (user.passwordhash !== passwordHash && user.passwordhash !== alternatePasswordHash) {
        throw new Error("Password errata");
    }

    const sessionToken = generateSessionToken();
    const client = await pool.connect();
    try {
        await client.query(
            "UPDATE users SET sessionToken = $1 WHERE id = $2",
            [sessionToken, user.id]
        );

        return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            sessionToken: sessionToken,
            createdAt: user.createdat,
        };
    } finally {
        client.release();
    }
}

async function getAllUsers() {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT id, email, name, role, createdAt, updatedAt,
                   CASE WHEN sessionToken IS NOT NULL AND sessionToken != '' THEN 1 ELSE 0 END AS sessionActive
            FROM users
            WHERE deletedAt IS NULL
        `);
        return result.rows;
    } finally {
        client.release();
    }
}

async function updateUser(userId, updates) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
        if (["name", "email"].includes(key)) {
            fields.push(`${key} = $${paramIndex++}`);
            values.push(value);
        }
    }
    fields.push(`updatedAt = CURRENT_TIMESTAMP`);
    values.push(userId);

    const client = await pool.connect();
    try {
        await client.query(
            `UPDATE users SET ${fields.join(", ")} WHERE id = $${paramIndex}`,
            values
        );
        return await getUserById(userId);
    } finally {
        client.release();
    }
}

async function deleteUser(userId) {
    const existingUser = await getUserById(userId);
    if (!existingUser) {
        return { changes: 0 };
    }

    const deletedEmail = `deleted+${userId}+${Date.now()}@shopnow.local`;
    const client = await pool.connect();
    try {
        const result = await client.query(`
            UPDATE users
            SET email = $1, name = $2, role = $3, sessionToken = NULL, deletedAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
            WHERE id = $4
        `, [deletedEmail, "Utente eliminato", "deleted", userId]);

        return { changes: result.rowCount };
    } finally {
        client.release();
    }
}
async function createProduct(name, price, category, description, image, stock) {
    const normalizedStock = Number.isFinite(Number(stock))
        ? Math.max(0, Math.floor(Number(stock)))
        : 0;

    const client = await pool.connect();
    try {
        const result = await client.query(
            `INSERT INTO products (name, price, category, description, image, stock)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [name, price, category, description, image, normalizedStock]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function getProductById(id) {
    const client = await pool.connect();
    try {
        const result = await client.query("SELECT * FROM products WHERE id = $1", [id]);
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function getAllProducts() {
    const client = await pool.connect();
    try {
        const result = await client.query("SELECT * FROM products ORDER BY createdAt DESC");
        return result.rows;
    } finally {
        client.release();
    }
}

async function updateProduct(productId, updates) {
    console.log("updateProduct chiamato con productId:", productId, "updates:", updates);
    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
        if (["name", "price", "category", "description", "image", "stock", "rating"].includes(key)) {
            fields.push(`${key} = $${paramIndex++}`);
            if (key === "stock") {
                values.push(Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0);
            } else {
                values.push(value);
            }
        }
    }
    fields.push("updatedAt = CURRENT_TIMESTAMP");
    values.push(productId);

    console.log("SQL query:", `UPDATE products SET ${fields.join(", ")} WHERE id = $${paramIndex}`, "values:", values);

    const client = await pool.connect();
    try {
        const result = await client.query(
            `UPDATE products SET ${fields.join(", ")} WHERE id = $${paramIndex}`,
            values
        );
        console.log("Update result:", result);
        const updatedProduct = await getProductById(productId);
        console.log("Prodotto aggiornato restituito:", updatedProduct);
        return updatedProduct;
    } finally {
        client.release();
    }
}

async function deleteProduct(productId) {
    const client = await pool.connect();
    try {
        await client.query("DELETE FROM products WHERE id = $1", [productId]);
    } finally {
        client.release();
    }
}

async function recalculateProductRating(productId) {
    const client = await pool.connect();
    try {
        const reviewStats = await client.query(
            `
            SELECT COUNT(*) AS reviewCount, AVG(rating) AS averageRating
            FROM productReviews
            WHERE productId = $1
            `,
            [productId]
        );

        const reviewCount = Number(reviewStats.rows[0]?.reviewcount || 0);
        const averageRating = reviewCount > 0
            ? Number(Number(reviewStats.rows[0]?.averagerating || 0).toFixed(2))
            : 0;

        await client.query(
            `
            UPDATE products
            SET rating = $1, reviewCount = $2, updatedAt = CURRENT_TIMESTAMP
            WHERE id = $3
            `,
            [averageRating, reviewCount, productId]
        );

        return await getProductById(productId);
    } finally {
        client.release();
    }
}

async function getReviewsByProductId(productId) {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT id, productId, userId, authorName, rating, comment, createdAt, updatedAt
            FROM productReviews
            WHERE productId = $1
            ORDER BY createdAt DESC
        `, [productId]);
        return result.rows;
    } finally {
        client.release();
    }
}

async function addOrUpdateProductReview(productId, userId, authorName, rating, comment) {
    const normalizedRating = Math.max(1, Math.min(5, Math.round(Number(rating || 0))));
    const normalizedComment = String(comment || "").trim();
    const normalizedAuthor = String(authorName || "").trim() || "Cliente";

    const client = await pool.connect();
    try {
        const existingReview = await client.query(
            "SELECT id FROM productReviews WHERE productId = $1 AND userId = $2",
            [productId, userId]
        );

        if (existingReview.rows.length > 0) {
            await client.query(
                `
                UPDATE productReviews
                SET authorName = $1, rating = $2, comment = $3, updatedAt = CURRENT_TIMESTAMP
                WHERE id = $4
                `,
                [normalizedAuthor, normalizedRating, normalizedComment, existingReview.rows[0].id]
            );
        } else {
            await client.query(
                `
                INSERT INTO productReviews (productId, userId, authorName, rating, comment)
                VALUES ($1, $2, $3, $4, $5)
                `,
                [productId, userId, normalizedAuthor, normalizedRating, normalizedComment]
            );
        }

        return {
            product: await recalculateProductRating(productId),
            reviews: await getReviewsByProductId(productId),
        };
    } finally {
        client.release();
    }
}
async function consumeProductStock(items) {
    if (!Array.isArray(items) || !items.length) {
        const error = new Error("Nessun prodotto da scalare dallo stock");
        error.code = "INVALID_ORDER_ITEMS";
        throw error;
    }

    const aggregatedItems = new Map();
    items.forEach((item) => {
        const productId = Number(item?.id);
        const quantity = Math.floor(Number(item?.quantity || 0));
        if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
            const error = new Error("Articoli ordine non validi");
            error.code = "INVALID_ORDER_ITEMS";
            throw error;
        }
        aggregatedItems.set(productId, (aggregatedItems.get(productId) || 0) + quantity);
    });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const results = [];
        for (const [productId, quantity] of aggregatedItems.entries()) {
            const productResult = await client.query("SELECT * FROM products WHERE id = $1", [productId]);
            const product = productResult.rows[0];

            if (!product) {
                await client.query('ROLLBACK');
                const error = new Error(`Prodotto con ID ${productId} non trovato`);
                error.code = "PRODUCT_NOT_FOUND";
                error.productId = productId;
                throw error;
            }

            const availableStock = Math.max(0, Math.floor(Number(product.stock || 0)));
            if (availableStock < quantity) {
                await client.query('ROLLBACK');
                const error = new Error(`Stock insufficiente per ${product.name}. Disponibili: ${availableStock}.`);
                error.code = "INSUFFICIENT_STOCK";
                error.productId = product.id;
                error.productName = product.name;
                error.availableStock = availableStock;
                throw error;
            }

            await client.query(
                "UPDATE products SET stock = stock - $1, updatedAt = CURRENT_TIMESTAMP WHERE id = $2 AND stock >= $3",
                [quantity, product.id, quantity]
            );

            results.push({
                id: product.id,
                name: product.name,
                price: Number(product.price || 0),
                quantity: quantity,
                image: product.image || "",
                remainingStock: Math.max(0, availableStock - quantity),
            });
        }

        await client.query('COMMIT');
        return results;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function createOrder(userId, total, items, shippingAddress, stripePaymentIntentId = null, createdAt = null) {
    let itemsJson;
    if (Array.isArray(items)) {
        itemsJson = JSON.stringify(items);
    } else {
        itemsJson = items;
    }

    const client = await pool.connect();
    try {
        let query, values;
        if (createdAt) {
            query = `
                INSERT INTO orders (userId, total, items, shippingAddress, stripePaymentIntentId, createdAt, updatedAt)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `;
            values = [userId, total, itemsJson, shippingAddress, stripePaymentIntentId, createdAt, createdAt];
        } else {
            query = `
                INSERT INTO orders (userId, total, items, shippingAddress, stripePaymentIntentId)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `;
            values = [userId, total, itemsJson, shippingAddress, stripePaymentIntentId];
        }

        const result = await client.query(query, values);
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function getOrderByStripePaymentIntentId(stripePaymentIntentId) {
    if (!stripePaymentIntentId) return null;
    const client = await pool.connect();
    try {
        const result = await client.query("SELECT * FROM orders WHERE stripePaymentIntentId = $1", [stripePaymentIntentId]);
        const order = result.rows[0];
        if (order) {
            order.items = order.items; // Already JSONB
        }
        return order;
    } finally {
        client.release();
    }
}

async function getOrderById(orderId) {
    const client = await pool.connect();
    try {
        const result = await client.query("SELECT * FROM orders WHERE id = $1", [orderId]);
        const order = result.rows[0];
        if (order) {
            order.items = order.items; // Already JSONB
        }
        return order;
    } finally {
        client.release();
    }
}

async function getOrdersByUserId(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            "SELECT * FROM orders WHERE userId = $1 ORDER BY createdAt DESC",
            [userId]
        );
        return result.rows.map((order) => ({
            ...order,
            items: order.items, // Already JSONB
        }));
    } finally {
        client.release();
    }
}

async function getAllOrders() {
    const client = await pool.connect();
    try {
        const result = await client.query("SELECT * FROM orders ORDER BY createdAt DESC");
        return result.rows.map((order) => ({
            ...order,
            items: order.items, // Already JSONB
        }));
    } finally {
        client.release();
    }
}

async function updateOrderStatus(orderId, status) {
    const client = await pool.connect();
    try {
        await client.query(
            "UPDATE orders SET status = $1, updatedAt = CURRENT_TIMESTAMP WHERE id = $2",
            [status, orderId]
        );
        return await getOrderById(orderId);
    } finally {
        client.release();
    }
}
async function addAddress(userId, street, city, postalCode, country, phone = "", isDefault = false) {
    const client = await pool.connect();
    try {
        if (isDefault) {
            await client.query("UPDATE addresses SET isDefault = false WHERE userId = $1", [userId]);
        }

        const result = await client.query(`
            INSERT INTO addresses (userId, street, city, postalCode, country, phone, isDefault)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [userId, street, city, postalCode, country, phone, isDefault]);

        return result.rows[0];
    } finally {
        client.release();
    }
}

async function getAddressById(addressId) {
    const client = await pool.connect();
    try {
        const result = await client.query("SELECT * FROM addresses WHERE id = $1", [addressId]);
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function getAddressesByUserId(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            "SELECT * FROM addresses WHERE userId = $1 ORDER BY createdAt DESC",
            [userId]
        );
        return result.rows;
    } finally {
        client.release();
    }
}

async function deleteAddress(addressId) {
    const client = await pool.connect();
    try {
        await client.query("DELETE FROM addresses WHERE id = $1", [addressId]);
    } finally {
        client.release();
    }
}

async function addPaymentMethod(userId, method, isDefault = false) {
    const client = await pool.connect();
    try {
        if (isDefault) {
            await client.query("UPDATE paymentMethods SET isDefault = false WHERE userId = $1", [userId]);
        }

        const alias = String(method.alias || method.cardHolder || "").trim();
        const brand = String(method.brand || "").trim();
        const last4 = String(method.last4 || "").trim();
        const expiry = String(method.expiry || method.expiryDate || "").trim();

        const result = await client.query(`
            INSERT INTO paymentMethods (userId, cardNumber, cardHolder, expiryDate, isDefault, alias, brand, last4, expiry)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [userId, last4, alias || "Carta", expiry, isDefault, alias, brand, last4, expiry]);

        return result.rows[0];
    } finally {
        client.release();
    }
}

async function getPaymentMethodById(paymentMethodId) {
    const client = await pool.connect();
    try {
        const result = await client.query("SELECT * FROM paymentMethods WHERE id = $1", [paymentMethodId]);
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function getPaymentMethodsByUserId(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            "SELECT * FROM paymentMethods WHERE userId = $1 ORDER BY createdAt DESC",
            [userId]
        );
        return result.rows.map((method) => ({
            ...method,
            alias: method.alias || method.cardholder || "",
            brand: method.brand || "",
            last4: method.last4 || method.cardnumber || "",
            expiry: method.expiry || method.expirydate || "",
        }));
    } finally {
        client.release();
    }
}

async function deletePaymentMethod(paymentMethodId) {
    const client = await pool.connect();
    try {
        await client.query("DELETE FROM paymentMethods WHERE id = $1", [paymentMethodId]);
    } finally {
        client.release();
    }
}
async function getCart(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query("SELECT * FROM cartItems WHERE userId = $1", [userId]);
        const cart = result.rows[0];
        if (cart) {
            cart.items = cart.items; // Already JSONB
        }
        return cart || null;
    } finally {
        client.release();
    }
}

async function updateCart(userId, items) {
    const itemsJson = JSON.stringify(items);
    const client = await pool.connect();
    try {
        await client.query(`
            INSERT INTO cartItems (userId, items)
            VALUES ($1, $2)
            ON CONFLICT (userId) DO UPDATE SET items = $2, updatedAt = CURRENT_TIMESTAMP
        `, [userId, itemsJson]);
        return await getCart(userId);
    } finally {
        client.release();
    }
}

async function clearCart(userId) {
    const client = await pool.connect();
    try {
        await client.query("DELETE FROM cartItems WHERE userId = $1", [userId]);
    } finally {
        client.release();
    }
}

async function seedDatabase() {
    const client = await pool.connect();
    try {
        const userCountResult = await client.query("SELECT COUNT(*) as count FROM users");
        const userCount = parseInt(userCountResult.rows[0].count);

        const legacyAdminResult = await client.query("SELECT * FROM users WHERE email = $1", [ADMIN_EMAIL]);
        const legacyAdmin = legacyAdminResult.rows[0];

        const currentAdminResult = await client.query("SELECT * FROM users WHERE email = $1", [ADMIN_EMAIL]);
        const currentAdmin = currentAdminResult.rows[0];

        if (legacyAdmin && !currentAdmin) {
            await client.query(
                "UPDATE users SET email = $1, name = $2, updatedAt = CURRENT_TIMESTAMP WHERE id = $3",
                [ADMIN_EMAIL, "Administrator", legacyAdmin.id]
            );
        }

        if (userCount === 0) {
            await createUser(ADMIN_EMAIL, "Administrator", "admin", "admin");
        }

        const existingProductsResult = await client.query("SELECT name FROM products");
        const existingNames = new Set(existingProductsResult.rows.map(p => p.name));

        let insertedProducts = 0;
        for (const product of DEFAULT_PRODUCTS) {
            if (!existingNames.has(product.name)) {
                await createProduct(
                    product.name,
                    product.price,
                    product.category,
                    product.description,
                    product.image,
                    product.stock
                );
                insertedProducts += 1;
            }
        }

        // Update specific products with images
        const imageUpdates = [
            ["Laptop Pro", "uploads/Laptop_Pro.jpg"],
            ["Pantaloni Jeans", "uploads/Pantaloni_Jeans.jpg"],
        ];

        for (const [productName, imagePath] of imageUpdates) {
            await client.query(
                "UPDATE products SET image = $1, updatedAt = CURRENT_TIMESTAMP WHERE name = $2 AND (image IS NULL OR image = '' OR image LIKE 'https://via.placeholder.com%')",
                [imagePath, productName]
            );
        }

        if (userCount === 0 || insertedProducts > 0) {
            console.log(`✅ Database PostgreSQL popolato con dati demo (${insertedProducts} prodotti aggiunti)`);
        }
    } finally {
        client.release();
    }
}
module.exports = {
    pool: pool,
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

const Database = require("better-sqlite3");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Configurazione percorso database (evita conflitti con DATABASE_URL di Railway se è Postgres)
const volumeMountPath = String(
  process.env.RAILWAY_VOLUME_MOUNT_PATH || "",
).trim();
const volumeDbPath = volumeMountPath
  ? path.join(volumeMountPath, "app.db")
  : "app.db";
const RESOLVED_VOLUME_PATH = volumeMountPath
  ? path.resolve(volumeMountPath)
  : "";
const requestedDbPath = String(process.env.DB_PATH || "").trim();
const requestedResolvedDbPath = requestedDbPath
  ? path.resolve(
      path.isAbsolute(requestedDbPath)
        ? requestedDbPath
        : path.join(__dirname, requestedDbPath),
    )
  : "";
const requestedDbIsPersistent =
  RESOLVED_VOLUME_PATH &&
  requestedResolvedDbPath &&
  (requestedResolvedDbPath === RESOLVED_VOLUME_PATH ||
    requestedResolvedDbPath.startsWith(RESOLVED_VOLUME_PATH + path.sep));
const rawDbPath =
  RESOLVED_VOLUME_PATH && !requestedDbIsPersistent
    ? volumeDbPath
    : requestedDbPath || volumeDbPath;
const DB_PATH = path.isAbsolute(rawDbPath)
  ? rawDbPath
  : path.resolve(__dirname, rawDbPath);

if (
  RESOLVED_VOLUME_PATH &&
  requestedDbPath &&
  requestedResolvedDbPath !== DB_PATH
) {
  console.warn(
    `[WARN] DB_PATH (${requestedDbPath}) non e persistente su Railway. ` +
      `Uso ${DB_PATH} sul volume ${RESOLVED_VOLUME_PATH}.`,
  );
}

// Assicura che la cartella di destinazione esista
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
console.log(`[DB] Inizializzazione database in: ${DB_PATH}`);
const db = new Database(DB_PATH);
const tableColumnsCache = new Map();

const ADMIN_EMAIL = normalizeEmail(
  process.env.ADMIN_EMAIL || "admin@gmail.com",
);
const ADMIN_NAME =
  String(process.env.ADMIN_NAME || "Administrator").trim() || "Administrator";
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "admin").trim();
const PASSWORD_HASH_PREFIX = "scrypt";
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_SALT_BYTES = 16;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

const DEFAULT_PRODUCTS = [
  {
    id: 1,
    name: "Laptop Pro",
    description: "Potente laptop per professionisti",
    price: 1299.99,
    category: "elettronica",
    image: "uploads/Laptop_Pro.jpg",
    stock: 10,
    rating: 4.5,
  },
  {
    id: 2,
    name: "Mouse Wireless",
    description: "Mouse ergonomico 2.4GHz",
    price: 29.99,
    category: "elettronica",
    image: "",
    stock: 50,
    rating: 4.2,
  },
  {
    id: 3,
    name: "Tastiera Meccanica",
    description: "Tastiera con switch meccanici",
    price: 149.99,
    category: "elettronica",
    image: "",
    stock: 25,
    rating: 4.7,
  },
  {
    id: 4,
    name: "Monitor 4K",
    description: "Monitor 4K da 27 pollici",
    price: 399.99,
    category: "elettronica",
    image: "",
    stock: 15,
    rating: 4.4,
  },
  {
    id: 5,
    name: "Cuffie ANC",
    description: "Cuffie con cancellazione rumore",
    price: 199.99,
    category: "elettronica",
    image: "",
    stock: 30,
    rating: 4.6,
  },
  {
    id: 6,
    name: "Maglietta Premium",
    description: "Maglietta in cotone 100% organico",
    price: 34.99,
    category: "abbigliamento",
    image: "",
    stock: 60,
    rating: 4.3,
  },
  {
    id: 7,
    name: "Pantaloni Jeans",
    description: "Jeans di qualità premium",
    price: 79.99,
    category: "abbigliamento",
    image: "uploads/Pantaloni_Jeans.jpg",
    stock: 40,
    rating: 4.4,
  },
  {
    id: 8,
    name: "Giacca Invernale",
    description: "Giacca calda e impermeabile",
    price: 149.99,
    category: "abbigliamento",
    image: "",
    stock: 20,
    rating: 4.6,
  },
  {
    id: 9,
    name: "Scarpe Sportive",
    description: "Scarpe comode per sport e tempo libero",
    price: 99.99,
    category: "abbigliamento",
    image: "",
    stock: 35,
    rating: 4.5,
  },
  {
    id: 10,
    name: "Divano Moderno",
    description: "Divano in tessuto grigio",
    price: 599.99,
    category: "casa",
    image: "",
    stock: 8,
    rating: 4.7,
  },
  {
    id: 11,
    name: "Tavolo da Pranzo",
    description: "Tavolo in legno massello",
    price: 349.99,
    category: "casa",
    image: "",
    stock: 12,
    rating: 4.4,
  },
  {
    id: 12,
    name: "Lampada LED",
    description: "Lampada moderna design minimal",
    price: 89.99,
    category: "casa",
    image: "",
    stock: 25,
    rating: 4.3,
  },
  {
    id: 13,
    name: "Tappeto",
    description: "Tappeto decorativo camera",
    price: 199.99,
    category: "casa",
    image: "",
    stock: 15,
    rating: 4.6,
  },
  {
    id: 14,
    name: "Bicicletta MTB",
    description: "Bicicletta Mountain 21 velocità",
    price: 449.99,
    category: "sport",
    image: "",
    stock: 10,
    rating: 4.5,
  },
  {
    id: 15,
    name: "Zaino Trekking",
    description: "Zaino 50L impermeabile",
    price: 129.99,
    category: "sport",
    image: "",
    stock: 40,
    rating: 4.4,
  },
  {
    id: 16,
    name: "Tenda Campeggio",
    description: "Tenda 3 persone ultraleggera",
    price: 219.99,
    category: "sport",
    image: "",
    stock: 18,
    rating: 4.6,
  },
  {
    id: 17,
    name: "Pallone Calcio",
    description: "Pallone professionale FIFA",
    price: 44.99,
    category: "sport",
    image: "",
    stock: 50,
    rating: 4.3,
  },
  {
    id: 18,
    name: "Romanzo Fantasy",
    description: "Trilogia completa edizione speciale",
    price: 89.99,
    category: "libri",
    image: "",
    stock: 25,
    rating: 4.9,
  },
  {
    id: 19,
    name: "Libro Cucina",
    description: "Le migliori ricette italiane",
    price: 29.99,
    category: "libri",
    image: "",
    stock: 30,
    rating: 4.8,
  },
  {
    id: 20,
    name: "Guida Tecnica",
    description: "Guida su architetture microservizi",
    price: 59.99,
    category: "libri",
    image: "",
    stock: 15,
    rating: 4.4,
  },
  {
    id: 21,
    name: "Manuale Storia",
    description: "Storia dell'umanità illustrata",
    price: 24.99,
    category: "libri",
    image: "",
    stock: 45,
    rating: 4.7,
  },
  {
    id: 22,
    name: "Smartwatch v2",
    description: "Monitoraggio salute e GPS",
    price: 249.99,
    category: "altro",
    image: "",
    stock: 22,
    rating: 4.5,
  },
  {
    id: 23,
    name: "Power Bank",
    description: "Power bank 20000mAh 65W",
    price: 59.99,
    category: "altro",
    image: "",
    stock: 50,
    rating: 4.3,
  },
  {
    id: 24,
    name: "Speaker BT",
    description: "Altoparlante Bluetooth wireless",
    price: 89.99,
    category: "altro",
    image: "",
    stock: 35,
    rating: 4.4,
  },
  {
    id: 25,
    name: "Portafoglio",
    description: "Portafoglio protezione RFID",
    price: 39.99,
    category: "altro",
    image: "",
    stock: 60,
    rating: 4.2,
  },
];

db.pragma("foreign_keys = ON");

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function normalizeRole(role) {
  return String(role || "")
    .trim()
    .toLowerCase() === "admin"
    ? "admin"
    : "user";
}

function hashLegacyPassword(password) {
  return crypto
    .createHash("sha256")
    .update(String(password || ""))
    .digest("hex");
}

function validatePasswordStrength(password) {
  // Nessuna limitazione sulla password
  return null;
}

function generateBootstrapPassword() {
  return crypto.randomBytes(18).toString("base64url");
}

function ensureColumn(tableName, columnName, definition) {
  const columns = getTableColumns(tableName, { refresh: true });
  const hasColumn = columns.some((column) => column.name === columnName);
  if (!hasColumn) {
    try {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
      getTableColumns(tableName, { refresh: true });
    } catch (error) {
      if (/non-constant default/i.test(error.message)) {
        const fallbackDefinition = definition.replace(
          /\s+DEFAULT\s+CURRENT_TIMESTAMP/i,
          "",
        );
        try {
          db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${fallbackDefinition}`);
          getTableColumns(tableName, { refresh: true });
          return;
        } catch (fallbackError) {
          console.warn(
            `Nota: Impossibile aggiungere colonna ${columnName} a ${tableName}: ${fallbackError.message}`,
          );
          return;
        }
      }
      console.warn(
        `Nota: Impossibile aggiungere colonna ${columnName} a ${tableName}: ${error.message}`,
      );
    }
  }
}

function getTableColumns(tableName, options = {}) {
  const refresh = options.refresh === true;
  if (!refresh && tableColumnsCache.has(tableName)) {
    return tableColumnsCache.get(tableName);
  }
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  tableColumnsCache.set(tableName, columns);
  return columns;
}

function tableHasColumn(tableName, columnName) {
  return getTableColumns(tableName).some(
    (column) => column.name === columnName,
  );
}

function refreshProductReviewStats(productId = null, options = {}) {
  const touchUpdatedAt = Boolean(options.touchUpdatedAt);
  const hasReviewCountColumn = tableHasColumn("products", "reviewCount");
  const targetProductIds =
    productId == null
      ? db
          .prepare("SELECT id FROM products")
          .all()
          .map((row) => row.id)
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
            refreshToken TEXT,
            resetToken TEXT,
            resetTokenExpiry DATETIME,
            passwordUpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            lastLoginAt DATETIME,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
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
            streetNumber TEXT,
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
    "users",
    "passwordUpdatedAt",
    "passwordUpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP",
  );
  ensureColumn("users", "lastLoginAt", "lastLoginAt DATETIME");
  ensureColumn(
    "products",
    "updatedAt",
    "updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP",
  );
  ensureColumn("users", "refreshToken", "refreshToken TEXT");
  ensureColumn("products", "reviewCount", "reviewCount INTEGER DEFAULT 0");
  ensureColumn("users", "resetPasswordToken", "resetPasswordToken TEXT");
  ensureColumn(
    "users",
    "resetPasswordExpires",
    "resetPasswordExpires DATETIME",
  );
  ensureColumn("users", "resetToken", "resetToken TEXT");
  ensureColumn("users", "resetTokenExpiry", "resetTokenExpiry DATETIME");
  ensureColumn("orders", "status", "status TEXT DEFAULT 'pending'");
  ensureColumn("orders", "shippingAddress", "shippingAddress TEXT");
  ensureColumn("orders", "stripePaymentIntentId", "stripePaymentIntentId TEXT");
  ensureColumn("addresses", "streetNumber", "streetNumber TEXT");
  ensureColumn("paymentMethods", "alias", "alias TEXT");
  ensureColumn("paymentMethods", "brand", "brand TEXT");
  ensureColumn("paymentMethods", "last4", "last4 TEXT");
  ensureColumn("paymentMethods", "expiry", "expiry TEXT");
  ensureColumn("paymentMethods", "cardNumber", "cardNumber TEXT");
  ensureColumn("paymentMethods", "cardHolder", "cardHolder TEXT");
  ensureColumn("paymentMethods", "expiryDate", "expiryDate TEXT");
  db.exec(`
        CREATE INDEX IF NOT EXISTS idx_users_refresh_token
        ON users(refreshToken);

        CREATE INDEX IF NOT EXISTS idx_orders_user_created
        ON orders(userId, createdAt DESC, id DESC);

        CREATE INDEX IF NOT EXISTS idx_orders_stripe_payment_intent
        ON orders(stripePaymentIntentId);

        CREATE INDEX IF NOT EXISTS idx_reviews_product_updated
        ON reviews(productId, updatedAt DESC, id DESC);

        CREATE INDEX IF NOT EXISTS idx_addresses_user_default
        ON addresses(userId, isDefault DESC, createdAt DESC, id DESC);

        CREATE INDEX IF NOT EXISTS idx_payment_methods_user_default
        ON paymentMethods(userId, isDefault DESC, createdAt DESC, id DESC);
    `);
  if (tableHasColumn("users", "passwordUpdatedAt")) {
    db.exec(`
          UPDATE users
          SET passwordUpdatedAt = COALESCE(passwordUpdatedAt, updatedAt, createdAt, CURRENT_TIMESTAMP)
          WHERE passwordUpdatedAt IS NULL
      `);
  }
  refreshProductReviewStats();

  console.log("SQLite Database Inizializzato");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(PASSWORD_SALT_BYTES).toString("hex");
  const derivedKey = crypto
    .scryptSync(String(password || ""), salt, PASSWORD_KEY_LENGTH, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
    })
    .toString("hex");
  return [
    PASSWORD_HASH_PREFIX,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt,
    derivedKey,
  ].join("$");
}

function verifyPassword(password, storedHash) {
  const normalizedPassword = String(password || "");
  const normalizedStoredHash = String(storedHash || "").trim();

  if (!normalizedStoredHash) {
    return { valid: false, needsRehash: false };
  }

  if (normalizedStoredHash.startsWith(`${PASSWORD_HASH_PREFIX}$`)) {
    const [, nValue, rValue, pValue, salt, expectedHash] =
      normalizedStoredHash.split("$");

    if (!salt || !expectedHash) {
      return { valid: false, needsRehash: false };
    }

    const computedHash = crypto
      .scryptSync(
        normalizedPassword,
        salt,
        Buffer.from(expectedHash, "hex").length,
        {
          N: Number(nValue) || SCRYPT_N,
          r: Number(rValue) || SCRYPT_R,
          p: Number(pValue) || SCRYPT_P,
        },
      )
      .toString("hex");

    const isValid =
      computedHash.length === expectedHash.length &&
      crypto.timingSafeEqual(
        Buffer.from(computedHash, "hex"),
        Buffer.from(expectedHash, "hex"),
      );

    return { valid: isValid, needsRehash: false };
  }

  const legacyHash = hashLegacyPassword(normalizedPassword);
  const isLegacyValid = normalizedStoredHash === legacyHash;
  return { valid: isLegacyValid, needsRehash: isLegacyValid };
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

function issueSessionTokens(userId) {
  const sessionToken = generateSessionToken();
  const refreshToken = generateSessionToken();
  db.prepare(
    `
            UPDATE users
            SET sessionToken = ?,
                refreshToken = ?,
                lastLoginAt = CURRENT_TIMESTAMP,
                updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?
        `,
  ).run(sessionToken, refreshToken, userId);
  return { sessionToken, refreshToken };
}

function setResetPasswordToken(email, token, expires) {
  const result = db
    .prepare(
      `
      UPDATE users
      SET resetPasswordToken = ?,
          resetPasswordExpires = ?
      WHERE email = ?
  `,
    )
    .run(token, expires.toISOString(), normalizeEmail(email));
  return result.changes > 0;
}

function getUserByResetToken(token) {
  return db
    .prepare(
      `
      SELECT * FROM users
      WHERE resetPasswordToken = ? AND resetPasswordExpires > CURRENT_TIMESTAMP
  `,
    )
    .get(token);
}

function clearUserSession(userId) {
  const normalizedUserId = Number(userId);
  if (!Number.isFinite(normalizedUserId)) {
    return false;
  }
  const result = db
    .prepare(
      `
            UPDATE users
            SET sessionToken = NULL,
                refreshToken = NULL,
                updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?
        `,
    )
    .run(normalizedUserId);
  return result.changes > 0;
}

function updateUserPassword(userId, password) {
  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
    throw new Error(passwordError);
  }

  const normalizedUserId = Number(userId);
  const passwordHash = hashPassword(password);
  const result = db
    .prepare(
      `
            UPDATE users
            SET passwordHash = ?,
                passwordUpdatedAt = CURRENT_TIMESTAMP,
                sessionToken = NULL,
                refreshToken = NULL,
                updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?
        `,
    )
    .run(passwordHash, normalizedUserId);

  if (result.changes === 0) {
    throw new Error("Utente non trovato");
  }

  return getUserById(normalizedUserId);
}

function parseOrderItems(itemsValue) {
  if (typeof itemsValue !== "string") {
    return Array.isArray(itemsValue) ? itemsValue : [];
  }
  try {
    const parsed = JSON.parse(itemsValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Impossibile leggere gli item ordine:", error.message);
    return [];
  }
}

function normalizeOrderRow(order) {
  if (!order) {
    return order;
  }
  return {
    ...order,
    items: parseOrderItems(order.items),
  };
}

function createUser(email, name, password, role = "user") {
  const normalizedEmail = normalizeEmail(email);
  const normalizedName = String(name || "").trim();
  const normalizedRole = normalizeRole(role);
  const passwordError = validatePasswordStrength(password);

  if (!normalizedEmail) {
    throw new Error("Email obbligatoria");
  }
  if (!normalizedName) {
    throw new Error("Nome obbligatorio");
  }
  if (passwordError) {
    throw new Error(passwordError);
  }

  const passwordHash = hashPassword(password);

  try {
    const stmt = db.prepare(`
            INSERT INTO users (email, name, passwordHash, role, sessionToken, refreshToken, passwordUpdatedAt)
            VALUES (?, ?, ?, ?, NULL, NULL, CURRENT_TIMESTAMP)
        `);
    const result = stmt.run(
      normalizedEmail,
      normalizedName,
      passwordHash,
      normalizedRole,
    );
    return {
      id: result.lastInsertRowid,
      email: normalizedEmail,
      name: normalizedName,
      role: normalizedRole,
      sessionToken: null,
      refreshToken: null,
    };
  } catch (error) {
    throw new Error("Email gia in uso");
  }
}

function getUserByEmail(email) {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
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
  const normalizedEmail = normalizeEmail(email);
  const user = getUserByEmail(normalizedEmail);

  if (!user) {
    console.warn(
      `[AUTH] Login fallito: utente ${normalizedEmail} non trovato nel database.`,
    );
    throw new Error("Email o password errati");
  }

  const verification = verifyPassword(password, user.passwordHash);
  if (!verification.valid) {
    throw new Error("Email o password errati");
  }

  if (verification.needsRehash) {
    db.prepare(
      `
                UPDATE users
                SET passwordHash = ?,
                    passwordUpdatedAt = CURRENT_TIMESTAMP,
                    updatedAt = CURRENT_TIMESTAMP
                WHERE id = ?
            `,
    ).run(hashPassword(password), user.id);
  }

  const { sessionToken, refreshToken } = issueSessionTokens(user.id);

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
            passwordUpdatedAt,
            lastLoginAt,
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
    values.push(
      String(updates.email || "")
        .trim()
        .toLowerCase(),
    );
  }
  if (updates.role !== undefined) {
    fields.push("role = ?");
    values.push(normalizeRole(updates.role));
  }

  if (!fields.length) {
    throw new Error("Nessun campo da aggiornare");
  }

  fields.push("updatedAt = CURRENT_TIMESTAMP");
  values.push(userId);

  const result = db
    .prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`)
    .run(...values);

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
    const users = db
      .prepare("SELECT id FROM users WHERE email LIKE ?")
      .all(pattern);
    users.forEach((u) => deleteUser(u.id));
    return users.length;
  })();
}

function getProductById(id) {
  const stmt = db.prepare("SELECT * FROM products WHERE id = ?");
  return stmt.get(id);
}

function getAllProducts() {
  const stmt = db.prepare(
    "SELECT * FROM products ORDER BY createdAt DESC, id DESC",
  );
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
        key === "stock" ? Math.max(0, Math.floor(Number(value) || 0)) : value,
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
  return normalizeOrderRow(stmt.get(orderId));
}

function getOrdersByUserId(userId) {
  const stmt = db.prepare(
    "SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC, id DESC",
  );
  return stmt.all(userId).map(normalizeOrderRow);
}

function getAllOrders() {
  const stmt = db.prepare(
    "SELECT * FROM orders ORDER BY createdAt DESC, id DESC",
  );
  return stmt.all().map(normalizeOrderRow);
}

function getAllOrdersWithUsers() {
  const stmt = db.prepare(`
        SELECT
            o.*,
            COALESCE(u.email, '') AS userEmail,
            COALESCE(u.name, 'Cliente') AS userName
        FROM orders o
        LEFT JOIN users u ON u.id = o.userId
        ORDER BY o.createdAt DESC, o.id DESC
    `);
  return stmt.all().map(normalizeOrderRow);
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
  return normalizeOrderRow(stmt.get(stripePaymentIntentId));
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
  streetNumber,
  city,
  postalCode,
  country,
  phone = "",
  isDefault = false,
) {
  const args = Array.from(arguments);
  const isLegacySignature = args.length <= 7;
  const normalizedStreet = String(street || "").trim();
  const normalizedStreetNumber = isLegacySignature
    ? ""
    : String(streetNumber || "").trim();
  const normalizedCity = String(
    isLegacySignature ? args[2] || "" : city || "",
  ).trim();
  const normalizedPostalCode = String(
    isLegacySignature ? args[3] || "" : postalCode || "",
  ).trim();
  const normalizedCountry = String(
    isLegacySignature ? args[4] || "" : country || "",
  )
    .trim()
    .toUpperCase();
  const normalizedPhone = String(
    isLegacySignature ? args[5] || "" : phone || "",
  ).trim();
  const normalizedIsDefault = Boolean(isLegacySignature ? args[6] : isDefault);

  return db.transaction(() => {
    const hasExisting = db
      .prepare("SELECT id FROM addresses WHERE userId = ? LIMIT 1")
      .get(userId);
    const shouldBeDefault = normalizedIsDefault || !hasExisting;

    if (shouldBeDefault) {
      db.prepare("UPDATE addresses SET isDefault = 0 WHERE userId = ?").run(
        userId,
      );
    }

    const stmt = db.prepare(`
            INSERT INTO addresses (userId, street, streetNumber, city, postalCode, country, phone, isDefault)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
    const result = stmt.run(
      userId,
      normalizedStreet,
      normalizedStreetNumber,
      normalizedCity,
      normalizedPostalCode,
      normalizedCountry,
      normalizedPhone,
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
        .prepare(
          `
                    SELECT id
                    FROM addresses
                    WHERE userId = ?
                    ORDER BY createdAt DESC, id DESC
                    LIMIT 1
                `,
        )
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
    const last4 = String(method?.last4 || method?.cardNumber || "")
      .replace(/\D/g, "")
      .slice(-4);
    const expiry = String(method?.expiry || method?.expiryDate || "")
      .replace(/[^\d/]/g, "")
      .trim();

    const payload = {
      userId: userId,
      isDefault: shouldBeDefault ? 1 : 0,
    };

    const paymentMethodsColumns = new Set(
      getTableColumns("paymentMethods").map((column) => column.name),
    );

    if (paymentMethodsColumns.has("alias")) {
      payload.alias = alias;
    }
    if (paymentMethodsColumns.has("brand")) {
      payload.brand = brand;
    }
    if (paymentMethodsColumns.has("last4")) {
      payload.last4 = last4;
    }
    if (paymentMethodsColumns.has("expiry")) {
      payload.expiry = expiry;
    }
    if (paymentMethodsColumns.has("cardNumber")) {
      payload.cardNumber = last4;
    }
    if (paymentMethodsColumns.has("cardHolder")) {
      payload.cardHolder = alias;
    }
    if (paymentMethodsColumns.has("expiryDate")) {
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

    db.prepare("DELETE FROM paymentMethods WHERE id = ?").run(paymentMethodId);

    if (Number(existingMethod.isDefault || 0) === 1) {
      const replacement = db
        .prepare(
          `
                    SELECT id
                    FROM paymentMethods
                    WHERE userId = ?
                    ORDER BY createdAt DESC, id DESC
                    LIMIT 1
                `,
        )
        .get(existingMethod.userId);
      if (replacement) {
        db.prepare("UPDATE paymentMethods SET isDefault = 1 WHERE id = ?").run(
          replacement.id,
        );
      }
    }

    return true;
  })();
}

function setDefaultPaymentMethod(userId, paymentMethodId) {
  return db.transaction(() => {
    const method = getPaymentMethodById(paymentMethodId);
    if (!method || Number(method.userId) !== Number(userId)) {
      return null;
    }

    db.prepare("UPDATE paymentMethods SET isDefault = 0 WHERE userId = ?").run(
      userId,
    );
    db.prepare("UPDATE paymentMethods SET isDefault = 1 WHERE id = ?").run(
      paymentMethodId,
    );

    return getPaymentMethodById(paymentMethodId);
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

  db.prepare(
    `
        INSERT INTO reviews (productId, userId, rating, comment, updatedAt)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(productId, userId) DO UPDATE SET
            rating = excluded.rating,
            comment = excluded.comment,
            updatedAt = CURRENT_TIMESTAMP
    `,
  ).run(productId, userId, ratingNum, commentStr);
  refreshProductReviewStats(productId, { touchUpdatedAt: true });

  return {
    product: getProductById(productId),
    reviews: getReviewsByProductId(productId),
  };
}

function seedDatabase() {
  console.log("[SEED] Verifica presenza account amministratore...");
  const adminUser = db
    .prepare(
      `
                SELECT *
                FROM users
                WHERE role = 'admin'
                ORDER BY createdAt ASC, id ASC
                LIMIT 1
            `,
    )
    .get();
  const configuredAdmin = getUserByEmail(ADMIN_EMAIL);

  if (configuredAdmin) {
    if (configuredAdmin.role !== "admin") {
      db.prepare(
        "UPDATE users SET role = 'admin', updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
      ).run(configuredAdmin.id);
    }

    // Forza sempre la password del .env se l'utente esiste
    const currentHash = hashPassword(ADMIN_PASSWORD);
    db.prepare("UPDATE users SET passwordHash = ? WHERE email = ?").run(
      currentHash,
      ADMIN_EMAIL,
    );
    console.log(
      `[SEED] Password per ${ADMIN_EMAIL} sincronizzata con successo.`,
    );
  } else {
    console.log(
      `[SEED] Creazione account admin configurato: ${ADMIN_EMAIL}...`,
    );
    createUser(ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD || "admin", "admin");
  }

  // Verifica e forza la sincronizzazione della password per l'admin configurato
  const finalAdmin = getUserByEmail(ADMIN_EMAIL);
  if (
    finalAdmin &&
    ADMIN_PASSWORD &&
    !verifyPassword(ADMIN_PASSWORD, finalAdmin.passwordHash).valid
  ) {
    console.log(`[SEED] Sincronizzazione password per ${ADMIN_EMAIL}...`);
    db.prepare(
      "UPDATE users SET passwordHash = ?, passwordUpdatedAt = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(hashPassword(ADMIN_PASSWORD), finalAdmin.id);
  }

  if (!adminUser && !configuredAdmin) {
    const bootstrapPassword = ADMIN_PASSWORD || generateBootstrapPassword();
    console.log(
      `[SEED] Nessun admin trovato. Creo bootstrap admin ${ADMIN_EMAIL}...`,
    );
    try {
      createUser(ADMIN_EMAIL, ADMIN_NAME, bootstrapPassword, "admin");
      console.log(`[SEED] Admin creato con successo: ${ADMIN_EMAIL}`);
      if (!ADMIN_PASSWORD) {
        console.log(
          `[SEED] ADMIN_PASSWORD non configurata. Password temporanea generata: ${bootstrapPassword}`,
        );
      }
    } catch (e) {
      console.error(
        "[SEED] Errore critico durante la creazione dell'admin:",
        e.message,
      );
    }
  } else {
    console.log(`[SEED] Admin esistente pronto: ${adminUser.email}.`);
    if (verifyPassword("admin", adminUser.passwordHash).valid) {
      console.log(
        `[SEED] L'account admin ${adminUser.email} usa ancora una password debole predefinita. Aggiornala dal profilo o tramite ADMIN_PASSWORD.`,
      );
    }
  }

  const existingRows = db.prepare("SELECT id,name FROM products").all();
  const existingNames = new Set(existingRows.map((product) => product.name));
  const defaultNames = new Set(DEFAULT_PRODUCTS.map((product) => product.name));
  const defaultProductsByName = new Map(
    DEFAULT_PRODUCTS.map((product) => [product.name, product]),
  );
  const matchLegacyProductName = new Map([
    ["Lampada a Sospensione", "Lampada LED"],
    ["Bicicletta Mountain", "Bicicletta MTB"],
  ]);

  const referencedIds = new Set(
    getAllOrders()
      .flatMap((order) => parseOrderItems(order.items))
      .filter((item) => item && item.id)
      .map((item) => Number(item.id)),
  );

  const staleRows = existingRows.filter(
    (product) => !defaultNames.has(product.name),
  );

  const renamedStaleIds = [];
  for (const row of staleRows) {
    if (!referencedIds.has(row.id)) continue;
    const canonicalName = matchLegacyProductName.get(row.name);
    const canonicalProduct = canonicalName
      ? defaultProductsByName.get(canonicalName)
      : null;
    if (!canonicalProduct) continue;

    db.prepare(
      `UPDATE products SET name = ?, description = ?, price = ?, category = ?, image = ?, stock = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
    ).run(
      canonicalProduct.name,
      canonicalProduct.description || "",
      canonicalProduct.price,
      canonicalProduct.category || "",
      canonicalProduct.image || "",
      canonicalProduct.stock || 0,
      row.id,
    );

    db.prepare("DELETE FROM products WHERE name = ? AND id != ?").run(
      canonicalProduct.name,
      row.id,
    );

    existingNames.delete(row.name);
    existingNames.add(canonicalProduct.name);
    renamedStaleIds.push(row.id);
  }

  const staleIdsToDelete = staleRows
    .filter(
      (product) =>
        !referencedIds.has(product.id) ||
        !matchLegacyProductName.has(product.name),
    )
    .map((product) => product.id);

  if (staleIdsToDelete.length > 0) {
    const placeholders = staleIdsToDelete.map(() => "?").join(",");
    db.prepare(`DELETE FROM products WHERE id IN (${placeholders})`).run(
      ...staleIdsToDelete,
    );
    console.log(
      `[SEED] Rimosso ${staleIdsToDelete.length} prodotti obsoleti non referenziati da ordini.`,
    );
  }

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

  if (insertedProducts > 0) {
    console.log(
      `[SEED] Inseriti ${insertedProducts} nuovi prodotti di default.`,
    );
  }
}

function exportFullBackup() {
  return {
    users: db.prepare("SELECT * FROM users").all(),
    products: db.prepare("SELECT * FROM products").all(),
    orders: db.prepare("SELECT * FROM orders").all(),
    reviews: db.prepare("SELECT * FROM reviews").all(),
    addresses: db.prepare("SELECT * FROM addresses").all(),
    paymentMethods: db.prepare("SELECT * FROM paymentMethods").all(),
    cartItems: db.prepare("SELECT * FROM cartItems").all(),
    exportedAt: new Date().toISOString(),
  };
}

function restoreBackup(data) {
  return db.transaction(() => {
    // 1. Ordine di cancellazione per rispettare i vincoli di integrità (Foreign Keys)
    // Cancelliamo prima le tabelle che dipendono da altre
    db.prepare("DELETE FROM reviews").run();
    db.prepare("DELETE FROM cartItems").run();
    db.prepare("DELETE FROM orders").run();
    db.prepare("DELETE FROM addresses").run();
    db.prepare("DELETE FROM paymentMethods").run();
    db.prepare("DELETE FROM users").run();
    db.prepare("DELETE FROM products").run();

    const insert = (table, rows) => {
      if (!Array.isArray(rows) || rows.length === 0) return;
      const cols = Object.keys(rows[0]);
      const stmt = db.prepare(
        `INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
      );
      rows.forEach((row) => stmt.run(...cols.map((c) => row[c])));
    };

    // 2. Ordine di inserimento per rispettare i vincoli (Prima padri, poi figli)
    insert("users", data.users);
    insert("products", data.products);
    insert("addresses", data.addresses);
    insert("paymentMethods", data.paymentMethods);
    insert("orders", data.orders);
    insert("cartItems", data.cartItems);
    insert("reviews", data.reviews);
  })();
}

function executeCheckoutTransaction(
  userId,
  total,
  items,
  shippingAddress,
  stripeId,
) {
  return db.transaction(() => {
    // 1. Consuma lo stock
    const updateStockStmt = db.prepare(
      "UPDATE products SET stock = stock - ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND stock >= ?",
    );

    for (const item of items) {
      const result = updateStockStmt.run(item.quantity, item.id, item.quantity);
      if (result.changes === 0) {
        throw new Error(`Stock insufficiente per prodotto ID ${item.id}`);
      }
    }

    // 2. Crea l'ordine
    const order = createOrder(userId, total, items, shippingAddress, stripeId);

    // 3. Pulisce il carrello se l'utente è loggato
    if (userId) {
      db.prepare("DELETE FROM cartItems WHERE userId = ?").run(userId);
    }

    return order;
  })();
}

module.exports = {
  db,
  DB_PATH,
  initializeDatabase,
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  generateSessionToken,
  createUser,
  getUserByEmail,
  getUserBySessionToken,
  getUserById,
  authenticateUser,
  issueSessionTokens,
  clearUserSession,
  setResetPasswordToken,
  getUserByResetToken,
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
  consumeProductStock,
  createOrder,
  getOrderById,
  getOrdersByUserId,
  getAllOrders,
  getAllOrdersWithUsers,
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
  setDefaultPaymentMethod,
  getReviewsByProductId,
  addOrUpdateProductReview,
  getCart,
  updateCart,
  clearCart,
  seedDatabase,
  DEFAULT_PRODUCTS, // Espongo i prodotti di default per coerenza e per il fallback
  getUserByRefreshToken,
  exportFullBackup,
  restoreBackup,
  executeCheckoutTransaction,
};

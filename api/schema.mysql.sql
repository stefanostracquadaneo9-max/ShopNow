CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  name VARCHAR(190) NOT NULL,
  passwordHash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user',
  sessionToken VARCHAR(128) NULL UNIQUE,
  refreshToken VARCHAR(128) NULL,
  resetToken VARCHAR(128) NULL,
  resetTokenExpiry DATETIME NULL,
  stripeCustomerId VARCHAR(128) NULL,
  passwordUpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  lastLoginAt DATETIME NULL,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_refresh_token (refreshToken),
  INDEX idx_users_stripe_customer (stripeCustomerId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(190) NOT NULL,
  description TEXT NULL,
  price DECIMAL(10,2) NOT NULL,
  category VARCHAR(120) NULL,
  image VARCHAR(255) NULL,
  stock INT DEFAULT 0,
  rating DECIMAL(3,2) DEFAULT 0,
  reviewCount INT DEFAULT 0,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  status VARCHAR(40) DEFAULT 'pending',
  items LONGTEXT NOT NULL,
  shippingAddress LONGTEXT NULL,
  stripePaymentIntentId VARCHAR(128) NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_orders_user_created (userId, createdAt, id),
  INDEX idx_orders_stripe_payment_intent (stripePaymentIntentId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cartItems (
  userId INT PRIMARY KEY,
  items LONGTEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  productId INT NOT NULL,
  userId INT NOT NULL,
  rating INT NOT NULL,
  comment TEXT NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_review (productId, userId),
  INDEX idx_reviews_product_updated (productId, updatedAt, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS addresses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  street VARCHAR(255) NOT NULL,
  streetNumber VARCHAR(60) NULL,
  city VARCHAR(160) NOT NULL,
  postalCode VARCHAR(40) NOT NULL,
  country VARCHAR(10) NOT NULL,
  phone VARCHAR(80) NULL,
  isDefault TINYINT(1) DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_addresses_user_default (userId, isDefault, createdAt, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS paymentMethods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  alias VARCHAR(190) NOT NULL,
  brand VARCHAR(80) NOT NULL,
  last4 VARCHAR(4) NOT NULL,
  expiry VARCHAR(7) NOT NULL,
  isDefault TINYINT(1) DEFAULT 0,
  stripePaymentMethodId VARCHAR(128) NULL,
  stripeCustomerId VARCHAR(128) NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_payment_methods_user_default (userId, isDefault, createdAt, id),
  INDEX idx_payment_methods_stripe_pm (stripePaymentMethodId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

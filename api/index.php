<?php
declare(strict_types=1);

ini_set('display_errors', '0');
date_default_timezone_set('Europe/Rome');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: ' . request_origin());
    header('Access-Control-Allow-Headers: Authorization, Content-Type');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    http_response_code(204);
    exit;
}

header('Access-Control-Allow-Origin: ' . request_origin());
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');

function request_origin(): string
{
    return $_SERVER['HTTP_ORIGIN'] ?? '*';
}

function deep_merge(array $base, array $override): array
{
    foreach ($override as $key => $value) {
        if (is_array($value) && isset($base[$key]) && is_array($base[$key])) {
            $base[$key] = deep_merge($base[$key], $value);
        } else {
            $base[$key] = $value;
        }
    }
    return $base;
}

function app_config(): array
{
    static $config = null;
    if ($config !== null) return $config;

    $config = [
        'db' => [
            'host' => getenv('IF_DB_HOST') ?: '',
            'name' => getenv('IF_DB_NAME') ?: '',
            'user' => getenv('IF_DB_USER') ?: '',
            'pass' => getenv('IF_DB_PASS') ?: '',
        ],
        'stripe' => [
            'public_key' => getenv('STRIPE_PUBLIC_KEY') ?: '',
            'secret_key' => getenv('STRIPE_SECRET_KEY') ?: '',
        ],
        'email' => [
            'host' => getenv('SMTP_HOST') ?: 'smtp.gmail.com',
            'port' => (int)(getenv('SMTP_PORT') ?: 587),
            'secure' => getenv('SMTP_SECURE') === 'true',
            'user' => getenv('EMAIL_USER') ?: '',
            'pass' => getenv('EMAIL_PASSWORD') ?: '',
            'from' => getenv('EMAIL_FROM') ?: (getenv('EMAIL_USER') ?: ''),
            'from_name' => getenv('EMAIL_FROM_NAME') ?: 'ShopNow',
            'timeout' => 20,
        ],
        'site' => [
            'public_url' => getenv('PUBLIC_SITE_URL') ?: '',
        ],
        'security' => [
            'install_token' => getenv('INSTALL_CHECK_TOKEN') ?: '',
        ],
        'admin' => [
            'email' => getenv('ADMIN_EMAIL') ?: 'admin@gmail.com',
            'name' => getenv('ADMIN_NAME') ?: 'Administrator',
            'password' => getenv('ADMIN_PASSWORD') ?: 'admin',
        ],
    ];

    foreach ([__DIR__ . '/config.local.php', __DIR__ . '/../infinityfree.config.php'] as $file) {
        if (is_file($file)) {
            $loaded = require $file;
            if (is_array($loaded)) $config = deep_merge($config, $loaded);
        }
    }
    return $config;
}

function json_response(array $data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function json_error(string $message, int $status = 400, array $extra = []): void
{
    json_response(array_merge(['error' => $message], $extra), $status);
}

function body_json(): array
{
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function request_method(): string
{
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

function normalized_path(): string
{
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $path = '/' . trim($path, '/');
    if ($path === '/') return '/';
    foreach (['/api/', '/admin/products', '/create-payment-intent', '/install-check', '/config', '/login', '/register'] as $marker) {
        $pos = strpos($path, $marker);
        if ($pos !== false) return substr($path, $pos);
    }
    return $path;
}

function pdo(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $cfg = app_config()['db'];
    if (!$cfg['host'] || !$cfg['name'] || !$cfg['user']) {
        json_error('Database InfinityFree non configurato. Crea api/config.local.php.', 500);
    }
    $dsn = 'mysql:host=' . $cfg['host'] . ';dbname=' . $cfg['name'] . ';charset=utf8mb4';
    $pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    initialize_database($pdo);
    return $pdo;
}

function now_sql(): string
{
    return date('Y-m-d H:i:s');
}

function initialize_database(PDO $db): void
{
    static $done = false;
    if ($done) return;

    $db->exec("
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $db->exec("
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $db->exec("
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $db->exec("
        CREATE TABLE IF NOT EXISTS cartItems (
            userId INT PRIMARY KEY,
            items LONGTEXT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $db->exec("
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $db->exec("
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $db->exec("
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    seed_admin($db);
    seed_products($db);
    $done = true;
}

function normalize_email(string $email): string
{
    return strtolower(trim($email));
}

function hash_password(string $password): string
{
    return password_hash($password, PASSWORD_DEFAULT);
}

function simple_hash(string $value): string
{
    $hash = 0;
    $len = strlen($value);
    for ($i = 0; $i < $len; $i++) {
        $hash = (($hash << 5) - $hash + ord($value[$i])) & 0xffffffff;
    }
    return str_pad(dechex($hash), 8, '0', STR_PAD_LEFT);
}

function verify_user_password(string $password, string $storedHash): bool
{
    if ($storedHash === '') return false;
    if (password_get_info($storedHash)['algo'] !== 0 && password_verify($password, $storedHash)) return true;
    if (hash('sha256', $password) === $storedHash) return true;
    return simple_hash($password) === $storedHash;
}

function random_token(int $bytes = 32): string
{
    return bin2hex(random_bytes($bytes));
}

function seed_admin(PDO $db): void
{
    $cfg = app_config()['admin'];
    $email = normalize_email((string)$cfg['email']);
    $stmt = $db->prepare('SELECT id FROM users WHERE email = ?');
    $stmt->execute([$email]);
    if ($stmt->fetch()) return;
    $insert = $db->prepare('INSERT INTO users (email, name, passwordHash, role) VALUES (?, ?, ?, "admin")');
    $insert->execute([$email, (string)$cfg['name'], hash_password((string)$cfg['password'])]);
}

function default_products(): array
{
    return [
        ['Laptop Pro', 'Potente laptop per professionisti', 1299.99, 'elettronica', 'uploads/Laptop_Pro.jpg', 10, 4.5],
        ['Mouse Wireless', 'Mouse ergonomico 2.4GHz', 29.99, 'elettronica', '', 50, 4.2],
        ['Tastiera Meccanica', 'Tastiera con switch meccanici', 149.99, 'elettronica', '', 25, 4.7],
        ['Monitor 4K', 'Monitor 4K da 27 pollici', 399.99, 'elettronica', '', 15, 4.4],
        ['Cuffie ANC', 'Cuffie con cancellazione rumore', 199.99, 'elettronica', '', 30, 4.6],
        ['Maglietta Premium', 'Maglietta in cotone 100% organico', 34.99, 'abbigliamento', '', 60, 4.3],
        ['Pantaloni Jeans', 'Jeans di qualità premium', 79.99, 'abbigliamento', 'uploads/Pantaloni_Jeans.jpg', 40, 4.4],
        ['Giacca Invernale', 'Giacca calda e impermeabile', 149.99, 'abbigliamento', '', 20, 4.6],
        ['Scarpe Sportive', 'Scarpe comode per sport e tempo libero', 99.99, 'abbigliamento', '', 35, 4.5],
        ['Divano Moderno', 'Divano in tessuto grigio', 599.99, 'casa', '', 8, 4.7],
        ['Tavolo da Pranzo', 'Tavolo in legno massello', 349.99, 'casa', '', 12, 4.4],
        ['Lampada LED', 'Lampada moderna design minimal', 89.99, 'casa', '', 25, 4.3],
        ['Tappeto', 'Tappeto decorativo camera', 199.99, 'casa', '', 15, 4.6],
        ['Bicicletta MTB', 'Bicicletta Mountain 21 velocità', 449.99, 'sport', '', 10, 4.5],
        ['Zaino Trekking', 'Zaino 50L impermeabile', 129.99, 'sport', '', 40, 4.4],
        ['Tenda Campeggio', 'Tenda 3 persone ultraleggera', 219.99, 'sport', '', 18, 4.6],
        ['Pallone Calcio', 'Pallone professionale FIFA', 44.99, 'sport', '', 50, 4.3],
        ['Romanzo Fantasy', 'Trilogia completa edizione speciale', 89.99, 'libri', '', 25, 4.9],
        ['Libro Cucina', 'Le migliori ricette italiane', 29.99, 'libri', '', 30, 4.8],
        ['Guida Tecnica', 'Manuale tecnico professionale', 49.99, 'libri', '', 20, 4.4],
    ];
}

function seed_products(PDO $db): void
{
    $count = (int)$db->query('SELECT COUNT(*) FROM products')->fetchColumn();
    if ($count > 0) return;
    $stmt = $db->prepare('INSERT INTO products (name, description, price, category, image, stock, rating) VALUES (?, ?, ?, ?, ?, ?, ?)');
    foreach (default_products() as $product) $stmt->execute($product);
}

function get_authorization_token(): string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!$header && function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        $header = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }
    if (preg_match('/Bearer\s+(.+)/i', $header, $m)) return trim($m[1]);
    return '';
}

function current_user(bool $required = true): ?array
{
    $token = get_authorization_token();
    if (!$token) {
        if ($required) json_error('Token di sessione mancante', 401);
        return null;
    }
    $stmt = pdo()->prepare('SELECT * FROM users WHERE sessionToken = ?');
    $stmt->execute([$token]);
    $user = $stmt->fetch();
    if (!$user) {
        if ($required) json_error('Sessione non valida', 401);
        return null;
    }
    return $user;
}

function require_admin(): array
{
    $user = current_user(true);
    if (($user['role'] ?? '') !== 'admin') json_error('Accesso negato - Richiesto ruolo amministratore', 403);
    return $user;
}

function issue_session_tokens(int $userId): array
{
    $session = random_token();
    $refresh = random_token();
    $stmt = pdo()->prepare('UPDATE users SET sessionToken = ?, refreshToken = ?, lastLoginAt = ?, updatedAt = ? WHERE id = ?');
    $stmt->execute([$session, $refresh, now_sql(), now_sql(), $userId]);
    return ['sessionToken' => $session, 'refreshToken' => $refresh];
}

function public_user(array $user): array
{
    return [
        'id' => (int)$user['id'],
        'email' => $user['email'],
        'name' => $user['name'],
        'role' => $user['role'] ?: 'user',
    ];
}

function get_user_by_id(int $id): ?array
{
    $stmt = pdo()->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function get_user_by_email(string $email): ?array
{
    $stmt = pdo()->prepare('SELECT * FROM users WHERE email = ?');
    $stmt->execute([normalize_email($email)]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function combine_street_line(string $street, string $streetNumber): string
{
    return trim($street . ($streetNumber ? ' ' . $streetNumber : ''));
}

function normalize_address(array $address): array
{
    $street = trim((string)($address['street'] ?? $address['line1'] ?? ''));
    $streetNumber = trim((string)($address['streetNumber'] ?? ''));
    return [
        'id' => (int)$address['id'],
        'line1' => combine_street_line($street, $streetNumber),
        'street' => $street,
        'streetNumber' => $streetNumber,
        'city' => (string)($address['city'] ?? ''),
        'postalCode' => (string)($address['postalCode'] ?? ''),
        'country' => (string)($address['country'] ?? ''),
        'phone' => (string)($address['phone'] ?? ''),
        'isDefault' => ((int)($address['isDefault'] ?? 0)) === 1,
        'createdAt' => $address['createdAt'] ?? null,
    ];
}

function normalize_payment_method(array $method): array
{
    $stripeBacked = trim((string)($method['stripePaymentMethodId'] ?? '')) !== '';
    return [
        'id' => (int)$method['id'],
        'alias' => (string)($method['alias'] ?? ''),
        'brand' => normalize_payment_brand((string)($method['brand'] ?? '')),
        'last4' => substr(preg_replace('/\D+/', '', (string)($method['last4'] ?? '')), -4),
        'expiry' => normalize_payment_expiry((string)($method['expiry'] ?? '')),
        'isDefault' => ((int)($method['isDefault'] ?? 0)) === 1,
        'canUseInCheckout' => $stripeBacked,
        'stripeBacked' => $stripeBacked,
        'createdAt' => $method['createdAt'] ?? null,
    ];
}

function normalize_payment_brand(string $brand): string
{
    $key = strtolower(trim(preg_replace('/\s+/', ' ', $brand)));
    $map = [
        'visa' => 'Visa',
        'mastercard' => 'Mastercard',
        'master card' => 'Mastercard',
        'amex' => 'American Express',
        'american express' => 'American Express',
        'maestro' => 'Maestro',
        'discover' => 'Discover',
        'diners' => 'Diners Club',
        'diners club' => 'Diners Club',
        'carta' => 'Carta',
    ];
    return $map[$key] ?? trim($brand);
}

function normalize_payment_expiry(string $value): string
{
    $digits = substr(preg_replace('/\D+/', '', $value), 0, 4);
    return strlen($digits) === 4 ? substr($digits, 0, 2) . '/' . substr($digits, 2) : '';
}

function profile_payload(int $userId): array
{
    $user = get_user_by_id($userId);
    if (!$user) json_error('Utente non trovato', 404);
    $addresses = fetch_all('SELECT * FROM addresses WHERE userId = ? ORDER BY isDefault DESC, createdAt DESC, id DESC', [$userId]);
    $payments = fetch_all('SELECT * FROM paymentMethods WHERE userId = ? ORDER BY isDefault DESC, createdAt DESC, id DESC', [$userId]);
    $orders = array_map('order_row', fetch_all('SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC, id DESC', [$userId]));
    return [
        'id' => (int)$user['id'],
        'email' => $user['email'],
        'name' => $user['name'],
        'role' => $user['role'],
        'addresses' => array_map('normalize_address', $addresses),
        'paymentMethods' => array_map('normalize_payment_method', $payments),
        'orders' => $orders,
        'createdAt' => $user['createdAt'],
        'updatedAt' => $user['updatedAt'],
        'lastLoginAt' => $user['lastLoginAt'],
        'passwordUpdatedAt' => $user['passwordUpdatedAt'],
    ];
}

function fetch_all(string $sql, array $params = []): array
{
    $stmt = pdo()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function fetch_one(string $sql, array $params = []): ?array
{
    $stmt = pdo()->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch();
    return $row ?: null;
}

function product_row(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'name' => $row['name'],
        'description' => $row['description'] ?? '',
        'price' => (float)$row['price'],
        'category' => $row['category'] ?? '',
        'image' => $row['image'] ?? '',
        'stock' => (int)$row['stock'],
        'rating' => (float)$row['rating'],
        'reviewCount' => (int)($row['reviewCount'] ?? 0),
        'createdAt' => $row['createdAt'] ?? null,
        'updatedAt' => $row['updatedAt'] ?? null,
    ];
}

function all_products(): array
{
    return array_map('product_row', fetch_all('SELECT * FROM products ORDER BY id ASC'));
}

function product_by_id(int $id): ?array
{
    $row = fetch_one('SELECT * FROM products WHERE id = ?', [$id]);
    return $row ? product_row($row) : null;
}

function calculate_shipping(float $subtotal): float
{
    return ($subtotal > 0 && $subtotal < 30) ? round($subtotal * 0.05, 2) : 0.0;
}

function calculate_vat(float $gross): float
{
    return $gross > 0 ? round($gross - ($gross / 1.22), 2) : 0.0;
}

function checkout_snapshot(array $items): array
{
    if (!$items) json_error('Carrello vuoto', 400);
    $out = [];
    $subtotal = 0.0;
    foreach ($items as $item) {
        $id = (int)($item['id'] ?? 0);
        $qty = max(0, (int)($item['quantity'] ?? 0));
        if (!$id || !$qty) json_error('Dati prodotto non validi', 400);
        $product = product_by_id($id);
        if (!$product) json_error('Prodotto non trovato', 400, ['productId' => $id]);
        if ($product['stock'] < $qty) {
            json_error('Stock non sufficiente', 409, ['productId' => $id, 'availableStock' => $product['stock']]);
        }
        $subtotal += $product['price'] * $qty;
        $out[] = [
            'id' => $product['id'],
            'name' => $product['name'],
            'price' => $product['price'],
            'quantity' => $qty,
            'image' => $product['image'],
            'stock' => $product['stock'],
        ];
    }
    $shipping = calculate_shipping($subtotal);
    $total = round($subtotal + $shipping, 2);
    return [
        'items' => $out,
        'subtotal' => round($subtotal, 2),
        'shipping' => $shipping,
        'vat' => calculate_vat($subtotal),
        'total' => $total,
    ];
}

function order_row(array $row): array
{
    $items = json_decode((string)$row['items'], true);
    $shipping = json_decode((string)($row['shippingAddress'] ?? ''), true);
    return [
        'id' => (int)$row['id'],
        'userId' => (int)$row['userId'],
        'total' => (float)$row['total'],
        'status' => $row['status'] ?? 'pending',
        'items' => is_array($items) ? $items : [],
        'shippingAddress' => is_array($shipping) ? $shipping : ($row['shippingAddress'] ?? null),
        'stripePaymentIntentId' => $row['stripePaymentIntentId'] ?? null,
        'createdAt' => $row['createdAt'] ?? null,
    ];
}

function create_order_transaction(int $userId, array $snapshot, array $shippingAddress, string $paymentIntentId): array
{
    $db = pdo();
    $db->beginTransaction();
    try {
        foreach ($snapshot['items'] as $item) {
            $stmt = $db->prepare('UPDATE products SET stock = stock - ?, updatedAt = ? WHERE id = ? AND stock >= ?');
            $stmt->execute([(int)$item['quantity'], now_sql(), (int)$item['id'], (int)$item['quantity']]);
            if ($stmt->rowCount() !== 1) throw new RuntimeException('Stock non sufficiente');
        }
        $stmt = $db->prepare('INSERT INTO orders (userId, total, status, items, shippingAddress, stripePaymentIntentId) VALUES (?, ?, "paid", ?, ?, ?)');
        $stmt->execute([
            $userId,
            $snapshot['total'],
            json_encode($snapshot['items'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            json_encode($shippingAddress, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            $paymentIntentId,
        ]);
        $orderId = (int)$db->lastInsertId();
        $db->commit();
        return order_row(fetch_one('SELECT * FROM orders WHERE id = ?', [$orderId]));
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }
}

function flatten_params(array $data, string $prefix = ''): array
{
    $out = [];
    foreach ($data as $key => $value) {
        $full = $prefix === '' ? (string)$key : $prefix . '[' . $key . ']';
        if (is_array($value)) $out += flatten_params($value, $full);
        elseif ($value !== null) $out[$full] = is_bool($value) ? ($value ? 'true' : 'false') : (string)$value;
    }
    return $out;
}

function stripe_request(string $method, string $endpoint, array $params = []): array
{
    $secret = app_config()['stripe']['secret_key'];
    if (!$secret) json_error('Stripe non configurato', 500);
    $url = 'https://api.stripe.com/v1' . $endpoint;
    $flat = flatten_params($params);
    $headers = ['Authorization: Bearer ' . $secret];
    $method = strtoupper($method);
    $body = http_build_query($flat);
    if ($method === 'GET' && $body) {
        $url .= (strpos($url, '?') === false ? '?' : '&') . $body;
        $body = '';
    }

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => array_merge($headers, ['Content-Type: application/x-www-form-urlencoded']),
            CURLOPT_TIMEOUT => 30,
        ]);
        if ($method !== 'GET') curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        $response = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        if ($response === false) json_error('Connessione Stripe non riuscita: ' . $error, 502);
    } else {
        $context = stream_context_create([
            'http' => [
                'method' => $method,
                'header' => implode("\r\n", array_merge($headers, ['Content-Type: application/x-www-form-urlencoded'])),
                'content' => $method === 'GET' ? '' : $body,
                'timeout' => 30,
                'ignore_errors' => true,
            ],
        ]);
        $response = file_get_contents($url, false, $context);
        $status = 0;
        if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) $status = (int)$m[1];
        if ($response === false) json_error('Connessione Stripe non riuscita', 502);
    }
    $decoded = json_decode((string)$response, true);
    if (!is_array($decoded)) json_error('Risposta Stripe non valida', 502);
    if ($status >= 400 || isset($decoded['error'])) {
        $message = $decoded['error']['message'] ?? 'Errore Stripe';
        json_error($message, $status >= 400 ? $status : 502);
    }
    return $decoded;
}

function get_or_create_stripe_customer(array $user): string
{
    if (!empty($user['stripeCustomerId'])) return (string)$user['stripeCustomerId'];
    $customer = stripe_request('POST', '/customers', [
        'email' => $user['email'],
        'name' => $user['name'],
        'metadata' => ['shopnow_user_id' => (string)$user['id']],
    ]);
    $customerId = (string)$customer['id'];
    $stmt = pdo()->prepare('UPDATE users SET stripeCustomerId = ?, updatedAt = ? WHERE id = ?');
    $stmt->execute([$customerId, now_sql(), (int)$user['id']]);
    return $customerId;
}

function stripe_card_expiry(array $card): string
{
    $month = str_pad((string)($card['exp_month'] ?? ''), 2, '0', STR_PAD_LEFT);
    $year = substr((string)($card['exp_year'] ?? ''), -2);
    return $month && $year ? $month . '/' . $year : '';
}

function set_default_payment_method(int $userId, int $methodId): ?array
{
    $db = pdo();
    $method = fetch_one('SELECT * FROM paymentMethods WHERE id = ? AND userId = ?', [$methodId, $userId]);
    if (!$method) return null;
    $db->prepare('UPDATE paymentMethods SET isDefault = 0 WHERE userId = ?')->execute([$userId]);
    $db->prepare('UPDATE paymentMethods SET isDefault = 1 WHERE id = ?')->execute([$methodId]);
    return fetch_one('SELECT * FROM paymentMethods WHERE id = ?', [$methodId]);
}

function add_payment_method(int $userId, array $data, bool $isDefault): array
{
    $db = pdo();
    if ($isDefault) $db->prepare('UPDATE paymentMethods SET isDefault = 0 WHERE userId = ?')->execute([$userId]);
    $count = (int)fetch_one('SELECT COUNT(*) AS c FROM paymentMethods WHERE userId = ?', [$userId])['c'];
    $default = $isDefault || $count === 0 ? 1 : 0;
    $stmt = $db->prepare('
        INSERT INTO paymentMethods (userId, alias, brand, last4, expiry, isDefault, stripePaymentMethodId, stripeCustomerId)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ');
    $stmt->execute([
        $userId,
        $data['alias'],
        $data['brand'],
        $data['last4'],
        $data['expiry'],
        $default,
        $data['stripePaymentMethodId'] ?? null,
        $data['stripeCustomerId'] ?? null,
    ]);
    return fetch_one('SELECT * FROM paymentMethods WHERE id = ?', [(int)$db->lastInsertId()]);
}

function save_payment_method_from_payment_intent(array $user, string $paymentIntentId, bool $isDefault): array
{
    $intent = stripe_request('GET', '/payment_intents/' . rawurlencode($paymentIntentId), ['expand' => ['payment_method']]);
    $paymentMethod = is_array($intent['payment_method'] ?? null) ? $intent['payment_method'] : null;
    if (!$paymentMethod && !empty($intent['payment_method'])) {
        $paymentMethod = stripe_request('GET', '/payment_methods/' . rawurlencode((string)$intent['payment_method']));
    }
    $card = $paymentMethod['card'] ?? null;
    if (!$paymentMethod || !$card || empty($card['last4'])) return ['saved' => false, 'reason' => 'no_card'];
    $existing = fetch_one('SELECT * FROM paymentMethods WHERE userId = ? AND stripePaymentMethodId = ?', [(int)$user['id'], $paymentMethod['id']]);
    if ($existing) {
        if ($isDefault) set_default_payment_method((int)$user['id'], (int)$existing['id']);
        return ['saved' => true, 'reason' => 'already_present'];
    }
    $customerId = get_or_create_stripe_customer($user);
    add_payment_method((int)$user['id'], [
        'alias' => normalize_payment_brand((string)($card['brand'] ?? 'Carta')) . ' terminante in ' . $card['last4'],
        'brand' => normalize_payment_brand((string)($card['brand'] ?? 'Carta')),
        'last4' => (string)$card['last4'],
        'expiry' => stripe_card_expiry($card),
        'stripePaymentMethodId' => (string)$paymentMethod['id'],
        'stripeCustomerId' => $customerId,
    ], $isDefault);
    return ['saved' => true, 'reason' => 'saved'];
}

function smtp_read($socket): string
{
    $data = '';
    while (($line = fgets($socket, 515)) !== false) {
        $data .= $line;
        if (preg_match('/^\d{3}\s/', $line)) break;
    }
    return $data;
}

function smtp_cmd($socket, string $command, array $okCodes): string
{
    fwrite($socket, $command . "\r\n");
    $response = smtp_read($socket);
    $code = (int)substr($response, 0, 3);
    if (!in_array($code, $okCodes, true)) throw new RuntimeException(trim($response));
    return $response;
}

function send_smtp_email(string $to, string $subject, string $html, string $text = ''): bool
{
    $cfg = app_config()['email'];
    if (!$cfg['user'] || !$cfg['pass'] || !$cfg['from']) return false;
    $host = (string)$cfg['host'];
    $port = (int)$cfg['port'];
    $remote = ((bool)$cfg['secure'] || $port === 465 ? 'ssl://' : '') . $host;
    $socket = fsockopen($remote, $port, $errno, $errstr, (int)$cfg['timeout']);
    if (!$socket) throw new RuntimeException('SMTP non raggiungibile: ' . $errstr);
    stream_set_timeout($socket, (int)$cfg['timeout']);
    smtp_read($socket);
    smtp_cmd($socket, 'EHLO ' . ($_SERVER['HTTP_HOST'] ?? 'shopnow.local'), [250]);
    if ($port === 587 && !(bool)$cfg['secure']) {
        smtp_cmd($socket, 'STARTTLS', [220]);
        if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            throw new RuntimeException('STARTTLS SMTP non riuscito');
        }
        smtp_cmd($socket, 'EHLO ' . ($_SERVER['HTTP_HOST'] ?? 'shopnow.local'), [250]);
    }
    smtp_cmd($socket, 'AUTH LOGIN', [334]);
    smtp_cmd($socket, base64_encode((string)$cfg['user']), [334]);
    smtp_cmd($socket, base64_encode((string)$cfg['pass']), [235]);
    smtp_cmd($socket, 'MAIL FROM:<' . $cfg['from'] . '>', [250]);
    smtp_cmd($socket, 'RCPT TO:<' . $to . '>', [250, 251]);
    smtp_cmd($socket, 'DATA', [354]);

    $boundary = 'b_' . bin2hex(random_bytes(8));
    $headers = [
        'From: ' . mime_header((string)$cfg['from_name']) . ' <' . $cfg['from'] . '>',
        'To: <' . $to . '>',
        'Subject: ' . mime_header($subject),
        'MIME-Version: 1.0',
        'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
    ];
    $message = implode("\r\n", $headers) . "\r\n\r\n";
    $message .= "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n" . ($text ?: strip_tags($html)) . "\r\n";
    $message .= "--$boundary\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n" . $html . "\r\n";
    $message .= "--$boundary--\r\n.";
    smtp_cmd($socket, $message, [250]);
    smtp_cmd($socket, 'QUIT', [221]);
    fclose($socket);
    return true;
}

function mime_header(string $value): string
{
    if (function_exists('mb_encode_mimeheader')) {
        return mb_encode_mimeheader($value, 'UTF-8', 'B', "\r\n");
    }
    return '=?UTF-8?B?' . base64_encode($value) . '?=';
}

function site_base_url(): string
{
    $configured = trim((string)app_config()['site']['public_url']);
    if ($configured) return rtrim($configured, '/');
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    return $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
}

function send_order_email(array $order, array $user): array
{
    $itemsHtml = '';
    foreach ($order['items'] as $item) {
        $itemsHtml .= '<li>' . htmlspecialchars($item['name']) . ' x ' . (int)$item['quantity'] . ' - €' . number_format((float)$item['price'], 2, ',', '.') . '</li>';
    }
    $subject = 'Ordine #' . $order['id'] . ' confermato - ShopNow';
    $html = '<h2>Ordine confermato</h2><p>Ciao ' . htmlspecialchars($user['name']) . ', il tuo ordine #' . (int)$order['id'] . ' è confermato.</p><ul>' . $itemsHtml . '</ul><p>Totale: <strong>€' . number_format((float)$order['total'], 2, ',', '.') . '</strong></p>';
    try {
        $sent = send_smtp_email($user['email'], $subject, $html);
        return ['emailSent' => $sent, 'message' => $sent ? 'Email inviata con successo' : 'Email non configurata'];
    } catch (Throwable $e) {
        return ['emailSent' => false, 'message' => 'Email non inviata: ' . $e->getMessage()];
    }
}

function handle_register(): void
{
    $body = body_json();
    $name = trim((string)($body['name'] ?? ''));
    $email = normalize_email((string)($body['email'] ?? ''));
    $password = trim((string)($body['password'] ?? ''));
    if (!$name || !$email || !$password) json_error('Compila tutti i campi');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Email non valida');
    if (get_user_by_email($email)) json_error('Email già registrata', 400);
    $stmt = pdo()->prepare('INSERT INTO users (email, name, passwordHash, role) VALUES (?, ?, ?, "user")');
    $stmt->execute([$email, $name, hash_password($password)]);
    $user = get_user_by_id((int)pdo()->lastInsertId());
    json_response(['success' => true, 'message' => 'Account creato con successo', 'user' => public_user($user)]);
}

function handle_login(): void
{
    $body = body_json();
    $email = normalize_email((string)($body['email'] ?? ''));
    $password = trim((string)($body['password'] ?? ''));
    $user = get_user_by_email($email);
    if (!$user || !verify_user_password($password, (string)$user['passwordHash'])) {
        json_error('Email o password errati', 401);
    }
    if (!password_get_info((string)$user['passwordHash'])['algo']) {
        pdo()->prepare('UPDATE users SET passwordHash = ? WHERE id = ?')->execute([hash_password($password), (int)$user['id']]);
    }
    $tokens = issue_session_tokens((int)$user['id']);
    $user = get_user_by_id((int)$user['id']);
    json_response(['success' => true, 'user' => public_user($user), 'sessionToken' => $tokens['sessionToken'], 'refreshToken' => $tokens['refreshToken']]);
}

function handle_forgot_password(): void
{
    $body = body_json();
    $email = normalize_email((string)($body['email'] ?? ''));
    if (!$email) json_error('Email richiesta');
    $user = get_user_by_email($email);
    if ($user) {
        $token = random_token(24);
        $expiry = date('Y-m-d H:i:s', time() + 3600);
        pdo()->prepare('UPDATE users SET resetToken = ?, resetTokenExpiry = ? WHERE id = ?')->execute([$token, $expiry, (int)$user['id']]);
        $link = site_base_url() . '/reset-password.html?token=' . urlencode($token);
        $html = '<h2>Recupero password ShopNow</h2><p>Ciao ' . htmlspecialchars($user['name']) . ', usa questo link per scegliere una nuova password:</p><p><a href="' . htmlspecialchars($link) . '">' . htmlspecialchars($link) . '</a></p><p>Il link scade tra 1 ora.</p>';
        try { send_smtp_email($email, 'Recupero password ShopNow', $html); } catch (Throwable $e) {}
    }
    json_response(['success' => true, 'message' => "Se l'email è presente nei nostri sistemi, riceverai a breve un link di reset."]);
}

function handle_reset_password(): void
{
    $body = body_json();
    $token = trim((string)($body['token'] ?? ''));
    $password = trim((string)($body['password'] ?? $body['newPassword'] ?? ''));
    if (!$token || !$password) json_error('Token o password mancanti');
    $user = fetch_one('SELECT * FROM users WHERE resetToken = ? AND resetTokenExpiry > ?', [$token, now_sql()]);
    if (!$user) json_error('Link reset non valido o scaduto', 400);
    pdo()->prepare('UPDATE users SET passwordHash = ?, resetToken = NULL, resetTokenExpiry = NULL, passwordUpdatedAt = ?, updatedAt = ? WHERE id = ?')
        ->execute([hash_password($password), now_sql(), now_sql(), (int)$user['id']]);
    $tokens = issue_session_tokens((int)$user['id']);
    json_response(['success' => true, 'message' => 'Password aggiornata', 'sessionToken' => $tokens['sessionToken'], 'refreshToken' => $tokens['refreshToken'], 'user' => public_user(get_user_by_id((int)$user['id']))]);
}

function admin_user_payload(int $userId): ?array
{
    $profile = profile_payload($userId);
    $total = array_reduce($profile['orders'], fn($sum, $order) => $sum + (float)$order['total'], 0.0);
    $profile['stats'] = [
        'ordersCount' => count($profile['orders']),
        'addressesCount' => count($profile['addresses']),
        'paymentMethodsCount' => count($profile['paymentMethods']),
        'totalSpent' => round($total, 2),
    ];
    $profile['sessionActive'] = !empty(get_user_by_id($userId)['sessionToken']);
    return $profile;
}

function export_backup(): array
{
    return [
        'users' => fetch_all('SELECT * FROM users ORDER BY id'),
        'products' => fetch_all('SELECT * FROM products ORDER BY id'),
        'orders' => fetch_all('SELECT * FROM orders ORDER BY id'),
        'reviews' => fetch_all('SELECT * FROM reviews ORDER BY id'),
        'addresses' => fetch_all('SELECT * FROM addresses ORDER BY id'),
        'paymentMethods' => fetch_all('SELECT * FROM paymentMethods ORDER BY id'),
        'cartItems' => fetch_all('SELECT * FROM cartItems ORDER BY userId'),
    ];
}

function restore_backup(array $backup): void
{
    $tables = ['cartItems', 'paymentMethods', 'addresses', 'reviews', 'orders', 'products', 'users'];
    $db = pdo();
    $db->beginTransaction();
    try {
        foreach ($tables as $table) $db->exec("DELETE FROM $table");
        foreach (array_reverse($tables) as $table) {
            $rows = $backup[$table] ?? [];
            if (!is_array($rows)) continue;
            $allowedColumns = array_flip(table_columns($table));
            foreach ($rows as $row) {
                if (!is_array($row) || !$row) continue;
                $row = array_intersect_key($row, $allowedColumns);
                if (!$row) continue;
                $cols = array_keys($row);
                $placeholders = implode(',', array_fill(0, count($cols), '?'));
                $sql = 'INSERT INTO ' . $table . ' (`' . implode('`,`', $cols) . '`) VALUES (' . $placeholders . ')';
                $db->prepare($sql)->execute(array_values($row));
            }
        }
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }
}

function table_columns(string $table): array
{
    static $cache = [];
    if (isset($cache[$table])) return $cache[$table];
    $rows = fetch_all('DESCRIBE `' . $table . '`');
    $cache[$table] = array_map(fn($row) => $row['Field'], $rows);
    return $cache[$table];
}

function is_local_request(): bool
{
    $addr = $_SERVER['REMOTE_ADDR'] ?? '';
    return in_array($addr, ['127.0.0.1', '::1'], true);
}

function handle_install_check(): void
{
    $cfg = app_config();
    $token = (string)($cfg['security']['install_token'] ?? '');
    $providedToken = (string)($_GET['token'] ?? '');
    if (!$token && !is_local_request()) {
        json_error('Configura security.install_token in api/config.local.php per usare questo controllo.', 403);
    }
    if ($token && !hash_equals($token, $providedToken)) {
        json_error('Token controllo installazione non valido', 403);
    }

    $dbCfg = $cfg['db'];
    $dbConfigured = (bool)($dbCfg['host'] && $dbCfg['name'] && $dbCfg['user']);
    $dbOk = false;
    $dbError = null;
    $tables = [];
    if ($dbConfigured) {
        try {
            $dsn = 'mysql:host=' . $dbCfg['host'] . ';dbname=' . $dbCfg['name'] . ';charset=utf8mb4';
            $checkPdo = new PDO($dsn, $dbCfg['user'], $dbCfg['pass'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
            initialize_database($checkPdo);
            $dbOk = true;
            foreach (['users', 'products', 'orders', 'addresses', 'paymentMethods', 'reviews', 'cartItems'] as $table) {
                $tables[$table] = (int)$checkPdo->query('SELECT COUNT(*) FROM `' . $table . '`')->fetchColumn();
            }
        } catch (Throwable $e) {
            $dbError = $e->getMessage();
        }
    }

    json_response([
        'success' => $dbOk,
        'mode' => 'infinityfree-php',
        'phpVersion' => PHP_VERSION,
        'extensions' => [
            'pdo_mysql' => extension_loaded('pdo_mysql'),
            'curl' => extension_loaded('curl'),
            'openssl' => extension_loaded('openssl'),
            'mbstring' => extension_loaded('mbstring'),
            'fileinfo' => extension_loaded('fileinfo'),
        ],
        'database' => [
            'configured' => $dbConfigured,
            'connected' => $dbOk,
            'error' => $dbOk ? null : $dbError,
            'tables' => $tables,
        ],
        'stripeConfigured' => (bool)($cfg['stripe']['public_key'] && $cfg['stripe']['secret_key']),
        'emailConfigured' => (bool)($cfg['email']['user'] && $cfg['email']['pass']),
        'publicUrl' => site_base_url(),
    ], $dbOk ? 200 : 500);
}

try {
    $method = request_method();
    $path = normalized_path();
    $body = in_array($method, ['POST', 'PUT', 'DELETE'], true) ? body_json() : [];

    if ($path === '/health') json_response(['status' => 'healthy', 'mode' => 'infinityfree-php']);
    if (($path === '/api/install-check' || $path === '/install-check') && $method === 'GET') handle_install_check();
    if ($path === '/config') {
        $cfg = app_config();
        json_response([
            'stripePublicKey' => $cfg['stripe']['public_key'],
            'emailConfigured' => (bool)($cfg['email']['user'] && $cfg['email']['pass']),
            'emailReady' => (bool)($cfg['email']['user'] && $cfg['email']['pass']),
            'emailLastError' => null,
            'emailLastCheckedAt' => now_sql(),
            'emailTransport' => ['provider' => 'smtp', 'service' => 'gmail', 'active' => $cfg['email']['host'] . ':' . $cfg['email']['port'], 'host' => $cfg['email']['host'], 'port' => $cfg['email']['port']],
            'addressAutofill' => ['enabled' => true, 'providers' => ['zippopotam.us'], 'cacheTtlMs' => 21600000],
            'paymentMethods' => ['types' => ['card']],
        ]);
    }
    if ($path === '/register' && $method === 'POST') handle_register();
    if ($path === '/login' && $method === 'POST') handle_login();
    if ($path === '/api/auth/forgot-password' && $method === 'POST') handle_forgot_password();
    if ($path === '/api/auth/reset-password' && $method === 'POST') handle_reset_password();
    if ($path === '/api/auth/logout' && $method === 'POST') {
        $u = current_user(true);
        pdo()->prepare('UPDATE users SET sessionToken = NULL, refreshToken = NULL WHERE id = ?')->execute([(int)$u['id']]);
        json_response(['success' => true, 'message' => 'Logout completato']);
    }
    if ($path === '/api/auth/refresh' && $method === 'POST') {
        $refresh = trim((string)($body['refreshToken'] ?? ''));
        $user = fetch_one('SELECT * FROM users WHERE refreshToken = ?', [$refresh]);
        if (!$user) json_error('Refresh token non valido', 401);
        json_response(issue_session_tokens((int)$user['id']));
    }

    if ($path === '/api/profile' && $method === 'GET') json_response(profile_payload((int)current_user(true)['id']));
    if ($path === '/api/profile' && $method === 'PUT') {
        $u = current_user(true);
        pdo()->prepare('UPDATE users SET name = ?, updatedAt = ? WHERE id = ?')->execute([trim((string)($body['name'] ?? $u['name'])), now_sql(), (int)$u['id']]);
        json_response(['success' => true, 'message' => 'Profilo aggiornato', 'user' => profile_payload((int)$u['id'])]);
    }
    if ($path === '/api/profile/password' && $method === 'POST') {
        $u = current_user(true);
        $current = trim((string)($body['currentPassword'] ?? ''));
        $new = trim((string)($body['newPassword'] ?? ''));
        $confirm = trim((string)($body['confirmPassword'] ?? ''));
        if (!$current || !$new || !$confirm) json_error('Compila tutti i campi password');
        if ($new !== $confirm) json_error('Le nuove password non coincidono');
        if (!verify_user_password($current, (string)$u['passwordHash'])) json_error('Password attuale non valida', 401);
        pdo()->prepare('UPDATE users SET passwordHash = ?, passwordUpdatedAt = ?, updatedAt = ? WHERE id = ?')->execute([hash_password($new), now_sql(), now_sql(), (int)$u['id']]);
        $tokens = issue_session_tokens((int)$u['id']);
        json_response(['success' => true, 'message' => 'Password aggiornata con successo', 'sessionToken' => $tokens['sessionToken'], 'refreshToken' => $tokens['refreshToken'], 'user' => profile_payload((int)$u['id'])]);
    }
    if ($path === '/api/orders' && $method === 'GET') {
        $u = current_user(true);
        $orders = array_map('order_row', fetch_all('SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC, id DESC', [(int)$u['id']]));
        json_response(['success' => true, 'orders' => $orders]);
    }
    if ($path === '/api/profile/addresses' && $method === 'POST') {
        $u = current_user(true);
        $street = trim((string)($body['street'] ?? $body['line1'] ?? ''));
        $streetNumber = trim((string)($body['streetNumber'] ?? ''));
        $city = trim((string)($body['city'] ?? ''));
        $postal = trim((string)($body['postalCode'] ?? ''));
        $country = trim((string)($body['country'] ?? ''));
        $phone = trim((string)($body['phone'] ?? ''));
        $isDefault = !empty($body['isDefault']);
        if (!$street || !$streetNumber || !$city || !$postal || !$country) json_error("Compila tutti i campi dell'indirizzo");
        if ($isDefault) pdo()->prepare('UPDATE addresses SET isDefault = 0 WHERE userId = ?')->execute([(int)$u['id']]);
        $stmt = pdo()->prepare('INSERT INTO addresses (userId, street, streetNumber, city, postalCode, country, phone, isDefault) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([(int)$u['id'], $street, $streetNumber, $city, $postal, $country, $phone, $isDefault ? 1 : 0]);
        json_response(['success' => true, 'message' => 'Indirizzo aggiunto', 'address' => normalize_address(fetch_one('SELECT * FROM addresses WHERE id = ?', [(int)pdo()->lastInsertId()]))]);
    }
    if (preg_match('#^/api/profile/addresses/(\d+)$#', $path, $m) && $method === 'DELETE') {
        $u = current_user(true);
        pdo()->prepare('DELETE FROM addresses WHERE id = ? AND userId = ?')->execute([(int)$m[1], (int)$u['id']]);
        json_response(['success' => true, 'message' => 'Indirizzo eliminato']);
    }

    if ($path === '/api/products' && $method === 'GET') json_response(all_products());
    if (preg_match('#^/api/products/(\d+)$#', $path, $m) && $method === 'GET') {
        $product = product_by_id((int)$m[1]);
        if (!$product) json_error('Prodotto non trovato', 404);
        json_response($product);
    }
    if (preg_match('#^/api/products/(\d+)/reviews$#', $path, $m) && $method === 'GET') {
        $product = product_by_id((int)$m[1]);
        if (!$product) json_error('Prodotto non trovato', 404);
        $reviews = fetch_all('SELECT r.*, u.name AS authorName FROM reviews r JOIN users u ON u.id = r.userId WHERE r.productId = ? ORDER BY r.updatedAt DESC, r.id DESC', [(int)$m[1]]);
        json_response(['success' => true, 'product' => $product, 'reviews' => $reviews]);
    }
    if (preg_match('#^/api/products/(\d+)/reviews$#', $path, $m) && $method === 'POST') {
        $u = current_user(true);
        $rating = max(1, min(5, (int)($body['rating'] ?? 0)));
        $comment = trim((string)($body['comment'] ?? ''));
        if (!$comment) json_error('Scrivi una recensione');
        pdo()->prepare('INSERT INTO reviews (productId, userId, rating, comment, updatedAt) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment), updatedAt = VALUES(updatedAt)')
            ->execute([(int)$m[1], (int)$u['id'], $rating, $comment, now_sql()]);
        $stats = fetch_one('SELECT AVG(rating) AS rating, COUNT(*) AS count FROM reviews WHERE productId = ?', [(int)$m[1]]);
        pdo()->prepare('UPDATE products SET rating = ?, reviewCount = ?, updatedAt = ? WHERE id = ?')->execute([round((float)$stats['rating'], 2), (int)$stats['count'], now_sql(), (int)$m[1]]);
        json_response(['success' => true, 'message' => 'Recensione salvata']);
    }
    if ($path === '/api/cart' && $method === 'GET') {
        $u = current_user(true);
        $row = fetch_one('SELECT items FROM cartItems WHERE userId = ?', [(int)$u['id']]);
        json_response($row ? (json_decode($row['items'], true) ?: []) : []);
    }
    if ($path === '/api/cart' && $method === 'POST') {
        $u = current_user(true);
        $items = $body['items'] ?? $body;
        pdo()->prepare('REPLACE INTO cartItems (userId, items) VALUES (?, ?)')->execute([(int)$u['id'], json_encode($items)]);
        json_response(['success' => true, 'items' => $items]);
    }
    if ($path === '/api/cart' && $method === 'DELETE') {
        $u = current_user(true);
        pdo()->prepare('DELETE FROM cartItems WHERE userId = ?')->execute([(int)$u['id']]);
        json_response(['success' => true, 'message' => 'Carrello svuotato']);
    }

    if ($path === '/create-payment-intent' && $method === 'POST') {
        $u = current_user(true);
        $snapshot = isset($body['items']) && is_array($body['items']) ? checkout_snapshot($body['items']) : null;
        $amount = $snapshot ? $snapshot['total'] : (float)($body['amount'] ?? 0);
        if ($amount <= 0) json_error('Amount non valido');
        $customerId = get_or_create_stripe_customer($u);
        $intent = stripe_request('POST', '/payment_intents', [
            'amount' => (string)round($amount * 100),
            'currency' => 'eur',
            'description' => 'Ordine ShopNow',
            'payment_method_types' => ['card'],
            'customer' => $customerId,
            'setup_future_usage' => 'off_session',
            'receipt_email' => $u['email'],
            'metadata' => ['customer_email' => $u['email'], 'customer_name' => $u['name'], 'shopnow_user_id' => (string)$u['id']],
        ]);
        json_response(['clientSecret' => $intent['client_secret'], 'paymentIntentId' => $intent['id'], 'amount' => $amount, 'paymentMethodTypes' => $intent['payment_method_types'] ?? ['card']]);
    }
    if ($path === '/api/checkout' && $method === 'POST') {
        $u = current_user(true);
        $paymentIntentId = trim((string)($body['paymentIntentId'] ?? ''));
        $snapshot = checkout_snapshot($body['items'] ?? []);
        if (!$paymentIntentId || empty($body['shippingAddress']) || empty($body['customerName']) || empty($body['customerEmail'])) json_error('Dati checkout incompleti');
        if (abs($snapshot['total'] - (float)($body['total'] ?? 0)) > 0.01) json_error('Totale ordine non coerente con i prezzi correnti');
        $intent = stripe_request('GET', '/payment_intents/' . rawurlencode($paymentIntentId), ['expand' => ['payment_method']]);
        if (($intent['status'] ?? '') !== 'succeeded') json_error('Pagamento non confermato da Stripe');
        if ((int)$intent['amount'] !== (int)round($snapshot['total'] * 100)) json_error("Importo pagamento non coerente con l'ordine");
        $existing = fetch_one('SELECT * FROM orders WHERE stripePaymentIntentId = ?', [$intent['id']]);
        if ($existing) {
            $order = order_row($existing);
            $email = send_order_email($order, $u);
            json_response(['success' => true, 'order' => $order, 'alreadyProcessed' => true, 'emailSent' => $email['emailSent'], 'emailMessage' => $email['message'], 'paymentIntentId' => $intent['id'], 'updatedProducts' => all_products()]);
        }
        $order = create_order_transaction((int)$u['id'], $snapshot, (array)$body['shippingAddress'], (string)$intent['id']);
        $email = send_order_email($order, $u);
        $save = ['saved' => false, 'reason' => 'not_requested'];
        if (!empty($body['savePaymentMethod'])) $save = save_payment_method_from_payment_intent($u, (string)$intent['id'], !empty($body['savePaymentMethodAsDefault']));
        json_response(['success' => true, 'order' => $order, 'emailSent' => $email['emailSent'], 'emailMessage' => $email['message'], 'paymentMethodSaved' => (bool)$save['saved'], 'paymentMethodSaveMessage' => $save['reason'], 'paymentIntentId' => $intent['id'], 'updatedProducts' => all_products()]);
    }
    if ($path === '/api/profile/setup-intent' && $method === 'POST') {
        $u = current_user(true);
        $intent = stripe_request('POST', '/setup_intents', ['customer' => get_or_create_stripe_customer($u), 'usage' => 'off_session', 'payment_method_types' => ['card'], 'metadata' => ['shopnowUserId' => (string)$u['id']]]);
        json_response(['success' => true, 'clientSecret' => $intent['client_secret'], 'setupIntentId' => $intent['id']]);
    }
    if ($path === '/api/profile/payment-methods/attach' && $method === 'POST') {
        $u = current_user(true);
        $setupId = trim((string)($body['setupIntentId'] ?? ''));
        if (!$setupId) json_error('SetupIntent mancante');
        $setup = stripe_request('GET', '/setup_intents/' . rawurlencode($setupId), ['expand' => ['payment_method']]);
        if (($setup['status'] ?? '') !== 'succeeded') json_error('Carta non confermata da Stripe');
        $pm = is_array($setup['payment_method'] ?? null) ? $setup['payment_method'] : stripe_request('GET', '/payment_methods/' . rawurlencode((string)$setup['payment_method']));
        $card = $pm['card'] ?? [];
        if (empty($card['last4'])) json_error('Metodo di pagamento Stripe non valido');
        $existing = fetch_one('SELECT * FROM paymentMethods WHERE userId = ? AND stripePaymentMethodId = ?', [(int)$u['id'], $pm['id']]);
        $methodRow = $existing ?: add_payment_method((int)$u['id'], ['alias' => trim((string)($body['alias'] ?? '')) ?: normalize_payment_brand($card['brand'] ?? 'Carta') . ' terminante in ' . $card['last4'], 'brand' => normalize_payment_brand($card['brand'] ?? 'Carta'), 'last4' => $card['last4'], 'expiry' => stripe_card_expiry($card), 'stripePaymentMethodId' => $pm['id'], 'stripeCustomerId' => get_or_create_stripe_customer($u)], !empty($body['isDefault']));
        if (!empty($body['isDefault']) && $existing) $methodRow = set_default_payment_method((int)$u['id'], (int)$existing['id']);
        json_response(['success' => true, 'message' => 'Metodo di pagamento aggiunto', 'paymentMethod' => normalize_payment_method($methodRow)]);
    }
    if ($path === '/api/profile/payment-methods' && $method === 'POST') {
        $u = current_user(true);
        $alias = trim((string)($body['alias'] ?? ''));
        $brand = normalize_payment_brand((string)($body['brand'] ?? 'Carta'));
        $last4 = substr(preg_replace('/\D+/', '', (string)($body['last4'] ?? '')), -4);
        $expiry = normalize_payment_expiry((string)($body['expiry'] ?? ''));
        if (!$alias || !$brand || strlen($last4) !== 4 || !$expiry) {
            json_error('Compila tutti i campi del metodo di pagamento');
        }
        $pm = add_payment_method((int)$u['id'], [
            'alias' => $alias,
            'brand' => $brand,
            'last4' => $last4,
            'expiry' => $expiry,
        ], !empty($body['isDefault']));
        json_response(['success' => true, 'message' => 'Metodo di pagamento aggiunto', 'paymentMethod' => normalize_payment_method($pm)]);
    }
    if ($path === '/api/checkout/confirm-saved-payment' && $method === 'POST') {
        $u = current_user(true);
        $paymentIntentId = trim((string)($body['paymentIntentId'] ?? ''));
        $methodId = (int)($body['paymentMethodId'] ?? 0);
        $pm = fetch_one('SELECT * FROM paymentMethods WHERE id = ? AND userId = ?', [$methodId, (int)$u['id']]);
        if (!$pm || empty($pm['stripePaymentMethodId'])) json_error('Metodo di pagamento non trovato', 404);
        $confirmed = stripe_request('POST', '/payment_intents/' . rawurlencode($paymentIntentId) . '/confirm', ['payment_method' => $pm['stripePaymentMethodId'], 'receipt_email' => $u['email'], 'return_url' => site_base_url() . '/order-confirmation.html?checkout_return=1']);
        json_response(['success' => true, 'paymentIntentId' => $confirmed['id'], 'status' => $confirmed['status'], 'clientSecret' => $confirmed['client_secret'] ?? null]);
    }
    if (preg_match('#^/api/profile/payment-methods/(\d+)$#', $path, $m) && $method === 'DELETE') {
        $u = current_user(true);
        $pm = fetch_one('SELECT * FROM paymentMethods WHERE id = ? AND userId = ?', [(int)$m[1], (int)$u['id']]);
        if (!$pm) json_error('Metodo di pagamento non trovato', 404);
        if (!empty($pm['stripePaymentMethodId'])) {
            try { stripe_request('POST', '/payment_methods/' . rawurlencode($pm['stripePaymentMethodId']) . '/detach'); } catch (Throwable $e) {}
        }
        pdo()->prepare('DELETE FROM paymentMethods WHERE id = ? AND userId = ?')->execute([(int)$m[1], (int)$u['id']]);
        json_response(['success' => true, 'message' => 'Metodo di pagamento eliminato']);
    }
    if (preg_match('#^/api/profile/payment-methods/(\d+)/default$#', $path, $m) && $method === 'PUT') {
        $u = current_user(true);
        $pm = set_default_payment_method((int)$u['id'], (int)$m[1]);
        if (!$pm) json_error('Metodo di pagamento non trovato', 404);
        json_response(['success' => true, 'message' => 'Metodo di pagamento predefinito aggiornato', 'paymentMethod' => normalize_payment_method($pm)]);
    }

    if ($path === '/api/address-autofill' && $method === 'GET') {
        $country = strtoupper(trim((string)($_GET['country'] ?? 'IT')));
        $postal = trim((string)($_GET['postalCode'] ?? ''));
        $city = trim((string)($_GET['city'] ?? ''));
        $matches = [];
        if ($postal) {
            $url = 'https://api.zippopotam.us/' . rawurlencode(strtolower($country)) . '/' . rawurlencode($postal);
            $raw = @file_get_contents($url);
            $data = $raw ? json_decode($raw, true) : null;
            foreach (($data['places'] ?? []) as $place) {
                $matches[] = ['city' => $place['place name'] ?? '', 'postalCode' => $postal, 'country' => $country, 'region' => $place['state'] ?? '', 'regionCode' => $place['state abbreviation'] ?? '', 'label' => trim(($place['place name'] ?? '') . ' ' . $postal)];
            }
        }
        json_response(['success' => (bool)$matches, 'source' => 'zippopotam.us', 'matches' => $matches, 'cached' => false, 'providerAttempts' => ['zippopotam.us'], 'query' => ['country' => $country, 'postalCode' => $postal, 'city' => $city]]);
    }

    if ($path === '/api/auth/users' && $method === 'GET') {
        require_admin();
        json_response(['success' => true, 'users' => array_map(fn($u) => admin_user_payload((int)$u['id']), fetch_all('SELECT id FROM users ORDER BY createdAt DESC, id DESC'))]);
    }
    if ($path === '/api/admin/dashboard' && $method === 'GET') {
        require_admin();
        $users = fetch_all('SELECT id, email, name, role, createdAt, updatedAt, lastLoginAt, passwordUpdatedAt, sessionToken FROM users ORDER BY createdAt DESC, id DESC');
        $products = all_products();
        $orders = array_map('order_row', fetch_all('SELECT * FROM orders ORDER BY createdAt DESC, id DESC'));
        $revenue = array_reduce($orders, fn($s, $o) => $s + (float)$o['total'], 0.0);
        json_response(['users' => $users, 'products' => $products, 'orders' => $orders, 'stats' => ['totalUsers' => count($users), 'totalProducts' => count($products), 'totalOrders' => count($orders), 'totalRevenue' => round($revenue, 2)]]);
    }
    if (preg_match('#^/api/admin/users/(\d+)$#', $path, $m) && $method === 'GET') {
        require_admin();
        json_response(['success' => true, 'user' => admin_user_payload((int)$m[1])]);
    }
    if (preg_match('#^/api/admin/users/(\d+)$#', $path, $m) && $method === 'DELETE') {
        $admin = require_admin();
        if ((int)$admin['id'] === (int)$m[1]) json_error('Non puoi eliminare il tuo stesso account amministratore');
        pdo()->prepare('DELETE FROM users WHERE id = ? AND role <> "admin"')->execute([(int)$m[1]]);
        json_response(['success' => true, 'message' => 'Utente eliminato']);
    }
    if ($path === '/api/admin/users' && $method === 'POST') {
        require_admin();
        $email = normalize_email((string)($body['email'] ?? ''));
        $name = trim((string)($body['name'] ?? ''));
        $password = trim((string)($body['password'] ?? random_token(6)));
        $role = ($body['role'] ?? 'user') === 'admin' ? 'admin' : 'user';
        if (!$email || !$name) json_error('Nome ed email obbligatori');
        pdo()->prepare('INSERT INTO users (email, name, passwordHash, role) VALUES (?, ?, ?, ?)')->execute([$email, $name, hash_password($password), $role]);
        json_response(['success' => true, 'message' => 'Utente creato']);
    }
    if ($path === '/api/admin/users/mass-delete' && $method === 'POST') {
        require_admin();
        $domain = strtolower(trim((string)($body['domain'] ?? '')));
        if (!$domain) json_error('Dominio richiesto');
        pdo()->prepare('DELETE FROM users WHERE role <> "admin" AND email LIKE ?')->execute(['%@' . $domain]);
        json_response(['success' => true, 'message' => 'Utenti eliminati']);
    }
    if (preg_match('#^/api/admin/users/(\d+)/password$#', $path, $m) && $method === 'POST') {
        require_admin();
        $password = trim((string)($body['password'] ?? ''));
        if (!$password) json_error('Password richiesta');
        pdo()->prepare('UPDATE users SET passwordHash = ?, passwordUpdatedAt = ?, updatedAt = ? WHERE id = ?')->execute([hash_password($password), now_sql(), now_sql(), (int)$m[1]]);
        json_response(['success' => true, 'message' => 'Password aggiornata']);
    }
    if (preg_match('#^/api/admin/orders/(\d+)$#', $path, $m) && $method === 'GET') {
        require_admin();
        $order = fetch_one('SELECT * FROM orders WHERE id = ?', [(int)$m[1]]);
        if (!$order) json_error('Ordine non trovato', 404);
        $payload = order_row($order);
        $user = get_user_by_id((int)$payload['userId']);
        $payload['userName'] = $user['name'] ?? 'Cliente';
        $payload['userEmail'] = $user['email'] ?? '';
        $payload['customerName'] = $payload['userName'];
        $payload['customerEmail'] = $payload['userEmail'];
        $payload['paymentDetails'] = ['available' => false, 'typeLabel' => 'Carta', 'message' => 'Dettagli Stripe disponibili nel dashboard Stripe'];
        json_response(['success' => true, 'order' => $payload]);
    }
    if ($path === '/api/admin/backup' && $method === 'GET') {
        require_admin();
        header('Content-Disposition: attachment; filename=shopnow_backup_' . date('Ymd_His') . '.json');
        json_response(export_backup());
    }
    if ($path === '/api/admin/restore' && $method === 'POST') {
        require_admin();
        restore_backup($body);
        json_response(['success' => true, 'message' => 'Database ripristinato con successo']);
    }
    if ($path === '/api/admin/stripe-summary' && $method === 'GET') {
        require_admin();
        $orders = array_map('order_row', fetch_all('SELECT * FROM orders'));
        $revenue = array_reduce($orders, fn($s, $o) => $s + (float)$o['total'], 0.0);
        json_response(['success' => true, 'ordersCount' => count($orders), 'revenue' => round($revenue, 2)]);
    }
    if ($path === '/api/admin/sync-stripe-history' && $method === 'POST') {
        require_admin();
        json_response(['success' => true, 'imported' => 0, 'skipped' => 0, 'message' => 'Sync Stripe non necessario in modalità InfinityFree']);
    }

    if ($path === '/admin/products' && $method === 'GET') {
        require_admin();
        json_response(all_products());
    }
    if ($path === '/admin/products' && $method === 'POST') {
        require_admin();
        $stmt = pdo()->prepare('INSERT INTO products (name, price, category, description, image, stock) VALUES (?, ?, ?, ?, ?, ?)');
        $stmt->execute([trim((string)$body['name']), (float)$body['price'], trim((string)($body['category'] ?? '')), trim((string)($body['description'] ?? '')), trim((string)($body['image'] ?? '')), (int)($body['stock'] ?? 0)]);
        json_response(['success' => true, 'message' => 'Prodotto aggiunto', 'product' => product_by_id((int)pdo()->lastInsertId())]);
    }
    if (preg_match('#^/admin/products/(\d+)$#', $path, $m) && $method === 'PUT') {
        require_admin();
        $allowed = ['name', 'description', 'price', 'category', 'image', 'stock'];
        $sets = [];
        $params = [];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $body)) {
                $sets[] = "$field = ?";
                $params[] = in_array($field, ['price'], true) ? (float)$body[$field] : (in_array($field, ['stock'], true) ? (int)$body[$field] : (string)$body[$field]);
            }
        }
        if ($sets) {
            $sets[] = 'updatedAt = ?';
            $params[] = now_sql();
            $params[] = (int)$m[1];
            pdo()->prepare('UPDATE products SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
        }
        json_response(['success' => true, 'message' => 'Prodotto aggiornato', 'product' => product_by_id((int)$m[1])]);
    }
    if (preg_match('#^/api/admin/products/(\d+)/stock$#', $path, $m) && $method === 'PUT') {
        require_admin();
        pdo()->prepare('UPDATE products SET stock = ?, updatedAt = ? WHERE id = ?')->execute([(int)$body['stock'], now_sql(), (int)$m[1]]);
        json_response(['success' => true, 'message' => 'Stock prodotto aggiornato', 'product' => product_by_id((int)$m[1])]);
    }
    if (preg_match('#^/admin/products/(\d+)/image$#', $path, $m) && $method === 'POST') {
        require_admin();
        $fileName = basename((string)($body['fileName'] ?? 'image.jpg'));
        $data = (string)($body['fileDataBase64'] ?? '');
        if (!$fileName || !$data) json_error('Immagine non valida');
        $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        if (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif'], true)) json_error('Formato immagine non supportato');
        $product = product_by_id((int)$m[1]);
        if (!$product) json_error('Prodotto non trovato', 404);
        $safe = preg_replace('/[^a-zA-Z0-9_-]+/', '_', $product['name']) . '_' . time() . '.' . $ext;
        $dir = dirname(__DIR__) . '/uploads';
        if (!is_dir($dir)) mkdir($dir, 0755, true);
        file_put_contents($dir . '/' . $safe, base64_decode($data));
        pdo()->prepare('UPDATE products SET image = ?, updatedAt = ? WHERE id = ?')->execute(['uploads/' . $safe, now_sql(), (int)$m[1]]);
        json_response(['success' => true, 'product' => product_by_id((int)$m[1])]);
    }
    if (preg_match('#^/admin/products/(\d+)/image$#', $path, $m) && $method === 'DELETE') {
        require_admin();
        pdo()->prepare('UPDATE products SET image = "", updatedAt = ? WHERE id = ?')->execute([now_sql(), (int)$m[1]]);
        json_response(['success' => true, 'product' => product_by_id((int)$m[1])]);
    }
    if (preg_match('#^/admin/products/(\d+)$#', $path, $m) && $method === 'DELETE') {
        require_admin();
        pdo()->prepare('DELETE FROM products WHERE id = ?')->execute([(int)$m[1]]);
        json_response(['success' => true, 'message' => 'Prodotto eliminato']);
    }

    json_error('Endpoint non trovato: ' . $path, 404);
} catch (Throwable $e) {
    json_error('Errore interno del server: ' . $e->getMessage(), 500);
}

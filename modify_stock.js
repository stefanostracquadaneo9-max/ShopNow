const Database = require('better-sqlite3');
const db = Database('app.db');

// Modifica lo stock del prodotto di test
const updateStmt = db.prepare('UPDATE products SET stock = 50 WHERE id = 999');
updateStmt.run();

const product = db.prepare('SELECT stock FROM products WHERE id = 999').get();
console.log('Stock modificato a:', product.stock);
db.close();
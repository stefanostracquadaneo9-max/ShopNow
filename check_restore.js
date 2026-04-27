const Database = require('better-sqlite3');
const db = Database('app.db');

const product = db.prepare('SELECT stock FROM products WHERE id = 999').get();
console.log('Stock dopo ripristino:', product.stock);
db.close();
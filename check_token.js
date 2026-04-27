const Database = require('better-sqlite3');
const db = Database('app.db');

const user = db.prepare('SELECT resetToken, resetTokenExpiry FROM users WHERE email = ?').get('admin@gmail.com');
console.log('Token di reset per admin:', user.resetToken ? 'Presente' : 'Non presente');
if (user.resetTokenExpiry) {
  console.log('Scadenza:', new Date(user.resetTokenExpiry));
}
db.close();
const { deleteUser, getUserByEmail, db } = require('./db');

/**
 * Utility script per eliminare utenti direttamente dal database
 * Utilizzo:
 *   node cleanup_users.js email1@example.com email2@example.com
 *   node cleanup_users.js --domain @example.com
 */
const args = process.argv.slice(2);

if (args.length === 0) {
    console.log("Utilizzo:");
    console.log("  node cleanup_users.js email1@test.com email2@test.com");
    console.log("  node cleanup_users.js --domain @example.com");
    process.exit(0);
}

if (args[0] === '--domain' && args[1]) {
    const domain = args[1].startsWith('@') ? args[1] : `@${args[1]}`;
    console.log(`Ricerca utenti con dominio ${domain}...`);
    
    const usersToDelete = db.prepare("SELECT id, email FROM users WHERE email LIKE ?").all(`%${domain}`);

    if (usersToDelete.length === 0) {
        console.log(`⚠️ Nessun utente trovato con dominio ${domain}.`);
    } else {
        usersToDelete.forEach(user => {
            deleteUser(user.id);
            console.log(`✅ Utente ${user.email} (ID: ${user.id}) eliminato.`);
        });
        console.log(`\nOperazione completata. Eliminati ${usersToDelete.length} utenti.`);
    }
} else {
    args.forEach(email => {
        const user = getUserByEmail(email);
        if (user) {
            deleteUser(user.id);
            console.log(`✅ Utente ${email} (ID: ${user.id}) eliminato con successo.`);
        } else {
            console.log(`⚠️ Utente ${email} non trovato nel database.`);
        }
    });
    console.log("Operazione completata.");
}
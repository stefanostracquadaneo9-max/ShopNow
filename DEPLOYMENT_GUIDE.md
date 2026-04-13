# Guida al Deployment di ShopNow

## Obiettivo

Per usare Stripe in modo reale:
- pubblica il backend Node/Express su Railway o Render
- pubblica il frontend su GitHub Pages oppure servilo dallo stesso backend
- collega il frontend al backend tramite `config.js`

## Backend

1. Crea un progetto su Railway o Render.
2. Collega la repository GitHub `ShopNow`.
3. Imposta queste variabili:

```ini
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
STRIPE_PUBLIC_KEY=pk_test_your_public_key_here
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password-here
NODE_ENV=production
PORT=3000
SHOP_URL=https://your-frontend-url.example
```

4. Avvia il deploy.

## Frontend

Se il frontend e su GitHub Pages, aggiorna `config.js`:

```js
window.SHOPNOW_API_BASE_URL = "https://your-backend.example";
```

Se backend e frontend stanno sullo stesso dominio, puoi comunque impostare `config.js` allo stesso origin pubblico.

## Verifica

Controlla questi punti:
- `GET /config` risponde con una `stripePublicKey` valida
- login e prodotti si caricano dal backend
- nel carrello Stripe monta correttamente il form
- il checkout crea l'ordine dopo il pagamento

## Sicurezza

- non salvare mai chiavi reali o password nel repository
- usa sempre `.env` o variabili del provider
- ruota subito eventuali chiavi gia esposte in precedenza

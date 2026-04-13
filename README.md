# ShopNow - E-commerce Platform

ShopNow e un e-commerce con autenticazione, catalogo prodotti, carrello, pannello admin e checkout Stripe.

## Architettura corretta per Stripe

Stripe reale non puo funzionare solo con GitHub Pages, perche la `STRIPE_SECRET_KEY` deve restare su un backend sicuro.

Configurazione consigliata:
- frontend statico su GitHub Pages
- backend Node/Express su Railway o Render
- `config.js` nel frontend con l'URL pubblico del backend

## Setup rapido

1. Pubblica il backend `server.js` su Railway o Render.
2. Imposta le variabili presenti in `.env.example`.
3. Aggiorna `config.js` con l'URL pubblico del backend:

```js
window.SHOPNOW_API_BASE_URL = "https://your-backend.example";
```

4. Pubblica il frontend su GitHub Pages oppure servi il frontend dallo stesso backend.

## Variabili d'ambiente backend

Usa questi valori come template:

```ini
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
STRIPE_PUBLIC_KEY=pk_test_your_public_key_here
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password-here
PORT=3000
NODE_ENV=production
SHOP_URL=https://your-frontend-url.example
```

## Note sul frontend

- `config.js` viene caricato dalle pagine principali.
- Se `SHOPNOW_API_BASE_URL` e vuoto, il checkout Stripe resta disattivato sulle versioni statiche.
- Se `SHOPNOW_API_BASE_URL` punta a un backend valido, login, recensioni, admin e checkout usano quel server.

## Tech stack

- Frontend: HTML5, Bootstrap 5, JavaScript
- Backend: Node.js, Express
- Database: SQLite
- Payments: Stripe
- Email: Nodemailer

## Licenza

Proprietaria - ShopNow 2026

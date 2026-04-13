# Deployment Complete

## Stato

La repository e pronta per essere collegata a un backend pubblico sicuro.

## Variabili richieste

```ini
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
STRIPE_PUBLIC_KEY=pk_test_your_public_key_here
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password-here
NODE_ENV=production
PORT=3000
SHOP_URL=https://your-frontend-url.example
```

## Frontend statico

Se il frontend e pubblicato su GitHub Pages, imposta in `config.js`:

```js
window.SHOPNOW_API_BASE_URL = "https://your-backend.example";
```

## Dopo il deploy

- verifica che `/config` esponga la chiave pubblica Stripe
- prova un checkout test con le test card di Stripe
- verifica ordine, stock e email

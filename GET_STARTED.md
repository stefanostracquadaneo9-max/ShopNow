# Get Started

## 1. Backend

Pubblica `server.js` su Railway o Render e configura:

```ini
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
STRIPE_PUBLIC_KEY=pk_test_your_public_key_here
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password-here
NODE_ENV=production
PORT=3000
SHOP_URL=https://your-frontend-url.example
```

## 2. Frontend

Aggiorna `config.js`:

```js
window.SHOPNOW_API_BASE_URL = "https://your-backend.example";
```

## 3. Repository GitHub

Pubblica o aggiorna la repository `ShopNow`, poi collega il backend al provider scelto.

## 4. Verifica Stripe

- apri `cart.html`
- controlla che il form Stripe si monti
- esegui un pagamento test
- verifica ordine, stock e email

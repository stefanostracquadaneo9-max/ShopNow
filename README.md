# 🛒 ShopNow - E-commerce Platform

Una piattaforma e-commerce completa con autenticazione, carrello, checkout Stripe e pannello admin.

## 🚀 Deploy su Railway

### Prerequisiti
- Account GitHub
- Account Railway (https://railway.app)

### Passo 1: Prepara il repository locale

```bash
cd c:\Users\stefa\Desktop\sito
git init
git add .
git commit -m "Initial commit: ShopNow e-commerce platform"
```

### Passo 2: Crea repository su GitHub

1. Vai su https://github.com/new
2. Nome repo: `shopnow`
3. Click "Create repository"
4. Copia il comando di push (non "Initialize with README")

### Passo 3: Fai push su GitHub

```bash
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/shopnow.git
git push -u origin main
```

### Passo 4: Deploy su Railway

1. Vai su https://railway.app
2. Login/Signup con GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Seleziona il repo `shopnow`
5. Railway auto-detecta che è Node.js
6. Add variables (in Railway Dashboard → Variables):
   - `STRIPE_SECRET_KEY` (dal tuo Stripe)
   - `STRIPE_PUBLIC_KEY` (dal tuo Stripe)
   - `EMAIL_USER` (tua email Gmail)
   - `EMAIL_PASSWORD` (app password Gmail)
   - `NODE_ENV` = `production`
   - `PORT` = `3000`
7. Deploy automaticamente parte!

### Passo 5: Ottieni il Domain

Railway genera automaticamente un domain tipo: `shopnow-production.up.railway.app`

Lo trovi in Railway Dashboard → Project → Domains

## 📋 Variabili d'Ambiente Richieste

Vedi `.env.example` per il template completo.

## 🛠️ Tech Stack

- **Frontend**: HTML5, Bootstrap 5, JavaScript
- **Backend**: Node.js, Express.js
- **Database**: SQLite
- **Payment**: Stripe
- **Email**: Nodemailer (Gmail)

## 📝 Licenza

Proprietaria - ShopNow 2026

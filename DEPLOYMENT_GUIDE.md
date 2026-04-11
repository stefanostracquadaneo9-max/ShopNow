# Guida al Deployment di ShopNow su Railway

## 📋 Cosa è già stato preparato

✅ File di configurazione per Railway  
✅ Environment variables template  
✅ Procfile per deployment  
✅ railway.json configuration  
✅ DEPLOY.bat script automatico  

---

## 🚀 **Metodo FACILE: Usa lo script DEPLOY.bat**

### Passo Unico:
1. Fai doppio click su **`DEPLOY.bat`**
2. Rispondi alla domanda quando richiesto
3. Lo script fa tutto il resto!

---

## 🔧 **Metodo Manuale (se lo script non funziona)**

Apri **Terminale/CMD** nella cartella del progetto e esegui:

```bash
cd c:\Users\stefa\Desktop\sito

# 1. Inizializza Git
git init
git add .
git commit -m "ShopNow: Initial deployment setup"

# 2. Aggiungi il remote GitHub (sostituisci con il tuo URL)
git remote add origin https://github.com/YOUR_USERNAME/shopnow.git

# 3. Fai il push
git branch -M main
git push -u origin main
```

---

## 📱 **Dopo il Push: Deploy su Railway**

1. **Apri** https://railway.app
2. **Login** con GitHub
3. **Click** "New Project" → "Deploy from GitHub repo"
4. **Seleziona** il repo `shopnow`
5. **Railway parte automaticamente!** ⚡

---

## 🔐 **Aggiungi Variabili d'Ambiente su Railway**

Nel Railway Dashboard, vai a **Project Settings → Variables** e aggiungi:

```
STRIPE_SECRET_KEY=sk_test_51TGkIERvM5OkkW7hF4AjFpXp8fXarIfPpO9aPN4B9AuJ1hRZXRCoEOKoOpY3Zs4KSsl2K7a88ulao80G27lpUtR100EezxAXae
STRIPE_PUBLIC_KEY=pk_test_51TGkIERvM5OkkW7h1NvqiFG8AqpnLGpt0mN33khefwGpqVYvOH9KZzAPt997HnvxgQ4WFRH0YmqOHvBLcp444Syw00olM66h78
EMAIL_USER=stefanostracquadaneo9@gmail.com
EMAIL_PASSWORD=ovqvuktgrevsbwur
NODE_ENV=production
```

---

## ✅ **Verifica il Deploy**

Una volta completato, troverai il domain nel Railway Dashboard:
- Sezione: **Project → Domains**
- Esempio: `shopnow-production.up.railway.app`

---

## 🚨 **Possibili Errori e Soluzioni**

### Git: "fatal: not a git repository"
```bash
Soluzione: npm install -g git (installare Git)
```

### GitHub: "permission denied (publickey)"
```bash
Soluzione: Usa HTTPS instead di SSH, oppure configura SSH keys
```

### Railway: Database error
```bash
Soluzione: Railway usa file system temporaneo. I dati si resettano.
Presto: migreremo a PostgreSQL per persistenza.
```

---

## 📚 **Risorse Utili**

- Railway Docs: https://docs.railway.app
- GitHub Personal Access Token: https://github.com/settings/tokens
- Stripe Dashboard: https://dashboard.stripe.com

---

**Tutto pronto! 🎉 Il tuo sito sarà online 24/7!**

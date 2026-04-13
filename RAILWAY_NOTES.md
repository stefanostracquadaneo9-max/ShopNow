# 📝 Note Importanti per il Deployment

## ⚠️ Database SQLite su Railway

Attualmente usiamo SQLite (`app.db`). Su Railway:
- ✅ Funziona per test/demo
- ⚠️ I dati si resettano ad ogni deployment
- ⚠️ Niente persistenza tra restart

### Soluzione Futura: PostgreSQL

Per persistenza completa (dati salvati), dovremo migrare a PostgreSQL:
1. Railway fornisce un add-on PostgreSQL gratuito
2. Cambiare da SQLite a SQLite3 client + PostgreSQL
3. Migrare le query da SQL SQLite a SQL standard

**Per ora va bene così per test/demo.**

---

## 🔄 Come Funziona il Deploy

1. **Git Push** push il codice a GitHub
2. **Railway Webhook** detecta il nuovo push
3. **Nixpacks** installa dipendenze (`npm install`)
4. **Start Command** esegue `node server.js`
5. **Auto-Generate Domain** crea un URL pubblico

---

## 📊 Monitoraggio su Railway

Nel Railway Dashboard puoi:
- ✅ Vedere i logs in real-time
- ✅ Monitorare CPU e memoria
- ✅ Fare rollback a versioni precedenti
- ✅ Impostare auto-deploy su ogni push

---

## 🔐 Secrets Management

⚠️ IMPORTANTE: Non mettere `.env` nel repository!

✅ `.env` è nel `.gitignore` (protetto)  
✅ Variables vanno setuppate su Railway Dashboard  
✅ Mai pushare credenziali su GitHub  

---

## 💰 Costo su Railway

- **Free tier**: Crediti gratuiti ogni mese
- **Node.js**: ~$5/mese (approssimativamente)
- **PostgreSQL** (quando aggiunto): ~$7/mese

Totale stimato: ~$12/mese per un sito piccolo.

---

**Domande? Controlla DEPLOYMENT_GUIDE.md**

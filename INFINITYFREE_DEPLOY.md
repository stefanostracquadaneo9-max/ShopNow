# Deploy ShopNow su InfinityFree

InfinityFree non esegue Node.js. Per questo il sito usa i file HTML/CSS/JS già presenti e un backend PHP/MySQL in `api/index.php`.

## 1. Crea database MySQL

Dal pannello InfinityFree crea un database MySQL e prendi:

- host, di solito `sqlXXX.infinityfree.com`
- nome database, tipo `if0_XXXXXXXX_shopnow`
- username, tipo `if0_XXXXXXXX`
- password database

Le tabelle vengono create automaticamente alla prima richiesta.

In alternativa puoi importare manualmente `api/schema.mysql.sql` da phpMyAdmin.

## 2. Configura le chiavi

Copia:

```text
api/config.local.example.php
```

in:

```text
api/config.local.php
```

e inserisci dati MySQL, Stripe, Gmail SMTP e dominio pubblico.

`api/config.local.php` è ignorato da Git e non va caricato su repository pubblici.

Puoi generarlo automaticamente partendo dal tuo `.env` locale e dai dati MySQL InfinityFree:

```powershell
.\tools\create-infinityfree-config.ps1 `
  -DbHost "sqlXXX.infinityfree.com" `
  -DbName "if0_XXXXXXXX_shopnow" `
  -DbUser "if0_XXXXXXXX" `
  -DbPass "PASSWORD_DATABASE" `
  -PublicUrl "https://tuodominio.infinityfreeapp.com"
```

Lo script stampa anche l'URL `/api/install-check?token=...` da aprire dopo l'upload.

Imposta anche `security.install_token`: serve solo per aprire il controllo installazione senza mostrare informazioni tecniche a chiunque.

Esempio:

```php
'security' => [
    'install_token' => 'metti-qui-un-token-lungo-casuale',
],
```

## 3. Carica i file

Per creare uno zip pulito da caricare in `htdocs`:

```powershell
.\tools\build-infinityfree-package.ps1
```

Se hai già creato `api/config.local.php` e vuoi includerlo nello zip:

```powershell
.\tools\build-infinityfree-package.ps1 -IncludeLocalConfig
```

Carica nella cartella `htdocs` di InfinityFree:

- tutti i file `.html`, `.js`, `.css`
- `.htaccess`
- `api/`
- `uploads/`
- `favicon.svg`

Non caricare:

- `node_modules/`
- `.env`
- `app.db`
- `server.js` se vuoi una cartella pulita solo InfinityFree

`server.js` resta nel repo per Railway/Node, ma InfinityFree usa PHP.

## 4. Email

La modalità PHP usa SMTP Gmail con password app Google. Non usa `mail()` di PHP.

Config consigliata:

```php
'email' => [
    'host' => 'smtp.gmail.com',
    'port' => 587,
    'secure' => false,
    'user' => 'tuaemail@gmail.com',
    'pass' => 'PASSWORD_APP_GOOGLE',
    'from' => 'tuaemail@gmail.com',
    'from_name' => 'ShopNow',
],
```

## 5. Stripe

Inserisci sia chiave pubblica sia chiave segreta nel config PHP. Il checkout resta solo carta.

Non servono webhook Stripe per il flusso attuale: il sito conferma il pagamento dal browser e poi registra l'ordine via PHP.

## 6. Migrazione dati

Dal sito Railway puoi scaricare un backup JSON da admin. Su InfinityFree, dopo il login admin, usa la funzione ripristino backup.

Nota importante: le password create sul backend Node moderno usano scrypt. PHP non può verificare automaticamente quei vecchi hash senza estensioni specifiche. Gli utenti importati potrebbero dover usare "recupera password" una volta. Le nuove password salvate su InfinityFree funzionano normalmente.

## 7. Test rapido

Dopo il caricamento apri:

```text
https://tuodominio/health
https://tuodominio/config
https://tuodominio/api/install-check?token=IL_TUO_TOKEN
https://tuodominio/products.html
```

`/health` deve rispondere:

```json
{"status":"healthy","mode":"infinityfree-php"}
```

`/api/install-check` deve indicare:

- `database.connected: true`
- `stripeConfigured: true`
- `emailConfigured: true`

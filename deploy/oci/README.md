# Migrazione ShopNow su Oracle Cloud Always Free

Questa cartella prepara ShopNow per una VM Ubuntu su Oracle Cloud Always Free.
La VM mantiene l'app Node/Express attuale, SQLite su disco persistente, uploads,
Stripe e Gmail SMTP.

## 1. Crea la VM Oracle

Nel pannello Oracle Cloud crea una Compute Instance Always Free:

- immagine: Ubuntu 22.04 o 24.04
- shape: Ampere A1 o Micro Always Free disponibile nella tua region
- disco boot: dentro i limiti Always Free
- aggiungi la tua chiave SSH

Nel Virtual Cloud Network apri queste porte in ingresso:

- `22/tcp` per SSH
- `80/tcp` per HTTP
- `443/tcp` per HTTPS

Per Stripe in produzione serve HTTPS. L'ideale e puntare un dominio al public IP
della VM prima di lanciare Certbot.

## 2. Installa ShopNow sulla VM

Entra nella VM:

```bash
ssh ubuntu@IP_DELLA_VM
```

Poi installa dal repository:

```bash
git clone https://github.com/stefanostracquadaneo9-max/ShopNow.git
cd ShopNow
sudo DOMAIN=tuodominio.it CERTBOT_EMAIL=tua-email@gmail.com bash deploy/oci/install.sh
```

Se non hai ancora un dominio:

```bash
sudo bash deploy/oci/install.sh
```

## 3. Inserisci le variabili reali

Modifica il file env sul server:

```bash
sudo nano /etc/shopnow/shopnow.env
```

Controlla soprattutto:

```env
PUBLIC_SITE_URL=https://tuodominio.it
STRIPE_PUBLIC_KEY=...
STRIPE_SECRET_KEY=...
EMAIL_SERVICE=gmail
EMAIL_USER=...
EMAIL_PASSWORD=...
EMAIL_FROM=...
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
```

Poi avvia:

```bash
sudo systemctl enable --now shopnow
sudo journalctl -u shopnow -f
```

## 4. Esporta i dati da Railway

Dal PC, nella cartella del progetto:

```powershell
.\deploy\oci\export-railway-data.ps1
```

Otterrai un file tipo:

```text
backups/shopnow-railway-YYYYMMDD-HHMMSS.tar.gz
```

Copialo sulla VM:

```powershell
scp .\backups\shopnow-railway-YYYYMMDD-HHMMSS.tar.gz ubuntu@IP_DELLA_VM:/tmp/shopnow-railway.tar.gz
```

Ripristinalo sulla VM:

```bash
sudo /opt/shopnow/app/deploy/oci/restore-railway-backup.sh /tmp/shopnow-railway.tar.gz
```

## 5. Aggiornare il sito dopo modifiche

Sulla VM:

```bash
sudo /opt/shopnow/app/deploy/oci/deploy.sh
```

## 6. Backup manuale

Sulla VM:

```bash
sudo /opt/shopnow/app/deploy/oci/backup.sh
```

Il backup viene salvato in `/var/backups/shopnow`.

## 7. Controlli rapidi

```bash
curl -I http://127.0.0.1:3000/health
curl https://tuodominio.it/config
sudo systemctl status shopnow
sudo nginx -t
```

Quando il nuovo sito e verificato, aggiorna eventuali link/domini e lascia Railway
attivo solo finche sei sicuro che ordini, email, login, admin e checkout funzionino.

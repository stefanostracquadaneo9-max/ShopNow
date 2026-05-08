#!/usr/bin/env bash
set -euo pipefail

APP_USER="${APP_USER:-shopnow}"
APP_ROOT="${APP_ROOT:-/opt/shopnow}"
APP_DIR="${APP_DIR:-$APP_ROOT/app}"
DATA_DIR="${DATA_DIR:-/var/lib/shopnow}"
LOG_DIR="${LOG_DIR:-/var/log/shopnow}"
ENV_DIR="${ENV_DIR:-/etc/shopnow}"
ENV_FILE="${ENV_FILE:-$ENV_DIR/shopnow.env}"
REPO_URL="${REPO_URL:-https://github.com/stefanostracquadaneo9-max/ShopNow.git}"
BRANCH="${BRANCH:-main}"
DOMAIN="${DOMAIN:-}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
NODE_MAJOR="${NODE_MAJOR:-20}"
SERVICE_NAME="${SERVICE_NAME:-shopnow}"
SERVER_NAME="${DOMAIN:-_}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Esegui questo script con sudo/root."
  exit 1
fi

echo "[1/8] Pacchetti di sistema"
apt-get update
apt-get install -y ca-certificates curl gnupg git nginx certbot python3-certbot-nginx build-essential sqlite3 rsync ufw

if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'Number(process.versions.node.split(`.`)[0])')" -lt "$NODE_MAJOR" ]; then
  echo "[2/8] Installazione Node.js $NODE_MAJOR"
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
else
  echo "[2/8] Node.js gia presente: $(node --version)"
fi

echo "[3/8] Utente e cartelle"
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home "$APP_ROOT" --shell /usr/sbin/nologin "$APP_USER"
fi
mkdir -p "$APP_ROOT" "$DATA_DIR/uploads" "$LOG_DIR" "$ENV_DIR" /var/backups/shopnow
chown -R "$APP_USER:$APP_USER" "$APP_ROOT" "$DATA_DIR" "$LOG_DIR" /var/backups/shopnow
chmod 750 "$DATA_DIR" "$DATA_DIR/uploads"

echo "[4/8] Codice applicazione"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  rm -rf "$APP_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "[5/8] Dipendenze Node"
runuser -u "$APP_USER" -- bash -lc "cd '$APP_DIR' && npm ci --omit=dev"

echo "[6/8] Environment"
if [ ! -f "$ENV_FILE" ]; then
  cp "$APP_DIR/deploy/oci/shopnow.env.example" "$ENV_FILE"
  sed -i "s#DB_PATH=.*#DB_PATH=$DATA_DIR/app.db#" "$ENV_FILE"
  sed -i "s#UPLOADS_DIR=.*#UPLOADS_DIR=$DATA_DIR/uploads#" "$ENV_FILE"
  if [ -n "$DOMAIN" ]; then
    sed -i "s#PUBLIC_SITE_URL=.*#PUBLIC_SITE_URL=https://$DOMAIN#" "$ENV_FILE"
  fi
  chmod 600 "$ENV_FILE"
  chown root:"$APP_USER" "$ENV_FILE"
  echo "Creato $ENV_FILE: inserisci Stripe, Gmail e password admin prima di avviare il sito."
else
  chmod 600 "$ENV_FILE"
  chown root:"$APP_USER" "$ENV_FILE"
fi

echo "[7/8] systemd e Nginx"
cp "$APP_DIR/deploy/oci/shopnow.service" "/etc/systemd/system/$SERVICE_NAME.service"
systemctl daemon-reload

sed "s#__SERVER_NAME__#$SERVER_NAME#g" "$APP_DIR/deploy/oci/nginx-shopnow.conf.template" \
  > "/etc/nginx/sites-available/$SERVICE_NAME"
ln -sfn "/etc/nginx/sites-available/$SERVICE_NAME" "/etc/nginx/sites-enabled/$SERVICE_NAME"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null || true
  ufw allow "Nginx Full" >/dev/null || true
fi

echo "[8/8] HTTPS opzionale"
if [ -n "$DOMAIN" ]; then
  if [ -n "$CERTBOT_EMAIL" ]; then
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$CERTBOT_EMAIL" --redirect
  else
    echo "Dominio configurato ma CERTBOT_EMAIL non impostato: esegui dopo:"
    echo "  sudo certbot --nginx -d $DOMAIN --redirect"
  fi
else
  echo "DOMAIN non impostato: il sito rispondera via HTTP sull'IP finche non configuri un dominio."
fi

echo
echo "Installazione completata."
echo "1) Modifica $ENV_FILE con le variabili reali."
echo "2) Avvia: sudo systemctl enable --now $SERVICE_NAME"
echo "3) Log: sudo journalctl -u $SERVICE_NAME -f"

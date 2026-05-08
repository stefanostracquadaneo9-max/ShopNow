#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:-}"
APP_USER="${APP_USER:-shopnow}"
DATA_DIR="${DATA_DIR:-/var/lib/shopnow}"
SERVICE_NAME="${SERVICE_NAME:-shopnow}"
DB_PATH="${DB_PATH:-$DATA_DIR/app.db}"
UPLOADS_DIR="${UPLOADS_DIR:-$DATA_DIR/uploads}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Esegui questo script con sudo/root."
  exit 1
fi

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "Uso: sudo $0 /percorso/shopnow-railway.tar.gz"
  exit 1
fi

WORK_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

systemctl stop "$SERVICE_NAME" >/dev/null 2>&1 || true
mkdir -p "$DATA_DIR" "$UPLOADS_DIR"

if [ -f "$DB_PATH" ]; then
  cp "$DB_PATH" "$DB_PATH.before-restore-$(date +%Y%m%d-%H%M%S)"
fi

tar -xzf "$BACKUP_FILE" -C "$WORK_DIR"

if [ ! -f "$WORK_DIR/app.db" ]; then
  echo "Backup non valido: app.db mancante"
  exit 1
fi

install -m 660 -o "$APP_USER" -g "$APP_USER" "$WORK_DIR/app.db" "$DB_PATH"
if [ -d "$WORK_DIR/uploads" ]; then
  rsync -a --delete "$WORK_DIR/uploads/" "$UPLOADS_DIR/"
fi
chown -R "$APP_USER:$APP_USER" "$DATA_DIR"

systemctl start "$SERVICE_NAME"
systemctl --no-pager --full status "$SERVICE_NAME"

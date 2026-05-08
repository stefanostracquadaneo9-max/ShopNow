#!/usr/bin/env bash
set -euo pipefail

APP_USER="${APP_USER:-shopnow}"
APP_DIR="${APP_DIR:-/opt/shopnow/app}"
BRANCH="${BRANCH:-main}"
SERVICE_NAME="${SERVICE_NAME:-shopnow}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Esegui questo script con sudo/root."
  exit 1
fi

git -C "$APP_DIR" fetch origin "$BRANCH"
git -C "$APP_DIR" reset --hard "origin/$BRANCH"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
runuser -u "$APP_USER" -- bash -lc "cd '$APP_DIR' && npm ci --omit=dev"
systemctl restart "$SERVICE_NAME"
systemctl --no-pager --full status "$SERVICE_NAME"

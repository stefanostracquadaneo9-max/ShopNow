#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/shopnow/shopnow.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/shopnow}"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

DB_PATH="${DB_PATH:-/var/lib/shopnow/app.db}"
UPLOADS_DIR="${UPLOADS_DIR:-/var/lib/shopnow/uploads}"
STAMP="$(date +%Y%m%d-%H%M%S)"
WORK_DIR="$(mktemp -d)"
OUT_FILE="$BACKUP_DIR/shopnow-$STAMP.tar.gz"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

mkdir -p "$BACKUP_DIR" "$WORK_DIR/uploads"

if [ -f "$DB_PATH" ]; then
  sqlite3 "$DB_PATH" ".backup '$WORK_DIR/app.db'"
else
  echo "Database non trovato: $DB_PATH"
  exit 1
fi

if [ -d "$UPLOADS_DIR" ]; then
  rsync -a "$UPLOADS_DIR/" "$WORK_DIR/uploads/"
fi

tar -C "$WORK_DIR" -czf "$OUT_FILE" app.db uploads
chmod 600 "$OUT_FILE"
echo "$OUT_FILE"

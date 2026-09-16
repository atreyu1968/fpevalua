#!/usr/bin/env bash
set -euo pipefail
if [ "${EUID}" -ne 0 ]; then echo "Usa sudo"; exit 1; fi
if [ $# -ne 1 ]; then echo "Uso: sudo bash deploy/restore-backup.sh /ruta/copia.tar.gz"; exit 1; fi
APP_DIR=/opt/fpevalua
BACKUP=$(readlink -f "$1")
[ -f "$BACKUP" ] || { echo "No existe $BACKUP"; exit 1; }
read -r -p "Esto sustituirá base de datos, adjuntos, SCORM y .env. Escribe RESTAURAR: " OK
[ "$OK" = "RESTAURAR" ] || exit 1
systemctl stop fpevalua
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
tar -xzf "$BACKUP" -C "$TMP"
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p "$APP_DIR/backups/pre-restore-$TS"
cp -a "$APP_DIR/data/fpevalua.sqlite"* "$APP_DIR/backups/pre-restore-$TS/" 2>/dev/null || true
[ -f "$TMP/fpevalua.sqlite" ] && cp -a "$TMP/fpevalua.sqlite" "$APP_DIR/data/fpevalua.sqlite"
[ -d "$TMP/uploads" ] && { rm -rf "$APP_DIR/uploads"; cp -a "$TMP/uploads" "$APP_DIR/uploads"; }
[ -d "$TMP/scorm" ] && { rm -rf "$APP_DIR/scorm"; cp -a "$TMP/scorm" "$APP_DIR/scorm"; }
[ -f "$TMP/.env" ] && cp -a "$TMP/.env" "$APP_DIR/.env"
chown -R www-data:www-data "$APP_DIR/data" "$APP_DIR/uploads" "$APP_DIR/scorm" "$APP_DIR/.env"
systemctl start fpevalua
echo "Restauración finalizada."

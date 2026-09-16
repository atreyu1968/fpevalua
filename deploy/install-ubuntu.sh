#!/usr/bin/env bash
set -euo pipefail

if [ "${EUID}" -ne 0 ]; then
  echo "Ejecuta con sudo: sudo bash deploy/install-ubuntu.sh"
  exit 1
fi

APP_DIR="/opt/fpevalua"

if ! command -v node >/dev/null; then
  echo "ERROR: instala Node.js 24 LTS antes de continuar."
  exit 1
fi
NODE_BIN=$(command -v node)
MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$MAJOR" -lt 24 ]; then
  echo "ERROR: se requiere Node.js 24 o superior. Versión actual: $(node -v)"
  exit 1
fi

apt-get update
apt-get install -y curl git nginx unzip ca-certificates

UPGRADING=0
if [ -d "$APP_DIR" ] && { [ -f "$APP_DIR/src/server.mjs" ] || [ -d "$APP_DIR/.git" ]; }; then
  UPGRADING=1
  TS=$(date +%Y%m%d-%H%M%S)
  mkdir -p "$APP_DIR/backups/pre-v2.4-${TS}"
  systemctl stop fpevalua 2>/dev/null || true
  for F in data/fpevalua.sqlite data/fpevalua.sqlite-wal data/fpevalua.sqlite-shm .env; do
    if [ -f "$APP_DIR/$F" ]; then
      cp -a "$APP_DIR/$F" "$APP_DIR/backups/pre-v2.4-${TS}/"
    fi
  done
  echo "Instalación previa detectada. Copia preventiva: $APP_DIR/backups/pre-v2.4-${TS}/"
fi

mkdir -p "$APP_DIR"
SRC_DIR="$(pwd -P)"
APP_REAL="$(cd "$APP_DIR" && pwd -P)"
if [ "$SRC_DIR" != "$APP_REAL" ]; then
  cp -a . "$APP_DIR/"
fi
cd "$APP_DIR"

# Una clonación limpia desde GitHub contiene el runtime empaquetado en bootstrap/.
# Se materializa antes de crear el servicio para impedir arranques incompletos.
if [ ! -s src/server.mjs ] || [ ! -s src/db.mjs ] || [ ! -s public/app.js ] || [ ! -s public/styles.css ] || [ ! -s data/tecnica-contable.json ]; then
  echo "Materializando runtime de FPEvalúa..."
  bash bootstrap/materialize-runtime.sh
fi

for REQUIRED in src/server.mjs src/db.mjs public/app.js public/styles.css data/tecnica-contable.json; do
  if [ ! -s "$REQUIRED" ]; then
    echo "ERROR: falta $APP_DIR/$REQUIRED. No se iniciará el servicio."
    exit 1
  fi
done

node --check src/server.mjs
node --check src/db.mjs
node --check public/app.js

if [ ! -f .env ]; then
  cp .env.example .env
  SESSION=$(node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))")
  AIKEY=$(node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))")
  sed -i "s#^SESSION_SECRET=.*#SESSION_SECRET=${SESSION}#" .env
  sed -i "s#^AI_ENCRYPTION_KEY=.*#AI_ENCRYPTION_KEY=${AIKEY}#" .env
else
  if ! grep -q '^AI_ENCRYPTION_KEY=' .env; then
    AIKEY=$(node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))")
    printf '\nAI_ENCRYPTION_KEY=%s\n' "$AIKEY" >> .env
  fi
  if ! grep -q '^SCORM_DIR=' .env; then printf '\nSCORM_DIR=./scorm\n' >> .env; fi
  if ! grep -q '^BACKUP_DIR=' .env; then printf '\nBACKUP_DIR=./backups\n' >> .env; fi
fi

mkdir -p data uploads backups scorm
chown -R www-data:www-data "$APP_DIR/data" "$APP_DIR/uploads" "$APP_DIR/backups" "$APP_DIR/scorm"
chmod 750 "$APP_DIR/data" "$APP_DIR/uploads" "$APP_DIR/backups" "$APP_DIR/scorm"
chmod 640 "$APP_DIR/.env"
chown www-data:www-data "$APP_DIR/.env"

sed "s#ExecStart=/usr/bin/node#ExecStart=${NODE_BIN}#" deploy/fpevalua.service > /etc/systemd/system/fpevalua.service

# Nginx queda limitado al loopback. Cloudflare Tunnel publicará 127.0.0.1:8080.
if [ -f /etc/nginx/sites-available/fpevalua ]; then
  cp -a /etc/nginx/sites-available/fpevalua "/etc/nginx/sites-available/fpevalua.bak.$(date +%Y%m%d-%H%M%S)"
fi
cp deploy/nginx.conf /etc/nginx/sites-available/fpevalua
ln -sf /etc/nginx/sites-available/fpevalua /etc/nginx/sites-enabled/fpevalua
nginx -t

systemctl daemon-reload
systemctl enable fpevalua nginx
systemctl restart fpevalua nginx
sleep 2

if ! systemctl is-active --quiet fpevalua; then
  echo "ERROR: FPEvalúa no ha arrancado. Últimas líneas del servicio:"
  journalctl -u fpevalua -n 100 --no-pager
  exit 1
fi

if ! curl -fsS http://127.0.0.1:3000/api/health >/tmp/fpevalua-health.json; then
  echo "ERROR: el servicio está activo pero /api/health no responde."
  journalctl -u fpevalua -n 100 --no-pager
  exit 1
fi

if ! curl -fsS http://127.0.0.1:8080/api/health >/dev/null; then
  echo "ERROR: Nginx no está publicando correctamente FPEvalúa en 127.0.0.1:8080."
  exit 1
fi

echo
echo "FPEvalúa responde correctamente: $(cat /tmp/fpevalua-health.json)"
if [ "$UPGRADING" -eq 1 ]; then
  echo "Actualización/reparación de FPEvalúa 2.4 completada conservando datos locales."
else
  echo "Instalación de FPEvalúa 2.4 completada."
fi
echo "Cloudflare Tunnel debe publicar: http://127.0.0.1:8080"
echo "No abras los puertos 3000 ni 8080 al exterior."
echo "Después de la primera entrada cambia las contraseñas de demostración y activa 2FA para personal docente."

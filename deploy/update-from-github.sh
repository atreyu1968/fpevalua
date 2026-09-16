#!/usr/bin/env bash
set -euo pipefail
APP_DIR="${FPEVALUA_APP_DIR:-/opt/fpevalua}"
BRANCH="${FPEVALUA_BRANCH:-main}"
if [ "${EUID}" -ne 0 ]; then echo "Ejecuta con sudo: sudo bash deploy/update-from-github.sh"; exit 1; fi
if [ ! -d "$APP_DIR/.git" ]; then echo "ERROR: $APP_DIR no es una instalación Git."; exit 1; fi
cd "$APP_DIR"
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p backups/pre-git-update-${TS}
for F in data/fpevalua.sqlite data/fpevalua.sqlite-wal data/fpevalua.sqlite-shm .env; do
  if [ -f "$F" ]; then cp -a "$F" "backups/pre-git-update-${TS}/"; fi
done
systemctl stop fpevalua 2>/dev/null || true
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"
exec bash deploy/install-ubuntu.sh

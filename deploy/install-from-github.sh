#!/usr/bin/env bash
set -euo pipefail
REPO_URL="${FPEVALUA_REPO_URL:-https://github.com/atreyu1968/fpevalua.git}"
BRANCH="${FPEVALUA_BRANCH:-main}"
APP_DIR="${FPEVALUA_APP_DIR:-/opt/fpevalua}"
TMP_DIR="$(mktemp -d /tmp/fpevalua-github.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT
if [ "${EUID}" -ne 0 ]; then echo "Ejecuta con sudo: sudo bash deploy/install-from-github.sh"; exit 1; fi
apt-get update
apt-get install -y git ca-certificates nginx unzip
if ! command -v node >/dev/null 2>&1; then echo "ERROR: Node.js 24 o superior no está instalado."; exit 1; fi
MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$MAJOR" -lt 24 ]; then echo "ERROR: se requiere Node.js 24 o superior. Versión actual: $(node -v)"; exit 1; fi
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
  exec bash deploy/install-ubuntu.sh
fi
git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$TMP_DIR/repo"
cd "$TMP_DIR/repo"
exec bash deploy/install-ubuntu.sh

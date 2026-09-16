#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
BOOT_DIR="$ROOT_DIR/bootstrap"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

required=(
  "$ROOT_DIR/src/server.mjs"
  "$ROOT_DIR/src/db.mjs"
  "$ROOT_DIR/public/app.js"
  "$ROOT_DIR/public/styles.css"
  "$ROOT_DIR/data/tecnica-contable.json"
)

all_present=1
for f in "${required[@]}"; do
  if [ ! -s "$f" ]; then all_present=0; break; fi
done
if [ "$all_present" -eq 1 ]; then
  echo "Runtime de FPEvalúa ya materializado."
  exit 0
fi

parts=(
  bundle.part00 bundle.part00tail
  bundle.part01 bundle.part02 bundle.part03
  bundle.part04a bundle.part04b
  bundle.part05a bundle.part05b
  bundle.part06a bundle.part06b
  bundle.part07a bundle.part07b
  bundle.part08a bundle.part08b
  bundle.part09a bundle.part09b
  bundle.part10
)

for p in "${parts[@]}"; do
  if [ ! -s "$BOOT_DIR/$p" ]; then
    echo "ERROR: falta $BOOT_DIR/$p. Ejecuta 'git pull --ff-only' y vuelve a intentarlo." >&2
    exit 1
  fi
done

B64="$TMP_DIR/runtime.b64"
ARCHIVE="$TMP_DIR/runtime.tar.gz"
: > "$B64"
for p in "${parts[@]}"; do cat "$BOOT_DIR/$p" >> "$B64"; done

if ! base64 -d "$B64" > "$ARCHIVE" 2>/dev/null; then
  echo "ERROR: el paquete runtime no se pudo decodificar." >&2
  exit 1
fi
if ! gzip -t "$ARCHIVE" 2>/dev/null; then
  echo "ERROR: el paquete runtime está corrupto." >&2
  exit 1
fi

mkdir -p "$TMP_DIR/unpack"
tar -xzf "$ARCHIVE" -C "$TMP_DIR/unpack"

PAYLOAD=""
for candidate in "$TMP_DIR/unpack" "$TMP_DIR/unpack/FPEvalua" "$TMP_DIR/unpack/fpevalua"; do
  if [ -s "$candidate/src/server.mjs" ] && [ -s "$candidate/src/db.mjs" ] && [ -s "$candidate/public/app.js" ]; then
    PAYLOAD="$candidate"
    break
  fi
done
if [ -z "$PAYLOAD" ]; then
  found="$(find "$TMP_DIR/unpack" -maxdepth 3 -type f -path '*/src/server.mjs' -print -quit || true)"
  if [ -n "$found" ]; then PAYLOAD="$(cd "$(dirname "$found")/.." && pwd -P)"; fi
fi
if [ -z "$PAYLOAD" ]; then
  echo "ERROR: el paquete runtime no contiene src/server.mjs." >&2
  exit 1
fi

mkdir -p "$ROOT_DIR/src" "$ROOT_DIR/public" "$ROOT_DIR/data" "$ROOT_DIR/scripts" "$ROOT_DIR/docs"
cp -a "$PAYLOAD/src/." "$ROOT_DIR/src/"
cp -a "$PAYLOAD/public/." "$ROOT_DIR/public/"
cp -a "$PAYLOAD/data/." "$ROOT_DIR/data/"
if [ -d "$PAYLOAD/scripts" ]; then cp -a "$PAYLOAD/scripts/." "$ROOT_DIR/scripts/"; fi
if [ -d "$PAYLOAD/docs" ]; then cp -a "$PAYLOAD/docs/." "$ROOT_DIR/docs/"; fi

for f in "${required[@]}"; do
  if [ ! -s "$f" ]; then
    echo "ERROR: no se pudo materializar $f" >&2
    exit 1
  fi
done

node --check "$ROOT_DIR/src/server.mjs"
node --check "$ROOT_DIR/src/db.mjs"
node --check "$ROOT_DIR/public/app.js"

echo "Runtime FPEvalúa materializado y verificado correctamente."

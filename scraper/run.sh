#!/usr/bin/env bash
# Instala dependencias (primera vez) y ejecuta el scraper.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Cargar .env si existe
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Instalar dependencias si no están presentes
if ! python3 -c "import requests, bs4" 2>/dev/null; then
  echo "[setup] Instalando dependencias..."
  pip3 install -r requirements.txt --quiet
fi

echo "[run] Iniciando scraper..."
python3 scraper.py

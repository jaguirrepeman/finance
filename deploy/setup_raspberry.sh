#!/usr/bin/env bash
# =============================================================================
# setup_raspberry.sh — Instalación del Portfolio Tracker en Raspberry Pi
# Probado en Raspberry Pi OS Bookworm (Debian 12) y Bullseye (Debian 11)
# Ejecución: bash deploy/setup_raspberry.sh
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VENV_DIR="$PROJECT_DIR/backend/.venv"

echo "=========================================="
echo " PORTFOLIO TRACKER — Setup Raspberry Pi"
echo "=========================================="
echo "Directorio del proyecto: $PROJECT_DIR"
echo ""
echo "--- Entorno detectado ---"
echo "SO:     $(. /etc/os-release && echo "$PRETTY_NAME")"
echo "Python: $(python3 --version 2>&1)"
echo "Arch:   $(uname -m)"
echo "-------------------------"
echo ""

# --- Comprobar versión mínima del SO ---
OS_ID=$(. /etc/os-release && echo "$VERSION_CODENAME")
if [[ "$OS_ID" == "buster" || "$OS_ID" == "jessie" || "$OS_ID" == "stretch" ]]; then
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║  ✘  SISTEMA OPERATIVO DEMASIADO ANTIGUO — NO COMPATIBLE     ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║  Tienes Raspbian/Debian '$OS_ID'.                           ║"
    echo "║  Este proyecto requiere Python 3.12+.                       ║"
    echo "║                                                              ║"
    echo "║  SOLUCIÓN: Flashea la tarjeta SD con Raspberry Pi OS        ║"
    echo "║  Bookworm (Debian 12) usando Raspberry Pi Imager:           ║"
    echo "║  https://www.raspberrypi.com/software/                      ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    exit 1
fi

# --- Comprobar versión mínima de Python ---
PY_VER_MAJOR=$(python3 -c 'import sys; print(sys.version_info.major)')
PY_VER_MINOR=$(python3 -c 'import sys; print(sys.version_info.minor)')
if [[ "$PY_VER_MAJOR" -lt 3 || ("$PY_VER_MAJOR" -eq 3 && "$PY_VER_MINOR" -lt 12) ]]; then
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║  ✘  PYTHON DEMASIADO ANTIGUO                                ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║  Tienes Python ${PY_VER_MAJOR}.${PY_VER_MINOR}. Este proyecto requiere Python 3.12+.  ║"
    echo "║  Actualiza el sistema operativo a Bookworm (Debian 12).     ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    exit 1
fi

# --- 1. Dependencias del sistema ---
echo "[1/6] Actualizando paquetes e instalando dependencias del sistema..."
sudo apt-get update --allow-releaseinfo-change -qq

# Paquetes base
sudo apt-get install -y python3 python3-pip python3-venv git curl

echo " ✔ Dependencias del sistema instaladas."
echo ""

# --- 2. Poetry ---
echo "[2/6] Instalando Poetry (gestor de dependencias Python)..."
if ! command -v poetry &>/dev/null; then
    curl -sSL https://install.python-poetry.org | python3 -
    export PATH="$HOME/.local/bin:$PATH"
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
    echo " ✔ Poetry instalado."
else
    echo " ✔ Poetry ya instalado."
fi
echo ""

# --- 3. Node.js (para el frontend) ---
echo "[3/6] Instalando Node.js 20.x (para Vite build)..."
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 20 ]]; then
    echo " Añadiendo repositorio NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    echo " ✔ Node.js instalado: $(node -v)"
else
    echo " ✔ Node.js ya instalado: $(node -v)"
fi
echo ""

# --- 4. Dependencias Python (backend) ---
echo "[4/6] Instalando dependencias Python (Poetry)..."
cd "$PROJECT_DIR/backend"
poetry install --no-interaction --no-root
echo " ✔ Dependencias Python instaladas."
echo ""

# --- 5. Build del frontend (Vite) ---
echo "[5/6] Construyendo el frontend (npm + Vite)..."
cd "$PROJECT_DIR/frontend"
npm ci --prefer-offline
npm run build
echo " ✔ Frontend construido en frontend/dist/"
echo ""

# --- 6. Verificación ---
echo "[6/6] Verificando instalación..."
cd "$PROJECT_DIR"

if [ -d "backend/.venv" ]; then
    echo " ✔ Entorno virtual Python creado"
fi

if [ -d "frontend/dist" ]; then
    echo " ✔ Build del frontend generado"
fi

if [ -d "frontend/node_modules" ]; then
    echo " ✔ Dependencias Node.js instaladas"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              INSTALACIÓN COMPLETADA                         ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Siguiente paso:                                            ║"
echo "║    bash deploy/install_service.sh                           ║"
echo "║                                                              ║"
echo "║  Esto instalará los servicios systemd y configurará el      ║"
echo "║  arranque automático.                                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

#!/usr/bin/env bash
# =============================================================================
# update.sh — Actualiza Portfolio Tracker a la última versión
#
# Realiza en orden:
#   1. git pull (descarga el código nuevo)
#   2. npm ci + build (actualiza frontend)
#   3. poetry install (actualiza dependencias backend)
#   4. Reiniciar servicios
#
# Puede ejecutarse:
#   - Manualmente por SSH: bash deploy/update.sh
#   - Automáticamente vía webhook on git push
#
# Ejecución: bash deploy/update.sh
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
POETRY_BIN="$(command -v poetry || echo "$HOME/.local/bin/poetry")"
LOG_FILE="$PROJECT_DIR/logs/deploy.log"

# Crear carpeta de logs si no existe
mkdir -p "$PROJECT_DIR/logs"

# Redirigir toda la salida al log Y a la terminal
exec > >(tee -a "$LOG_FILE") 2>&1

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           PORTFOLIO TRACKER — Actualización                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo " Inicio: $(date)"
echo ""

cd "$PROJECT_DIR"

# =============================================================================
# 1. Git pull
# =============================================================================
echo "[1/4] Descargando última versión del código (git pull)..."

if [ ! -d ".git" ]; then
    echo " ⚠ No es un repositorio git. Actualización abortada."
    exit 1
fi

# Guardar rama actual
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
CURRENT_COMMIT=$(git rev-parse --short HEAD)
echo " Rama: $CURRENT_BRANCH | Commit actual: $CURRENT_COMMIT"

# Guardar cambios locales si los hay (no debería haber en la Pi)
if ! git diff --quiet; then
    echo " ⚠ Hay cambios locales sin commitear. Haciendo stash..."
    git stash push -m "auto-stash antes de update $(date +%Y%m%d_%H%M%S)"
fi

git fetch origin
git reset --hard origin/"$CURRENT_BRANCH"

NEW_COMMIT=$(git rev-parse --short HEAD)
echo " ✔ Actualizado: $CURRENT_COMMIT → $NEW_COMMIT"

if [[ "$CURRENT_COMMIT" != "$NEW_COMMIT" ]]; then
    echo ""
    echo " Cambios incluidos:"
    git log --oneline "$CURRENT_COMMIT...$NEW_COMMIT" | head -10 | sed 's/^/   • /'
fi
echo ""

# =============================================================================
# 2. Frontend build
# =============================================================================
echo "[2/4] Construyendo el frontend (npm ci + build)..."
cd "$PROJECT_DIR/frontend"

npm ci --prefer-offline
npm run build

echo " ✔ Frontend reconstruido en frontend/dist/"
echo ""

# =============================================================================
# 3. Backend dependencies
# =============================================================================
echo "[3/4] Actualizando dependencias del backend (poetry)..."
cd "$PROJECT_DIR/backend"

"$POETRY_BIN" install --only main --no-interaction

echo " ✔ Dependencias actualizadas."
echo ""

# =============================================================================
# 4. Reiniciar servicios
# =============================================================================
echo "[4/4] Reiniciando el backend..."

# El reinicio necesita sudo SIN contraseña (no hay TTY cuando lo dispara el
# webhook). La regla sudoers (install_service.sh) solo permite EXACTAMENTE
# `systemctl restart portfolio-tracker`, así que probamos ESE comando, no otros
# (un `sudo -n true` fallaría porque no está en el allowlist).
if systemctl is-active --quiet portfolio-tracker; then
    if sudo -n systemctl restart portfolio-tracker; then
        sleep 2
        if systemctl is-active --quiet portfolio-tracker; then
            echo " ✔ portfolio-tracker reiniciado correctamente."
        else
            echo " ✘ portfolio-tracker falló al reiniciar. Ver logs:"
            echo "   sudo journalctl -u portfolio-tracker -n 30"
            exit 1
        fi
    else
        echo " ✘ sudo sin contraseña no disponible para reiniciar el servicio."
        echo "   Ejecuta una vez:  bash deploy/install_service.sh"
        echo "   (instala /etc/sudoers.d/portfolio-tracker)"
        exit 1
    fi
else
    echo " ⚠ portfolio-tracker no estaba ejecutándose."
fi

# NOTA: NO reiniciamos portfolio-webhook aquí. Este script corre como hijo del
# propio webhook; reiniciarlo mataría el deploy a medias (kill del cgroup).
# hooks.json se regenera solo al arrancar el webhook (ExecStartPre). Si cambias
# el secreto o el servicio del webhook, reinícialo a mano:
#   sudo systemctl restart portfolio-webhook

echo ""

# =============================================================================
# Resumen
# =============================================================================
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              ACTUALIZACIÓN COMPLETADA                       ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Commit: $NEW_COMMIT"
echo "║  Finalizado: $(date)"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

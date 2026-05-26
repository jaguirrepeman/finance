#!/usr/bin/env bash
# =============================================================================
# install_service.sh — Instala servicios systemd del Portfolio Tracker
#
# Instala:
#   - portfolio-tracker.service  → FastAPI backend en puerto 8000
#   - portfolio-webhook.service  → Webhook listener en puerto 9000
#
# Ejecución: bash deploy/install_service.sh
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CURRENT_USER="$(whoami)"
POETRY_BIN="$(command -v poetry || echo "$HOME/.local/bin/poetry")"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║       PORTFOLIO TRACKER — Instalación de Servicios          ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Usuario:  $CURRENT_USER"
echo "║  Proyecto: $PROJECT_DIR"
echo "║  Poetry:   $POETRY_BIN"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ---------------------------------------------------------------------------
# Helper: instalar un servicio systemd
# ---------------------------------------------------------------------------
install_systemd_service() {
    local SERVICE_TEMPLATE="$1"     # Ruta al archivo .service plantilla
    local SERVICE_NAME="$2"         # Nombre del servicio (sin .service)
    local SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

    echo " → Instalando servicio: $SERVICE_NAME"

    # Sustituir variables en la plantilla
    sudo bash -c "sed \
        -e 's|__PROJECT_DIR__|$PROJECT_DIR|g' \
        -e 's|__USER__|$CURRENT_USER|g' \
        -e 's|__POETRY__|$POETRY_BIN|g' \
        '$SERVICE_TEMPLATE' > '$SERVICE_FILE'"

    sudo systemctl daemon-reload
    sudo systemctl enable "$SERVICE_NAME"
    echo "   ✔ $SERVICE_NAME habilitado (arranque automático al boot)."
}

# ---------------------------------------------------------------------------
# 1. Servicio del backend (FastAPI + uvicorn)
# ---------------------------------------------------------------------------
echo "[1/3] Instalando servicio del backend (portfolio-tracker)..."

install_systemd_service \
    "$SCRIPT_DIR/portfolio-tracker.service" \
    "portfolio-tracker"

sudo systemctl restart portfolio-tracker

# Esperar a que arranque
sleep 3
if systemctl is-active --quiet portfolio-tracker; then
    LOCAL_IP=$(hostname -I | awk '{print $1}')
    echo "   ✔ Backend activo → http://${LOCAL_IP}:8000/api/health"
else
    echo "   ⚠ El backend no arrancó correctamente. Ver logs:"
    echo "     sudo journalctl -u portfolio-tracker -n 30"
fi
echo ""

# ---------------------------------------------------------------------------
# 2. Webhook listener (para auto-deploy)
# ---------------------------------------------------------------------------
echo "[2/3] Instalando webhook listener (portfolio-webhook)..."

# Instalar adnanh/webhook si no existe
if ! command -v webhook &>/dev/null; then
    echo "   Instalando 'webhook'..."
    sudo apt-get install -y webhook
fi

install_systemd_service \
    "$SCRIPT_DIR/portfolio-webhook.service" \
    "portfolio-webhook"

sudo systemctl restart portfolio-webhook

# Esperar a que arranque
sleep 2
if systemctl is-active --quiet portfolio-webhook; then
    echo "   ✔ Webhook listener activo en puerto 9000"
else
    echo "   ⚠ El webhook no arrancó correctamente. Ver logs:"
    echo "     sudo journalctl -u portfolio-webhook -n 30"
fi
echo ""

# ---------------------------------------------------------------------------
# 3. Configuración del webhook secret
# ---------------------------------------------------------------------------
echo "[3/3] Configuración del webhook..."
echo ""
echo " IMPORTANTE: Debes configurar el webhook secret en:"
echo "   1. deploy/hooks.json → cambia 'YOUR_WEBHOOK_SECRET_HERE'"
echo "   2. GitHub repo → Settings → Webhooks → Secret (mismo valor)"
echo ""
echo " Después de configurar el secret, reinicia el webhook:"
echo "   sudo systemctl restart portfolio-webhook"
echo ""

# ---------------------------------------------------------------------------
# Resumen
# ---------------------------------------------------------------------------
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              SERVICIOS INSTALADOS                           ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  portfolio-tracker   → Backend en puerto 8000               ║"
echo "║  portfolio-webhook   → Webhook en puerto 9000               ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Siguiente paso:                                            ║"
echo "║    bash deploy/add_to_funnel.sh                             ║"
echo "║                                                              ║"
echo "║  Esto expondrá el servicio vía Tailscale Funnel.           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

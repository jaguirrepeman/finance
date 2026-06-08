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
echo "[1/4] Instalando servicio del backend (portfolio-tracker)..."

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
echo "[2/4] Configurando el secreto del webhook (fuera de git)..."

WEBHOOK_ENV="$SCRIPT_DIR/webhook.env"
if [[ ! -f "$WEBHOOK_ENV" ]]; then
    if [[ -n "${WEBHOOK_SECRET:-}" ]]; then
        SECRET="$WEBHOOK_SECRET"
        echo "   Usando WEBHOOK_SECRET del entorno."
    elif command -v openssl &>/dev/null; then
        SECRET="$(openssl rand -hex 24)"
        echo "   Generado un secreto aleatorio nuevo."
    else
        SECRET="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
        echo "   Generado un secreto aleatorio nuevo."
    fi
    ( umask 077; printf 'WEBHOOK_SECRET=%s\n' "$SECRET" > "$WEBHOOK_ENV" )
    echo "   ✔ Escrito $WEBHOOK_ENV (modo 600, git-ignorado)."
    echo ""
    echo "   ► Configura este MISMO secreto en GitHub:"
    echo "       Settings → Webhooks → Secret:"
    echo "       $SECRET"
    echo ""
else
    echo "   ✔ Ya existe $WEBHOOK_ENV; se conserva."
fi

# ---------------------------------------------------------------------------
# 3. Webhook listener (para auto-deploy)
# ---------------------------------------------------------------------------
echo "[3/4] Instalando webhook listener (portfolio-webhook)..."

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
    echo "   ✔ Webhook listener activo en puerto 9000 (hooks.json regenerado)"
else
    echo "   ⚠ El webhook no arrancó correctamente. Ver logs:"
    echo "     sudo journalctl -u portfolio-webhook -n 30"
fi
echo ""

# ---------------------------------------------------------------------------
# 4. Regla sudoers: reiniciar el backend sin contraseña
# ---------------------------------------------------------------------------
echo "[4/4] Instalando regla sudoers (reinicio sin contraseña)..."

SYSTEMCTL_BIN="$(command -v systemctl)"
SUDOERS_DST="/etc/sudoers.d/portfolio-tracker"
TMP_SUDOERS="$(mktemp)"

sed \
    -e "s|__USER__|$CURRENT_USER|g" \
    -e "s|__SYSTEMCTL__|$SYSTEMCTL_BIN|g" \
    "$SCRIPT_DIR/sudoers-portfolio.template" > "$TMP_SUDOERS"

if sudo visudo -cf "$TMP_SUDOERS" >/dev/null 2>&1; then
    sudo install -m 0440 -o root -g root "$TMP_SUDOERS" "$SUDOERS_DST"
    echo "   ✔ Instalado $SUDOERS_DST"
else
    echo "   ✘ La regla sudoers no validó; NO instalada. Revisa la plantilla."
fi
rm -f "$TMP_SUDOERS"
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

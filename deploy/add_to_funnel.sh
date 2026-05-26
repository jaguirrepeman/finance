#!/usr/bin/env bash
# =============================================================================
# add_to_funnel.sh — Añade Portfolio Tracker al Tailscale Funnel existente
#
# Añade path-based routing al Funnel sin tocar la configuración actual
# (idealista_bot debe estar corriendo en /)
#
# Resultado:
#   /         → idealista_bot (puerto 8501)
#   /finance  → portfolio tracker (puerto 8000)
#   /hooks    → webhook listener (puerto 9000)
#
# REQUISITO: Tailscale debe estar instalado y conectado
#            (ejecutar deploy/remote_access.sh de idealista_bot primero)
#
# Ejecución: bash deploy/add_to_funnel.sh
# =============================================================================
set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     PORTFOLIO TRACKER — Configuración Tailscale Funnel      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# --- Verificar que Tailscale está instalado y conectado ---
if ! command -v tailscale &>/dev/null; then
    echo " ✘ Tailscale no está instalado."
    echo "   Ejecuta primero el script remote_access.sh de idealista_bot:"
    echo "   bash ~/idealista_bot/deploy/remote_access.sh"
    exit 1
fi

TS_STATE=$(tailscale status --json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('BackendState',''))" 2>/dev/null || echo "")
if [[ "$TS_STATE" != "Running" ]]; then
    echo " ✘ Tailscale no está conectado."
    echo "   Ejecuta: sudo tailscale up"
    exit 1
fi

echo " ✔ Tailscale está conectado."
echo ""

# --- Obtener la URL del Funnel actual ---
FUNNEL_URL=$(tailscale serve status 2>/dev/null | grep -o 'https://[^ ]*' | head -1 || echo "")
if [[ -z "$FUNNEL_URL" ]]; then
    echo " ✘ No hay Funnel activo."
    echo "   Ejecuta primero el script remote_access.sh de idealista_bot:"
    echo "   bash ~/idealista_bot/deploy/remote_access.sh"
    exit 1
fi

echo " ✔ Funnel activo: $FUNNEL_URL"
echo ""

# --- Añadir rutas al Funnel ---
echo " Añadiendo rutas al Funnel..."
echo ""

# /finance → portfolio tracker backend (puerto 8000)
echo "   → /finance → http://localhost:8000"
sudo tailscale serve https:443 /finance http://localhost:8000

# /hooks → webhook listener (puerto 9000)
echo "   → /hooks → http://localhost:9000"
sudo tailscale serve https:443 /hooks http://localhost:9000

echo ""
echo " Activando Funnel (si no está ya activo)..."
sudo tailscale funnel 443 on 2>/dev/null || true

echo ""
echo " ✔ Rutas añadidas al Funnel."
echo ""

# --- Mostrar configuración actual ---
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              FUNNEL CONFIGURADO                             ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  URL Base:        $FUNNEL_URL"
echo "║                                                              ║"
echo "║  Idealista Bot:   ${FUNNEL_URL%/}/"
echo "║  Portfolio:       ${FUNNEL_URL%/}/finance"
echo "║  Webhook:         ${FUNNEL_URL%/}/hooks/deploy-finance"
echo "║                                                              ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Verificar:                                                  ║"
echo "║    tailscale serve status                                   ║"
echo "║    curl ${FUNNEL_URL%/}/finance/api/health"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo " Siguiente paso: Configurar el webhook en GitHub"
echo ""
echo " 1. Ve a GitHub → tu repo → Settings → Webhooks → Add webhook"
echo " 2. Payload URL: ${FUNNEL_URL%/}/hooks/deploy-finance"
echo " 3. Content type: application/json"
echo " 4. Secret: (genera uno aleatorio y cópialo en deploy/hooks.json)"
echo " 5. Events: Just the push event"
echo " 6. Active: ✓"
echo ""
echo " Generar secret: openssl rand -hex 32"
echo ""
echo " Después de configurar, reinicia el webhook:"
echo "   sudo systemctl restart portfolio-webhook"
echo ""
echo " Para añadir más apps en el futuro:"
echo "   sudo tailscale serve https:443 /ruta http://localhost:PUERTO"
echo ""

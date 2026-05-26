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

# --- Añadir rutas al Funnel ---
echo " Configurando todas las rutas en el Funnel..."
echo ""
echo " IMPORTANTE: La sintaxis usada aquí es compatible con Tailscale 1.98.3."
echo ""

# Configurar rutas públicas con funnel + set-path (HTTPS 443)
echo "   → / → http://127.0.0.1:8501 (idealista_bot)"
sudo tailscale funnel --bg --https=443 --set-path=/ http://127.0.0.1:8501

echo "   → /finance → http://127.0.0.1:8000 (portfolio tracker)"
sudo tailscale funnel --bg --https=443 --set-path=/finance http://127.0.0.1:8000

echo "   → /hooks → http://127.0.0.1:9000 (webhook)"
sudo tailscale funnel --bg --https=443 --set-path=/hooks http://127.0.0.1:9000

echo ""
echo " Validando estado de Funnel..."
FUNNEL_URL=$(tailscale funnel status 2>/dev/null | grep -o 'https://[^ ]*' | head -1 || echo "")
if [[ -z "$FUNNEL_URL" ]]; then
    echo " ✘ No se pudo obtener la URL de Funnel."
    echo "   Revisa permisos/ACL de Funnel y vuelve a ejecutar."
    exit 1
fi

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
echo "║    tailscale funnel status                                  ║"
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
echo "   sudo tailscale funnel --bg --https=443 --set-path=/ruta http://127.0.0.1:PUERTO"
echo ""

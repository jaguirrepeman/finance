#!/usr/bin/env bash
# =============================================================================
# pi.sh — Operar y probar portfolio_tracker en la Raspberry Pi vía SSH
#
# Requiere un alias SSH en ~/.ssh/config (por defecto 'finance-rpi'):
#
#   Host finance-rpi
#       HostName 192.168.1.137
#       User raspberry
#       IdentityFile ~/.ssh/idealista_rpi
#       IdentitiesOnly yes
#       StrictHostKeyChecking accept-new
#
# Puedes sobreescribir el host con la variable FINANCE_PI_HOST.
#
# Uso:
#   bash deploy/pi.sh where      # localiza el proyecto en la Pi
#   bash deploy/pi.sh status     # estado de los servicios
#   bash deploy/pi.sh build      # npm ci + build del frontend (typecheck)
#   bash deploy/pi.sh deploy     # git pull + build + restart (update.sh)
#   bash deploy/pi.sh logs       # últimos logs del backend
#   bash deploy/pi.sh shell      # shell interactiva en la Pi
#   bash deploy/pi.sh exec '<cmd>'   # ejecuta un comando arbitrario en la Pi
# =============================================================================
set -euo pipefail

HOST="${FINANCE_PI_HOST:-finance-rpi}"

# Localiza en la Pi el directorio del proyecto (contiene backend/ frontend/ y
# deploy/update.sh). Ruta real conocida: ~/Documents/finance (usuario raspberry).
# Se puede fijar con FINANCE_PI_DIR para saltar la búsqueda.
remote_dir() {
    ssh "$HOST" "set -e
        if [ -n \"\${FINANCE_PI_DIR:-}\" ] && [ -f \"\$FINANCE_PI_DIR/deploy/update.sh\" ]; then
            echo \"\$FINANCE_PI_DIR\"; exit 0
        fi
        for d in ~/Documents/finance ~/Finance ~/finance ~/portfolio_tracker ~/*/ ~/*/*/ ; do
            d=\"\${d%/}\"
            if [ -f \"\$d/deploy/update.sh\" ] && [ -d \"\$d/backend\" ] && [ -d \"\$d/frontend\" ]; then
                echo \"\$d\"; exit 0
            fi
        done
        # Último recurso: deducir del servicio systemd
        wd=\$(systemctl show portfolio-tracker -p WorkingDirectory --value 2>/dev/null)
        [ -n \"\$wd\" ] && echo \"\${wd%/backend}\" && exit 0
        echo 'NO_ENCONTRADO' >&2; exit 1"
}

cmd="${1:-help}"
case "$cmd" in
    where)
        remote_dir
        ;;
    status)
        ssh "$HOST" 'echo "host: $(hostname) ($(whoami))";
            echo "--- servicios ---";
            systemctl is-active portfolio-tracker portfolio-webhook 2>/dev/null || true;
            echo "--- tailscale ---";
            command -v tailscale >/dev/null && tailscale status 2>/dev/null | head -3 || echo "(sin tailscale)"'
        ;;
    build)
        D="$(remote_dir)"
        echo "Proyecto en: $D"
        ssh "$HOST" "cd '$D/frontend' && npm ci --prefer-offline && npm run build"
        ;;
    deploy)
        D="$(remote_dir)"
        ssh "$HOST" "cd '$D' && bash deploy/update.sh"
        ;;
    logs)
        ssh "$HOST" 'sudo -n journalctl -u portfolio-tracker -n 50 --no-pager 2>/dev/null || journalctl -u portfolio-tracker -n 50 --no-pager'
        ;;
    shell)
        ssh -t "$HOST"
        ;;
    exec)
        shift
        ssh "$HOST" "$*"
        ;;
    *)
        echo "uso: pi.sh {where|status|build|deploy|logs|shell|exec '<cmd>'}"
        ;;
esac

#!/usr/bin/env bash
# =============================================================================
# render_hooks.sh — Genera deploy/hooks.json a partir del secreto de webhook.env
#
# El secreto del webhook NUNCA se versiona. Este script lo lee de
# deploy/webhook.env (o de la variable de entorno WEBHOOK_SECRET, que systemd
# inyecta vía EnvironmentFile) y escribe deploy/hooks.json con el secreto real.
#
# Se invoca como ExecStartPre del servicio portfolio-webhook, así que hooks.json
# se regenera en CADA arranque del listener. Esto es clave: update.sh hace
# `git reset --hard`, que restauraría un hooks.json versionado al placeholder;
# al estar hooks.json git-ignorado y regenerarse al reiniciar, el secreto real
# nunca se pierde.
#
# Uso manual:  WEBHOOK_SECRET=... bash deploy/render_hooks.sh
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Cargar el secreto desde webhook.env si no viene ya en el entorno
if [[ -z "${WEBHOOK_SECRET:-}" && -f "$SCRIPT_DIR/webhook.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$SCRIPT_DIR/webhook.env"
    set +a
fi

: "${WEBHOOK_SECRET:?Falta WEBHOOK_SECRET. Crea deploy/webhook.env (ver webhook.env.example).}"

OUT="$SCRIPT_DIR/hooks.json"
umask 077

# Serializamos con python para escapar el secreto de forma segura (comillas, etc.)
PROJECT_DIR="$PROJECT_DIR" WEBHOOK_SECRET="$WEBHOOK_SECRET" python3 - "$OUT" <<'PY'
import json, os, sys

out = sys.argv[1]
project_dir = os.environ["PROJECT_DIR"]
secret = os.environ["WEBHOOK_SECRET"]

hooks = [
    {
        "id": "deploy-finance",
        "execute-command": f"{project_dir}/deploy/update.sh",
        "command-working-directory": project_dir,
        "response-message": "Deploy triggered successfully",
        "trigger-rule": {
            "and": [
                {
                    "match": {
                        "type": "payload-hmac-sha256",
                        "secret": secret,
                        "parameter": {"source": "header", "name": "X-Hub-Signature-256"},
                    }
                },
                {
                    "match": {
                        "type": "value",
                        "value": "refs/heads/main",
                        "parameter": {"source": "payload", "name": "ref"},
                    }
                },
            ]
        },
    }
]

with open(out, "w") as f:
    json.dump(hooks, f, indent=2)
    f.write("\n")
PY

echo "render_hooks.sh: hooks.json regenerado en $OUT"

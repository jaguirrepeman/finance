# Portfolio Tracker — Deployment Guide

Guía completa para desplegar Portfolio Tracker como PWA en Raspberry Pi 4 con:
- **Tailscale Funnel** — acceso HTTPS permanente desde cualquier dispositivo sin instalar apps
- **Path-based routing** — coexiste con idealista_bot en la misma URL (`/finance`)
- **Auto-deploy** — push a GitHub → deploy automático en la Pi vía webhook

---

## Arquitectura

```
GitHub (push to main)
    ↓
Webhook HTTPS → https://<host>.tailnet-xxxx.ts.net/hooks/deploy-finance
    ↓
Tailscale Funnel (TLS termination)
    ↓
localhost:9000 (adnanh/webhook)
    ↓
deploy/update.sh (git pull + build + restart)
    ↓
systemctl restart portfolio-tracker (FastAPI en :8000)
```

**Servicios systemd en la Pi:**
- `portfolio-tracker.service` — FastAPI backend (puerto 8000)
- `portfolio-webhook.service` — GitHub webhook listener (puerto 9000)

> **Coordenadas reales de ESTE despliegue** (los ejemplos genéricos de abajo usan
> `pi@raspberrypi.local` / `~/Finance`, pero la instalación real es):
> - **Usuario:** `raspberry` · **IP LAN:** `192.168.1.137` · **Tailscale:** `100.114.2.16`
> - **Ruta del proyecto:** `~/Documents/finance` (`/home/raspberry/Documents/finance`)
> - **Acceso SSH:** alias `finance-rpi` en `~/.ssh/config` (clave `~/.ssh/idealista_rpi`)
> - **Helper:** `bash deploy/pi.sh {where|status|build|deploy|logs|shell}` desde el PC

**Rutas Funnel compartidas:**
- `/` → idealista_bot (puerto 8501)
- `/finance` → Portfolio Tracker (puerto 8000)
- `/hooks` → webhook listener (puerto 9000)

---

## Requisitos Previos

### En la Raspberry Pi 4

1. **Sistema operativo:** Raspberry Pi OS Bookworm (Debian 12) o Bullseye (Debian 11)
   - Verificar: `cat /etc/os-release`
   - Si tienes Buster o anterior, flashea la SD con [Raspberry Pi Imager](https://www.raspberrypi.com/software/)

2. **Tailscale + Funnel ya configurado** (por idealista_bot)
   - Si aún no lo tienes: `bash ~/idealista_bot/deploy/remote_access.sh`
   - Verificar: `tailscale funnel status` debe mostrar "Funnel on" con la ruta `/` activa

3. **Git configurado con SSH**
   - Generar clave SSH: `ssh-keygen -t ed25519 -C "raspberry"`
   - Añadir la clave pública a GitHub: Settings → SSH keys
   - Verificar: `ssh -T git@github.com`

### En tu PC (Windows)

1. **WinSCP** o similar para transferir archivos
2. **SSH client** (PowerShell nativo o PuTTY)

---

## Instalación (Primera Vez)

### Paso 1 — Transferir el proyecto a la Pi

Desde tu PC (Windows):

```powershell
# Opción A: Con WinSCP
# 1. Conecta a la Pi por SFTP
# 2. Crea la carpeta ~/Finance/
# 3. Copia backend/, frontend/, deploy/ (excluye .venv, node_modules, __pycache__)

# Opción B: Con SCP desde PowerShell
scp -r backend frontend deploy .gitignore pyproject.toml pi@raspberrypi.local:~/Finance/
```

**IMPORTANTE:** También copia:
- `backend/data/config.json` (API keys)
- `backend/data/*.csv` (transacciones)
- `.env` si lo usas

### Paso 2 — Ejecutar setup_raspberry.sh en la Pi

SSH a la Pi:

```bash
ssh pi@raspberrypi.local
cd ~/Finance/

# Dar permisos de ejecución a los scripts
chmod +x deploy/*.sh

# Instalación completa (Python, Poetry, Node.js, dependencias, build)
bash deploy/setup_raspberry.sh
```

Esto tarda ~10-15 minutos la primera vez. Instala:
- Python 3.12+ (si no está)
- Poetry (gestor de dependencias Python)
- Node.js 20+ (para Vite)
- Todas las dependencias del proyecto
- Build inicial del frontend

### Paso 3 — Instalar servicios systemd

```bash
bash deploy/install_service.sh
```

Esto:
- Instala `webhook` (si no existe)
- Crea y arranca `portfolio-tracker.service` (backend)
- Crea y arranca `portfolio-webhook.service` (listener)
- Verifica que ambos están activos

### Paso 4 — Añadir rutas al Funnel

```bash
bash deploy/add_to_funnel.sh
```

Esto:
- Verifica que Tailscale está conectado
- **Restaura la ruta `/` para idealista_bot** (puerto 8501)
- Añade `/finance` → puerto 8000 (portfolio tracker)
- Añade `/hooks` → puerto 9000 (webhook)
- Muestra la URL pública completa

**⚠️ IMPORTANTE:** `tailscale serve` sobrescribe la configuración completa, por eso el script restaura TODAS las rutas (incluyendo idealista_bot).

**Resultado:** 
- Idealista Bot: `https://<host>.tailnet-xxxx.ts.net/`
- Portfolio Tracker: `https://<host>.tailnet-xxxx.ts.net/finance`

### Paso 5 — Configurar webhook en GitHub

El secreto **no se versiona**: vive en `deploy/webhook.env` (git-ignorado) y
`install_service.sh` lo genera automáticamente. `hooks.json` ya no se edita a
mano — lo regenera `render_hooks.sh` en cada arranque del listener (vía
`ExecStartPre`), de modo que sobrevive al `git reset --hard` de cada deploy.

1. **Obtener el secreto generado.** `install_service.sh` (Paso 3) ya creó
   `deploy/webhook.env` y mostró el secreto por pantalla. Para verlo de nuevo:
   ```bash
   cat deploy/webhook.env        # WEBHOOK_SECRET=...
   ```
   Para forzar uno propio antes de instalar: `WEBHOOK_SECRET=$(openssl rand -hex 24) bash deploy/install_service.sh`

2. **Configurar webhook en GitHub:**
   - Ve a tu repo → Settings → Webhooks → Add webhook
   - **Payload URL:** `https://<host>.tailnet-xxxx.ts.net/hooks/deploy-finance`
   - **Content type:** `application/json`
   - **Secret:** (el valor de `WEBHOOK_SECRET` en `deploy/webhook.env`)
   - **Events:** Just the push event
   - **Branch:** `main` (o la rama que uses)
   - **Active:** ✓

3. **Reiniciar el webhook listener** (regenera `hooks.json` con el secreto):
   ```bash
   sudo systemctl restart portfolio-webhook
   ```

5. **Verificar:**
   - Haz un push a `main` con un cambio trivial
   - En GitHub, ve a Settings → Webhooks → Recent Deliveries
   - Debe mostrar "200 OK"
   - En la Pi: `tail -f logs/deploy.log` muestra el despliegue

---

## Generar Iconos PWA (Pendiente)

El PWA necesita iconos de 192x192 y 512x512 píxeles. Opciones:

### Opción A — Online (más fácil)

1. Ve a https://realfavicongenerator.net/
2. Sube `frontend/public/favicon.svg`
3. Descarga el paquete (incluye todos los tamaños)
4. Copia `pwa-192.png` y `pwa-512.png` a `frontend/public/`

### Opción B — Local (con Inkscape o ImageMagick)

```bash
# Instalar ImageMagick
sudo apt install imagemagick

# Convertir SVG a PNG (192x192)
convert -background none -resize 192x192 frontend/public/favicon.svg frontend/public/pwa-192.png

# Convertir SVG a PNG (512x512)
convert -background none -resize 512x512 frontend/public/favicon.svg frontend/public/pwa-512.png
```

Después de generar los iconos:

```bash
cd frontend
npm run build
sudo systemctl restart portfolio-tracker
```

---

## Uso Diario

### Acceso al Dashboard

| Desde dónde | URL |
|-------------|-----|
| **Cualquier dispositivo** (sin Tailscale instalado) | `https://<host>.tailnet-xxxx.ts.net/finance` |
| **Dispositivos con Tailscale** | `http://<pi-tailscale-ip>:8000` |
| **Misma WiFi que la Pi** | `http://raspberrypi.local:8000` |

### Instalar como PWA en Móvil

1. Abre `https://<host>.tailnet-xxxx.ts.net/finance` en Chrome/Safari
2. Toca el menú (⋮ o 􀆊)
3. "Añadir a la pantalla de inicio" / "Add to Home Screen"
4. El icono aparece en tu móvil como una app nativa

### Desarrollo en Local (PC)

Para desarrollo, sigue usando tu entorno local:

```bash
# En tu PC Windows
cd Finance
.venv\Scripts\activate
cd backend
poetry run uvicorn app.main:app --reload

# En otra terminal
cd frontend
npm run dev
```

Cuando hagas push a `main`, la Pi se actualiza sola.

### Forzar Actualización Manual

Si necesitas actualizar sin hacer push:

```bash
ssh pi@raspberrypi.local
cd ~/Finance
bash deploy/update.sh
```

---

## Comandos Útiles

### Ver logs en tiempo real

```bash
# Backend (FastAPI)
sudo journalctl -u portfolio-tracker -f

# Webhook listener
sudo journalctl -u portfolio-webhook -f

# Deploy logs (git pull + build + restart)
tail -f ~/Finance/logs/deploy.log
```

### Reiniciar servicios

```bash
# Reiniciar backend (tras cambios en .env o data/)
sudo systemctl restart portfolio-tracker

# Reiniciar webhook (tras cambios en hooks.json)
sudo systemctl restart portfolio-webhook
```

### Verificar estado

```bash
# Estado de servicios
systemctl status portfolio-tracker
systemctl status portfolio-webhook

# Estado de Tailscale Funnel (Tailscale 1.98+)
tailscale funnel status

# Health check del API
curl https://<host>.tailnet-xxxx.ts.net/finance/api/health
```

### Tailscale Funnel

```bash
# Ver configuración actual (Tailscale 1.98+)
tailscale funnel status

# Añadir nueva ruta pública
sudo tailscale funnel --bg --https=443 --set-path=/nueva-app http://127.0.0.1:8502

# Desactivar una ruta concreta
sudo tailscale funnel --https=443 --set-path=/nueva-app off

# Reset completo de Funnel (si necesitas limpiar todo)
sudo tailscale funnel reset
```

---

## Estructura del Proyecto en la Pi

```
~/Finance/
├── backend/
│   ├── app/                     # Código FastAPI
│   ├── data/
│   │   ├── config.json          # API keys (Git-ignored)
│   │   ├── *.csv                # Transacciones (Git-ignored)
│   │   └── calculated/          # Cache JSON (Git-ignored)
│   ├── pyproject.toml
│   └── .venv/                   # Entorno virtual Python
├── frontend/
│   ├── dist/                    # Build Vite (servido por FastAPI)
│   ├── node_modules/
│   ├── public/
│   │   ├── pwa-192.png          # Icono PWA 192x192
│   │   └── pwa-512.png          # Icono PWA 512x512
│   ├── src/
│   ├── vite.config.ts
│   └── package.json
├── deploy/
│   ├── setup_raspberry.sh       # Instalación inicial
│   ├── install_service.sh       # Crear servicios systemd
│   ├── add_to_funnel.sh         # Configurar Funnel
│   ├── update.sh                # Script de deploy (llamado por webhook)
│   ├── render_hooks.sh          # Genera hooks.json desde el secreto (ExecStartPre)
│   ├── webhook.env.example      # Plantilla del secreto (copiar a webhook.env, git-ignorado)
│   ├── sudoers-portfolio.template  # Regla NOPASSWD para reiniciar el backend
│   ├── hooks.json               # (generado, git-ignorado) configuración del webhook
│   ├── portfolio-tracker.service
│   └── portfolio-webhook.service
├── logs/
│   └── deploy.log               # Historial de deploys
└── .git/
```

---

## Troubleshooting

### 502 en /finance (copy/paste en Raspberry)

Si `curl -i http://127.0.0.1:8000/api/health` falla, el problema es el backend.
Si ese curl local funciona pero la URL pública da 502, el problema es Funnel/routing.

```bash
# 0) Ir al proyecto
cd ~/Finance

# 1) Actualizar código
git pull

# 2) Reiniciar backend y ver estado
sudo systemctl daemon-reload
sudo systemctl restart portfolio-tracker.service
sleep 2
sudo systemctl --no-pager --full status portfolio-tracker.service | sed -n '1,80p'
sudo journalctl -u portfolio-tracker.service -n 120 --no-pager

# 3) Comprobar backend local
curl -i http://127.0.0.1:8000/api/health
```

Si el curl local sigue fallando, prueba arranque manual para ver el traceback real:

```bash
cd ~/Finance/backend
poetry run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Si el curl local funciona pero fuera sigue 502:

```bash
cd ~/Finance
bash deploy/add_to_funnel.sh
tailscale funnel status
curl -i https://<host>.ts.net/finance/api/health
```

Opcional (ver puertos escuchando):

```bash
sudo ss -ltnp | grep -E ':8000|:8501|:9000'
```

### El backend no arranca

```bash
# Ver logs completos
sudo journalctl -u portfolio-tracker -n 50

# Verificar permisos de data/
ls -la ~/Finance/backend/data/

# Verificar que Poetry está en el PATH del servicio
cat /etc/systemd/system/portfolio-tracker.service | grep ExecStart

# Probar arranque manual
cd ~/Finance/backend
poetry run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Si ves este error:

```text
ValueError: Can't patch loop of type ...
```

Significa que `nest_asyncio` intentó parchear `uvloop` (no compatible en runtime de producción).

Pasos:

```bash
cd ~/Finance
git pull
sudo systemctl restart portfolio-tracker.service
sudo journalctl -u portfolio-tracker.service -n 120 --no-pager
curl -i http://127.0.0.1:8000/api/health
```

### El webhook no recibe eventos de GitHub

1. **Verificar que el webhook está activo:**
   ```bash
   sudo systemctl status portfolio-webhook
   sudo journalctl -u portfolio-webhook -f
   ```

2. **Verificar que el puerto 9000 está mapeado en Funnel:**
   ```bash
   tailscale funnel status
   # Debe mostrar: /hooks → http://127.0.0.1:9000
   ```

3. **En GitHub → Settings → Webhooks → Recent Deliveries:**
   - Si "Connection timeout": el Funnel no está activo o el servicio webhook no escucha
   - Si "401 Unauthorized": el secret de GitHub no coincide con `deploy/webhook.env`
     (tras editar `webhook.env`, `sudo systemctl restart portfolio-webhook`)
   - Si "200 OK" pero no se despliega: revisar `logs/deploy.log`. Si descarga pero
     no reinicia, falta la regla sudoers → `bash deploy/install_service.sh`
   - Si "200 OK" con respuesta de 2 bytes y `deploy.log` NO cambia: el hook no
     casa por la ruta. El Funnel monta `/hooks` → `:9000` **quitando** el prefijo
     `/hooks`, así que el webhook debe servir en la raíz (`-urlprefix ""`, ya en
     `portfolio-webhook.service`) y el Payload URL de GitHub debe ser
     `…/hooks/deploy-finance`. Comprueba el mapeo real:
     ```bash
     # a través del Funnel: la ruta correcta debe dar 403 (firma), no 404/200
     curl -s -o /dev/null -w '%{http_code}\n' -X POST \
       https://<host>.tailnet-xxxx.ts.net/hooks/deploy-finance
     ```

### La PWA no muestra el prompt de instalación

- **Requisito:** HTTPS (Funnel lo provee automáticamente)
- **Verificar manifest:** Abre DevTools → Application → Manifest
- **Verificar service worker:** Application → Service Workers
- **Regenerar build:** `cd frontend && npm run build && sudo systemctl restart portfolio-tracker`

### El auto-deploy no funciona

```bash
# Verificar logs del webhook
sudo journalctl -u portfolio-webhook -n 30

# Verificar logs del deploy
tail -50 ~/Finance/logs/deploy.log

# Probar update.sh manualmente
bash ~/Finance/deploy/update.sh
```

### Se rompió la URL de idealista_bot tras añadir finance

**Causa:** `tailscale serve` sobrescribe todas las rutas existentes. Si solo añades `/finance`, pierdes la ruta `/` de idealista_bot.

**Solución rápida (Tailscale 1.98+):**
```bash
# Restaurar todas las rutas con funnel explícito
sudo tailscale funnel --bg --https=443 --set-path=/ http://127.0.0.1:8501
sudo tailscale funnel --bg --https=443 --set-path=/finance http://127.0.0.1:8000
sudo tailscale funnel --bg --https=443 --set-path=/hooks http://127.0.0.1:9000

# Verificar
tailscale funnel status
```

**Solución automática:**
```bash
# El script add_to_funnel.sh ya restaura todas las rutas
bash ~/Finance/deploy/add_to_funnel.sh
```

**Verificar que todo funciona:**
```bash
# Debe mostrar "Funnel on" y las 3 rutas
tailscale funnel status

# Probar idealista_bot
curl https://raspberrypi.tailf2dda1.ts.net/

# Probar portfolio tracker
curl https://raspberrypi.tailf2dda1.ts.net/finance/api/health
```

---

## Seguridad

### ¿Es seguro exponer el dashboard públicamente?

**Sí, con Tailscale Funnel:**
- El tráfico está cifrado (HTTPS con certificados de Tailscale)
- Solo tu cuenta de Tailscale puede acceder (Funnel requiere autenticación en la primera visita desde un dispositivo nuevo)
- La URL es aleatoria y no indexable por buscadores
- No hay autenticación en el dashboard porque Funnel ya protege el acceso

**Para mayor seguridad:**
- Usa contraseñas fuertes en tu cuenta de Tailscale
- Activa 2FA en tu cuenta de Tailscale
- Mantén actualizada la Pi: `sudo apt update && sudo apt upgrade`

### Webhook secret

El webhook usa HMAC-SHA256 para verificar que las peticiones vienen de GitHub:
- GitHub firma cada payload con tu secret
- `adnanh/webhook` verifica la firma antes de ejecutar el script
- Sin el secret correcto, el webhook rechaza la petición

---

## Mantenimiento

### Actualizar dependencias

```bash
# En tu PC (desarrollo)
cd frontend
npm update
npm run build

cd ../backend
poetry update

# Commit y push → la Pi se actualiza sola
git add .
git commit -m "chore: update dependencies"
git push
```

### Backup

Los datos SQLite están en `~/.local/share/portfolio_tracker/` (Linux) o `%LOCALAPPDATA%\portfolio_tracker\` (Windows). Haz backup periódico:

```bash
# En la Pi
tar -czf portfolio-backup-$(date +%Y%m%d).tar.gz \
  ~/.local/share/portfolio_tracker/ \
  ~/Finance/backend/data/

# Copiar a tu PC
scp pi@raspberrypi.local:~/portfolio-backup-*.tar.gz .
```

### Restaurar tras flashear la SD

1. Flashea la SD con Raspberry Pi OS Bookworm
2. Conéctate por SSH
3. Copia el backup: `scp portfolio-backup-*.tar.gz pi@raspberrypi.local:~`
4. Descomprime: `tar -xzf portfolio-backup-*.tar.gz -C ~`
5. Sigue los pasos de instalación normales

---

## Próximos Pasos

- [ ] Generar iconos PWA (pwa-192.png, pwa-512.png)
- [ ] Configurar webhook secret en GitHub
- [ ] Instalar PWA en tu móvil
- [ ] Probar auto-deploy con un commit trivial

---

## Recursos

- **Tailscale Docs:** https://tailscale.com/kb/1247/funnel-serve-use-cases/
- **Vite PWA Plugin:** https://vite-pwa-org.netlify.app/
- **adnanh/webhook:** https://github.com/adnanh/webhook
- **FastAPI Docs:** https://fastapi.tiangolo.com/

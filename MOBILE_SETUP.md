# Portfolio Tracker — Mobile PWA Setup

This project is now configured as a Progressive Web App (PWA) that can be deployed to a Raspberry Pi 4 and accessed from any device via HTTPS.

## What Was Implemented

✅ **Frontend PWA Configuration**
- Vite PWA plugin with auto-update
- Service worker for offline caching
- App manifest for "Add to Home Screen"
- Mobile-friendly meta tags
- Base path `/finance/` for Tailscale Funnel routing

✅ **Backend Adaptation**
- `root_path` support for sub-path deployment
- Permissive CORS for remote access
- Cross-platform data paths (Windows/Linux/macOS)

✅ **Deployment Infrastructure**
- Systemd service templates (backend + webhook)
- Setup scripts for Raspberry Pi 4
- GitHub webhook auto-deploy
- Tailscale Funnel integration
- Complete deployment documentation

## Next Steps

### 1. Generate PWA Icons (Required)

The PWA needs 192x192 and 512x512 pixel icons. Two options:

**Option A — Online (easiest):**
1. Go to https://realfavicongenerator.net/
2. Upload [frontend/public/favicon.svg](frontend/public/favicon.svg)
3. Download the package
4. Copy `pwa-192.png` and `pwa-512.png` to `frontend/public/`

**Option B — Local (requires ImageMagick):**
```bash
convert -background none -resize 192x192 frontend/public/favicon.svg frontend/public/pwa-192.png
convert -background none -resize 512x512 frontend/public/favicon.svg frontend/public/pwa-512.png
```

### 2. Install Dependencies

Before deploying, you need to install the PWA plugin:

```bash
cd frontend
npm install
```

### 3. Test Locally (Optional)

Test the PWA configuration on your PC:

```bash
# Build frontend with PWA support
cd frontend
npm run build

# Start backend with root_path
cd ../backend
$env:ROOT_PATH="/finance"
poetry run uvicorn app.main:app --reload

# Access at http://localhost:8000/finance/
```

### 4. Deploy to Raspberry Pi

See the complete guide in [deploy/README.md](deploy/README.md).

Quick overview:
1. Transfer project to Pi
2. Run `bash deploy/setup_raspberry.sh` (installs everything)
3. Run `bash deploy/install_service.sh` (creates services)
4. Run `bash deploy/add_to_funnel.sh` (exposes via HTTPS)
5. Configure GitHub webhook for auto-deploy

## Access URLs After Deployment

| Device | URL |
|--------|-----|
| **Any browser** (no app needed) | `https://<hostname>.tailnet-xxxx.ts.net/finance` |
| **Devices with Tailscale** | `http://<pi-ip>:8000` |
| **Same WiFi as Pi** | `http://raspberrypi.local:8000` |

## Architecture

```
┌─────────────────────────────────────────────┐
│  GitHub (main branch)                       │
└────────────┬────────────────────────────────┘
             │ push triggers webhook
             ↓
┌─────────────────────────────────────────────┐
│  Tailscale Funnel (HTTPS)                   │
│  https://<host>.tailnet-xxxx.ts.net         │
│                                              │
│  /         → Idealista Bot (8501)           │
│  /finance  → Portfolio Tracker (8000) ←     │
│  /hooks    → Webhook Listener (9000)        │
└─────────────────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────┐
│  Raspberry Pi 4                              │
│                                              │
│  • portfolio-tracker (systemd)              │
│  • portfolio-webhook (systemd)              │
│  • SQLite DBs in ~/.local/share/            │
└─────────────────────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| [frontend/vite.config.ts](frontend/vite.config.ts) | PWA configuration |
| [frontend/index.html](frontend/index.html) | PWA meta tags |
| [backend/app/main.py](backend/app/main.py) | `root_path` + CORS |
| [deploy/setup_raspberry.sh](deploy/setup_raspberry.sh) | Initial setup script |
| [deploy/install_service.sh](deploy/install_service.sh) | Install systemd services |
| [deploy/add_to_funnel.sh](deploy/add_to_funnel.sh) | Configure Tailscale Funnel |
| [deploy/update.sh](deploy/update.sh) | Deploy script (called by webhook) |
| [deploy/hooks.json](deploy/hooks.json) | Webhook configuration |
| [deploy/README.md](deploy/README.md) | **Full deployment guide** |

## Benefits

✅ **Single Database** — Desktop and mobile share the same SQLite DBs on the Pi
✅ **No App Store** — Install directly from browser (PWA)
✅ **Auto-Deploy** — Push to GitHub → Pi updates automatically
✅ **Works Everywhere** — HTTPS URL accessible from any device
✅ **Coexists with Idealista Bot** — Both apps under the same Funnel domain
✅ **Offline Support** — Service worker caches API responses

## Support

For full deployment instructions, troubleshooting, and maintenance guide:
👉 **[deploy/README.md](deploy/README.md)**

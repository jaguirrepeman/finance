"""
main.py — Entrypoint FastAPI del Portfolio Tracker.

Usa el patrón lifespan moderno y el PortfolioClient async.

Ejecutar con:
    cd backend
    poetry run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
"""

import logging
import os
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api import endpoints
from .services.http_client import close_http_client
from .services.portfolio_service import load_json, run_analytics_pipeline

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lifespan (reemplaza @app.on_event("startup") deprecado)
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gestiona el ciclo de vida de la app: startup → yield → shutdown."""
    # --- Startup ---
    cached_summary = load_json("summary.json")
    if cached_summary:
        logger.info("Cache found — serving instantly. Background refresh started.")
    else:
        logger.info("No cache — building data in background thread.")

    # Lanzar pipeline en background thread (no bloquea el arranque)
    t = threading.Thread(
        target=run_analytics_pipeline,
        kwargs={"force_download": False},
        daemon=True,
    )
    t.start()

    yield  # La app está corriendo

    # --- Shutdown ---
    await close_http_client()
    logger.info("Application shutdown complete.")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

# Read ROOT_PATH from environment (for Tailscale Funnel path-based routing)
ROOT_PATH = os.environ.get("ROOT_PATH", "")

app = FastAPI(
    title="Portfolio Tracker API",
    description="Backend para el dashboard de Portfolio Financiero",
    version="0.3.0",
    lifespan=lifespan,
    root_path=ROOT_PATH,
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

# Permissive CORS for single-user remote access via Tailscale
# Safe since: private Tailscale network + no auth tokens in CORS-protected headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Compress large JSON responses (history_batch, real-evolution, etc.)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(endpoints.router, prefix="/api/portfolio", tags=["portfolio"])

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.get("/api/health", tags=["system"])
def health_check():
    """Endpoint de salud."""
    return {"status": "ok", "version": app.version}


# ---------------------------------------------------------------------------
# Frontend estático (Vite build output)
# ---------------------------------------------------------------------------

FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
FRONTEND_LEGACY = Path(__file__).resolve().parent.parent.parent / "frontend-deprecated"

# Choose whichever exists — prefer new Vite build, fallback to legacy
FRONTEND_DIR = FRONTEND_DIST if FRONTEND_DIST.is_dir() else FRONTEND_LEGACY

if FRONTEND_DIR.is_dir():
    # SPA catch-all: any non-API, non-file route → index.html
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        file_path = FRONTEND_DIR / full_path
        if full_path and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(FRONTEND_DIR / "index.html"))

    app.mount(
        "/assets",
        StaticFiles(directory=str(FRONTEND_DIR / "assets"))
        if (FRONTEND_DIR / "assets").is_dir()
        else StaticFiles(directory=str(FRONTEND_DIR)),
        name="assets",
    )

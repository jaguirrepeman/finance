"""
main.py — Entrypoint FastAPI del Portfolio Tracker.

Ejecutar con:
    cd backend
    poetry run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
"""

import logging
import os
import threading

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .api import endpoints
from .services.portfolio_service import load_json, run_analytics_pipeline

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Portfolio Tracker API",
    description="Backend para el dashboard de Portfolio Financiero",
    version="0.2.0",
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",      # Vite dev
        "http://localhost:3000",      # CRA / alt dev
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",     # Self-serve (frontend estático)
        "http://localhost:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(endpoints.router, prefix="/api/portfolio", tags=["portfolio"])


# ---------------------------------------------------------------------------
# Startup: background refresh de datos (sin bloquear arranque)
# ---------------------------------------------------------------------------

@app.on_event("startup")
def startup_background_refresh():
    """Al arrancar, si ya hay caché JSON sirve al instante. Lanza recálculo en hilo aparte."""
    cached_summary = load_json("summary.json")
    if cached_summary:
        logging.getLogger(__name__).info("Cache found — serving instantly. Background refresh started.")
    else:
        logging.getLogger(__name__).info("No cache — building data in background thread.")
    # Siempre lanzar refresh en background para actualizar datos
    t = threading.Thread(target=run_analytics_pipeline, kwargs={"force_download": False}, daemon=True)
    t.start()


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/api/health", tags=["system"])
def health_check():
    """Endpoint de salud para verificar que el backend está vivo."""
    return {"status": "ok", "version": app.version}


# ---------------------------------------------------------------------------
# Servir frontend estático (index.html + assets)
# ---------------------------------------------------------------------------

FRONTEND_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend"
)

if os.path.isdir(FRONTEND_DIR):
    @app.get("/", include_in_schema=False)
    def serve_index():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

    app.mount("/", StaticFiles(directory=FRONTEND_DIR), name="frontend")

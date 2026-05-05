"""
main_v2.py — Entrypoint FastAPI del Portfolio Tracker (v2 async).

Usa el patrón lifespan moderno y el PortfolioClient v2 async.

Ejecutar con:
    cd backend
    poetry run uvicorn app.main_v2:app --host 127.0.0.1 --port 8000 --reload
"""

import logging
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from .api import endpoints
from .services.http_client import close_http_client
from .services.portfolio_service_v2 import load_json, run_analytics_pipeline

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

app = FastAPI(
    title="Portfolio Tracker API",
    description="Backend para el dashboard de Portfolio Financiero (v2 async)",
    version="0.3.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
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
# Health check
# ---------------------------------------------------------------------------


@app.get("/api/health", tags=["system"])
def health_check():
    """Endpoint de salud."""
    return {"status": "ok", "version": app.version}


# ---------------------------------------------------------------------------
# Frontend estático
# ---------------------------------------------------------------------------

FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"

if FRONTEND_DIR.is_dir():

    @app.get("/", include_in_schema=False)
    def serve_index():
        return FileResponse(str(FRONTEND_DIR / "index.html"))

    @app.get("/components.js", include_in_schema=False)
    def serve_components_js():
        """Serve components.js sin cache para que el navegador siempre cargue la versión más reciente."""
        with open(str(FRONTEND_DIR / "components.js"), "rb") as f:
            content = f.read()
        return Response(
            content=content,
            media_type="application/javascript",
            headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
        )

    @app.get("/style.css", include_in_schema=False)
    def serve_style_css():
        """Serve style.css sin cache."""
        with open(str(FRONTEND_DIR / "style.css"), "rb") as f:
            content = f.read()
        return Response(
            content=content,
            media_type="text/css",
            headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
        )

    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR)), name="frontend")

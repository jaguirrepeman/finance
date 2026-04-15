from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
from .api import endpoints

app = FastAPI(
    title="Portfolio Tracker API",
    description="Backend para el dashboard de Portfolio Financiero",
    version="0.1.0"
)

# Configurar CORS para permitir acceso desde el frontend (Vite React por defecto en port 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(endpoints.router, prefix="/api/portfolio", tags=["portfolio"])

# Mount the frontend directory correctly. Assuming 'frontend' is adjacent to 'backend'.
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend")

@app.get("/")
def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

# Montar todo el directorio (cuidado con el orden, root endpoint arriba)
app.mount("/", StaticFiles(directory=FRONTEND_DIR), name="frontend")

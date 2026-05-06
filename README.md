# Portfolio Tracker

Dashboard de seguimiento de cartera de fondos de inversión con backend FastAPI y frontend React.

## Arquitectura

```
start_dashboard.bat          ← Lanza servidor + abre navegador
backend/
├── app/
│   ├── main.py              ← Entrypoint FastAPI (lifespan, CORS, static files)
│   ├── client.py            ← PortfolioClient: fachada sync sobre async core
│   ├── client_async.py      ← AsyncPortfolioCore: toda la lógica de negocio
│   ├── api/
│   │   └── endpoints.py    ← 22 endpoints REST
│   ├── schemas/
│   │   └── portfolio.py    ← Modelos Pydantic (request/response)
│   └── services/
│       ├── cache_store.py       ← Cache SQLite unificado con TTL (evita OneDrive)
│       ├── core_portfolio.py    ← Motor FIFO: parsing órdenes, posiciones, lotes
│       ├── data_providers.py    ← Proveedores async (Finect, FT, YFinance, FMP)
│       ├── finect_provider.py   ← Proveedor sync Finect + resolución sitemap
│       ├── fund_classifier.py   ← Clasificación de fondos (RV/RF/CASH/ALT)
│       ├── http_client.py       ← Singleton httpx.AsyncClient con retry/backoff
│       ├── portfolio_service.py ← Servicio central: adapta client → endpoints
│       ├── region_normalizer.py ← Normalización regiones/sectores multi-proveedor
│       ├── tax_calculator.py    ← Optimizador fiscal FIFO (tramos ahorro España)
│       └── utils.py             ← Utilidades compartidas (run_sync, safe_float)
├── data/
│   ├── config.json
│   ├── Órdenes 1238478.tsv ← Datos de órdenes (fuente canónica)
│   └── calculated/          ← JSONs pre-calculados (cache de API)
├── notebooks/
│   └── portfolio_tracker.ipynb  ← Réplica interactiva del dashboard
└── tests/
    └── *.py                 ← Tests pytest
frontend/
├── index.html               ← SPA entry point
├── components.jsx           ← UI React (pre-compilado a .js)
└── style.css                ← Dark theme glassmorphism
```

## Flujo de datos

```
TSV/Excel órdenes
    → Portfolio (FIFO engine)
        → CompositeAsyncProvider (Finect/FT/YFinance/FMP)
            → AsyncPortfolioCore (lógica de negocio)
                → PortfolioClient (fachada sync)
                    → portfolio_service (adapter)
                        → endpoints.py (REST API)
                            → React frontend
```

## Patrón clave: thin-notebook / thick-backend

1. **Toda lógica de cálculo vive en `services/`** — nunca en notebooks ni en endpoints.
2. **`PortfolioClient`** es la fachada única — notebooks y endpoints la consumen igual.
3. **Notebooks solo visualizan** — llaman `client.method()` y muestran resultados.

## Quick Start

```bash
# Opción 1: Script automático (Windows)
start_dashboard.bat

# Opción 2: Manual
cd backend
poetry install
poetry run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
# Abrir http://127.0.0.1:8000
```

## Desarrollo

```bash
cd backend
poetry install

# Ejecutar tests
poetry run pytest tests/ -v

# Smoke test rápido
poetry run python tests/smoke_test.py
```

## Stack

| Componente | Tecnología |
|------------|-----------|
| Backend    | FastAPI + uvicorn |
| Data       | pandas, httpx (async), yfinance |
| Cache      | SQLite (WAL mode) con TTL |
| Frontend   | React (vanilla, sin bundler) |
| Gestión deps | Poetry |
| Runtime    | Python 3.10+ |

## Proveedores de datos (orden de prioridad)

| Dato | Cadena de fallback |
|------|-------------------|
| NAV (precio actual) | Finect → YFinance → FMP |
| Historial precios | YFinance → FMP (merge longest) |
| Info/Sectores/Regiones | Finect → FT → YFinance → FMP |
| Holdings | Finect → FT |

## Endpoints principales

| Método | Path | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/portfolio/summary` | Resumen de cartera |
| GET | `/api/portfolio/details` | Detalles por fondo (sector/región) |
| GET | `/api/portfolio/history_batch` | Histórico de precios |
| GET | `/api/portfolio/correlation` | Matriz de correlación |
| GET | `/api/portfolio/positions` | Posiciones con P&L |
| GET | `/api/portfolio/open-lots` | Lotes FIFO abiertos |
| POST | `/api/portfolio/tax-optimize` | Plan de retirada fiscal óptimo |
| GET | `/api/portfolio/fund/{isin}/details` | Detalle completo de un fondo |
| POST | `/api/portfolio/simulate` | Simulación de incorporación |
| GET | `/api/portfolio/evolution-metrics` | Métricas de evolución |
| POST | `/api/portfolio/refresh-nav` | Refrescar cotizaciones |
| POST | `/api/portfolio/refresh-details` | Refrescar detalles |

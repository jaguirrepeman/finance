"""
endpoints.py — API REST del Portfolio Tracker.

Usa portfolio_service.py (clases modernas) en vez del código deprecated.
Mantiene compatibilidad con las shapes de respuesta del frontend existente.
Añade nuevos endpoints: /positions, /open-lots, /tax-optimize, /fund/{isin}/details.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile, File
import os
import shutil
from typing import List

from ..schemas.portfolio import (
    AnalysisResponse,
    FundBase,
    PositionsResponse,
    PositionItem,
    OpenLotItem,
    TaxOptimizeRequest,
    TaxOptimizeResponse,
    TaxPlanStep,
    FundDetailResponse,
)
from ..services.portfolio_service import (
    CACHE_DIR,
    EXCEL_PATH,
    load_json,
    build_summary,
    build_details,
    build_history_batch,
    build_correlation,
    run_analytics_pipeline,
    get_portfolio_client,
    reset_client,
    safe_float,
)

router = APIRouter()


# =========================================================================
# Endpoints existentes (compatibilidad frontend)
# =========================================================================

@router.get("/summary", response_model=AnalysisResponse)
async def get_portfolio_summary(background_tasks: BackgroundTasks):
    """Devuelve el resumen del portfolio (desde caché JSON). Lanza build en background si no hay caché."""
    cached = load_json("summary.json")
    if cached:
        return cached

    # No cache — return placeholder and build in background
    background_tasks.add_task(run_analytics_pipeline, force_download=False)
    return {
        "summary": {"total_rv": 0, "total_rf": 0, "total_cash": 0, "total_alt": 0, "details": {}},
        "funds": [],
        "recommendation": {"rf_sug": {"title": "Cargando...", "text": "Primera carga en curso. Los datos aparecerán en unos segundos. Refresca la página."}},
    }


@router.get("/enrich", response_model=AnalysisResponse)
async def get_enriched_portfolio(background_tasks: BackgroundTasks):
    """Lanza recálculo en background y devuelve la última caché."""
    background_tasks.add_task(run_analytics_pipeline, force_download=True)

    cached = load_json("summary.json")
    if not cached:
        try:
            cached = build_summary()
        except Exception:
            cached = {
                "summary": {"total_rv": 0, "total_rf": 0, "total_cash": 0, "total_alt": 0, "details": {}},
                "funds": [],
                "recommendation": {},
            }

    cached["recommendation"] = {
        "rf_sug": {
            "title": "Cálculo en Proceso (Background)",
            "text": "El motor de datos está ejecutándose en paralelo. Refresca la ventana en unos segundos.",
        }
    }
    return cached


@router.get("/history_batch")
async def get_history_batch(background_tasks: BackgroundTasks):
    """Histórico de precios por fondo. Sirve caché siempre; recalcula en background si no hay."""
    cached = load_json("history_batch.json")
    if cached:
        return cached
    # No cache — trigger background build and return empty
    background_tasks.add_task(run_analytics_pipeline, force_download=False)
    return {}


@router.get("/details")
async def get_portfolio_details(background_tasks: BackgroundTasks):
    """Detalles sector/región por fondo. Sirve caché siempre."""
    cached = load_json("details.json")
    if cached:
        return cached
    background_tasks.add_task(run_analytics_pipeline, force_download=False)
    return {}


@router.get("/correlation")
async def get_portfolio_correlation(background_tasks: BackgroundTasks):
    """Matriz de correlación entre fondos. Sirve caché siempre."""
    cached = load_json("correlation.json", {"labels": [], "matrix": {}})
    if cached and cached.get("labels"):
        return cached
    # No cache — trigger background build
    background_tasks.add_task(run_analytics_pipeline, force_download=False)
    return {"labels": [], "matrix": {}}


@router.post("/")
async def add_fund(fund: FundBase, background_tasks: BackgroundTasks):
    """Añade un fondo al portfolio (nota: con sistema FIFO, esto es informativo)."""
    # Con el sistema FIFO basado en Excel, esta operación es limitada.
    # Se mantiene por compatibilidad con el frontend pero se recomienda
    # importar el Excel actualizado via /upload-orders.
    background_tasks.add_task(run_analytics_pipeline, force_download=False)
    return {"message": "✅ Recalculando portfolio. Para cambios permanentes, actualiza el Excel de órdenes."}


@router.delete("/{isin_or_name}")
async def delete_fund(isin_or_name: str, background_tasks: BackgroundTasks):
    """Elimina un fondo (nota: con sistema FIFO, se recomienda actualizar el Excel)."""
    background_tasks.add_task(run_analytics_pipeline, force_download=False)
    return {"message": "🗑️ Recalculando portfolio. Para cambios permanentes, actualiza el Excel de órdenes."}


# =========================================================================
# Nuevos endpoints
# =========================================================================

@router.get("/last_update")
async def get_last_update():
    """Devuelve la fecha del último dato disponible en el histórico."""
    cached = load_json("history_batch.json")
    if not cached:
        return {"last_date": None, "cache_age": None}

    # Encontrar la fecha máxima entre todos los fondos
    last_date = None
    for fund_name, points in cached.items():
        if points and isinstance(points, list) and len(points) > 0:
            fund_last = points[-1].get("date")
            if fund_last and (last_date is None or fund_last > last_date):
                last_date = fund_last

    # Calcular antigüedad de la caché
    import os as _os
    from ..services.portfolio_service import CACHE_DIR as _CACHE_DIR
    cache_path = _os.path.join(_CACHE_DIR, "history_batch.json")
    cache_age = None
    if _os.path.exists(cache_path):
        import time
        cache_age = round(time.time() - _os.path.getmtime(cache_path))

    return {"last_date": last_date, "cache_age_seconds": cache_age}


@router.get("/positions", response_model=PositionsResponse)
async def get_positions():
    """Posiciones FIFO con P&L completo."""
    client = get_portfolio_client()
    df = client.positions(live=True)

    positions = []
    for _, row in df.iterrows():
        positions.append(PositionItem(
            ISIN=row["ISIN"],
            Fondo=row.get("Fondo", row["ISIN"]),
            Participaciones=safe_float(row.get("Participaciones", 0)),
            Precio_Compra_Medio=safe_float(row.get("Precio_Compra_Medio", 0)),
            Capital_Invertido=safe_float(row.get("Capital_Invertido", 0)),
            Precio_Actual=row.get("Precio_Actual"),
            Valor_Actual=row.get("Valor_Actual"),
            Ganancia_Euros=row.get("Ganancia_Euros"),
            Ganancia_Pct=row.get("Ganancia_Pct"),
        ))

    total_invested = sum(p.Capital_Invertido for p in positions)
    total_value = sum(p.Valor_Actual or 0 for p in positions)
    total_gain = total_value - total_invested
    total_gain_pct = ((total_value / total_invested) - 1) * 100 if total_invested > 0 else 0

    return PositionsResponse(
        positions=positions,
        total_invested=round(total_invested, 2),
        total_value=round(total_value, 2),
        total_gain=round(total_gain, 2),
        total_gain_pct=round(total_gain_pct, 2),
    )


@router.get("/open-lots", response_model=List[OpenLotItem])
async def get_open_lots():
    """Todos los lotes FIFO abiertos."""
    client = get_portfolio_client()
    df = client.open_lots()

    lots = []
    for _, row in df.iterrows():
        fecha = row.get("Fecha_Compra")
        fecha_str = fecha.strftime("%Y-%m-%d") if hasattr(fecha, "strftime") else str(fecha) if fecha else None
        lots.append(OpenLotItem(
            ISIN=row["ISIN"],
            Fondo=row.get("Fondo", row["ISIN"]),
            Fecha_Compra=fecha_str,
            Participaciones_Iniciales=safe_float(row.get("Participaciones_Iniciales", 0)),
            Participaciones_Restantes=safe_float(row.get("Participaciones_Restantes", 0)),
            Importe_Invertido=safe_float(row.get("Importe_Invertido", 0)),
            Precio_Compra_Unitario=safe_float(row.get("Precio_Compra_Unitario", 0)),
        ))

    return lots


@router.post("/tax-optimize", response_model=TaxOptimizeResponse)
async def tax_optimize(request: TaxOptimizeRequest):
    """Calcula el plan de retirada fiscal óptimo."""
    client = get_portfolio_client()
    from ..services.tax_calculator import TaxOptimizer

    prices = client._fetch_prices()
    optimizer = TaxOptimizer(client.portfolio, prices=prices)
    plan = optimizer.optimize_withdrawal(request.target_amount)

    steps = []
    for step in plan.get("plan", []):
        fecha = step.get("Fecha_Compra")
        fecha_str = fecha.strftime("%Y-%m-%d") if hasattr(fecha, "strftime") else str(fecha) if fecha else None
        steps.append(TaxPlanStep(
            ISIN=step["ISIN"],
            Fondo=step.get("Fondo", step["ISIN"]),
            Fecha_Compra=fecha_str,
            Participaciones_Vendidas=safe_float(step.get("Participaciones_Vendidas", 0)),
            Importe_Retirado=safe_float(step.get("Importe_Retirado", 0)),
            Ganancia_Patrimonial=safe_float(step.get("Ganancia_Patrimonial", 0)),
        ))

    return TaxOptimizeResponse(
        target_amount=plan["target_amount"],
        withdrawn_amount=safe_float(plan["withdrawn_amount"]),
        total_capital_gain=safe_float(plan["total_capital_gain"]),
        estimated_tax=safe_float(plan["estimated_tax"]),
        net_amount=safe_float(plan["net_amount"]),
        plan=steps,
    )


@router.get("/fund/{isin}/details", response_model=FundDetailResponse)
async def get_fund_detail(isin: str):
    """Detalle completo de un fondo: info, sectores, países, holdings."""
    client = get_portfolio_client()
    provider = client.provider

    info = provider.get_fund_info(isin) or {}
    sectors = provider.get_sector_weights(isin) or {}
    countries = provider.get_country_weights(isin) or {}
    holdings_df = provider.get_holdings(isin)

    holdings = holdings_df.to_dict("records") if not holdings_df.empty else []

    return FundDetailResponse(
        isin=isin,
        name=info.get("name", isin),
        expense_ratio=info.get("expense_ratio"),
        aum=info.get("aum"),
        inception_date=info.get("inception_date"),
        rating=info.get("overallMorningstarRating"),
        risk_score=info.get("riskScore"),
        sectors={k: safe_float(v) for k, v in sectors.items()},
        countries={k: safe_float(v) for k, v in countries.items()},
        holdings=holdings,
        source=info.get("source", ""),
    )


@router.get("/performance")
async def get_performance():
    """Métricas de rendimiento del portfolio."""
    client = get_portfolio_client()
    df = client.performance(years=3)
    if df.empty:
        return {"metrics": []}
    return {"metrics": df.to_dict("records")}


@router.post("/upload-orders")
async def upload_orders(file: UploadFile = File(...)):
    """Sube un nuevo Excel de órdenes y recalcula todo."""
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Solo se aceptan archivos .xlsx o .xls")

    # Guardar archivo
    try:
        with open(EXCEL_PATH, "wb") as f:
            content = await file.read()
            f.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error guardando archivo: {e}")

    # Resetear y recalcular
    reset_client()
    try:
        run_analytics_pipeline(force_download=True)
    except Exception as e:
        return {"message": f"⚠️ Excel guardado pero hubo un error al procesar: {e}"}

    return {"message": "✅ Excel de órdenes actualizado y portfolio recalculado."}



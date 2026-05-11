"""
endpoints.py — API REST del Portfolio Tracker.

Usa portfolio_service.py para acceder a los datos de cartera.
Mantiene compatibilidad con las shapes de respuesta del frontend existente.

Endpoints disponibles: summary, details, history_batch, correlation,
positions, open-lots, tax-optimize, fund details, fund search,
simulate, evolution-metrics, performance, traspaso-analysis, upload-orders.
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
    FundSearchResult,
    SimulationRequest,
    SimulationResponse,
    RebalanceRequest,
    RebalanceResponse,
    TraspasoFundItem,
    TraspasoOptimizeRequest,
    TraspasoOptimizeResponse,
    DestinationFund,
    TraspasoLotStep,
    EscenarioFiscal,
)
from ..services.portfolio_service import (
    CACHE_DIR,
    EXCEL_PATH,
    TSV_PATH,
    load_json,
    build_summary,
    build_details,
    build_history_batch,
    build_correlation,
    run_analytics_pipeline,
    run_nav_pipeline,
    run_details_pipeline,
    build_msci_world_benchmark,
    get_portfolio_client,
    get_fund_detail_full_cached,
    reset_client,
    safe_float,
    search_funds,
    search_funds_async,
    get_fund_detail_full,
    simulate_addition,
    _get_fund_detail_async,
    build_real_portfolio_history,
    build_real_portfolio_history_per_fund,
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


@router.get("/refresh-nav", response_model=AnalysisResponse)
async def refresh_nav(background_tasks: BackgroundTasks):
    """Recalcula solo cotizaciones (NAVs), histórico y correlaciones.

    Más rápido que /enrich ya que no descarga sectores/regiones.
    """
    background_tasks.add_task(run_nav_pipeline, force_download=True)

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
            "title": "Actualizando Cotizaciones",
            "text": "Recalculando NAVs, histórico y correlaciones. Refresca en unos segundos.",
        }
    }
    return cached


@router.get("/refresh-details")
async def refresh_details(background_tasks: BackgroundTasks):
    """Recalcula solo los detalles (sectores, regiones, métricas de riesgo).

    Más lento que /refresh-nav ya que consulta Finect, FT, etc.
    """
    background_tasks.add_task(run_details_pipeline, force_download=True)

    cached = load_json("details.json")
    return cached or {}


@router.get("/benchmark/msci-world")
async def get_msci_world_benchmark():
    """Pesos sectoriales y geográficos del MSCI World (iShares ETF proxy)."""
    cached = load_json("benchmark_msci.json")
    if cached:
        return cached
    try:
        return build_msci_world_benchmark()
    except Exception as e:
        return {"sectors": {}, "regions": {}, "error": str(e)}


@router.get("/portfolio-holdings")
async def get_portfolio_holdings():
    """Holdings agregados a nivel de cartera: ponderación de los activos subyacentes.

    Combina los holdings de todos los fondos en cartera usando el peso real de cada
    fondo (Valor_Actual / total_cartera). Devuelve la lista completa ordenada por
    peso descendente (no limitado a top 10).
    """
    details = load_json("details.json")
    summary = load_json("summary.json")
    if not details or not summary:
        return {"holdings": [], "coverage_pct": 0, "total_funds": 0, "funds_with_holdings": 0}

    funds = summary.get("funds", [])
    total_value = sum(f.get("Valor_Actual") or 0 for f in funds)
    if total_value <= 0:
        return {"holdings": [], "coverage_pct": 0, "total_funds": len(funds), "funds_with_holdings": 0}

    # Build fund-weight map: fund_name → portfolio weight fraction
    fund_weights: dict = {}
    for f in funds:
        name = f.get("Fondo", "")
        val = f.get("Valor_Actual") or 0
        if name and val > 0:
            fund_weights[name] = val / total_value

    aggregated: dict = {}
    funds_with_holdings = 0

    for fund_name, fund_detail in details.items():
        holdings = fund_detail.get("holdings", [])
        if not holdings:
            continue
        fund_weight = fund_weights.get(fund_name, 0.0)
        if fund_weight <= 0:
            continue
        funds_with_holdings += 1
        # Normalize holding weights within this fund (should sum ~100)
        total_h = sum(float(h.get("weight", 0) or 0) for h in holdings)
        if total_h <= 0:
            continue
        for h in holdings:
            hname = str(h.get("name", "")).strip()
            if not hname or hname.lower() in ("cash", "efectivo", "liquidez", "other"):
                continue
            hw = float(h.get("weight", 0) or 0) / total_h  # fraction within fund
            portfolio_contribution = hw * fund_weight * 100  # % of total portfolio
            if hname in aggregated:
                aggregated[hname] += portfolio_contribution
            else:
                aggregated[hname] = portfolio_contribution

    holdings_list = sorted(
        [{"name": k, "weight": round(v, 3)} for k, v in aggregated.items()],
        key=lambda x: x["weight"],
        reverse=True,
    )
    coverage_pct = round(funds_with_holdings / max(len(funds), 1) * 100, 1)
    return {
        "holdings": holdings_list,
        "coverage_pct": coverage_pct,
        "total_funds": len(funds),
        "funds_with_holdings": funds_with_holdings,
    }


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
    cache_path = str(CACHE_DIR / "history_batch.json")
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
    # Precompute finect URLs from the cached sitemap (fast, sync)
    try:
        from ..services.finect_provider import _get_finect_url
    except Exception:
        _get_finect_url = lambda isin: None  # noqa: E731

    for _, row in df.iterrows():
        isin = row["ISIN"]
        try:
            finect_url = _get_finect_url(isin)
        except Exception:
            finect_url = None
        positions.append(PositionItem(
            ISIN=isin,
            Fondo=row.get("Fondo", isin),
            Participaciones=safe_float(row.get("Participaciones", 0)),
            Precio_Compra_Medio=safe_float(row.get("Precio_Compra_Medio", 0)),
            Capital_Invertido=safe_float(row.get("Capital_Invertido", 0)),
            Precio_Actual=row.get("Precio_Actual"),
            Valor_Actual=row.get("Valor_Actual"),
            Ganancia_Euros=row.get("Ganancia_Euros"),
            Ganancia_Pct=row.get("Ganancia_Pct"),
            finect_url=finect_url,
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
    try:
        client = get_portfolio_client()
        # Call the async core directly to avoid nested event-loop issues
        df = await client.core.tax_optimize(request.target_amount)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error calculando plan de retirada: {exc}") from exc

    # Filter out the synthetic TOTAL row added by client_async
    plan_df = df[df["ISIN"] != "── TOTAL ──"]

    steps = []
    for _, row in plan_df.iterrows():
        fecha = row.get("Fecha_Compra")
        import pandas as _pd
        if fecha is None or (_pd.isna(fecha) if not isinstance(fecha, str) else False):
            fecha_str = None
        elif hasattr(fecha, "strftime"):
            try:
                fecha_str = fecha.strftime("%Y-%m-%d")
            except Exception:
                fecha_str = None
        else:
            fecha_str = str(fecha) or None
        fondo_val = row.get("Fondo")
        fondo_str = str(fondo_val) if fondo_val is not None and not (isinstance(fondo_val, float) and _pd.isna(fondo_val)) else str(row.get("ISIN", ""))
        steps.append(TaxPlanStep(
            ISIN=str(row.get("ISIN", "")),
            Fondo=fondo_str,
            Fecha_Compra=fecha_str,
            Participaciones_Vendidas=safe_float(row.get("Participaciones_Vendidas", 0)),
            Importe_Retirado=safe_float(row.get("Importe_Retirado", 0)),
            Ganancia_Patrimonial=safe_float(row.get("Ganancia_Patrimonial", 0)),
        ))

    # Use attrs set by client_async (more reliable than re-summing)
    total_retirado = safe_float(df.attrs.get("withdrawn_amount") or sum(s.Importe_Retirado for s in steps))
    total_ganancia = safe_float(df.attrs.get("total_capital_gain") or sum(s.Ganancia_Patrimonial for s in steps))
    impuesto = safe_float(df.attrs.get("estimated_tax") or 0)

    if not impuesto:
        # Tramos IRPF España 2024
        def _calcular_impuesto(ganancia: float) -> float:
            if ganancia <= 0:
                return 0.0
            tax = 0.0
            tramos = [(6000, 0.19), (44000, 0.21), (150000, 0.23), (float("inf"), 0.27)]
            acum = 0.0
            for limite, tipo in tramos:
                tramo = min(ganancia - acum, limite)
                if tramo <= 0:
                    break
                tax += tramo * tipo
                acum += tramo
            return round(tax, 2)
        impuesto = _calcular_impuesto(total_ganancia)

    return TaxOptimizeResponse(
        target_amount=request.target_amount,
        withdrawn_amount=round(total_retirado, 2),
        total_capital_gain=round(total_ganancia, 2),
        estimated_tax=impuesto,
        net_amount=round(total_retirado - impuesto, 2),
        plan=steps,
    )


@router.get("/traspaso-analysis", response_model=List[TraspasoFundItem])
async def traspaso_analysis():
    """
    Analiza qué fondos podrían traspasarse en lugar de venderse para diferir impuestos.

    Normativa aplicable:
    - Art. 94 Ley 35/2006 del IRPF: los traspasos entre Instituciones de Inversión
      Colectiva (IICs) no tributan; la plusvalía latente se difiere hasta la
      venta definitiva.
    - Solo aplica a fondos de inversión registrados (CNMV/ESMA).
      No aplica a ETFs, acciones ni planes de pensiones.
    """
    try:
        client = get_portfolio_client()
        items = await client.core.traspaso_analysis()
        return [TraspasoFundItem(**item) for item in items]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error en análisis de traspasos: {exc}") from exc


@router.post("/traspaso-optimize", response_model=TraspasoOptimizeResponse)
async def traspaso_optimize(request: TraspasoOptimizeRequest):
    """
    Optimiza la retirada de efectivo usando traspasos previos para minimizar IRPF.

    Algoritmo greedy global (óptimo para impuesto convexo):
      1. Ordena TODOS los lotes de cartera por plusvalía% ascendente.
      2. Selecciona los lotes más baratos para reembolso en efectivo.
      3. Los lotes FIFO-anteriores del mismo fondo van a traspaso (Art. 94 LIRPF,
         coste fiscal = 0€).
      4. Elige el mejor fondo destino (indexado en cartera o sugerencia).
    """
    try:
        client = get_portfolio_client()
        result = await client.core.optimize_withdrawal_via_traspaso(request.target_amount)

        # Construir respuesta robusta manejando los campos anidados
        def _lot(d: dict) -> TraspasoLotStep:
            fecha = d.get("Fecha_Compra")
            if hasattr(fecha, "strftime"):
                fecha = fecha.strftime("%Y-%m-%d")
            elif fecha and not isinstance(fecha, str):
                fecha = str(fecha)
            return TraspasoLotStep(
                ISIN=str(d.get("ISIN", "")),
                Fondo=str(d.get("Fondo", "")),
                Fecha_Compra=fecha,
                Participaciones=safe_float(d.get("Participaciones", 0)),
                Importe=safe_float(d.get("Importe")) if d.get("Importe") is not None else None,
                Ganancia_Patrimonial=safe_float(d.get("Ganancia_Patrimonial")) if d.get("Ganancia_Patrimonial") is not None else None,
                Importe_Traspasado=safe_float(d.get("Importe_Traspasado")) if d.get("Importe_Traspasado") is not None else None,
                Plusvalia_Diferida=safe_float(d.get("Plusvalia_Diferida")) if d.get("Plusvalia_Diferida") is not None else None,
                Destination_ISIN=d.get("Destination_ISIN"),
                Destination_Fondo=d.get("Destination_Fondo"),
                Precio_Compra_Unitario=safe_float(d.get("Precio_Compra_Unitario", 0)),
                Nota=d.get("Nota"),
            )

        def _escenario(d: dict) -> EscenarioFiscal:
            return EscenarioFiscal(
                ganancia_patrimonial=safe_float(d.get("ganancia_patrimonial", 0)),
                impuesto=safe_float(d.get("impuesto", 0)),
                neto_recibido=safe_float(d.get("neto_recibido", 0)),
                detalle=[_lot(s) for s in d.get("detalle", [])],
            )

        dest_raw = result.get("destination_fund") or {}
        dest = DestinationFund(
            isin=dest_raw.get("isin", ""),
            nombre=dest_raw.get("nombre", ""),
            tipo=dest_raw.get("tipo", "new_suggestion"),
            is_index=dest_raw.get("is_index", True),
            motivo=dest_raw.get("motivo", ""),
        ) if dest_raw else None

        return TraspasoOptimizeResponse(
            target_amount=result["target_amount"],
            total_portfolio_value=safe_float(result.get("total_portfolio_value", 0)),
            escenario_directo=_escenario(result.get("escenario_directo", {})),
            escenario_optimizado=_escenario(result.get("escenario_optimizado", {})),
            ahorro_fiscal=safe_float(result.get("ahorro_fiscal", 0)),
            ahorro_fiscal_pct=safe_float(result.get("ahorro_fiscal_pct", 0)),
            plan_traspasos=[_lot(s) for s in result.get("plan_traspasos", [])],
            plan_reembolso=[_lot(s) for s in result.get("plan_reembolso", [])],
            importe_traspasado=safe_float(result.get("importe_traspasado", 0)),
            plusvalia_diferida=safe_float(result.get("plusvalia_diferida", 0)),
            fondos_afectados=result.get("fondos_afectados", []),
            destination_fund=dest,
            destination_alternatives=result.get("destination_alternatives", []),
            portfolio_after=result.get("portfolio_after", []),
            notas=result.get("notas", ""),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Error en optimización de traspaso: {exc}",
        ) from exc


@router.get("/fund/search", response_model=List[FundSearchResult])
async def fund_search(q: str = "", limit: int = 20):
    """Busca fondos en el índice de Finect (por ISIN o nombre).

    Permite encontrar fondos que no están en cartera para simular su adición.
    """
    if len(q.strip()) < 2:
        return []

    results = await search_funds_async(q, limit=limit)

    return [
        FundSearchResult(
            isin=r["isin"],
            name=r.get("name", ""),
            in_portfolio=r.get("in_portfolio", False),
            url=r.get("url"),
        )
        for r in results
    ]


@router.get("/fund/{isin}/details", response_model=FundDetailResponse)
async def get_fund_detail(isin: str, refresh: bool = False):
    """Detalle completo de un fondo: info, métricas, sectores, países, holdings.

    Usa caché en disco (7 días) + memoria (1 h) para respuestas rápidas después de la primera carga.
    Pasa ?refresh=true para ignorar la caché y forzar re-descarga.
    """
    import json as _json
    import os as _os

    disk_path = CACHE_DIR / f"fund_detail_{isin}.json"
    now = __import__("time").time()
    _DISK_TTL = 86400 * 7  # 7 días

    if not refresh and disk_path.exists() and (now - disk_path.stat().st_mtime) < _DISK_TTL:
        try:
            with open(disk_path, "r", encoding="utf-8") as f:
                detail = _json.load(f)
            return FundDetailResponse(**detail)
        except Exception:
            pass  # corrupt cache, re-fetch

    # 2. Fetch async
    detail = await _get_fund_detail_async(isin)
    try:
        with open(disk_path, "w", encoding="utf-8") as f:
            _json.dump(detail, f, ensure_ascii=False, default=str)
    except Exception:
        pass
    return FundDetailResponse(**detail)


@router.get("/fund/{isin}/nav_history")
async def get_fund_nav_history(isin: str, years: int = 10):
    """Devuelve el histórico de precios NAV para cualquier ISIN (incluso fuera de cartera).

    Respuesta: lista de ``{date: str, price: float}``.
    Útil para añadir fondos externos a la pestaña de Evolución/Comparativa.
    """
    try:
        client = get_portfolio_client()
        df = await client.provider.get_nav_history(isin, years=years)
        if df is None or df.empty:
            raise HTTPException(status_code=404, detail=f"Sin datos NAV para {isin}")
        # Normalize column names: may be 'date'/'price' or index-based
        df = df.reset_index(drop=True)
        if "date" not in df.columns or "price" not in df.columns:
            raise HTTPException(status_code=500, detail="Formato inesperado de HistóricoNAV")
        df = df.dropna(subset=["price"])
        df["date"] = df["date"].astype(str)
        return df[["date", "price"]].to_dict(orient="records")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error obteniendo histórico: {exc}") from exc


@router.post("/simulate", response_model=SimulationResponse)
async def simulate_fund_addition(request: SimulationRequest):
    """Simula añadir Y€ a un fondo y devuelve las métricas resultantes.

    Permite fondos que ya están en cartera o fondos nuevos de Finect.
    """
    try:
        client = get_portfolio_client()
        result = await client.core.simulate_addition(request.isin, request.amount)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error en simulación: {exc}") from exc

    funds = [
        {
            "isin": row["ISIN"],
            "name": row["Fondo"],
            "current_weight": row.get("Peso_Actual", 0.0),
            "simulated_weight": row.get("Peso_Simulado", 0.0),
        }
        for row in result["weights"].to_dict(orient="records")
    ]

    return SimulationResponse(
        added_isin=request.isin,
        added_name=result["metadata"]["added_name"],
        added_amount=request.amount,
        current_total=result["metadata"]["current_total"],
        simulated_total=result["metadata"]["simulated_total"],
        funds=funds,
        current_portfolio_metrics=result.get("current_portfolio_metrics", {}),
        simulated_portfolio_metrics=result.get("simulated_portfolio_metrics", {}),
        history_current=result.get("history_current", []),
        history_fund=result.get("history_fund", []),
        history_simulated=result.get("history_simulated", []),
        period_returns=result.get("period_returns", []),
    )


@router.post("/rebalance", response_model=RebalanceResponse)
async def rebalance_portfolio(request: RebalanceRequest):
    """Simula rebalancear la cartera a los pesos objetivo indicados.

    El cuerpo debe contener ``weights``: diccionario ISIN → fracción (0-1),
    con suma aproximada de 1.0.
    """
    total = sum(request.weights.values())
    if abs(total - 1.0) > 0.01:
        raise HTTPException(
            status_code=422,
            detail=f"Los pesos deben sumar 1.0 (suma actual: {total:.4f})",
        )
    try:
        client = get_portfolio_client()
        result = await client.core.simulate_rebalance(request.weights)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error en rebalanceo: {exc}") from exc

    funds = [
        {
            "isin": row["ISIN"],
            "name": row["Fondo"],
            "current_weight": row.get("Peso_Actual", 0.0),
            "target_weight": row.get("Peso_Objetivo", 0.0),
            "delta_eur": row.get("Delta_EUR", 0.0),
        }
        for row in result["weights"].to_dict(orient="records")
    ]

    return RebalanceResponse(
        total_value=result["metadata"]["total_value"],
        funds=funds,
        current_portfolio_metrics=result.get("current_portfolio_metrics", {}),
        simulated_portfolio_metrics=result.get("simulated_portfolio_metrics", {}),
        history_current=result.get("history_current", []),
        history_simulated=result.get("history_simulated", []),
        period_returns=result.get("period_returns", []),
    )


@router.get("/orders-summary")
async def get_orders_summary():
    """Resumen de órdenes reales: importes invertidos por mes y por año.

    Devuelve ``{monthly: {"YYYY-MM": total_eur, ...}, yearly: {YYYY: total_eur, ...}}``
    calculado a partir del fichero de órdenes (solo compras).  Útil para el
    modo "totales (€)" de la vista Comparativa.
    """
    client = get_portfolio_client()
    movements = client.portfolio.movements
    if movements.empty:
        return {"monthly": {}, "yearly": {}}

    import pandas as _pd
    buys = movements[movements["Participaciones"] > 0].copy()
    if buys.empty:
        return {"monthly": {}, "yearly": {}}

    buys["Fecha"] = _pd.to_datetime(buys["Fecha"])
    buys["ym"] = buys["Fecha"].dt.strftime("%Y-%m")
    buys["year"] = buys["Fecha"].dt.year
    buys["Importe"] = buys["Importe"].apply(safe_float)

    monthly_s = buys.groupby("ym")["Importe"].sum()
    yearly_s = buys.groupby("year")["Importe"].sum()

    return {
        "monthly": {k: round(float(v), 2) for k, v in monthly_s.items()},
        "yearly": {int(k): round(float(v), 2) for k, v in yearly_s.items()},
    }


@router.get("/real-evolution")
async def get_real_evolution(years: int = 20):
    """Evolución real del portfolio basada en órdenes (participaciones × NAV diarios).

    Distinto de /history_batch: cada inversión se contabiliza a partir de su fecha real
    de ejecución. Incluye fondos ya vendidos. Devuelve serie diaria y snapshots mensuales.
    """
    try:
        return build_real_portfolio_history(years=years)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error calculando evolución real: {exc}") from exc


@router.get("/real-evolution-per-fund")
async def get_real_evolution_per_fund(years: int = 20):
    """Evolución real desglosada por fondo (participaciones × NAV diarios).

    Alias de /real-evolution — devuelve la misma respuesta completa que incluye
    series, monthly, monthly_per_fund, funds e invested_per_fund.
    """
    try:
        return build_real_portfolio_history(years=years)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error calculando evolución por fondo: {exc}") from exc


@router.get("/performance")
async def get_performance():
    """Métricas de rendimiento del portfolio."""
    client = get_portfolio_client()
    df = client.performance(years=3)
    if df.empty:
        return {"metrics": []}
    return {"metrics": df.to_dict("records")}


@router.get("/evolution-metrics")
async def get_evolution_metrics(
    years: int = 5,
    risk_free: float = 0.03,
    benchmark_isin: str | None = None,
):
    """Métricas de evolución por fondo calculadas desde el historial de NAV.

    Devuelve Rentabilidad Total, CAGR, Volatilidad Anualizada, Sharpe,
    Alpha (anualizado) y Beta respecto al benchmark indicado.
    Los fondos se ordenan por peso en cartera descendente.

    Query params:
        years: ventana historica en años (default 5).
        risk_free: tasa libre de riesgo anual para Sharpe (default 0.03).
        benchmark_isin: ISIN del benchmark; si se omite se usa la serie
            de cartera agregada o el fondo de mayor peso.
    """
    _client = get_portfolio_client()
    df = _client.evolution_metrics(
        years=years,
        risk_free_annual=risk_free,
        benchmark_isin=benchmark_isin,
    )
    if df.empty:
        return {"funds": [], "benchmark": None, "years": years}
    return {
        "funds": df.to_dict("records"),
        "benchmark": df.attrs.get("benchmark"),
        "years": years,
        "risk_free_annual": risk_free,
    }


@router.get("/annual-returns")
async def get_annual_returns():
    """Retornos anuales por fondo (año natural, Jan-Dec).

    Calcula la rentabilidad de cada fondo para cada año completo disponible
    usando el primer y último precio de cada año natural.
    Para el año en curso (año actual) calcula el retorno YTD y lo anualiza
    a fin de compararlo en igualdad de condiciones con años completos.
    Devuelve: ``{years, funds: {name: {year: pct, ...}, ...}, current_year}``.
    """
    cached = load_json("history_batch.json")
    if not cached:
        return {"years": [], "funds": {}, "current_year": None}

    from collections import defaultdict
    from datetime import datetime as _dt

    current_year = _dt.now().year
    today = _dt.now().date()

    result: dict[str, dict[int, float]] = {}
    all_years: set[int] = set()

    for fund_name, series in cached.items():
        if not isinstance(series, list) or len(series) < 2:
            continue
        # Group prices by year
        by_year: dict[int, list[dict]] = defaultdict(list)
        for point in series:
            date_str = point.get("date", "")
            price = point.get("price")
            if not date_str or price is None:
                continue
            try:
                year = int(date_str[:4])
            except (ValueError, TypeError):
                continue
            by_year[year].append({"date": date_str, "price": float(price)})

        fund_returns: dict[int, float] = {}
        for year, points in by_year.items():
            if len(points) < 2:
                continue
            sorted_pts = sorted(points, key=lambda p: p["date"])
            first_price = sorted_pts[0]["price"]
            last_price = sorted_pts[-1]["price"]
            if first_price and first_price > 0:
                ytd_pct = (last_price / first_price - 1) * 100

                if year == current_year:
                    # Annualize to compare fairly with complete years:
                    # annualized = (1 + ytd)^(365/days_elapsed) - 1
                    try:
                        from_date = _dt.strptime(sorted_pts[0]["date"][:10], "%Y-%m-%d").date()
                        to_date = _dt.strptime(sorted_pts[-1]["date"][:10], "%Y-%m-%d").date()
                        days_elapsed = max((to_date - from_date).days, 1)
                        pct = round(((1 + ytd_pct / 100) ** (365.0 / days_elapsed) - 1) * 100, 2)
                    except Exception:
                        pct = round(ytd_pct, 2)
                else:
                    pct = round(ytd_pct, 2)

                fund_returns[year] = pct
                all_years.add(year)

        if fund_returns:
            result[fund_name] = fund_returns

    years_sorted = sorted(all_years)
    return {"years": years_sorted, "funds": result, "current_year": current_year}


@router.post("/upload-orders")
async def upload_orders(file: UploadFile = File(...)):
    """Sube el fichero de órdenes (TSV del broker o Excel) y recalcula todo."""
    fname = file.filename or ""
    if fname.endswith(".tsv"):
        dest = TSV_PATH
    elif fname.endswith((".xlsx", ".xls")):
        dest = EXCEL_PATH
    else:
        raise HTTPException(status_code=400, detail="Solo se aceptan archivos .tsv, .xlsx o .xls")

    # Guardar archivo
    try:
        with open(dest, "wb") as f:
            content = await file.read()
            f.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error guardando archivo: {e}")

    # Resetear y recalcular
    reset_client()
    try:
        run_analytics_pipeline(force_download=True)
    except Exception as e:
        return {"message": f"⚠️ Fichero guardado pero hubo un error al procesar: {e}"}

    return {"message": f"✅ Fichero de órdenes ({fname}) actualizado y portfolio recalculado."}


# =========================================================================
# Oportunidades de compra y explorador de fondos
# =========================================================================


@router.get("/opportunities")
async def get_opportunities(weights: str | None = None):
    """Escanea todos los fondos del portfolio con scoring de timing.

    Calcula 6 dimensiones: tendencia, pullback, divergencia momentum,
    RSI, régimen de volatilidad y corto plazo. Score 0-100 ajustado
    por tipo de fondo. Pesos configurables via query param.

    Query params:
        weights: JSON string con pesos personalizados, ej:
            {"trend":0.3,"pullback":0.2,"divergence":0.15,
             "rsi":0.15,"vol_regime":0.1,"short_term":0.1}
    """
    import json

    from ..services.opportunity_scanner import scan_portfolio_opportunities

    parsed_weights = None
    if weights:
        try:
            parsed_weights = json.loads(weights)
        except (json.JSONDecodeError, TypeError):
            pass

    client = get_portfolio_client()
    results = await scan_portfolio_opportunities(
        client, weights=parsed_weights,
    )
    return results


@router.get("/timing-presets")
async def get_timing_presets():
    """Devuelve los presets de pesos y los valores por defecto.

    Usado por el frontend para renderizar el panel de configuración
    de pesos sin hardcodear los valores.
    """
    from ..services.opportunity_scanner import (
        DEFAULT_TIMING_WEIGHTS,
        TIMING_PRESETS,
    )
    return {
        "presets": TIMING_PRESETS,
        "default_weights": DEFAULT_TIMING_WEIGHTS,
    }


@router.get("/opportunity/{isin}")
async def get_fund_opportunity(isin: str, weights: str | None = None):
    """Calcula señales de timing para un fondo concreto (en cartera o no).

    Query params:
        weights: JSON string con pesos personalizados.
    """
    import json

    from ..services.opportunity_scanner import scan_fund_opportunity

    parsed_weights = None
    if weights:
        try:
            parsed_weights = json.loads(weights)
        except (json.JSONDecodeError, TypeError):
            pass

    client = get_portfolio_client()
    return await scan_fund_opportunity(
        client, isin, weights=parsed_weights,
    )


@router.get("/opportunity/{isin}/chart-data")
async def get_opportunity_chart(isin: str, months: int = 12):
    """Datos de gráfica de timing para un fondo.

    Devuelve serie de precios, regresión log-lineal, bandas ±1σ/±2σ,
    SMA-200, RSI, crossovers de momentum y niveles de pullback.
    Diseñado para renderizar la visualización de por qué un fondo
    tiene el timing score que tiene.

    Query params:
        months: Meses de histórico para la gráfica (default 12).
    """
    from ..services.opportunity_scanner import get_opportunity_chart_data

    client = get_portfolio_client()
    return await get_opportunity_chart_data(client, isin, months=months)


@router.post("/compare-funds")
async def compare_funds_endpoint(isins: list[str], years: int = 5):
    """Compara múltiples fondos lado a lado.

    Body: lista de ISINs (max 6).
    Query: years (default 5) — controla el gráfico normalizado.

    Devuelve info, métricas, señales de timing y series de precios
    normalizadas a base 100 para cada fondo.
    """
    from ..services.opportunity_scanner import compare_funds

    if not isins or len(isins) < 1:
        raise HTTPException(status_code=400, detail="Envía al menos 1 ISIN")
    if len(isins) > 6:
        raise HTTPException(status_code=400, detail="Máximo 6 fondos para comparar")

    client = get_portfolio_client()
    return await compare_funds(client, isins, years=years)


# ─────────────────────────────────────────────────────────────────────────────
# Carteras guardadas & Favoritos
# ─────────────────────────────────────────────────────────────────────────────

def _persistence():
    from ..services.persistence_service import get_persistence_service
    return get_persistence_service()


@router.get("/portfolios")
async def list_portfolios():
    """Lista todas las carteras guardadas (sin detalles de fondos)."""
    return {"portfolios": _persistence().list_portfolios()}


@router.post("/portfolios")
async def create_portfolio(body: dict):
    """Crea una nueva cartera guardada.

    Body: {name, description?, color?, funds: [{isin, name, weight}]}
    """
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name es obligatorio")
    funds = body.get("funds", [])
    if not funds:
        raise HTTPException(status_code=400, detail="funds no puede estar vacío")
    portfolio = _persistence().create_portfolio(
        name=name,
        funds=funds,
        description=body.get("description", ""),
        color=body.get("color", "#4ca1af"),
        total_value=float(body.get("total_value") or 0),
    )
    return portfolio


@router.get("/portfolios/{portfolio_id}")
async def get_portfolio(portfolio_id: int):
    """Devuelve una cartera guardada con sus fondos."""
    p = _persistence().get_portfolio(portfolio_id)
    if not p:
        raise HTTPException(status_code=404, detail="Cartera no encontrada")
    return p


@router.put("/portfolios/{portfolio_id}")
async def update_portfolio(portfolio_id: int, body: dict):
    """Actualiza nombre, descripción, color y/o fondos de una cartera."""
    p = _persistence().update_portfolio(
        portfolio_id=portfolio_id,
        name=body.get("name"),
        description=body.get("description"),
        color=body.get("color"),
        funds=body.get("funds"),
        total_value=float(body["total_value"]) if "total_value" in body else None,
    )
    if not p:
        raise HTTPException(status_code=404, detail="Cartera no encontrada")
    return p


@router.delete("/portfolios/{portfolio_id}")
async def delete_portfolio(portfolio_id: int):
    """Elimina una cartera guardada."""
    ok = _persistence().delete_portfolio(portfolio_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Cartera no encontrada")
    return {"ok": True}


@router.post("/portfolios/clone-current")
async def clone_current_portfolio(body: dict):
    """Clona la cartera real actual en una cartera guardada.

    Body: {name?, description?}
    """
    client = get_portfolio_client()
    positions = client.positions(live=True)
    if positions.empty:
        raise HTTPException(status_code=400, detail="No hay posiciones disponibles")

    pos_list = positions.to_dict(orient="records")
    name = body.get("name", "Copia de Mi Cartera")
    description = body.get("description", "Copia de la cartera real del " + __import__("datetime").date.today().isoformat())
    portfolio = _persistence().clone_from_live(pos_list, name=name, description=description)
    return portfolio


@router.post("/portfolios/compare")
async def compare_portfolios_endpoint(body: dict):
    """Compara dos carteras definidas por el usuario.

    Body: {
        portfolio_a: {name, funds: [{isin, name, weight}]},
        portfolio_b: {name, funds: [{isin, name, weight}]},
        years: int (default 5)
    }
    Devuelve métricas (CAGR, vol, Sharpe, maxDD) y series normalizadas
    base 100 para cada cartera.
    """
    import numpy as np
    from datetime import datetime, timedelta

    pa = body.get("portfolio_a") or {}
    pb = body.get("portfolio_b") or {}
    years = int(body.get("years", 5))

    if not pa.get("funds") or not pb.get("funds"):
        raise HTTPException(status_code=400, detail="Se necesitan funds en portfolio_a y portfolio_b")

    client = get_portfolio_client()
    cutoff = datetime.now() - timedelta(days=years * 365)

    async def _build_portfolio_series(port_def: dict) -> dict:
        """Builds normalized weighted price series for a portfolio definition."""
        import asyncio as _asyncio
        funds = port_def.get("funds", [])
        # normalize weights
        total_w = sum(float(f.get("weight", 0)) for f in funds)
        if total_w <= 0:
            return {"series": [], "metrics": None}

        # Load NAV histories concurrently
        isins = [f["isin"] for f in funds if f.get("isin")]
        nav_results = await _asyncio.gather(
            *[client.core.provider.get_nav_history(isin, years=years + 1) for isin in isins],
            return_exceptions=True,
        )
        fund_series: dict[str, list] = {}
        for isin, df in zip(isins, nav_results):
            if isinstance(df, Exception) or df is None:
                continue
            try:
                rows = df[["date", "price"]].dropna().to_dict(orient="records")
                if len(rows) >= 10:
                    fund_series[isin] = sorted(rows, key=lambda x: str(x.get("date", "")))
            except Exception:
                continue

        if not fund_series:
            return {"series": [], "metrics": None}

        cutoff_str = cutoff.strftime("%Y-%m-%d")

        # Find common date range
        all_dates: set[str] = set()
        for pts in fund_series.values():
            for p in pts:
                d = p.get("date")
                if d is not None:
                    d_str = str(d)[:10]
                    if d_str >= cutoff_str:
                        all_dates.add(d_str)

        if not all_dates:
            return {"series": [], "metrics": None}

        sorted_dates = sorted(all_dates)

        # Build price map per ISIN (date -> price)
        price_map: dict[str, dict[str, float]] = {}
        for isin, pts in fund_series.items():
            pm = {}
            for p in pts:
                d = p.get("date")
                pr = p.get("price")
                if d is not None and pr is not None:
                    # Convert Timestamp or date to string
                    d_str = str(d)[:10]
                    try:
                        pm[d_str] = float(pr)
                    except (TypeError, ValueError):
                        pass
            price_map[isin] = pm

        # Build weighted portfolio series
        portfolio_pts = []
        for d in sorted_dates:
            w_total = 0.0
            w_price = 0.0
            for f in funds:
                isin = f.get("isin")
                w = float(f.get("weight", 0)) / total_w
                if isin in price_map:
                    # Forward-fill: find nearest previous date
                    p = price_map[isin].get(d)
                    if p is None:
                        # Find nearest previous
                        prev = [dd for dd in price_map[isin] if dd <= d]
                        p = price_map[isin][max(prev)] if prev else None
                    if p and p > 0:
                        w_price += p * w
                        w_total += w
            if w_total > 0.3 and w_price > 0:  # at least 30% weighted coverage
                portfolio_pts.append({"date": d, "price": round(w_price / w_total, 6)})

        if len(portfolio_pts) < 5:
            return {"series": portfolio_pts, "metrics": None}

        # Normalize to base 100
        base = portfolio_pts[0]["price"]
        normalized = [{"date": p["date"], "price": round(p["price"] / base * 100, 4)} for p in portfolio_pts]

        # Compute metrics
        prices = [p["price"] for p in portfolio_pts]
        first_p, last_p = prices[0], prices[-1]
        days = max((datetime.strptime(portfolio_pts[-1]["date"], "%Y-%m-%d") - datetime.strptime(portfolio_pts[0]["date"], "%Y-%m-%d")).days, 1)

        total_return = (last_p / first_p - 1) * 100
        ann_return = (pow(last_p / first_p, 365.0 / days) - 1) * 100 if days > 0 else 0

        # Daily log returns
        log_rets = [np.log(prices[i] / prices[i - 1]) for i in range(1, len(prices)) if prices[i] > 0 and prices[i - 1] > 0]
        vol = float(np.std(log_rets) * np.sqrt(252) * 100) if len(log_rets) >= 10 else None
        sharpe = ann_return / vol if vol and vol > 0 else None

        # Max drawdown
        peak = prices[0]
        max_dd = 0.0
        for p in prices:
            if p > peak:
                peak = p
            dd = (peak - p) / peak
            if dd > max_dd:
                max_dd = dd

        metrics = {
            "total_return": round(total_return, 2),
            "ann_return": round(ann_return, 2),
            "vol": round(vol, 2) if vol else None,
            "sharpe": round(sharpe, 3) if sharpe else None,
            "max_dd": round(max_dd * 100, 2),
            "days": days,
        }
        return {"series": normalized, "metrics": metrics}

    # Build both
    result_a = await _build_portfolio_series(pa)
    result_b = await _build_portfolio_series(pb)

    # Fund overlap
    isins_a = {f["isin"] for f in pa.get("funds", []) if f.get("isin")}
    isins_b = {f["isin"] for f in pb.get("funds", []) if f.get("isin")}
    overlap = isins_a & isins_b

    return {
        "portfolio_a": {
            "name": pa.get("name", "Cartera A"),
            "series": result_a["series"],
            "metrics": result_a["metrics"],
            "funds": pa.get("funds", []),
        },
        "portfolio_b": {
            "name": pb.get("name", "Cartera B"),
            "series": result_b["series"],
            "metrics": result_b["metrics"],
            "funds": pb.get("funds", []),
        },
        "overlap_isins": list(overlap),
        "overlap_count": len(overlap),
    }


# ── Favorites ──────────────────────────────────────────────────────────────

@router.get("/favorites")
async def list_favorites():
    """Lista todos los fondos en la watchlist personal."""
    return {"favorites": _persistence().list_favorites()}


@router.post("/favorites")
async def add_favorite(body: dict):
    """Añade un fondo a favoritos.

    Body: {isin, name?, notes?}
    """
    isin = body.get("isin", "").strip().upper()
    if not isin:
        raise HTTPException(status_code=400, detail="isin es obligatorio")
    fav = _persistence().add_favorite(
        isin=isin, name=body.get("name", ""), notes=body.get("notes", "")
    )
    return fav


@router.delete("/favorites/{isin}")
async def remove_favorite(isin: str):
    """Elimina un fondo de favoritos."""
    ok = _persistence().remove_favorite(isin.upper())
    if not ok:
        raise HTTPException(status_code=404, detail="Fondo no encontrado en favoritos")
    return {"ok": True}


@router.post("/fund/enrich")
async def enrich_funds(isins: list[str]):
    """Enriquece una lista de ISINs con métricas completas para el screener.

    Body: lista de ISINs (max 20).
    Devuelve info, retornos, métricas de riesgo y señales de timing
    para cada fondo, permitiendo filtrado y ordenación en el frontend.
    """
    from ..services.opportunity_scanner import enrich_funds_batch

    if not isins or len(isins) < 1:
        raise HTTPException(status_code=400, detail="Envía al menos 1 ISIN")
    if len(isins) > 20:
        isins = isins[:20]

    client = get_portfolio_client()
    return await enrich_funds_batch(client, isins)


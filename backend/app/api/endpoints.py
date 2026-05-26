"""
endpoints.py — API REST del Portfolio Tracker.

Usa portfolio_service.py para acceder a los datos de cartera.
Mantiene compatibilidad con las shapes de respuesta del frontend existente.

Endpoints disponibles: summary, details, history_batch, correlation,
positions, open-lots, tax-optimize, fund details, fund search,
simulate, evolution-metrics, performance, traspaso-analysis, upload-orders.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile, File
import logging
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
    LossHarvestingCandidate,
    LossHarvestingSuggestion,
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
logger = logging.getLogger(__name__)
# In-memory TTL caches for slow endpoints
# ---------------------------------------------------------------------------
import time as _time

_traspaso_analysis_cache: dict = {"data": None, "ts": 0.0}
_TRASPASO_ANALYSIS_TTL = 30 * 60  # 30 minutes

# In-memory TTL cache for portfolio comparison results (keyed by hash of request body)
_compare_portfolios_cache: dict[str, dict] = {}
_COMPARE_PORTFOLIOS_TTL = 20 * 60  # 20 minutes


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


@router.post("/recalculate")
async def recalculate_portfolio():
    """Resetea el portfolio en memoria para que se recalcule con los datos persistidos actuales.

    Útil después de añadir/eliminar posiciones manuales o correcciones. No descarga datos externos.
    """
    from ..services.portfolio_service import reset_client
    reset_client()
    return {"message": "✅ Portfolio recalculado con los datos guardados."}


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
        return {"series": cached}
    # No cache — trigger background build and return empty
    background_tasks.add_task(run_analytics_pipeline, force_download=False)
    return {"series": {}}


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
    """Añade una aportación manual al portfolio (siempre crea una nueva entrada).

    Permite múltiples aportaciones al mismo fondo (mismo ISIN, distinta fecha/importe).
    El tipo de activo se infiere automáticamente del nombre del fondo.
    - Si sólo se indica importe + fecha, se calculan automáticamente las participaciones:
      participaciones = importe / NAV(fecha_compra).
    - Si sólo se indican participaciones + fecha, se calcula automáticamente el importe:
      importe = participaciones × NAV(fecha_compra).
    Importes negativos representan ventas/reembolsos.
    """
    from ..services.persistence_service import get_persistence_service
    from ..services.fund_classifier import classify_fund, is_index_fund
    import pandas as _pd

    isin = (fund.ISIN or "").strip().upper()
    name = fund.Fondo or isin
    capital_invertido = fund.Capital_Invertido  # can be negative (sale)
    participaciones = fund.Participaciones
    fecha_compra = fund.Fecha_Compra

    if not isin:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Se requiere ISIN para añadir una posición.")

    # ── Auto-detect tipo ──────────────────────────────────────────────────
    raw_tipo = (fund.TIPO or "AUTO").strip().upper()
    if raw_tipo in ("", "AUTO"):
        tipo = "INDEX" if is_index_fund(name=name) else classify_fund(name=name).name
    else:
        tipo = raw_tipo

    # ── Derive participaciones / importe from NAV(fecha) ─────────────────
    # Helper: look up the closest NAV on or before fecha_compra.
    def _get_nav_on_date(isin_: str, fecha_: str) -> float | None:
        try:
            from ..services.portfolio_service import get_portfolio_client
            _client = get_portfolio_client()
            _nav_df = _client.fund_nav_history(isin_, years=15)
            if _nav_df is None or _nav_df.empty:
                return None
            _nav_df["date"] = _pd.to_datetime(_nav_df["date"])
            target = _pd.Timestamp(fecha_)
            _before = _nav_df[_nav_df["date"] <= target]
            if _before.empty:
                _before = _nav_df  # fallback: earliest available
            nav = float(_before.sort_values("date").iloc[-1]["price"])
            return nav if nav > 0 else None
        except Exception as _e:
            import logging as _log
            _log.getLogger(__name__).warning(
                "add_fund: no se pudo obtener NAV para %s en %s: %s", isin_, fecha_, _e
            )
            return None

    # Case 1: importe given, participaciones missing → participaciones = importe / NAV
    if participaciones is None and capital_invertido is not None and fecha_compra:
        nav = _get_nav_on_date(isin, fecha_compra)
        if nav is not None:
            participaciones = round(float(capital_invertido) / nav, 6)

    # Case 2: participaciones given, importe missing → importe = participaciones × NAV
    elif capital_invertido is None and participaciones is not None and fecha_compra:
        nav = _get_nav_on_date(isin, fecha_compra)
        if nav is not None:
            capital_invertido = round(float(participaciones) * nav, 6)

    svc = get_persistence_service()
    position = svc.add_manual_position(
        isin=isin,
        name=name,
        tipo=tipo,
        capital_invertido=float(capital_invertido) if capital_invertido is not None else None,
        participaciones=float(participaciones) if participaciones is not None else None,
        fecha_compra=fecha_compra,
    )
    background_tasks.add_task(run_analytics_pipeline, force_download=False)
    return {"message": f"✅ Aportación manual guardada para {isin}.", "position": position}


@router.delete("/manual/entry/{entry_id}")
async def delete_manual_fund_entry(entry_id: int, background_tasks: BackgroundTasks):
    """Elimina una aportación manual concreta por id."""
    from ..services.persistence_service import get_persistence_service

    svc = get_persistence_service()
    deleted = svc.delete_manual_position_by_id(entry_id)
    if not deleted:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Aportación manual {entry_id} no encontrada.")
    background_tasks.add_task(run_analytics_pipeline, force_download=False)
    return {"message": f"🗑️ Aportación manual {entry_id} eliminada."}


@router.delete("/manual/{isin}")
async def delete_manual_fund(isin: str, background_tasks: BackgroundTasks):
    """Elimina TODAS las aportaciones manuales de un ISIN."""
    from ..services.persistence_service import get_persistence_service

    svc = get_persistence_service()
    deleted = svc.delete_manual_position(isin.strip().upper())
    if not deleted:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Posición manual {isin} no encontrada.")
    background_tasks.add_task(run_analytics_pipeline, force_download=False)
    return {"message": f"🗑️ Posición manual {isin} eliminada."}


@router.get("/manual-positions")
async def list_manual_positions():
    """Lista todas las posiciones manuales guardadas."""
    from ..services.persistence_service import get_persistence_service
    return get_persistence_service().list_manual_positions()


# ── Transaction overrides ────────────────────────────────────────────────────

@router.get("/transaction-overrides")
async def list_transaction_overrides():
    """Lista todos los overrides de transacciones con nombre de fondo e importe real."""
    import pandas as _pd
    from ..services.persistence_service import get_persistence_service

    overrides = get_persistence_service().list_transaction_overrides()
    if not overrides:
        return []

    client = get_portfolio_client()
    movements = client.portfolio.movements

    # ── Build ISIN → name map (same logic as /raw-movements) ─────────────────
    name_map: dict = {}
    for lot in client.portfolio.open_lots:
        isin_k = str(lot.get("ISIN", "")).strip().upper()
        fondo_k = str(lot.get("Fondo", "")).strip()
        if isin_k and fondo_k and fondo_k != isin_k:
            name_map[isin_k] = fondo_k
    _summary = load_json("summary.json")
    if _summary:
        for f in _summary.get("funds", []):
            isin_k = str(f.get("ISIN", "")).strip().upper()
            fondo_k = str(f.get("Fondo", "")).strip()
            if isin_k and fondo_k and fondo_k != isin_k:
                name_map[isin_k] = fondo_k
    _details = load_json("details.json")
    if _details:
        for fondo_k, meta in _details.items():
            isin_k = str(meta.get("isin", "")).strip().upper()
            if isin_k and fondo_k and fondo_k != isin_k and isin_k not in name_map:
                name_map[isin_k] = fondo_k
    # Also supplement from movements CSV Fondo column directly
    if not movements.empty and "Fondo" in movements.columns:
        for _, row in movements.iterrows():
            isin_k = str(row.get("ISIN", "") or "").strip().upper()
            fondo_k = str(row.get("Fondo", "") or "").strip()
            if isin_k and fondo_k and fondo_k.lower() not in ("nan", "none", "") and fondo_k != isin_k and isin_k not in name_map:
                name_map[isin_k] = fondo_k

    # ── Resolve missing names via provider (covers historical funds no longer held) ──
    override_isins = [str(ov.get("isin", "")).strip().upper() for ov in overrides]
    missing_name_isins = [isin for isin in override_isins if isin and isin not in name_map]
    if missing_name_isins:
        try:
            resolved = await client.provider.resolve_names_batch(missing_name_isins)
            for isin_k, name_v in resolved.items():
                if name_v and name_v != isin_k:
                    name_map[isin_k] = name_v
        except Exception as _resolve_err:
            logger.warning("Could not resolve fund names for overrides: %s", _resolve_err)

    enriched = []
    for ov in overrides:
        isin = str(ov.get("isin", "")).strip().upper()
        fecha = str(ov.get("fecha", "")).strip()[:10]
        fondo = name_map.get(isin) or isin

        # Stored participaciones value (the corrected one); 0 means "auto-flip all positive"
        stored_parts: float = float(ov.get("participaciones", 0))

        # Look up the actual movement values (after overrides are applied to movements)
        actual_participaciones: float | None = None
        importe: float | None = None
        if not movements.empty:
            isin_norm = movements["ISIN"].str.strip().str.upper()
            mask = (
                (isin_norm == isin)
                & (movements["Fecha"].dt.strftime("%Y-%m-%d") == fecha)
            )
            rows_for_ov = movements[mask]
            if not rows_for_ov.empty:
                actual_participaciones = float(rows_for_ov["Participaciones"].sum())
                if "Importe" in rows_for_ov.columns:
                    raw_imp = float(rows_for_ov["Importe"].abs().sum())
                    # Sign based on actual (post-override) participaciones; fall back to stored sign
                    is_negative = (
                        actual_participaciones < 0
                        if actual_participaciones is not None
                        else stored_parts < 0
                    )
                    importe = -raw_imp if is_negative else raw_imp

        # When movement rows not found, fall back to stored participaciones for display
        if actual_participaciones is None and stored_parts != 0:
            actual_participaciones = stored_parts

        # Auto-assign note "Traspaso saliente" for overrides with negative participaciones
        # that were saved without a note (backward compatibility)
        notes = ov.get("notes") or ""
        if not notes and stored_parts < 0:
            notes = "Traspaso saliente"

        enriched.append({
            **ov,
            "fondo": fondo,
            "actual_participaciones": actual_participaciones,
            "importe": importe,
            "notes": notes,
        })

    return enriched


@router.post("/transaction-overrides")
async def upsert_transaction_override(body: dict, background_tasks: BackgroundTasks):
    """Crea o actualiza un override de transacción.

    Body: {isin, fecha (YYYY-MM-DD), participaciones (con signo correcto), notes?}
    """
    from ..services.persistence_service import get_persistence_service

    isin = (body.get("isin") or "").strip().upper()
    fecha = (body.get("fecha") or "").strip()
    participaciones = body.get("participaciones")
    notes = body.get("notes", "")

    if not isin or not fecha or participaciones is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Se requieren isin, fecha y participaciones.")

    svc = get_persistence_service()
    override = svc.upsert_transaction_override(
        isin=isin, fecha=fecha, participaciones=float(participaciones), notes=notes
    )
    # Forzar recarga del cliente para que el override surta efecto
    from ..services.portfolio_service import reset_client
    reset_client()
    background_tasks.add_task(run_analytics_pipeline, force_download=False)
    return {"message": "✅ Override guardado.", "override": override}


@router.delete("/transaction-overrides/{override_id}")
async def delete_transaction_override(override_id: int, background_tasks: BackgroundTasks):
    """Elimina un override de transacción por id."""
    from ..services.persistence_service import get_persistence_service

    svc = get_persistence_service()
    deleted = svc.delete_transaction_override(override_id)
    if not deleted:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Override {override_id} no encontrado.")
    from ..services.portfolio_service import reset_client
    reset_client()
    background_tasks.add_task(run_analytics_pipeline, force_download=False)
    return {"message": f"🗑️ Override {override_id} eliminado."}


@router.get("/raw-movements")
async def get_raw_movements():
    """Devuelve todas las transacciones cargadas (movimientos en bruto) del portfolio.

    Unifica las tres fuentes: MyInvestor Fondos (TSV), MyInvestor ETFs (Excel)
    y Trade Republic ETFs (CSV). Incluye nombres de fondo resueltos.

    Returns:
        Lista de dicts con: isin, fecha, participaciones, importe, tipo, fondo, fuente.
        El importe lleva el mismo signo que participaciones.
    """
    import pandas as _pd

    client = get_portfolio_client()
    movements = client.portfolio.movements
    if movements.empty:
        return []

    # Build ISIN → nombre from open lots (most reliable) + summary cache
    name_map: dict = {}
    for lot in client.portfolio.open_lots:
        isin_k = str(lot.get("ISIN", "")).strip().upper()
        fondo_k = str(lot.get("Fondo", "")).strip()
        if isin_k and fondo_k and fondo_k != isin_k:
            name_map[isin_k] = fondo_k
    # Supplement with summary JSON cache (has prettier fund names)
    _summary = load_json("summary.json")
    if _summary:
        for f in _summary.get("funds", []):
            isin_k = str(f.get("ISIN", "")).strip().upper()
            fondo_k = str(f.get("Fondo", "")).strip()
            if isin_k and fondo_k:
                name_map[isin_k] = fondo_k
    # Supplement with details.json (covers closed/old funds not in open lots)
    _details = load_json("details.json")
    if _details:
        for fondo_k, meta in _details.items():
            isin_k = str(meta.get("isin", "")).strip().upper()
            if isin_k and fondo_k and fondo_k != isin_k and isin_k not in name_map:
                name_map[isin_k] = fondo_k

    df = movements.copy()
    df["Fecha"] = _pd.to_datetime(df["Fecha"]).dt.strftime("%Y-%m-%d")

    if "Fuente" not in df.columns:
        df["Fuente"] = "MyInvestor Fondos"
    else:
        df["Fuente"] = df["Fuente"].fillna("MyInvestor Fondos").replace("", "MyInvestor Fondos")

    result = []
    for _, row in df.iterrows():
        isin = str(row.get("ISIN", "") or "").strip().upper()
        partic = safe_float(row.get("Participaciones", 0))
        importe_raw = safe_float(row.get("Importe", 0))
        # Importe carries the same sign as participaciones
        importe = -abs(importe_raw) if partic < 0 else abs(importe_raw)
        # Resolve fund name: row Fondo, then name_map, then ISIN
        fondo_row = str(row.get("Fondo", "") or "").strip()
        if fondo_row.lower() in ("nan", "none", ""):
            fondo_row = ""
        fondo = name_map.get(isin) or (fondo_row if fondo_row and fondo_row != isin else "") or isin
        result.append({
            "isin": isin,
            "fecha": str(row.get("Fecha", "") or "").strip(),
            "participaciones": partic,
            "importe": importe,
            "tipo": str(row.get("Tipo", "") or "").strip(),
            "fondo": fondo,
            "fuente": str(row.get("Fuente", "") or "").strip(),
        })

    result.sort(key=lambda x: x["fecha"], reverse=True)

    # Filter out excluded movements
    from ..services.persistence_service import get_persistence_service
    svc = get_persistence_service()
    excluded = {(e["isin"], e["fecha"]) for e in svc.list_excluded_movements()}
    if excluded:
        result = [m for m in result if (m["isin"], m["fecha"]) not in excluded]

    return result


@router.delete("/raw-movements/{isin}/{fecha}")
async def delete_raw_movement(isin: str, fecha: str, background_tasks: BackgroundTasks):
    """Excluye un movimiento del portfolio y recalcula.

    El movimiento queda oculto y excluido del cálculo FIFO.
    Se puede restaurar vía POST /raw-movements/{isin}/{fecha}/restore.
    """
    from ..services.persistence_service import get_persistence_service
    svc = get_persistence_service()
    svc.exclude_movement(isin.upper().strip(), fecha.strip())
    from ..services.portfolio_service import reset_client
    reset_client()
    background_tasks.add_task(run_analytics_pipeline, force_download=False)
    return {"message": f"🗑️ Movimiento {isin} / {fecha} excluido."}


@router.get("/excluded-movements")
async def list_excluded_movements():
    """Devuelve todos los movimientos excluidos (borrados por el usuario).

    Incluye información enriquecida del fondo (nombre, importe) cuando está disponible.
    """
    import pandas as _pd
    from ..services.persistence_service import get_persistence_service
    svc = get_persistence_service()
    excluded = svc.list_excluded_movements()
    if not excluded:
        return []

    # Try to enrich with fund name and amount from original movements
    try:
        client = get_portfolio_client()
        # We need raw movements BEFORE filtering, so read from the original CSV source
        # Since the client already filtered them out, we look at ALL movements from source
        from ..services.portfolio_service import _get_orders_source, DATA_DIR
        from ..services.core_portfolio import Portfolio
        source = _get_orders_source()
        if source:
            temp_portfolio = Portfolio()
            temp_portfolio.load_orders(source)
            movements = temp_portfolio.movements
        else:
            movements = _pd.DataFrame()

        name_map: dict = {}
        _summary = load_json("summary.json")
        if _summary:
            for f in _summary.get("funds", []):
                isin_k = str(f.get("ISIN", "")).strip().upper()
                fondo_k = str(f.get("Fondo", "")).strip()
                if isin_k and fondo_k:
                    name_map[isin_k] = fondo_k

        result = []
        for ex in excluded:
            isin = ex["isin"]
            fecha = ex["fecha"]
            fondo = name_map.get(isin, isin)
            importe = None
            participaciones = None
            if not movements.empty:
                mask = (
                    (movements["ISIN"] == isin)
                    & (movements["Fecha"].dt.strftime("%Y-%m-%d") == fecha)
                )
                if mask.any():
                    row = movements.loc[mask].iloc[0]
                    partic = safe_float(row.get("Participaciones", 0))
                    imp_raw = safe_float(row.get("Importe", 0))
                    importe = -abs(imp_raw) if partic < 0 else abs(imp_raw)
                    participaciones = partic
                    fondo_row = str(row.get("Fondo", "") or "").strip()
                    if fondo_row and fondo_row.lower() not in ("nan", "none", "") and fondo_row != isin:
                        fondo = fondo_row
            result.append({
                "isin": isin,
                "fecha": fecha,
                "fondo": fondo,
                "importe": importe,
                "participaciones": participaciones,
            })
        return result
    except Exception:
        # Fallback: return basic info without enrichment
        return [{"isin": ex["isin"], "fecha": ex["fecha"], "fondo": ex["isin"], "importe": None, "participaciones": None} for ex in excluded]


@router.post("/raw-movements/{isin}/{fecha}/restore")
async def restore_raw_movement(isin: str, fecha: str, background_tasks: BackgroundTasks):
    """Restaura un movimiento previamente excluido y recalcula el portfolio."""
    from ..services.persistence_service import get_persistence_service
    svc = get_persistence_service()
    found = svc.unexclude_movement(isin.upper().strip(), fecha.strip())
    if not found:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Exclusión no encontrada: {isin}/{fecha}")
    from ..services.portfolio_service import reset_client
    reset_client()
    background_tasks.add_task(run_analytics_pipeline, force_download=False)
    return {"message": f"✅ Movimiento {isin} / {fecha} restaurado."}


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
    """Posiciones FIFO con P&L completo.

    Incluye también los fondos añadidos manualmente en Gestión de Cartera
    (manual positions de SQLite) que no estén ya en el cálculo FIFO.
    """
    client = get_portfolio_client()
    df = client.positions(live=True)

    positions = []
    # Precompute finect URLs from the cached sitemap (fast, sync)
    try:
        from ..services.finect_provider import _get_finect_url
    except Exception:
        _get_finect_url = lambda isin: None  # noqa: E731

    etf_isins: set = getattr(client.portfolio, "_etf_isins", set())

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
            is_etf=isin in etf_isins,
        ))

    # Supplement with manual positions from summary.json (includes Gestión de Cartera funds)
    # build_summary() merges manual positions; client.positions() does not.
    try:
        _summary = load_json("summary.json")
        if _summary:
            _fifo_isins = {p.ISIN for p in positions}
            for f in _summary.get("funds", []):
                f_isin = (f.get("ISIN") or "").strip().upper()
                if not f_isin or f_isin in _fifo_isins:
                    continue  # already covered by FIFO
                _valor = safe_float(f.get("Valor_Actual") or 0)
                if _valor <= 0:
                    continue
                try:
                    finect_url = _get_finect_url(f_isin)
                except Exception:
                    finect_url = None
                positions.append(PositionItem(
                    ISIN=f_isin,
                    Fondo=f.get("Fondo", f_isin),
                    Participaciones=safe_float(f.get("Participaciones") or 0),
                    Precio_Compra_Medio=0.0,
                    Capital_Invertido=round(safe_float(f.get("Capital_Invertido") or 0), 2),
                    Precio_Actual=safe_float(f.get("NAV (Precio)") or 0) or None,
                    Valor_Actual=round(_valor, 2),
                    Ganancia_Euros=round(safe_float(f.get("Ganancia_Abs") or 0), 2) or None,
                    Ganancia_Pct=round(safe_float(f.get("Ganancia_Pct") or 0), 2) or None,
                    finect_url=finect_url,
                    is_etf=f_isin in etf_isins,
                ))
    except Exception:
        pass  # degraded mode: just return FIFO positions

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
            es_etf=bool(row.get("es_etf", False)),
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

    Resultado cacheado 30 minutos para evitar llamadas repetidas a proveedores externos.
    """
    # Serve from cache if fresh
    now = _time.time()
    cached = _traspaso_analysis_cache
    if cached["data"] is not None and (now - cached["ts"]) < _TRASPASO_ANALYSIS_TTL:
        return cached["data"]

    try:
        client = get_portfolio_client()
        items = await client.core.traspaso_analysis()
        result = [TraspasoFundItem(**item) for item in items]
        # Only cache if we got meaningful results
        if result:
            _traspaso_analysis_cache["data"] = result
            _traspaso_analysis_cache["ts"] = now
        return result
    except Exception as exc:
        # If we have stale cache, return it rather than an error
        if cached["data"] is not None:
            return cached["data"]
        raise HTTPException(status_code=500, detail=f"Error en análisis de traspasos: {exc}") from exc


def _build_harvesting(raw: dict | None) -> LossHarvestingSuggestion | None:
    """Build a LossHarvestingSuggestion from the raw dict returned by tax_calculator."""
    if not raw:
        return None
    candidates = [
        LossHarvestingCandidate(
            ISIN=str(c.get("ISIN", "")),
            Fondo=str(c.get("Fondo", "")),
            es_etf=bool(c.get("es_etf", False)),
            Fecha_Compra=(
                c["Fecha_Compra"].strftime("%Y-%m-%d")
                if hasattr(c.get("Fecha_Compra"), "strftime")
                else str(c["Fecha_Compra"]) if c.get("Fecha_Compra") else None
            ),
            lot_loss=safe_float(c.get("lot_loss", 0)),
            lot_value=safe_float(c.get("lot_value", 0)),
            preceding_forced_gain=safe_float(c.get("preceding_forced_gain", 0)),
            preceding_forced_value=safe_float(c.get("preceding_forced_value", 0)),
            preceding_transfer_value=safe_float(c.get("preceding_transfer_value", 0)),
            net_harvest_gain=safe_float(c.get("net_harvest_gain", 0)),
            additional_cash=safe_float(c.get("additional_cash", 0)),
            antiaplicacion_plazo=str(c.get("antiaplicacion_plazo", "")),
        )
        for c in raw.get("candidates", [])
    ]
    return LossHarvestingSuggestion(
        direction=str(raw.get("direction", "none")),
        candidates=candidates,
        base_net_gain=safe_float(raw.get("base_net_gain", 0)),
        base_tax=safe_float(raw.get("base_tax", 0)),
        total_harvestable_loss=safe_float(raw.get("total_harvestable_loss", 0)),
        net_gain_after_harvest=safe_float(raw.get("net_gain_after_harvest", 0)),
        tax_after_harvest=safe_float(raw.get("tax_after_harvest", 0)),
        tax_savings=safe_float(raw.get("tax_savings", 0)),
        additional_cash=safe_float(raw.get("additional_cash", 0)),
    )


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
                es_etf=bool(d.get("es_etf", False)),
            )

        def _escenario(d: dict) -> EscenarioFiscal:
            return EscenarioFiscal(
                ganancia_patrimonial=safe_float(d.get("ganancia_patrimonial", 0)),
                impuesto=safe_float(d.get("impuesto", 0)),
                withdrawn_amount=safe_float(d.get("withdrawn_amount", 0)),
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
            non_traspasable_isins=result.get("non_traspasable_isins", []),
            loss_harvesting=_build_harvesting(result.get("loss_harvesting")),
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
            ticker=r.get("ticker"),
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
async def get_real_evolution(years: int = 20, background_tasks: BackgroundTasks = None):
    """Evolución real del portfolio basada en órdenes (participaciones × NAV diarios).

    Distinto de /history_batch: cada inversión se contabiliza a partir de su fecha real
    de ejecución. Incluye fondos ya vendidos. Devuelve serie diaria y snapshots mensuales.
    """
    # Serve from cache whenever available — avoids expensive computation on each request
    cached = load_json("real_evolution.json")
    if cached:
        return cached
    try:
        result = build_real_portfolio_history(years=years)
        # Persist so subsequent calls are instant
        from ..services.portfolio_service import _save_json
        _save_json("real_evolution.json", result)
        return result
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
    import time as _time
    import os as _os

    hb_path = CACHE_DIR / "history_batch.json"
    ar_path = CACHE_DIR / "annual_returns.json"

    # Serve from cache if fresher than history_batch
    if ar_path.exists() and hb_path.exists():
        if ar_path.stat().st_mtime >= hb_path.stat().st_mtime:
            cached_ar = load_json("annual_returns.json")
            if cached_ar:
                return cached_ar

    cached = load_json("history_batch.json")
    if not cached:
        return {"years": [], "funds": {}, "current_year": None}

    from collections import defaultdict
    from datetime import datetime as _dt
    from ..services.portfolio_service import _save_json

    current_year = _dt.now().year

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
    response = {"years": years_sorted, "funds": result, "current_year": current_year}
    _save_json("annual_returns.json", response)
    return response


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
    # Invalidate comparison cache since the portfolio changed
    _compare_portfolios_cache.clear()
    return p


@router.delete("/portfolios/{portfolio_id}")
async def delete_portfolio(portfolio_id: int):
    """Elimina una cartera guardada."""
    ok = _persistence().delete_portfolio(portfolio_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Cartera no encontrada")
    _compare_portfolios_cache.clear()
    return {"ok": True}


@router.post("/portfolios/clone-current")
async def clone_current_portfolio(body: dict):
    """Clona la cartera real actual en una cartera guardada.

    Usa summary.json cuando está disponible para incluir fondos añadidos
    manualmente en Gestión de Cartera (manual positions). Cae back a
    client.positions() si no hay caché.

    Body: {name?, description?}
    """
    client = get_portfolio_client()
    name = body.get("name", "Copia de Mi Cartera")
    description = body.get("description", "Copia de la cartera real del " + __import__("datetime").date.today().isoformat())

    # Prefer summary.json which already merges manual positions
    pos_list: list[dict] = []
    _summary = load_json("summary.json")
    if _summary and _summary.get("funds"):
        for f in _summary["funds"]:
            f_isin = (f.get("ISIN") or "").strip().upper()
            _valor = float(f.get("Valor_Actual") or 0)
            if f_isin and _valor > 0:
                pos_list.append({
                    "isin": f_isin,
                    "name": f.get("Fondo", f_isin),
                    "Valor_Actual": _valor,
                })

    if not pos_list:
        # Fallback: use FIFO positions (no manual positions included)
        positions = client.positions(live=True)
        if positions.empty:
            raise HTTPException(status_code=400, detail="No hay posiciones disponibles")
        pos_list = positions.to_dict(orient="records")

    if not pos_list:
        raise HTTPException(status_code=400, detail="No hay posiciones disponibles")

    portfolio = _persistence().clone_from_live(pos_list, name=name, description=description)
    return portfolio


@router.post("/portfolios/compare")
async def compare_portfolios_endpoint(body: dict):
    """Compara dos carteras definidas por el usuario.

    Body acepta dos formatos para portfolio_a / portfolio_b:
    - Un ID numérico o string (se resuelve desde la BD; "current" para la cartera real).
    - Un objeto {name, funds: [{isin, name, weight}]} para carteras ad-hoc.

    Devuelve métricas (CAGR, vol, Sharpe, maxDD) y series normalizadas base 100.
    """
    import json as _json
    import hashlib as _hashlib
    import numpy as np
    from datetime import datetime, timedelta

    # ── Cache lookup ──────────────────────────────────────────────────────────
    try:
        _cache_key = _hashlib.md5(
            _json.dumps(body, sort_keys=True, default=str).encode()
        ).hexdigest()
    except Exception:
        _cache_key = None

    if _cache_key:
        cached = _compare_portfolios_cache.get(_cache_key)
        if cached and (_time.time() - cached["ts"]) < _COMPARE_PORTFOLIOS_TTL:
            return cached["data"]

    def _resolve_portfolio(raw) -> dict:
        """Resolve a portfolio_a/b value to a {name, funds} dict."""
        if isinstance(raw, dict):
            return raw  # already a portfolio definition

        ref = str(raw).strip()

        # "current" → live positions
        if ref == "current":
            try:
                pclient = get_portfolio_client()
                df = pclient.positions(live=True)
                total_v = df["Valor_Actual"].sum() if "Valor_Actual" in df.columns else 0
                funds = []
                for _, row in df.iterrows():
                    val = row.get("Valor_Actual") or 0
                    weight = float(val) / total_v if total_v > 0 else 0
                    if weight > 0:
                        funds.append({
                            "isin": str(row.get("ISIN", "")),
                            "name": str(row.get("Fondo", row.get("ISIN", ""))),
                            "weight": round(weight, 6),
                        })
                return {"name": "Mi Cartera", "funds": funds}
            except Exception as exc:
                raise HTTPException(status_code=500, detail=f"Error resolviendo cartera actual: {exc}") from exc

        # numeric ID → look up in persistence
        try:
            pid = int(ref)
            p = _persistence().get_portfolio(pid)
            if not p:
                raise HTTPException(status_code=404, detail=f"Cartera {pid} no encontrada")
            return {"name": p["name"], "funds": p.get("funds", [])}
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Referencia de cartera no válida: {ref!r}")

    pa = _resolve_portfolio(body.get("portfolio_a") or {})
    pb = _resolve_portfolio(body.get("portfolio_b") or {})
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

        # Load NAV histories concurrently.
        # Use _YEARS=30 to match the main pipeline cache key (nav_history_key(isin, 30)).
        # Requesting years+1 (e.g. 6) would always miss that cache, causing 25 s+ cold fetches.
        _NAV_FETCH_YEARS = 30
        isins = [f["isin"] for f in funds if f.get("isin")]
        nav_results = await _asyncio.gather(
            *[client.core.provider.get_nav_history(isin, years=_NAV_FETCH_YEARS) for isin in isins],
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
            return {"series": [], "metrics": None, "fund_starts": {}}

        cutoff_str = cutoff.strftime("%Y-%m-%d")

        # Build price map per ISIN (date -> price)
        price_map: dict[str, dict[str, float]] = {}
        for isin, pts in fund_series.items():
            pm = {}
            for p in pts:
                d = p.get("date")
                pr = p.get("price")
                if d is not None and pr is not None:
                    d_str = str(d)[:10]
                    try:
                        pm[d_str] = float(pr)
                    except (TypeError, ValueError):
                        pass
            price_map[isin] = pm

        # Determine first available date per fund (>= cutoff)
        fund_starts: dict[str, str] = {}
        for isin, pm in price_map.items():
            dates_in_range = sorted(d for d in pm if d >= cutoff_str)
            if dates_in_range:
                fund_starts[isin] = dates_in_range[0]

        # The portfolio can only start when ALL funds have data
        # Use the latest of all fund start dates as the common start
        if not fund_starts:
            return {"series": [], "metrics": None, "fund_starts": {}}

        common_start = max(fund_starts.values())

        # Collect all dates across funds from common_start onwards
        all_dates: set[str] = set()
        for pm in price_map.values():
            for d in pm:
                if d >= common_start:
                    all_dates.add(d)

        if not all_dates:
            return {"series": [], "metrics": None, "fund_starts": fund_starts}

        sorted_dates = sorted(all_dates)

        # Build weighted portfolio series (no silent weight redistribution)
        portfolio_pts = []
        for d in sorted_dates:
            w_price = 0.0
            all_covered = True
            for f in funds:
                isin = f.get("isin")
                w = float(f.get("weight", 0)) / total_w
                if isin not in price_map:
                    continue  # fund had no data at all, skip
                pm = price_map[isin]
                p = pm.get(d)
                if p is None:
                    # Forward-fill within the common window
                    prev = [dd for dd in pm if dd <= d and dd >= common_start]
                    p = pm[max(prev)] if prev else None
                if p and p > 0:
                    w_price += p * w
                else:
                    all_covered = False
            if w_price > 0:
                portfolio_pts.append({"date": d, "price": round(w_price, 6)})

        if len(portfolio_pts) < 5:
            return {"series": portfolio_pts, "metrics": None, "fund_starts": fund_starts, "data_start": common_start}

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
        return {"series": normalized, "metrics": metrics, "fund_starts": fund_starts, "data_start": common_start}

    # Build both
    result_a = await _build_portfolio_series(pa)
    result_b = await _build_portfolio_series(pb)

    name_a = pa.get("name", "Cartera A")
    name_b = pb.get("name", "Cartera B")

    def _norm_metrics(m: dict | None) -> dict:
        if not m:
            return {}
        return {
            "total_return": m.get("total_return", 0) / 100,
            "ann_return": m.get("ann_return", 0) / 100,
            "volatility": (m.get("vol") or 0) / 100,
            "sharpe": m.get("sharpe") or 0,
            "max_drawdown": (m.get("max_dd") or 0) / 100,
        }

    # History keyed by portfolio name (date → price)
    history: dict[str, list] = {
        name_a: result_a["series"],
        name_b: result_b["series"],
    }
    metrics = {
        name_a: _norm_metrics(result_a["metrics"]),
        name_b: _norm_metrics(result_b["metrics"]),
    }

    # Fund weight comparison (funds present in both)
    weight_map_a = {f["isin"]: (f, float(f.get("weight", 0))) for f in pa.get("funds", []) if f.get("isin")}
    weight_map_b = {f["isin"]: (f, float(f.get("weight", 0))) for f in pb.get("funds", []) if f.get("isin")}
    isins_a = set(weight_map_a)
    isins_b = set(weight_map_b)
    overlap = isins_a & isins_b

    # Normalize weights to fractions
    total_w_a = sum(v for _, v in weight_map_a.values()) or 1
    total_w_b = sum(v for _, v in weight_map_b.values()) or 1

    weight_comparison = []
    all_isins = isins_a | isins_b
    for isin in sorted(all_isins):
        fa = weight_map_a.get(isin)
        fb = weight_map_b.get(isin)
        if fa is None and fb is None:
            continue
        fund_name = (fa[0] if fa else fb[0]).get("name") or isin
        weight_comparison.append({
            "fund": fund_name,
            "isin": isin,
            "weight_a": round((fa[1] / total_w_a) if fa else 0, 4),
            "weight_b": round((fb[1] / total_w_b) if fb else 0, 4),
            "in_both": isin in overlap,
        })
    weight_comparison.sort(key=lambda x: max(x["weight_a"], x["weight_b"]), reverse=True)

    # Map ISINs to fund names for legible fund_starts warnings
    isin_name_map: dict[str, str] = {}
    for f in pa.get("funds", []) + pb.get("funds", []):
        if f.get("isin") and f.get("name"):
            isin_name_map[f["isin"]] = f["name"]

    def _named_starts(fund_starts: dict[str, str]) -> list[dict]:
        return sorted(
            [{"isin": isin, "name": isin_name_map.get(isin, isin), "first_date": d}
             for isin, d in fund_starts.items()],
            key=lambda x: x["first_date"],
        )

    result = {
        "history": history,
        "metrics": metrics,
        "weight_comparison": weight_comparison,
        "overlap_count": len(overlap),
        # Per-portfolio availability metadata so the frontend can warn the user
        "availability": {
            name_a: {
                "data_start": result_a.get("data_start"),
                "fund_starts": _named_starts(result_a.get("fund_starts", {})),
            },
            name_b: {
                "data_start": result_b.get("data_start"),
                "fund_starts": _named_starts(result_b.get("fund_starts", {})),
            },
        },
    }
    # Store in cache
    if _cache_key:
        _compare_portfolios_cache[_cache_key] = {"data": result, "ts": _time.time()}
    return result


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


# ── Data Providers Status ────────────────────────────────────────────────────

@router.get("/providers-status")
async def get_providers_status():
    """Devuelve el estado de los proveedores de datos para cada ISIN del portfolio.

    Para cada ISIN, informa:
    - Número de filas de historial disponibles en caché (por proveedor y combinado)
    - Rango de fechas del historial disponible
    - Si el dato es fresco (< 3 días)
    - El nombre del fondo
    """
    import asyncio as _aio
    import time as _t
    from ..services.cache_store import CacheStore
    import pandas as _pd

    client = get_portfolio_client()
    cache: CacheStore = client.provider._cache

    # Collect all ISINs ever traded plus current holdings
    movements = client.portfolio.movements
    all_isins_raw: list[str] = []
    if not movements.empty and "ISIN" in movements.columns:
        all_isins_raw = [str(i).strip().upper() for i in movements["ISIN"].dropna().unique()]

    # Add canonical ISINs too
    from ..services.portfolio_service import get_canonical_isin as _canonical
    canonical_map = {isin: _canonical(isin) for isin in all_isins_raw}
    all_isins = list(set(all_isins_raw) | set(canonical_map.values()))

    # Build name map
    name_map: dict = {}
    _sum = load_json("summary.json")
    if _sum:
        for f in _sum.get("funds", []):
            isin_k = str(f.get("ISIN", "")).strip().upper()
            fondo_k = str(f.get("Fondo", "") or f.get("Morningstar Name", "")).strip()
            if isin_k and fondo_k:
                name_map[isin_k] = fondo_k
    if not movements.empty and "Fondo" in movements.columns:
        for _, row in movements.iterrows():
            isin_k = str(row.get("ISIN", "") or "").strip().upper()
            fondo_k = str(row.get("Fondo", "") or "").strip()
            if isin_k and fondo_k and fondo_k.lower() not in ("nan", "none", "") and fondo_k != isin_k and isin_k not in name_map:
                name_map[isin_k] = fondo_k

    # Resolve remaining names via provider (cached names)
    missing = [i for i in all_isins if i not in name_map]
    if missing:
        try:
            resolved = await client.provider.resolve_names_batch(missing)
            name_map.update({k: v for k, v in resolved.items() if v and v != k})
        except Exception:
            pass

    _YEARS = 30  # match the default in build_real_portfolio_history

    async def _check_isin(isin: str) -> dict:
        """Check cached NAV history and per-provider availability for one ISIN."""
        cache_key = CacheStore.nav_history_key(isin, _YEARS)
        cached = await cache.aget(cache_key)
        stale = await cache.aget_stale(cache_key)

        is_fresh = cached is not None
        rows_total = 0
        first_date = None
        last_date = None
        avg_gap_days: float | None = None
        sparse_warning = False
        missing_today = False
        source = cached or stale
        if source:
            try:
                import datetime as _dt
                df = _pd.DataFrame(source)
                df["date"] = _pd.to_datetime(df["date"])
                df = df.sort_values("date").drop_duplicates("date")
                rows_total = len(df)
                first_date = df["date"].iloc[0].strftime("%Y-%m-%d") if rows_total > 0 else None
                last_date = df["date"].iloc[-1].strftime("%Y-%m-%d") if rows_total > 0 else None
                if rows_total > 1:
                    gaps = df["date"].diff().dt.days.dropna()
                    avg_gap_days = float(round(gaps.mean(), 2))
                    # Warn if average gap > 2.5 days (not daily)
                    sparse_warning = avg_gap_days > 2.5
                # Warn if last data point is > 7 calendar days ago (excluding weekends still leaves ~5 days)
                if last_date:
                    days_since = (_dt.date.today() - _dt.date.fromisoformat(last_date)).days
                    missing_today = days_since > 7
            except Exception:
                pass

        # Load per-provider source metadata (stored by CompositeAsyncProvider)
        sources_key = CacheStore.nav_history_sources_key(isin, _YEARS)
        sources_meta: dict = await cache.aget(sources_key) or await cache.aget_stale(sources_key) or {}

        return {
            "isin": isin,
            "name": name_map.get(isin, isin),
            "canonical": canonical_map.get(isin, isin),
            "rows": rows_total,
            "first_date": first_date,
            "last_date": last_date,
            "is_fresh": is_fresh,
            "is_stale": not is_fresh and stale is not None,
            "no_data": rows_total == 0,
            "avg_gap_days": avg_gap_days,
            "sparse_warning": sparse_warning,
            "missing_today": missing_today,
            "providers": sources_meta,  # {Finect: 1234, YahooFinance: 1000, FMP: 0}
        }

    results = await _aio.gather(*[_check_isin(isin) for isin in all_isins])

    # Group raw ISINs by canonical (merge share classes)
    canonical_groups: dict = {}
    for r in results:
        can = r["canonical"]
        if can not in canonical_groups:
            canonical_groups[can] = r.copy()
            canonical_groups[can]["raw_isins"] = [r["isin"]]
            canonical_groups[can]["name"] = name_map.get(can, r["name"])
        else:
            # Merge: keep the entry with the most rows
            canonical_groups[can]["raw_isins"].append(r["isin"])
            if r["rows"] > canonical_groups[can]["rows"]:
                canonical_groups[can]["rows"] = r["rows"]
                canonical_groups[can]["first_date"] = r["first_date"]
                canonical_groups[can]["last_date"] = r["last_date"]
                canonical_groups[can]["is_fresh"] = r["is_fresh"]
            if r["is_fresh"]:
                canonical_groups[can]["is_fresh"] = True
            # Propagate warnings — if any share class has a warning, the group has it
            if r.get("sparse_warning"):
                canonical_groups[can]["sparse_warning"] = True
            if r.get("missing_today"):
                canonical_groups[can]["missing_today"] = True
            canonical_groups[can]["no_data"] = canonical_groups[can]["rows"] == 0

    return {"providers": list(canonical_groups.values())}


@router.post("/providers-status/refresh/{isin}")
async def refresh_provider_for_isin(isin: str, background_tasks: BackgroundTasks):
    """Limpia la caché del historial NAV para un ISIN y fuerza re-descarga."""
    from ..services.cache_store import CacheStore

    isin = isin.strip().upper()
    client = get_portfolio_client()
    cache: CacheStore = client.provider._cache

    # Delete all year-variants of the history cache for this ISIN
    for years_key in [20, 30]:
        key = CacheStore.nav_history_key(isin, years_key)
        cache.delete(key)
        sources_key = CacheStore.nav_history_sources_key(isin, years_key)
        cache.delete(sources_key)

    # Also clear fund info cache to get fresh name
    cache.delete(CacheStore.fund_info_key(isin))
    cache.delete(CacheStore.name_key(isin))

    # Trigger re-download in background
    background_tasks.add_task(run_analytics_pipeline, force_download=False)
    return {"message": f"✅ Caché eliminada para {isin}. Recalculando en segundo plano…"}


@router.post("/providers-status/refresh/{isin}/provider/{provider}")
async def refresh_provider_for_isin_with_choice(
    isin: str,
    provider: str,
    background_tasks: BackgroundTasks,
):
    """Fuerza re-descarga del historial NAV para un ISIN usando un proveedor concreto.

    provider: finect | yahoo | fmp
    """
    import asyncio as _aio
    from ..services.cache_store import CacheStore
    from ..services.data_providers import (
        FinectAsyncProvider,
        YFinanceAsyncProvider,
        FMPAsyncProvider,
    )

    isin = isin.strip().upper()
    provider = provider.strip().lower()

    client = get_portfolio_client()
    cache: CacheStore = client.provider._cache

    _YEARS = 30

    async def _do_download():
        p_map = {
            "finect": FinectAsyncProvider(cache),
            "yahoo": YFinanceAsyncProvider(),
            "fmp": FMPAsyncProvider(),
        }
        chosen = p_map.get(provider)
        if chosen is None:
            return

        try:
            import pandas as _pd
            df = await chosen.get_nav_history(isin, years=_YEARS)
            if df is None or df.empty:
                return
            df = df.copy()
            df["date"] = _pd.to_datetime(df["date"]).dt.tz_localize(None).dt.strftime("%Y-%m-%d")
            cache_key = CacheStore.nav_history_key(isin, _YEARS)
            from ..services.cache_store import TTL_NAV_HISTORY
            await cache.aset(cache_key, df[["date", "price"]].to_dict(orient="records"), TTL_NAV_HISTORY)
            # Update sources metadata  
            sources_key = CacheStore.nav_history_sources_key(isin, _YEARS)
            label_map = {"finect": "Finect", "yahoo": "YahooFinance", "fmp": "FMP"}
            existing: dict = await cache.aget(sources_key) or {}
            existing[label_map[provider]] = len(df)
            await cache.aset(sources_key, existing, TTL_NAV_HISTORY)
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("refresh_with_choice(%s, %s) failed: %s", isin, provider, exc)

    background_tasks.add_task(_do_download)
    return {"message": f"✅ Descarga iniciada para {isin} desde {provider}. Los datos estarán disponibles en breve."}


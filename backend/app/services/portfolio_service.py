"""
portfolio_service.py — Servicio central para la API.

Adapter sobre PortfolioClient (async core).
Conecta las clases modernas con los endpoints REST.

Funciones principales:
  - get_portfolio_client() → singleton PortfolioClient
  - build_summary() → dict compatible con AnalysisResponse
  - build_details() → dict compatible con /details
  - build_history_batch() → dict compatible con /history_batch
  - build_correlation() → dict compatible con /correlation
  - run_analytics_pipeline() → genera JSONs en data/calculated/
"""

import asyncio
import json
import logging
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd

from .fund_classifier import FundType, classify_fund, is_index_fund
from .region_normalizer import normalize_regions, normalize_sectors
from .utils import run_sync as _run, safe_float

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Rutas
# ---------------------------------------------------------------------------

_BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = _BASE_DIR / "data"
CACHE_DIR = DATA_DIR / "calculated"
CSV_PATH = DATA_DIR / "Órdenes 1238478.csv"
TSV_PATH = DATA_DIR / "Órdenes 1238478.tsv"
EXCEL_PATH = DATA_DIR / "Ordenes.xlsx"

# Fuentes adicionales de ETFs
MYINVESTOR_ETF_PATH = DATA_DIR / "MyInvestorETF.xlsx"
TRADEREPUBLIC_CSV_PATH = DATA_DIR / "Exportación de transacción.csv"

CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Lock to prevent concurrent pipeline runs from competing on SQLite
import threading as _threading
_pipeline_lock = _threading.Lock()
# ---------------------------------------------------------------------------


def _load_etf_sources(client) -> None:
    """Carga las fuentes adicionales de ETFs (MyInvestor + TradeRepublic) en el portfolio.

    Llama a ``portfolio.load_extra_orders`` para cada fuente disponible.
    Los ISINs cargados se marcan como ETFs para evitar la corrección de
    localización Excel española (que divide enteros por 1000).

    Args:
        client: instancia de PortfolioClient ya inicializada.
    """
    from .core_portfolio import Portfolio

    etf_isins: set = set()

    # --- MyInvestor ETF ---
    if MYINVESTOR_ETF_PATH.exists():
        try:
            df_mi = Portfolio._normalize_myinvestor_etf_df(str(MYINVESTOR_ETF_PATH))
            isins_mi = set(df_mi["ISIN"].dropna().unique())
            etf_isins.update(isins_mi)
            client.portfolio.load_extra_orders(df_mi, etf_isins=isins_mi)
            logger.info(
                "MyInvestorETF: cargadas %d \u00f3rdenes (%d ISINs distintos)",
                len(df_mi),
                len(isins_mi),
            )
        except Exception:
            logger.exception("Error cargando MyInvestorETF.xlsx; se omite.")
    else:
        logger.debug("MyInvestorETF.xlsx no encontrado en %s", MYINVESTOR_ETF_PATH)

    # --- TradeRepublic TRADING ---
    if TRADEREPUBLIC_CSV_PATH.exists():
        try:
            df_tr = Portfolio._normalize_traderepublic_df(str(TRADEREPUBLIC_CSV_PATH))
            isins_tr = set(df_tr["ISIN"].dropna().unique())
            etf_isins.update(isins_tr)
            client.portfolio.load_extra_orders(df_tr, etf_isins=isins_tr)
            logger.info(
                "TradeRepublic TRADING: cargadas %d \u00f3rdenes (%d ISINs distintos)",
                len(df_tr),
                len(isins_tr),
            )
        except Exception:
            logger.exception("Error cargando Exportaci\u00f3n de transacci\u00f3n.csv; se omite.")
    else:
        logger.debug("TradeRepublic CSV no encontrado en %s", TRADEREPUBLIC_CSV_PATH)


def _get_orders_source() -> Optional[str]:
    """Devuelve la ruta al fichero de órdenes más reciente.

    Prioridad: CSV (broker, sep=';') > TSV > XLSX.
    El CSV del broker ya exporta participaciones con coma decimal correcta,
    evitando los problemas de localización del TSV/Excel español.
    """
    if CSV_PATH.exists():
        return str(CSV_PATH)
    tsv_exists = TSV_PATH.exists()
    xlsx_exists = EXCEL_PATH.exists()
    if tsv_exists and xlsx_exists:
        return str(TSV_PATH) if TSV_PATH.stat().st_mtime >= EXCEL_PATH.stat().st_mtime else str(EXCEL_PATH)
    if tsv_exists:
        return str(TSV_PATH)
    if xlsx_exists:
        return str(EXCEL_PATH)
    return None


# ---------------------------------------------------------------------------
# Fund Groups
# ---------------------------------------------------------------------------

FUND_GROUPS: Dict[str, List[str]] = {
    "IE00BYX5NX33": ["IE00BYX5NX33", "IE000ZYRH0Q7", "IE00BD0NCM55"],
}

_ISIN_TO_GROUP: Dict[str, str] = {}
for canonical, members in FUND_GROUPS.items():
    for isin in members:
        _ISIN_TO_GROUP[isin] = canonical


def get_canonical_isin(isin: str) -> str:
    return _ISIN_TO_GROUP.get(isin, isin)


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

# Correcciones de signo que antes estaban hardcodeadas en core_portfolio.py.
# participaciones=0.0 → negar todos los positivos en esa fecha (ver apply_sign_overrides).
_DEFAULT_OVERRIDES = [
    {
        "isin": "IE00BYX5MX67",
        "fecha": "2026-02-24",
        "participaciones": 0.0,
        "notes": "Traspaso saliente",
    },
    {
        "isin": "FR0000989626",
        "fecha": "2025-09-14",
        "participaciones": 0.0,
        "notes": "Traspaso saliente",
    },
    {
        "isin": "LU1694789451",
        "fecha": "2026-05-07",
        "participaciones": 0.0,
        "notes": "Traspaso saliente",
    },
]


def _seed_default_overrides() -> None:
    """Inserta las correcciones de signo por defecto en SQLite si no existen.

    Además, normaliza la nota de los overrides existentes que tengan notas
    antiguas con "migrado desde hardcode" para que aparezcan como "Traspaso saliente".
    """
    try:
        from .persistence_service import get_persistence_service as _get_ps
        svc = _get_ps()
        existing = {(r["isin"], r["fecha"]): r for r in svc.list_transaction_overrides()}
        for ov in _DEFAULT_OVERRIDES:
            key = (ov["isin"], ov["fecha"])
            if key not in existing:
                svc.upsert_transaction_override(
                    isin=ov["isin"],
                    fecha=ov["fecha"],
                    participaciones=ov["participaciones"],
                    notes=ov["notes"],
                )
                logger.info("Override por defecto sembrado: %s %s", ov["isin"], ov["fecha"])
            else:
                # Normalize old "migrado" notes to canonical "Traspaso saliente"
                existing_notes = existing[key].get("notes", "") or ""
                if "migrado" in existing_notes.lower() or existing_notes != ov["notes"]:
                    svc.upsert_transaction_override(
                        isin=ov["isin"],
                        fecha=ov["fecha"],
                        participaciones=ov["participaciones"],
                        notes=ov["notes"],
                    )
                    logger.info("Override nota normalizada: %s %s → %s", ov["isin"], ov["fecha"], ov["notes"])
    except Exception as _e:
        logger.warning("No se pudieron sembrar los overrides por defecto: %s", _e)


_client_instance = None


def get_portfolio_client(force_refresh: bool = False):
    """Devuelve un PortfolioClient singleton."""
    global _client_instance
    if _client_instance is None or force_refresh:
        from ..client import PortfolioClient

        # Do NOT pass cache_path — let CacheStore use its default (LOCALAPPDATA)
        # to avoid OneDrive sync locking the SQLite database.
        source = _get_orders_source()
        _client_instance = PortfolioClient(
            source=source,
            force_refresh=force_refresh,
        )
        logger.info(
            "PortfolioClient initialized from '%s' with %d positions",
            source,
            len(_client_instance.portfolio.positions),
        )

        # Cargar órdenes adicionales de ETFs (MyInvestor + TradeRepublic)
        _load_etf_sources(_client_instance)

        # Sembrar correcciones por defecto (solo si no existen ya en DB)
        _seed_default_overrides()

        # Aplicar exclusiones de movimientos desde SQLite
        try:
            from .persistence_service import get_persistence_service as _get_ps
            _excluded = _get_ps().list_excluded_movements()
            if _excluded:
                _client_instance.portfolio.filter_excluded_movements(_excluded)
                logger.info("Filtrados %d excluded_movements de SQLite", len(_excluded))
        except Exception as _ex_err:
            logger.warning("No se pudieron filtrar excluded_movements: %s", _ex_err)

        # Aplicar overrides de transacciones desde SQLite (corrección de signos)
        try:
            from .persistence_service import get_persistence_service as _get_ps
            _overrides = _get_ps().list_transaction_overrides()
            if _overrides:
                _client_instance.portfolio.apply_sign_overrides(_overrides)
                logger.info("Aplicados %d transaction_overrides de SQLite", len(_overrides))
        except Exception as _ov_err:
            logger.warning("No se pudieron aplicar transaction_overrides: %s", _ov_err)

        logger.info(
            "Portfolio final con ETFs: %d posiciones",
            len(_client_instance.portfolio.positions),
        )
    return _client_instance



def reset_client(force_refresh: bool = False):
    """Fuerza la recarga del PortfolioClient."""
    global _client_instance
    _client_instance = None
    if force_refresh:
        get_portfolio_client(force_refresh=True)


# ---------------------------------------------------------------------------
# Cache JSON
# ---------------------------------------------------------------------------


def _save_json(filename: str, data: Any) -> None:
    path = CACHE_DIR / filename
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, default=str)
    logger.info("Cache saved: %s", path)


def load_json(filename: str, default=None):
    path = CACHE_DIR / filename
    if not path.exists():
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning("Error loading %s: %s", path, e)
        return default


# ---------------------------------------------------------------------------
# Builders (thin adapters sobre client)
# ---------------------------------------------------------------------------


def build_summary() -> Dict[str, Any]:
    """Construye summary compatible con AnalysisResponse."""
    client = get_portfolio_client()
    pos = client.positions(live=True)

    if pos.empty:
        return {
            "summary": {"total_rv": 0, "total_rf": 0, "total_cash": 0, "total_alt": 0, "details": {}},
            "funds": [],
            "recommendation": {},
        }

    enriched = client.enrich()
    total_val = pos["Valor_Actual"].sum() if pos["Valor_Actual"].notna().any() else pos["Capital_Invertido"].sum()

    total_rv = total_rf = total_cash = total_alt = 0.0
    details: Dict[str, float] = {}
    funds_list: List[Dict] = []

    for _, row in pos.iterrows():
        isin = row["ISIN"]

        # Use info from cache (already fetched by enrich)
        async def _get_info(i):
            return await client.provider.get_fund_info(i)

        info = _run(_get_info(isin)) or {}

        name = info.get("name", row.get("Fondo", isin))
        valor = safe_float(row.get("Valor_Actual", row.get("Capital_Invertido", 0)))
        peso = (valor / total_val * 100) if total_val > 0 else 0

        # Usar clasificador unificado
        fund_type = classify_fund(info=info)
        if fund_type == FundType.RF:
            total_rf += peso
        elif fund_type == FundType.CASH:
            total_cash += peso
        elif fund_type == FundType.ALTERNATIVO:
            total_alt += peso
        else:
            total_rv += peso

        details[fund_type.value] = details.get(fund_type.value, 0) + peso
        is_idx = is_index_fund(info=info)

        # Resolve Finect URL with slug for General tab links
        try:
            from .finect_provider import _get_finect_url as _gfu
            finect_url = _gfu(isin)
        except Exception:
            finect_url = None

        enr_row = enriched[enriched["ISIN"] == isin].iloc[0] if not enriched.empty and isin in enriched["ISIN"].values else {}
        price_str = f"{safe_float(row.get('Precio_Actual', 0)):.2f}" if pd.notna(row.get("Precio_Actual")) else "---"
        ganancia_pct = row.get("Ganancia_Pct")
        ytd_str = f"{safe_float(ganancia_pct):+.1f}%" if pd.notna(ganancia_pct) else "---"

        rating = enr_row.get("Rating_MS") if isinstance(enr_row, (dict, pd.Series)) else None
        stars = "★" * int(rating) if pd.notna(rating) and rating else "---"

        funds_list.append({
            "Fondo": name,
            "TIPO": fund_type.name,
            "Porcentaje": round(peso, 2),
            "ISIN": isin,
            "NAV (Precio)": price_str,
            "YTD (%)": ytd_str,
            "Estrellas MS": stars,
            "Categoría": fund_type.value,
            "IsIndex": is_idx,
            "Valor_Actual": round(safe_float(row.get("Valor_Actual", 0)), 2),
            "Capital_Invertido": round(safe_float(row.get("Capital_Invertido", 0)), 2),
            "Ganancia_Abs": round(safe_float(row.get("Ganancia_Euros", 0)), 2),
            "Ganancia_Pct": round(safe_float(ganancia_pct), 2) if pd.notna(ganancia_pct) else None,
            "finect_url": finect_url,
        })

    # ── Merge manual positions (from SQLite) that are NOT already in FIFO ──
    # Build a live-price lookup from the already-loaded positions DataFrame
    _live_prices: Dict[str, float] = {}
    for _, _pr in pos.iterrows():
        _pi = str(_pr.get("ISIN", "")).strip().upper()
        _pv = _pr.get("Precio_Actual")
        if _pi and _pv is not None and pd.notna(_pv) and float(_pv) > 0:
            _live_prices[_pi] = float(_pv)
    try:
        from .persistence_service import get_persistence_service as _get_ps
        _TIPO_LABEL: dict[str, str] = {
            "RV": "Renta Variable",
            "INDEX": "Indexado",
            "RF": "Renta Fija",
            "CASH": "Liquidez",
            "ALTERNATIVO": "Alternativo",
        }
        _manual = _get_ps().list_manual_positions()
        _existing_isins = {f["ISIN"] for f in funds_list}

        # Aggregate multiple entries per ISIN into a single virtual position
        _manual_by_isin: Dict[str, dict] = {}
        for mp in _manual:
            mp_isin = (mp.get("isin") or "").strip().upper()
            if not mp_isin:
                continue
            if mp_isin not in _manual_by_isin:
                _manual_by_isin[mp_isin] = {
                    "isin": mp_isin,
                    "name": mp.get("name") or mp_isin,
                    "tipo": (mp.get("tipo") or "RV").upper(),
                    "capital_invertido": 0.0,
                    "participaciones": None,
                    "fecha_compra": mp.get("fecha_compra"),
                }
            agg = _manual_by_isin[mp_isin]
            agg["capital_invertido"] += float(mp.get("capital_invertido") or 0)
            mp_partic = mp.get("participaciones")
            if mp_partic is not None:
                agg["participaciones"] = (agg["participaciones"] or 0.0) + float(mp_partic)

        for mp_isin, mp in _manual_by_isin.items():
            existing_entry = next((f for f in funds_list if f["ISIN"] == mp_isin), None)
            mp_cap = float(mp.get("capital_invertido") or 0)   # sum of manual deposits (neg = sales)
            mp_partic = mp.get("participaciones")               # sum of manual participaciones (neg = sales)

            # Resolve live NAV (need it regardless of whether entry exists)
            _live_price = _live_prices.get(mp_isin)
            if _live_price is None:
                try:
                    _nav_df = client.fund_nav_history(mp_isin, years=1)
                    if _nav_df is not None and not _nav_df.empty:
                        import pandas as _pd2
                        _nav_df["date"] = _pd2.to_datetime(_nav_df["date"])
                        _latest_price = float(_nav_df.sort_values("date").iloc[-1]["price"])
                        if _latest_price > 0:
                            _live_price = _latest_price
                except Exception:
                    pass

            # Current value of the manual portion
            mp_valor: float = 0.0
            if mp_partic is not None and _live_price and _live_price > 0:
                mp_valor = round(float(mp_partic) * _live_price, 2)
            if mp_valor == 0.0:
                mp_valor = mp_cap  # fallback when no NAV available

            if existing_entry is not None:
                # ── FIFO entry exists: ADD manual contribution on top ──────
                fifo_valor = safe_float(existing_entry.get("Valor_Actual", 0))
                fifo_cap   = safe_float(existing_entry.get("Capital_Invertido", 0))
                fifo_partic = safe_float(existing_entry.get("Participaciones", 0))

                new_valor  = round(fifo_valor + mp_valor, 2)
                new_cap    = round(fifo_cap   + mp_cap,   2)
                new_partic = round(fifo_partic + float(mp_partic or 0), 6)
                new_ganancia = round(new_valor - new_cap, 2)
                new_ganancia_pct = (new_ganancia / new_cap * 100) if new_cap > 0 else 0

                existing_entry["Valor_Actual"]     = new_valor
                existing_entry["Capital_Invertido"] = new_cap
                existing_entry["Participaciones"]   = new_partic
                existing_entry["Ganancia_Abs"]      = new_ganancia
                existing_entry["Ganancia_Pct"]      = round(new_ganancia_pct, 2)
                existing_entry["YTD (%)"]           = f"{new_ganancia_pct:+.1f}%"
                existing_entry["has_manual"]        = True
                # Recompute all weights
                total_val_new = sum(safe_float(f.get("Valor_Actual", 0)) for f in funds_list)
                for f in funds_list:
                    f["Porcentaje"] = round(
                        safe_float(f.get("Valor_Actual", 0)) / total_val_new * 100
                        if total_val_new > 0 else 0, 2
                    )
            else:
                # ── New fund not in FIFO: create entry ───────────────────
                mp_tipo = mp.get("tipo", "RV").upper()
                mp_label = _TIPO_LABEL.get(mp_tipo, mp_tipo)
                mp_ganancia = mp_valor - mp_cap
                mp_ganancia_pct = (mp_ganancia / mp_cap * 100) if mp_cap > 0 else 0

                total_val_with_manual = total_val + mp_valor
                mp_peso = (mp_valor / total_val_with_manual * 100) if total_val_with_manual > 0 else 0
                if total_val_with_manual > 0:
                    factor = total_val / total_val_with_manual
                    for f in funds_list:
                        f["Porcentaje"] = round(f["Porcentaje"] * factor, 2)
                total_val = total_val_with_manual
                if mp_tipo == "RF":
                    total_rf += mp_peso
                elif mp_tipo == "CASH":
                    total_cash += mp_peso
                elif mp_tipo == "ALTERNATIVO":
                    total_alt += mp_peso
                else:
                    total_rv += mp_peso
                details[mp_label] = details.get(mp_label, 0) + mp_peso
                fund_entry: dict[str, Any] = {
                    "Fondo": mp.get("name") or mp_isin,
                    "TIPO": mp_tipo,
                    "Porcentaje": round(mp_peso, 2),
                    "ISIN": mp_isin,
                    "NAV (Precio)": "---",
                    "YTD (%)": f"{mp_ganancia_pct:+.1f}%",
                    "Estrellas MS": "---",
                    "Categoría": mp_label,
                    "IsIndex": mp_tipo == "INDEX",
                    "Valor_Actual": round(mp_valor, 2),
                    "Capital_Invertido": round(mp_cap, 2),
                    "Ganancia_Abs": round(mp_ganancia, 2),
                    "Ganancia_Pct": round(mp_ganancia_pct, 2),
                    "finect_url": None,
                    "is_manual": True,
                }
                if mp_partic is not None:
                    fund_entry["Participaciones"] = float(mp_partic)
                funds_list.append(fund_entry)
                _existing_isins.add(mp_isin)
    except Exception as _mp_err:
        logger.warning("Error merging manual_positions into summary: %s", _mp_err)

    total_indexed = sum(f["Porcentaje"] for f in funds_list if f["IsIndex"])
    total_active = sum(f["Porcentaje"] for f in funds_list if not f["IsIndex"])

    rec: Dict[str, Any] = {}
    if total_cash > 15:
        rec["cash_warn"] = {
            "title": "Exceso de Liquidez",
            "text": f"Tienes {total_cash:.1f}% en liquidez.",
        }

    return {
        "summary": {
            "total_rv": round(total_rv, 2),
            "total_rf": round(total_rf, 2),
            "total_cash": round(total_cash, 2),
            "total_alt": round(total_alt, 2),
            "total_indexed": round(total_indexed, 2),
            "total_active": round(total_active, 2),
            "details": {k: round(v, 2) for k, v in details.items()},
        },
        "funds": funds_list,
        "recommendation": rec,
        "built_at": datetime.utcnow().isoformat() + "Z",
    }


def build_details() -> Dict[str, Any]:
    """Construye detalles (sector/region) por fondo."""
    client = get_portfolio_client()
    pos = client.positions(live=True)
    if pos.empty:
        return {}

    total_val = pos["Valor_Actual"].sum() if pos["Valor_Actual"].notna().any() else pos["Capital_Invertido"].sum()
    result = {}

    for _, row in pos.iterrows():
        isin = row["ISIN"]

        async def _fetch_detail(i):
            info = await client.provider.get_fund_info(i) or {}
            sectors_raw = await client.provider.get_sector_weights(i) or {}
            regions_raw = await client.provider.get_country_weights(i) or {}
            return info, sectors_raw, regions_raw

        info, sectors_raw, regions_raw = _run(_fetch_detail(isin))
        name = info.get("name", row.get("Fondo", isin))
        sectors = normalize_sectors({k: safe_float(v) for k, v in sectors_raw.items()})
        regions = normalize_regions({k: safe_float(v) for k, v in regions_raw.items()})

        valor = safe_float(row.get("Valor_Actual", row.get("Capital_Invertido", 0)))
        pct = (valor / total_val * 100) if total_val > 0 else 0
        fund_type = classify_fund(info=info)

        # Resolve Finect URL with slug
        try:
            from .finect_provider import _get_finect_url as _get_url
            finect_url = _get_url(isin)
        except Exception:
            finect_url = None

        result[name] = {
            "isin": isin,
            "sector": sectors,
            "region": regions,
            "percentage": round(pct, 2),
            "tipo": fund_type.name,
            "finect_url": finect_url,
        }

    return result


def build_history_batch() -> Dict[str, Any]:
    """Construye histórico por fondo compatible con /history_batch."""
    client = get_portfolio_client()
    hist = client.history(years=10)
    if hist.empty:
        return {}

    date_col = hist.columns[0]
    pos = client.positions(live=True)

    # Map names to ISINs for group detection
    name_to_isin: Dict[str, str] = {}
    for _, row in pos.iterrows():
        name_to_isin[row["Fondo"]] = row["ISIN"]

    seen_groups: Dict[str, str] = {}
    skip_cols: set = set()
    for col in hist.columns:
        if col == date_col:
            continue
        isin = name_to_isin.get(col, "")
        canonical = get_canonical_isin(isin)
        if canonical in seen_groups:
            skip_cols.add(col)
        else:
            seen_groups[canonical] = col

    result: Dict[str, Any] = {}
    fund_series: Dict[str, pd.Series] = {}

    for col in hist.columns:
        if col == date_col or col in skip_cols:
            continue
        series = hist[[date_col, col]].dropna(subset=[col])
        result[col] = [
            {"date": row[date_col].strftime("%Y-%m-%d") if hasattr(row[date_col], "strftime") else str(row[date_col]),
             "price": safe_float(row[col])}
            for _, row in series.iterrows()
        ]
        fund_series[col] = series.set_index(date_col)[col]

    # ── Incluir fondos manuales cuyo ISIN no tiene NAV en el batch ──────────
    try:
        from .persistence_service import get_persistence_service as _get_ps_hb
        _manual_list = _get_ps_hb().list_manual_positions()
        # Build a set of ISINs already covered (resolved from pos DataFrame)
        _covered_isins: set = set()
        for _, _r in pos.iterrows():
            _covered_isins.add(str(_r.get("ISIN", "")).strip().upper())
        for _mp in _manual_list:
            _mp_isin = ((_mp.get("isin") or "")).strip().upper()
            _mp_name = _mp.get("name") or _mp_isin
            if not _mp_isin or _mp_isin in _covered_isins:
                continue
            try:
                _nav_df = client.fund_nav_history(_mp_isin, years=10)
                if _nav_df is not None and not _nav_df.empty:
                    # Normalise: either {date,price} columns or date-index
                    if "date" in _nav_df.columns and "price" in _nav_df.columns:
                        _series_data = [
                            {"date": str(row["date"])[:10], "price": safe_float(row["price"])}
                            for _, row in _nav_df.iterrows()
                            if row["price"] is not None
                        ]
                    else:
                        _series_data = [
                            {"date": str(idx)[:10], "price": safe_float(val)}
                            for idx, val in _nav_df.squeeze().items()
                            if val is not None
                        ]
                    if _series_data:
                        result[_mp_name] = _series_data
                        # Also expose as a Series for the portfolio-line computation
                        _tmp = pd.Series(
                            {r["date"]: r["price"] for r in _series_data},
                            name=_mp_name,
                        )
                        _tmp.index = pd.to_datetime(_tmp.index)
                        fund_series[_mp_name] = _tmp
                        _covered_isins.add(_mp_isin)
                        logger.info("build_history_batch: added manual fund %s (%s)", _mp_name, _mp_isin)
            except Exception as _mp_err:
                logger.warning("build_history_batch: error fetching NAV for manual %s: %s", _mp_isin, _mp_err)
    except Exception as _mp_outer_err:
        logger.warning("build_history_batch: error loading manual positions: %s", _mp_outer_err)

    # Serie "Mi Cartera Actual"
    if len(fund_series) >= 2:
        try:
            total_val = pos["Valor_Actual"].sum() if pos["Valor_Actual"].notna().any() else pos["Capital_Invertido"].sum()
            weights: Dict[str, float] = {}
            for _, row in pos.iterrows():
                name = row["Fondo"]
                val = safe_float(row.get("Valor_Actual", row.get("Capital_Invertido", 0)))
                weights[name] = weights.get(name, 0) + (val / total_val if total_val > 0 else 0)

            all_prices = pd.concat(fund_series.values(), axis=1, join="outer").sort_index().ffill()
            daily_returns = all_prices.pct_change().dropna(how="all")

            weight_vec = pd.Series({k: weights.get(k, 0.0) for k in fund_series})
            valid_mask = daily_returns[list(fund_series.keys())].notna()
            period_weights = valid_mask.multiply(weight_vec)
            period_weight_sums = period_weights.sum(axis=1).replace(0, pd.NA)
            portfolio_return = (
                daily_returns[list(fund_series.keys())]
                .fillna(0)
                .multiply(period_weights)
                .sum(axis=1)
                .div(period_weight_sums)
                .fillna(0)
            )
            cum_return = (1 + portfolio_return).cumprod() * 100
            result["📊 Mi Cartera Actual"] = [
                {"date": d.strftime("%Y-%m-%d"), "price": round(float(v), 4)}
                for d, v in cum_return.items() if pd.notna(v)
            ]
        except Exception as e:
            logger.warning("Error building portfolio line: %s", e)

    return result


def build_real_portfolio_history(years: int = 30) -> Dict[str, Any]:
    """Evolución real del portfolio basada en órdenes: participaciones × NAV por día.

    A diferencia de ``build_history_batch`` (que usa pesos actuales sobre toda la historia),
    esta función reconstruye el valor diario real de la cartera aplicando cada orden en
    su fecha de ejecución, de modo que el patrimonio sube el día que se invierte y baja
    el día que se reembolsa.

    Returns:
        {
          "series":  [{"date": "YYYY-MM-DD", "value": float, "invested": float}, ...],
          "monthly": [{"date", "label", "value", "invested", "gain", "gain_pct", "mom"}, ...],
        }
    """
    import asyncio

    client = get_portfolio_client()
    movements = client.portfolio.movements

    if movements.empty:
        return {"series": [], "monthly": []}

    # All ISINs ever traded (including old share classes)
    all_isins_raw: List[str] = [str(i) for i in movements["ISIN"].dropna().unique()]
    canonical_map: Dict[str, str] = {isin: get_canonical_isin(isin) for isin in all_isins_raw}
    # Fetch NAV for EVERY raw ISIN so each share class uses its own price
    all_nav_isins = list(set(all_isins_raw) | set(canonical_map.values()))

    async def _fetch_all_navs() -> Dict[str, pd.Series]:
        results = await asyncio.gather(
            *[client.core.provider.get_nav_history(isin, years=years) for isin in all_nav_isins],
            return_exceptions=True,
        )
        nav: Dict[str, pd.Series] = {}
        for isin, res in zip(all_nav_isins, results):
            if isinstance(res, BaseException) or not isinstance(res, pd.DataFrame) or res.empty:
                continue
            s = res.set_index("date")["price"]
            s.index = pd.to_datetime(s.index)
            nav[isin] = s
        return nav

    nav_series: Dict[str, pd.Series] = _run(_fetch_all_navs())
    if not nav_series:
        return {"series": [], "monthly": []}

    etf_isins: set = client.portfolio._etf_isins

    mov_sorted = movements.sort_values("Fecha").copy()
    first_order_date = pd.Timestamp(mov_sorted["Fecha"].min())
    all_nav_dates: pd.DatetimeIndex = pd.DatetimeIndex(
        sorted({d for s in nav_series.values() for d in s.index})
    )
    all_dates = all_nav_dates[all_nav_dates >= first_order_date]
    if len(all_dates) == 0:
        return {"series": [], "monthly": []}

    def _fix_loc(units: float, amount: float, is_etf: bool = False) -> float:
        if units == 0:
            return 0.0
        abs_u = abs(units)
        if is_etf:
            return abs_u
        if abs_u % 1 == 0:
            return abs_u / 1000.0
        return abs_u

    from collections import defaultdict as _dd

    # ── Process each raw ISIN independently ─────────────────────────────────
    # Each share class is tracked with its own cumulative participaciones and
    # valued at its own NAV price.  ISINs in the same FUND_GROUP are summed
    # together under a single display name.
    cum_parts_raw: Dict[str, pd.Series] = {}   # raw_isin → daily cumulative units
    cum_inv_canonical: Dict[str, pd.Series] = {}  # canonical → daily cumulative cost

    for raw_isin, grp in mov_sorted.groupby("ISIN"):
        raw_isin = str(raw_isin)
        canonical = canonical_map.get(raw_isin, raw_isin)
        # We need at least some NAV data for this ISIN (own or canonical)
        if raw_isin not in nav_series and canonical not in nav_series:
            continue

        grp_sorted = grp.sort_values("Fecha")
        is_etf_isin = raw_isin in etf_isins
        day_parts: dict = _dd(float)
        day_inv: dict = _dd(float)
        running_parts = 0.0
        running_cost = 0.0

        for _, row in grp_sorted.iterrows():
            dt = pd.Timestamp(row["Fecha"])
            raw_parts = float(row.get("Participaciones", 0))
            imp = abs(safe_float(row.get("Importe", 0)))

            is_sell = raw_parts < 0
            if not is_sell and "Tipo" in row.index:
                tipo = str(row.get("Tipo", "")).lower()
                if "venta" in tipo or "reembolso" in tipo:
                    is_sell = True

            true_parts = _fix_loc(raw_parts, imp, is_etf=is_etf_isin)

            if not is_sell and true_parts > 0:
                cost = imp if imp > 0 else 0.0
                if cost == 0.0:
                    nav_s = nav_series.get(raw_isin)
                    if nav_s is None:
                        nav_s = nav_series.get(canonical)
                    if nav_s is not None:
                        nav_at = nav_s[nav_s.index <= dt]
                        if nav_at.empty:
                            nav_at = nav_s[nav_s.index >= dt]
                        cost = float(nav_at.iloc[-1]) * true_parts if not nav_at.empty else 0.0
                day_parts[dt] += true_parts
                running_parts += true_parts
                running_cost += cost
                day_inv[dt] += cost
            elif is_sell and true_parts > 0:
                day_parts[dt] -= true_parts
                if running_parts > 1e-9:
                    ratio = min(true_parts / running_parts, 1.0)
                    cost_red = running_cost * ratio
                    running_parts = max(0.0, running_parts - true_parts)
                    running_cost = max(0.0, running_cost - cost_red)
                    day_inv[dt] -= cost_red

        if day_parts:
            ps = pd.Series(dict(day_parts)).sort_index()
            ps.index = pd.to_datetime(ps.index)
            cum = ps.reindex(all_dates, fill_value=0.0).cumsum().clip(lower=0)
        else:
            cum = pd.Series(0.0, index=all_dates)
        cum_parts_raw[raw_isin] = cum

        if day_inv:
            inv_s = pd.Series(dict(day_inv)).sort_index()
            inv_s.index = pd.to_datetime(inv_s.index)
            inv_cum = inv_s.reindex(all_dates, fill_value=0.0).cumsum()
        else:
            inv_cum = pd.Series(0.0, index=all_dates)

        prev = cum_inv_canonical.get(canonical, pd.Series(0.0, index=all_dates))
        cum_inv_canonical[canonical] = prev.add(inv_cum, fill_value=0)

    # ── Resolve display names ────────────────────────────────────────────────
    canonical_isins = list(set(canonical_map.values()))
    isin_name_map: Dict[str, str] = {}
    if not movements.empty and "Fondo" in movements.columns:
        for _, row in movements.iterrows():
            can = get_canonical_isin(str(row["ISIN"]))
            fondo_val = row.get("Fondo")
            name = str(fondo_val) if pd.notna(fondo_val) else ""
            if name and name.lower() not in ("nan", ""):
                isin_name_map[can] = name

    missing_isins = [c for c in canonical_isins if c not in isin_name_map]
    if missing_isins:
        try:
            async def _resolve_names(isins: list) -> Dict[str, str]:
                result: Dict[str, str] = {}
                for isin in isins:
                    try:
                        info = await client.provider.get_fund_info(isin)
                        if info and info.get("name"):
                            result[isin] = info["name"]
                    except Exception:
                        pass
                return result
            isin_name_map.update(_run(_resolve_names(missing_isins)))
        except Exception as exc:
            logger.warning("Error resolving fund names from provider: %s", exc)

    # ── Live NAVs from positions (same source as "Mi Cartera Base") ─────────
    # Fetch live prices once and use them to pin the most-recent date to the
    # same values shown in the General tab, eliminating NAV-lag discrepancies.
    live_navs: Dict[str, float] = {}
    try:
        df_live = client.positions(live=True)
        for _, _row in df_live.iterrows():
            _isin = str(_row["ISIN"])
            _price = _row.get("Precio_Actual")
            _val = _row.get("Valor_Actual")
            _parts = _row.get("Participaciones")
            # Derive live NAV: prefer Precio_Actual; fallback to Valor/Participaciones
            if _price and float(_price) > 0:
                live_navs[_isin] = float(_price)
            elif _val and _parts and float(_parts) > 0:
                live_navs[_isin] = float(_val) / float(_parts)
    except Exception as _e:
        logger.warning("Could not fetch live NAVs for evolution pinning: %s", _e)

    # ── Aggregate by canonical: each raw ISIN × its own NAV ─────────────────
    portfolio_value = pd.Series(0.0, index=all_dates)
    total_invested = pd.Series(0.0, index=all_dates)
    fund_value_series: Dict[str, pd.Series] = {}
    fund_inv_series: Dict[str, pd.Series] = {}

    # The last date available in all_dates (most recent NAV date)
    last_date = all_dates[-1] if len(all_dates) > 0 else None

    for canonical in canonical_isins:
        raw_isins_in_group = [r for r, c in canonical_map.items() if c == canonical and r in cum_parts_raw]
        if not raw_isins_in_group:
            continue

        fund_val = pd.Series(0.0, index=all_dates)
        for raw_isin in raw_isins_in_group:
            parts = cum_parts_raw[raw_isin]
            nav_src = nav_series.get(raw_isin)
            if nav_src is None:
                nav_src = nav_series.get(canonical)
            if nav_src is None:
                # If we have a live NAV and current holding, inject a synthetic
                # single-point series so the fund appears in the final date.
                _syn_price = live_navs.get(raw_isin) or live_navs.get(canonical)
                if _syn_price and last_date is not None:
                    synthetic_nav = pd.Series(_syn_price, index=[last_date])
                    nav_src = synthetic_nav
                else:
                    continue
            nav = nav_src.reindex(all_dates, method="ffill")
            # Override the most-recent date with the live NAV when available
            if last_date is not None and raw_isin in live_navs:
                nav.loc[last_date] = live_navs[raw_isin]
            elif last_date is not None and canonical in live_navs:
                nav.loc[last_date] = live_navs[canonical]
            fund_val = fund_val.add((parts * nav).fillna(0), fill_value=0)

        portfolio_value = portfolio_value.add(fund_val, fill_value=0)
        fund_name = isin_name_map.get(canonical, canonical)
        fund_value_series[fund_name] = fund_val
        if canonical in cum_inv_canonical:
            total_invested = total_invested.add(cum_inv_canonical[canonical], fill_value=0)
            fund_inv_series[fund_name] = cum_inv_canonical[canonical]

    # ── Build output series ──────────────────────────────────────────────────
    mask = portfolio_value > 0
    portfolio_value = portfolio_value[mask]
    total_invested = total_invested.reindex(portfolio_value.index, fill_value=0)

    # Pin the last date's values to match "Mi Cartera Base" exactly.
    # 1) Total Valor_Actual from positions (live) replaces the last evolution point.
    # 2) Total Capital_Invertido from positions replaces the last invested point.
    # 3) Per-fund values are also pinned so their sum equals the total.
    # This eliminates NAV-lag drift and includes funds with no NAV history
    # (e.g. ES0141116030 which has no Finect/YF price history).
    try:
        _live_inv_total = float(df_live["Capital_Invertido"].dropna().sum())
        if _live_inv_total > 0 and last_date is not None and last_date in total_invested.index:
            total_invested.loc[last_date] = _live_inv_total

        # ── Pin per-fund at last_date to live Valor_Actual / Capital_Invertido ──
        # Build a mapping: canonical ISIN → SUM(Valor_Actual), SUM(Capital_Invertido)
        # IMPORTANT: df_live may have multiple rows for ISINs that map to the
        # same canonical (e.g. different share classes in the same FUND_GROUP).
        # We must aggregate by canonical so the per-fund pin matches the total.
        _live_val_per_canonical: Dict[str, float] = {}
        _live_inv_per_canonical: Dict[str, float] = {}
        for _, _lr in df_live.iterrows():
            _li = str(_lr["ISIN"])
            _canonical_li = get_canonical_isin(_li)
            _lv = _lr.get("Valor_Actual")
            _lc = _lr.get("Capital_Invertido")
            if _lv is not None and pd.notna(_lv):
                _live_val_per_canonical[_canonical_li] = (
                    _live_val_per_canonical.get(_canonical_li, 0.0) + float(_lv)
                )
            if _lc is not None and pd.notna(_lc):
                _live_inv_per_canonical[_canonical_li] = (
                    _live_inv_per_canonical.get(_canonical_li, 0.0) + float(_lc)
                )

        # Map canonical → fund_name (reverse of isin_name_map)
        _can_to_name: Dict[str, str] = {
            c: isin_name_map.get(c, c) for c in canonical_isins
        }

        for _ci, _fn in _can_to_name.items():
            # Pin fund value
            if (
                _fn in fund_value_series
                and last_date is not None
                and _ci in _live_val_per_canonical
                and last_date in fund_value_series[_fn].index
            ):
                fund_value_series[_fn].loc[last_date] = _live_val_per_canonical[_ci]
            # Pin fund invested
            if (
                _fn in fund_inv_series
                and last_date is not None
                and _ci in _live_inv_per_canonical
                and last_date in fund_inv_series[_fn].index
            ):
                fund_inv_series[_fn].loc[last_date] = _live_inv_per_canonical[_ci]

        # Handle funds in df_live that have no entry in fund_value_series
        # (e.g. no NAV history at all → they were skipped entirely)
        for _ci, _fn in _can_to_name.items():
            if _fn not in fund_value_series and _ci in _live_val_per_canonical and last_date is not None:
                _syn = pd.Series(0.0, index=all_dates)
                _syn.loc[last_date] = _live_val_per_canonical[_ci]
                fund_value_series[_fn] = _syn
                if _ci in _live_inv_per_canonical:
                    _isyn = pd.Series(0.0, index=all_dates)
                    _isyn.loc[last_date] = _live_inv_per_canonical[_ci]
                    fund_inv_series[_fn] = _isyn

        # ── Recompute portfolio totals from per-fund series ──────────────────
        # This guarantees that the total evolution chart is ALWAYS the exact sum
        # of the individual per-fund charts — no independent overrides that could
        # create a jump/divergence on the last date.
        if fund_value_series:
            _pv_new = pd.concat(list(fund_value_series.values()), axis=1).fillna(0).sum(axis=1)
            _pv_new = _pv_new.reindex(all_dates, fill_value=0.0)
            _pv_mask = _pv_new > 0
            portfolio_value = _pv_new[_pv_mask]
        if fund_inv_series:
            _ti_new = pd.concat(list(fund_inv_series.values()), axis=1).fillna(0).sum(axis=1)
            total_invested = _ti_new.reindex(portfolio_value.index, fill_value=0.0)

    except Exception as _pin_err:
        logger.warning("Could not pin last evolution date to live positions: %s", _pin_err)

    series = [
        {
            "date": d.strftime("%Y-%m-%d"),
            "value": round(float(v), 2),
            "invested": round(float(total_invested.get(d, 0.0)), 2),
        }
        for d, v in portfolio_value.items()
        if pd.notna(v) and float(v) > 0
    ]

    monthly: List[Dict[str, Any]] = []
    monthly_per_fund: Dict[str, List[Dict[str, Any]]] = {}

    if series:
        df_s = pd.DataFrame(series)
        df_s["date"] = pd.to_datetime(df_s["date"])
        df_s["month"] = df_s["date"].dt.to_period("M")
        last_of_month = df_s.groupby("month").last().reset_index(drop=True)
        prev_value: Optional[float] = None
        for _, row in last_of_month.iterrows():
            val = float(row["value"])
            inv = float(row["invested"])
            gain = val - inv
            gain_pct = (gain / inv * 100) if inv > 0 else 0.0
            mom = ((val / prev_value - 1) * 100) if prev_value and prev_value > 0 else None
            monthly.append({
                "date": row["date"].strftime("%Y-%m-%d"),
                "label": row["date"].strftime("%b %Y"),
                "value": round(val, 2),
                "invested": round(inv, 2),
                "gain": round(gain, 2),
                "gain_pct": round(gain_pct, 2),
                "mom": round(mom, 2) if mom is not None else None,
            })
            prev_value = val

        month_end_dates = last_of_month["date"].tolist()
        for fund_name, fv_series in fund_value_series.items():
            fi_series = fund_inv_series.get(fund_name, pd.Series(0.0, index=all_dates))
            fund_monthly: List[Dict[str, Any]] = []
            for dt in month_end_dates:
                fv = float(fv_series.get(dt, 0.0)) if dt in fv_series.index else 0.0
                fi = float(fi_series.get(dt, 0.0)) if dt in fi_series.index else 0.0
                fg = fv - fi
                fg_pct = (fg / fi * 100) if fi > 0 else 0.0
                fund_monthly.append({
                    "date": dt.strftime("%Y-%m-%d"),
                    "value": round(fv, 2),
                    "invested": round(fi, 2),
                    "gain": round(fg, 2),
                    "gain_pct": round(fg_pct, 2),
                })
            if any(m["value"] > 0 for m in fund_monthly):
                monthly_per_fund[fund_name] = fund_monthly

    funds_out: Dict[str, List[Dict]] = {}
    invested_out: Dict[str, List[Dict]] = {}
    for fund_name, fv_series in fund_value_series.items():
        fmask = fv_series > 0
        fund_pts = [
            {"date": d.strftime("%Y-%m-%d"), "value": round(float(v), 2)}
            for d, v in fv_series[fmask].items()
        ]
        if fund_pts:
            funds_out[fund_name] = fund_pts
        fi_series = fund_inv_series.get(fund_name)
        if fi_series is not None:
            invested_out[fund_name] = [
                {"date": d.strftime("%Y-%m-%d"), "invested": round(float(v), 2)}
                for d, v in fi_series[fmask].items()
            ]

    return {
        "series": series,
        "monthly": monthly,
        "monthly_per_fund": monthly_per_fund,
        "funds": funds_out,
        "invested_per_fund": invested_out,
    }


def build_real_portfolio_history_per_fund(years: int = 30) -> Dict[str, Any]:
    """Evolución real desglosada por fondo: valor diario = participaciones × NAV.

    Delega completamente en ``build_real_portfolio_history`` para garantizar que:
    - Se usa el mismo seguimiento por ISIN-raw (evita el error de ratio
      combinado cuando se vende un share-class mientras se mantiene otro del
      mismo grupo de fondos).
    - Las correcciones de divisa (XS2940466316 USD→EUR, IE00B4ND3602 USD→EUR)
      se aplican igual en ambas vistas.
    - El "pinning" al valor live de posiciones aplica igual en la vista total
      y en el desglose por fondo.

    Returns:
        {
          "funds": {fund_name: [{"date": str, "value": float}, ...], ...},
          "invested_per_fund": {fund_name: [{"date": str, "invested": float}, ...], ...},
          "monthly_per_fund": {fund_name: [{"date", "value", "invested", "gain", "gain_pct"}, ...], ...},
        }
    """
    full = build_real_portfolio_history(years=years)
    return {
        "funds": full.get("funds", {}),
        "invested_per_fund": full.get("invested_per_fund", {}),
        "monthly_per_fund": full.get("monthly_per_fund", {}),
    }


def build_correlation() -> Dict[str, Any]:
    """Construye la matriz de correlación."""
    client = get_portfolio_client()
    df_corr = client.correlation(years=5)
    if df_corr.empty:
        return {}
    # Serializar como dict de dicts
    return {col: df_corr[col].to_dict() for col in df_corr.columns}


# ---------------------------------------------------------------------------
# Simulación de incorporación
# ---------------------------------------------------------------------------


def simulate_addition(isin: str, amount: float) -> Dict[str, Any]:
    """Simula la incorporación de un fondo al portfolio."""
    client = get_portfolio_client()
    result = client.simulate_addition(isin, amount)

    # Map columns to the SimulatedFundDetail schema
    funds = [
        {
            "isin": row["ISIN"],
            "name": row["Fondo"],
            "current_weight": row.get("Peso_Actual", 0.0),
            "simulated_weight": row.get("Peso_Simulado", 0.0),
        }
        for row in result["weights"].to_dict(orient="records")
    ]

    return {
        "added_isin": isin,
        "added_name": result["metadata"]["added_name"],
        "added_amount": amount,
        "current_total": result["metadata"]["current_total"],
        "simulated_total": result["metadata"]["simulated_total"],
        "funds": funds,
        "current_portfolio_metrics": {},
        "simulated_portfolio_metrics": {},
        "history_current": [],
        "history_fund": [],
        "history_simulated": [],
        "period_returns": [],
    }


def simulate_rebalance(target_weights: Dict[str, float]) -> Dict[str, Any]:
    """Simula el rebalanceo del portfolio a los pesos objetivo.

    Args:
        target_weights: Diccionario {isin: fracción} con suma ≈ 1.

    Returns:
        Diccionario con históricos, métricas y movimientos necesarios.
    """
    client = get_portfolio_client()
    result = client.simulate_rebalance(target_weights)

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

    return {
        "total_value": result["metadata"]["total_value"],
        "funds": funds,
        "current_portfolio_metrics": result.get("current_portfolio_metrics", {}),
        "simulated_portfolio_metrics": result.get("simulated_portfolio_metrics", {}),
        "history_current": result.get("history_current", []),
        "history_simulated": result.get("history_simulated", []),
        "period_returns": result.get("period_returns", []),
    }


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------


def run_analytics_pipeline(force_download: bool = False):
    """Recalcula todos los datos y los escribe a calculated/.

    Usa un lock para evitar ejecuciones concurrentes que bloquearian SQLite.
    Si ya hay un pipeline en curso, la llamada retorna inmediatamente.
    """
    if not _pipeline_lock.acquire(blocking=False):
        logger.info("Analytics Pipeline ya en ejecucion — omitiendo llamada duplicada")
        return
    try:
        logger.info("=== Analytics Pipeline START (force=%s) ===", force_download)
        start = time.time()

        if force_download:
            reset_client(force_refresh=True)

        summary = {}
        try:
            summary = build_summary()
        except Exception as e:
            logger.error("Error building summary: %s", e)
        try:
            real_evo = build_real_portfolio_history()
            summary["real_evolution"] = real_evo
            _save_json("real_evolution.json", real_evo)
        except Exception as e:
            logger.error("Error building real_evolution: %s", e)
        if summary:
            _save_json("summary.json", summary)

        try:
            details = build_details()
            _save_json("details.json", details)
        except Exception as e:
            logger.error("Error building details: %s", e)

        try:
            history = build_history_batch()
            _save_json("history_batch.json", history)
        except Exception as e:
            logger.error("Error building history_batch: %s", e)

        try:
            corr = build_correlation()
            _save_json("correlation.json", corr)
        except Exception as e:
            logger.error("Error building correlation: %s", e)

        elapsed = time.time() - start
        logger.info("=== Analytics Pipeline DONE in %.1fs ===", elapsed)
    finally:
        _pipeline_lock.release()


def run_nav_pipeline(force_download: bool = False):
    """Recalcula solo cotizaciones: summary + history + correlation."""
    if not _pipeline_lock.acquire(blocking=False):
        logger.info("NAV Pipeline ya en ejecucion — omitiendo llamada duplicada")
        return
    try:
        logger.info("=== NAV Pipeline START (force=%s) ===", force_download)
        start = time.time()
        if force_download:
            reset_client(force_refresh=True)
        summary_data = {}
        try:
            summary_data = build_summary()
        except Exception as e:
            logger.error("Error building summary: %s", e)
        try:
            real_evo = build_real_portfolio_history()
            summary_data["real_evolution"] = real_evo
            _save_json("real_evolution.json", real_evo)
        except Exception as e:
            logger.error("Error building real_evolution: %s", e)
        if summary_data:
            _save_json("summary.json", summary_data)
        try:
            _save_json("history_batch.json", build_history_batch())
        except Exception as e:
            logger.error("Error building history_batch: %s", e)
        try:
            _save_json("correlation.json", build_correlation())
        except Exception as e:
            logger.error("Error building correlation: %s", e)
        logger.info("=== NAV Pipeline DONE in %.1fs ===", time.time() - start)
    finally:
        _pipeline_lock.release()


def run_details_pipeline(force_download: bool = False):
    """Recalcula solo detalles (sectores, regiones, métricas)."""
    if not _pipeline_lock.acquire(blocking=False):
        logger.info("Details Pipeline ya en ejecucion — omitiendo llamada duplicada")
        return
    try:
        logger.info("=== Details Pipeline START (force=%s) ===", force_download)
        start = time.time()
        if force_download:
            reset_client(force_refresh=True)
        try:
            _save_json("details.json", build_details())
        except Exception as e:
            logger.error("Error building details: %s", e)
        logger.info("=== Details Pipeline DONE in %.1fs ===", time.time() - start)
    finally:
        _pipeline_lock.release()


# ---------------------------------------------------------------------------
# Fund detail (para /fund/{isin}/details y /fund/search)
# ---------------------------------------------------------------------------

_KEY_MAP = {
    "sharperatio": "sharpe_ratio",
    "alpha": "alpha",
    "beta": "beta",
    "standarddeviation": "standard_deviation",
    "maxdrawdown": "max_drawdown",
    "trackingerror": "tracking_error",
    "informationratio": "information_ratio",
    "r2": "r2",
    "correlation": "correlation",
}


def _extract_fund_metrics(info: Dict[str, Any]) -> Dict[str, Any]:
    metrics: Dict[str, Any] = {}
    for finect_key, schema_key in _KEY_MAP.items():
        val = info.get(finect_key)
        if val is not None:
            metrics[schema_key] = safe_float(val)
    return metrics


async def _get_fund_detail_async(isin: str) -> Dict[str, Any]:
    """Detalle completo de un fondo usando el provider async."""
    client = get_portfolio_client()
    provider = client.provider

    results = await asyncio.gather(
        provider.get_fund_info(isin),
        provider.get_sector_weights(isin),
        provider.get_country_weights(isin),
        provider.get_holdings(isin),
        return_exceptions=True,
    )

    info = results[0] if not isinstance(results[0], BaseException) else {}
    sectors = results[1] if not isinstance(results[1], BaseException) else {}
    countries = results[2] if not isinstance(results[2], BaseException) else {}
    holdings_df = results[3] if not isinstance(results[3], BaseException) else pd.DataFrame()

    info = info or {}
    sectors = sectors or {}
    countries = countries or {}
    holdings = holdings_df.to_dict("records") if hasattr(holdings_df, 'empty') and not holdings_df.empty else []

    # Resolve the full Finect URL with slug for this ISIN
    try:
        from .finect_provider import _get_finect_url as _sync_finect_url
        finect_url = _sync_finect_url(isin)
    except Exception:
        finect_url = None

    return {
        "isin": isin,
        "name": info.get("name", isin),
        "expense_ratio": info.get("total_expense_ratio") or info.get("ongoing_charge"),
        "aum": info.get("total_net_asset"),
        "inception_date": info.get("inception_date"),
        "rating": info.get("rating_morningstar"),
        "risk_score": info.get("srri"),
        "srri": info.get("srri"),
        "category": info.get("category"),
        "management_company": info.get("management_company"),
        "metrics": _extract_fund_metrics(info) or None,
        "sectors": {k: safe_float(v) for k, v in sectors.items()},
        "countries": {k: safe_float(v) for k, v in countries.items()},
        "asset_allocation": {},
        "market_cap": {},
        "holdings": holdings,
        "source": info.get("source", ""),
        "finect_url": finect_url,
    }


def get_fund_detail_full(isin: str) -> Dict[str, Any]:
    """Detalle completo de un fondo: info, métricas, sectores, países, holdings."""
    return _run(_get_fund_detail_async(isin))


_fund_detail_cache: Dict[str, Any] = {}
_fund_detail_cache_ts: Dict[str, float] = {}
_FUND_DETAIL_TTL = 3600  # 1 hora en memoria
_FUND_DETAIL_DISK_TTL = 86400 * 7  # 7 días en disco


def get_fund_detail_full_cached(isin: str) -> Dict[str, Any]:
    """Wrapper de get_fund_detail_full con caché en memoria (TTL 1h) y disco (TTL 7 días)."""
    import os as _os

    now = time.time()
    # 1. In-memory cache (fast path)
    if isin in _fund_detail_cache and now - _fund_detail_cache_ts.get(isin, 0) < _FUND_DETAIL_TTL:
        return _fund_detail_cache[isin]

    # 2. Disk cache
    disk_path = CACHE_DIR / f"fund_detail_{isin}.json"
    if disk_path.exists():
        age = now - disk_path.stat().st_mtime
        if age < _FUND_DETAIL_DISK_TTL:
            try:
                import json as _json
                with open(disk_path, "r", encoding="utf-8") as f:
                    detail = _json.load(f)
                _fund_detail_cache[isin] = detail
                _fund_detail_cache_ts[isin] = now
                return detail
            except Exception:
                pass  # if corrupt, re-fetch

    # 3. Fetch from provider
    detail = get_fund_detail_full(isin)
    _fund_detail_cache[isin] = detail
    _fund_detail_cache_ts[isin] = now
    try:
        import json as _json
        with open(disk_path, "w", encoding="utf-8") as f:
            _json.dump(detail, f, ensure_ascii=False, default=str)
    except Exception:
        pass  # disk write failures are non-fatal
    return detail


# ---------------------------------------------------------------------------
# Benchmark MSCI World
# ---------------------------------------------------------------------------

_MSCI_WORLD_ISIN = "IE00B4L5Y983"  # iShares Core MSCI World UCITS ETF


def build_msci_world_benchmark() -> Dict[str, Any]:
    """Pesos sectoriales y geográficos del MSCI World (proxy iShares ETF)."""
    async def _fetch():
        client = get_portfolio_client()
        provider = client.provider
        sectors_raw, regions_raw = await asyncio.gather(
            provider.get_sector_weights(_MSCI_WORLD_ISIN),
            provider.get_country_weights(_MSCI_WORLD_ISIN),
        )
        return sectors_raw or {}, regions_raw or {}

    sectors_raw, regions_raw = _run(_fetch())
    result = {
        "sectors": normalize_sectors({k: safe_float(v) for k, v in sectors_raw.items()}),
        "regions": normalize_regions({k: safe_float(v) for k, v in regions_raw.items()}),
    }
    _save_json("benchmark_msci.json", result)
    return result


# ---------------------------------------------------------------------------
# Búsqueda de fondos en Finect
# ---------------------------------------------------------------------------

# Registro estático de ETFs conocidos (ticker → ISIN + metadatos).
# Incluye ETFs de energía nuclear disponibles en MyInvestor/Trade Republic.
_KNOWN_ETF_TICKERS: Dict[str, Dict[str, str]] = {
    "NUKL": {
        "isin": "IE000M7V94E1",
        "name": "VanEck Uranium and Nuclear Technologies UCITS ETF",
        "ticker": "NUKL",
    },
    "NUCL": {
        "isin": "IE000BMZP0I6",
        "name": "iShares Nuclear Energy and Uranium Mining UCITS ETF",
        "ticker": "NUCL",
    },
    "NCLR": {
        "isin": "IE0003BJ2JS4",
        "name": "WisdomTree Uranium and Nuclear Energy UCITS ETF (NCLR)",
        "ticker": "NCLR",
    },
    "NUCG": {
        "isin": "IE000M7V94E1",
        "name": "VanEck Uranium and Nuclear Technologies UCITS ETF (NUCG)",
        "ticker": "NUCG",
    },
    "WNUC": {
        "isin": "IE0003BJ2JS4",
        "name": "WisdomTree Uranium and Nuclear Energy UCITS ETF (WNUC)",
        "ticker": "WNUC",
    },
}

_TICKER_RE = re.compile(r"^[A-Z]{2,6}$")

# In-memory cache for search results (query → (timestamp, results))
_search_cache: Dict[str, tuple[float, List[Dict[str, Any]]]] = {}
_SEARCH_CACHE_TTL = 120  # 2 minutes


async def _search_etf_by_ticker(query: str) -> List[Dict[str, Any]]:
    """Busca ETFs por ticker usando el autocomplete de Yahoo Finance.

    Devuelve resultados con al menos ``isin`` (si disponible via yfinance),
    ``name`` y ``ticker``.  Nunca lanza excepciones — devuelve lista vacía
    en caso de error.
    """
    results: List[Dict[str, Any]] = []
    query_upper = query.upper().strip()

    # --- 1. Registro estático ---
    for tk, meta in _KNOWN_ETF_TICKERS.items():
        if query_upper in tk or tk in query_upper:
            results.append({
                "isin": meta["isin"],
                "name": meta["name"],
                "ticker": tk,
                "in_portfolio": False,
                "url": f"https://www.finect.com/etfs/{meta['isin']}",
            })

    # --- 2. Yahoo Finance autocomplete ---
    try:
        from .http_client import get_http_client

        yfin_url = (
            "https://query2.finance.yahoo.com/v1/finance/search"
            f"?q={query}&lang=en-US&region=ES&quotesCount=10&newsCount=0"
        )
        async with get_http_client() as client:
            resp = await client.get(yfin_url, timeout=5)
            if resp.status_code == 200:
                quotes = resp.json().get("quotes", [])
                seen_isins = {r["isin"] for r in results}
                for q in quotes:
                    if q.get("quoteType") not in ("ETF", "MUTUALFUND"):
                        continue
                    symbol: str = q.get("symbol", "")
                    name: str = q.get("longname") or q.get("shortname") or symbol
                    # Try yfinance for ISIN (run in thread to avoid blocking)
                    isin = ""
                    try:
                        import yfinance as yf

                        def _get_isin(s: str) -> str:
                            return yf.Ticker(s).isin or ""

                        raw_isin = await asyncio.to_thread(_get_isin, symbol)
                        isin = raw_isin if raw_isin and raw_isin != "-" else ""
                    except Exception:
                        pass
                    entry: Dict[str, Any] = {
                        "isin": isin or symbol,  # fallback: use ticker symbol as key
                        "name": name,
                        "ticker": symbol,
                        "in_portfolio": False,
                    }
                    if isin and isin not in seen_isins:
                        seen_isins.add(isin)
                        results.append(entry)
                    elif not isin and symbol not in seen_isins:
                        seen_isins.add(symbol)
                        results.append(entry)
    except Exception as exc:
        logger.debug("_search_etf_by_ticker Yahoo fallback failed: %s", exc)

    return results


def search_funds(query: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Busca fondos en el índice de sitemaps de Finect (por ISIN o nombre)."""
    return _run(search_funds_async(query, limit=limit))


async def search_funds_async(query: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Versión async de search_funds: busca en el sitemap de Finect + portfolio local."""
    # Check in-memory cache first
    cache_key = f"{query.lower().strip()}:{limit}"
    cached = _search_cache.get(cache_key)
    if cached and (time.time() - cached[0]) < _SEARCH_CACHE_TTL:
        return cached[1]

    client = get_portfolio_client()
    portfolio_isins: set = set(client.portfolio.positions.keys())
    query_lower = query.lower().strip()

    # --- Fallback: fondos del portfolio que coinciden ---
    portfolio_matches: List[Dict[str, Any]] = []
    history_cache = load_json("history_batch.json") or {}
    details_cache = load_json("details.json") or {}
    for isin in portfolio_isins:
        name = history_cache.get(isin, {}) if isinstance(history_cache.get(isin), dict) else isin
        if isinstance(history_cache.get(isin), list):
            name = isin  # history_batch stores lists of {date,price}
        # Try to get name from details cache
        for fund_name, fund_data in details_cache.items():
            if isinstance(fund_data, dict) and fund_data.get("isin") == isin:
                name = fund_name
                break
        if query_lower in isin.lower() or query_lower in str(name).lower():
            portfolio_matches.append({"isin": isin, "name": str(name), "in_portfolio": True})

    # --- Try sitemap index ---
    try:
        index: Dict[str, str] = await client.provider._finect._load_sitemap_index()
    except Exception as e:
        logger.warning("Async sitemap index load failed: %s — trying sync fallback", e)
        try:
            from .finect_provider import _load_sitemap_index as _sync_sitemap
            index = _sync_sitemap()
        except Exception as e2:
            logger.warning("Sync sitemap fallback also failed: %s", e2)
            index = {}

    results: List[Dict[str, Any]] = []
    exact_matches: List[Dict[str, Any]] = []

    for isin, url in index.items():
        slug = url.rsplit("/", 1)[-1] if "/" in url else url
        if "-" in slug:
            slug_name = slug.split("-", 1)[1] if slug.startswith(isin) else slug
        else:
            slug_name = slug[len(isin):].lstrip("-_") if slug.startswith(isin) else slug
        slug_name = slug_name.replace("_", " ").replace("-", " ")

        entry = {"isin": isin, "name": slug_name, "url": url, "in_portfolio": isin in portfolio_isins}

        if query_lower == isin.lower():
            exact_matches.append(entry)
        elif query_lower in isin.lower() or query_lower in slug_name.lower():
            results.append(entry)

    # Merge: portfolio matches first (if not already in sitemap results), then sitemap
    sitemap_isins = {e["isin"] for e in exact_matches + results}
    extra_portfolio = [m for m in portfolio_matches if m["isin"] not in sitemap_isins]

    combined = exact_matches + extra_portfolio + results

    # --- Búsqueda por ticker (cuando la query parece un ticker de bolsa) ---
    ticker_matches: List[Dict[str, Any]] = []
    if _TICKER_RE.match(query.strip().upper()):
        ticker_matches = await _search_etf_by_ticker(query.strip())
        # Evitar duplicados con los resultados ya encontrados
        combined_isins = {e["isin"] for e in combined}
        ticker_matches = [m for m in ticker_matches if m["isin"] not in combined_isins]

    # Tickers primero si la query parece un ticker exacto, si no, al final
    if _TICKER_RE.match(query.strip().upper()):
        combined = ticker_matches + combined
    else:
        combined = combined + ticker_matches

    final = combined[:limit]
    _search_cache[cache_key] = (time.time(), final)
    return final

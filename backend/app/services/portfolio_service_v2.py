"""
portfolio_service_v2.py — Servicio central para la API (v2).

Thin adapter sobre PortfolioClient v2 (async core).
Reemplaza portfolio_service.py eliminando la duplicación de lógica.

Funciones principales:
  - get_portfolio_client() → singleton PortfolioClient v2
  - build_summary() → dict compatible con AnalysisResponse
  - build_details() → dict compatible con /details
  - build_history_batch() → dict compatible con /history_batch
  - build_correlation() → dict compatible con /correlation
  - run_analytics_pipeline() → genera JSONs en data/calculated/
"""

import asyncio
import json
import logging
import math
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import nest_asyncio
import pandas as pd

from .fund_classifier import FundType, classify_fund, is_index_fund
from .region_normalizer import normalize_regions, normalize_sectors

# Parchear event loop para llamadas sync desde aquí y desde notebooks
nest_asyncio.apply()


def _run(coro):
    """Ejecuta una coroutine de forma síncrona, compatible con cualquier contexto."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Rutas
# ---------------------------------------------------------------------------

_BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = _BASE_DIR / "data"
CACHE_DIR = DATA_DIR / "calculated"
TSV_PATH = DATA_DIR / "Órdenes 1238478.tsv"
EXCEL_PATH = DATA_DIR / "Ordenes.xlsx"

CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _get_orders_source() -> Optional[str]:
    """Devuelve la ruta al fichero de órdenes más reciente."""
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


def safe_float(val) -> float:
    if pd.isna(val) or val is None:
        return 0.0
    try:
        val_float = float(val)
        if math.isnan(val_float) or math.isinf(val_float):
            return 0.0
        return val_float
    except (ValueError, TypeError):
        return 0.0


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_client_instance = None
_client_lock = asyncio.Lock()


def get_portfolio_client(force_refresh: bool = False):
    """Devuelve un PortfolioClient v2 singleton."""
    global _client_instance
    if _client_instance is None or force_refresh:
        from ..client_v2 import PortfolioClient

        cache_path = str(DATA_DIR / "cache")
        source = _get_orders_source()
        _client_instance = PortfolioClient(
            source=source,
            cache_path=cache_path,
            force_refresh=force_refresh,
        )
        logger.info(
            "PortfolioClient v2 initialized from '%s' with %d positions",
            source,
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
# Builders (thin adapters sobre client v2)
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

        from ..client_v2 import _run
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
        })

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
    }


def build_details() -> Dict[str, Any]:
    """Construye detalles (sector/region) por fondo."""
    client = get_portfolio_client()
    pos = client.positions(live=True)
    if pos.empty:
        return {}

    from ..client_v2 import _run
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

        result[name] = {
            "isin": isin,
            "sector": sectors,
            "region": regions,
            "percentage": round(pct, 2),
            "tipo": fund_type.name,
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

    return {
        "added_name": result["metadata"]["added_name"],
        "current_total": result["metadata"]["current_total"],
        "simulated_total": result["metadata"]["simulated_total"],
        "funds": result["weights"].to_dict(orient="records"),
        "current_portfolio_metrics": {},
        "simulated_portfolio_metrics": {},
    }


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------


def run_analytics_pipeline(force_download: bool = False):
    """Recalcula todos los datos y los escribe a calculated/."""
    logger.info("=== Analytics Pipeline v2 START (force=%s) ===", force_download)
    start = time.time()

    if force_download:
        reset_client(force_refresh=True)

    try:
        summary = build_summary()
        _save_json("summary.json", summary)
    except Exception as e:
        logger.error("Error building summary: %s", e)

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
    logger.info("=== Analytics Pipeline v2 DONE in %.1fs ===", elapsed)


def run_nav_pipeline(force_download: bool = False):
    """Recalcula solo cotizaciones: summary + history + correlation."""
    logger.info("=== NAV Pipeline v2 START (force=%s) ===", force_download)
    start = time.time()
    if force_download:
        reset_client(force_refresh=True)
    try:
        _save_json("summary.json", build_summary())
    except Exception as e:
        logger.error("Error building summary: %s", e)
    try:
        _save_json("history_batch.json", build_history_batch())
    except Exception as e:
        logger.error("Error building history_batch: %s", e)
    try:
        _save_json("correlation.json", build_correlation())
    except Exception as e:
        logger.error("Error building correlation: %s", e)
    logger.info("=== NAV Pipeline v2 DONE in %.1fs ===", time.time() - start)


def run_details_pipeline(force_download: bool = False):
    """Recalcula solo detalles (sectores, regiones, métricas)."""
    logger.info("=== Details Pipeline v2 START (force=%s) ===", force_download)
    start = time.time()
    if force_download:
        reset_client(force_refresh=True)
    try:
        _save_json("details.json", build_details())
    except Exception as e:
        logger.error("Error building details: %s", e)
    logger.info("=== Details Pipeline v2 DONE in %.1fs ===", time.time() - start)


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

    info, sectors, countries, holdings_df = await asyncio.gather(
        provider.get_fund_info(isin),
        provider.get_sector_weights(isin),
        provider.get_country_weights(isin),
        provider.get_holdings(isin),
    )
    info = info or {}
    sectors = sectors or {}
    countries = countries or {}
    holdings = holdings_df.to_dict("records") if not holdings_df.empty else []

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
    }


def get_fund_detail_full(isin: str) -> Dict[str, Any]:
    """Detalle completo de un fondo: info, métricas, sectores, países, holdings."""
    return _run(_get_fund_detail_async(isin))


_fund_detail_cache: Dict[str, Any] = {}
_fund_detail_cache_ts: Dict[str, float] = {}
_FUND_DETAIL_TTL = 3600  # 1 hora


def get_fund_detail_full_cached(isin: str) -> Dict[str, Any]:
    """Wrapper de get_fund_detail_full con caché en memoria (TTL 1h)."""
    now = time.time()
    if isin in _fund_detail_cache and now - _fund_detail_cache_ts.get(isin, 0) < _FUND_DETAIL_TTL:
        return _fund_detail_cache[isin]
    detail = get_fund_detail_full(isin)
    _fund_detail_cache[isin] = detail
    _fund_detail_cache_ts[isin] = now
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


def search_funds(query: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Busca fondos en el índice de sitemaps de Finect (por ISIN o nombre)."""
    async def _fetch_index():
        client = get_portfolio_client()
        return await client.provider._finect._load_sitemap_index()

    index: Dict[str, str] = _run(_fetch_index())
    if not index:
        return []

    query_lower = query.lower().strip()
    client = get_portfolio_client()
    pos = client.movements()  # ligero, no hace network
    portfolio_isins: set = set(client.portfolio.positions.keys())

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

    combined = exact_matches + results
    return combined[:limit]

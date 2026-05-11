"""
portfolio_service.py — Servicio central para la API.

Adapter sobre PortfolioClient (async core).
Conecta las clases modernas con los endpoints REST.

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

_client_instance = None


def get_portfolio_client(force_refresh: bool = False):
    """Devuelve un PortfolioClient v2 singleton."""
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
            "PortfolioClient v2 initialized from '%s' with %d positions",
            source,
            len(_client_instance.portfolio.positions),
        )

        # Cargar órdenes adicionales de ETFs (MyInvestor + TradeRepublic)
        _load_etf_sources(_client_instance)

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


def build_real_portfolio_history(years: int = 20) -> Dict[str, Any]:
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
                if raw_isin in live_navs and last_date is not None:
                    synthetic_nav = pd.Series(live_navs[raw_isin], index=[last_date])
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
    # This eliminates NAV-lag drift and includes funds with no NAV history
    # (e.g. ES0141116030 which has no Finect/YF price history).
    try:
        _live_val_total = float(df_live["Valor_Actual"].dropna().sum())
        _live_inv_total = float(df_live["Capital_Invertido"].dropna().sum())
        if _live_val_total > 0 and last_date is not None and last_date in portfolio_value.index:
            portfolio_value.loc[last_date] = _live_val_total
        if _live_inv_total > 0 and last_date is not None and last_date in total_invested.index:
            total_invested.loc[last_date] = _live_inv_total
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


def build_real_portfolio_history_per_fund(years: int = 20) -> Dict[str, Any]:
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
        logger.info("=== Analytics Pipeline v2 START (force=%s) ===", force_download)
        start = time.time()

        if force_download:
            reset_client(force_refresh=True)

        summary = {}
        try:
            summary = build_summary()
        except Exception as e:
            logger.error("Error building summary: %s", e)
        try:
            summary["real_evolution"] = build_real_portfolio_history()
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
        logger.info("=== Analytics Pipeline v2 DONE in %.1fs ===", elapsed)
    finally:
        _pipeline_lock.release()


def run_nav_pipeline(force_download: bool = False):
    """Recalcula solo cotizaciones: summary + history + correlation."""
    if not _pipeline_lock.acquire(blocking=False):
        logger.info("NAV Pipeline ya en ejecucion — omitiendo llamada duplicada")
        return
    try:
        logger.info("=== NAV Pipeline v2 START (force=%s) ===", force_download)
        start = time.time()
        if force_download:
            reset_client(force_refresh=True)
        summary_data = {}
        try:
            summary_data = build_summary()
        except Exception as e:
            logger.error("Error building summary: %s", e)
        try:
            summary_data["real_evolution"] = build_real_portfolio_history()
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
        logger.info("=== NAV Pipeline v2 DONE in %.1fs ===", time.time() - start)
    finally:
        _pipeline_lock.release()


def run_details_pipeline(force_download: bool = False):
    """Recalcula solo detalles (sectores, regiones, métricas)."""
    if not _pipeline_lock.acquire(blocking=False):
        logger.info("Details Pipeline ya en ejecucion — omitiendo llamada duplicada")
        return
    try:
        logger.info("=== Details Pipeline v2 START (force=%s) ===", force_download)
        start = time.time()
        if force_download:
            reset_client(force_refresh=True)
        try:
            _save_json("details.json", build_details())
        except Exception as e:
            logger.error("Error building details: %s", e)
        logger.info("=== Details Pipeline v2 DONE in %.1fs ===", time.time() - start)
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


def search_funds(query: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Busca fondos en el índice de sitemaps de Finect (por ISIN o nombre)."""
    return _run(search_funds_async(query, limit=limit))


async def search_funds_async(query: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Versión async de search_funds: busca en el sitemap de Finect + portfolio local."""
    client = get_portfolio_client()
    portfolio_isins: set = set(client.portfolio.positions.keys())
    query_lower = query.lower().strip()

    # --- Fallback: fondos del portfolio que coinciden ---
    portfolio_matches: List[Dict[str, Any]] = []
    history_cache = load_json("history_batch.json") or {}
    for isin in portfolio_isins:
        name = history_cache.get(isin, {}) if isinstance(history_cache.get(isin), dict) else isin
        if isinstance(history_cache.get(isin), list):
            name = isin  # history_batch stores lists of {date,price}
        # Try to get name from details cache
        details_cache = load_json("details.json") or {}
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
    return combined[:limit]

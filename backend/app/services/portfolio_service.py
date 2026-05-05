"""
portfolio_service.py — Servicio central para la API.

Reemplaza los imports de deprecated/portfolio.py y deprecated/background_calculator.py.
Conecta las clases modernas (Portfolio, CompositeProvider, TaxOptimizer) con los endpoints.

Funciones principales:
  - get_portfolio_client() → singleton PortfolioClient
  - get_summary_data() → dict compatible con AnalysisResponse
  - build_details() → dict compatible con /details
  - build_history_batch() → dict compatible con /history_batch
  - build_correlation() → dict compatible con /correlation
  - run_analytics_pipeline(force) → genera JSONs en data/calculated/
"""

import json
import logging
import math
import os
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

import pandas as pd

from .region_normalizer import normalize_regions, normalize_sectors

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Rutas
# ---------------------------------------------------------------------------

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(_BASE_DIR, "data")
CACHE_DIR = os.path.join(DATA_DIR, "calculated")
EXCEL_PATH = os.path.join(DATA_DIR, "Ordenes.xlsx")
# El TSV exportado directamente del broker es la fuente canónica de órdenes.
# Si existe se usa con prioridad sobre el Excel (más fácil de actualizar).
TSV_PATH = os.path.join(DATA_DIR, "Órdenes 1238478.tsv")

os.makedirs(CACHE_DIR, exist_ok=True)


def _get_orders_source() -> Optional[str]:
    """Devuelve la ruta al fichero de órdenes más reciente disponible.

    Prioridad: TSV del broker > Excel > None.
    Si ambos existen se elige el que tenga la fecha de modificación más reciente.
    """
    tsv_exists = os.path.exists(TSV_PATH)
    xlsx_exists = os.path.exists(EXCEL_PATH)
    if tsv_exists and xlsx_exists:
        tsv_mtime = os.path.getmtime(TSV_PATH)
        xlsx_mtime = os.path.getmtime(EXCEL_PATH)
        return TSV_PATH if tsv_mtime >= xlsx_mtime else EXCEL_PATH
    if tsv_exists:
        return TSV_PATH
    if xlsx_exists:
        return EXCEL_PATH
    return None

# ---------------------------------------------------------------------------
# Agrupaciones de fondos (clases del mismo fondo)
# ---------------------------------------------------------------------------
# ISINs que representan el mismo fondo con distintas clases de participación.
# Se agrupan bajo el primer ISIN del grupo en history_batch y correlation.
FUND_GROUPS: Dict[str, List[str]] = {
    # iShares MSCI ACWI UCITS ETF — distintas clases
    "IE00BYX5NX33": ["IE00BYX5NX33", "IE000ZYRH0Q7", "IE00BD0NCM55"],
}

# Construir mapa inverso: ISIN → ISIN canónico del grupo
_ISIN_TO_GROUP: Dict[str, str] = {}
for canonical, members in FUND_GROUPS.items():
    for isin in members:
        _ISIN_TO_GROUP[isin] = canonical


def get_canonical_isin(isin: str) -> str:
    """Devuelve el ISIN canónico del grupo, o el propio ISIN si no pertenece a ninguno."""
    return _ISIN_TO_GROUP.get(isin, isin)

# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def safe_float(val) -> float:
    """Conversión segura a float (maneja NaN, None, Inf)."""
    if pd.isna(val) or val is None:
        return 0.0
    try:
        val_float = float(val)
        if math.isnan(val_float) or math.isinf(val_float):
            return 0.0
        return val_float
    except (ValueError, TypeError):
        return 0.0


def _map_category(tipo: str) -> str:
    """Mapea el tipo de fondo a una categoría estándar."""
    t = str(tipo).upper()
    if t in ("INDEX", "VALUE", "SPECIALIZED"):
        return "Renta Variable"
    elif t == "RF":
        return "Renta Fija"
    elif t == "CASH":
        return "Liquidez"
    elif t in ("CRYPTO", "ORO", "GOLD"):
        return "Alternativo"
    return "Otros"


def _extract_fund_metrics(info: Dict[str, Any]) -> Dict[str, Any]:
    """Extrae las métricas de riesgo/rendimiento del dict de info de Finect.

    Las claves vienen de ``_extract_stats`` del Finect provider en
    formato ``snake_case``: sharperatio, alpha, beta, standarddeviation,
    maxdrawdown, trackingerror, informationratio, r2, correlation.
    """
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
    metrics: Dict[str, Any] = {}
    for finect_key, schema_key in _KEY_MAP.items():
        val = info.get(finect_key)
        if val is not None:
            metrics[schema_key] = safe_float(val)
    return metrics if metrics else {}


# ---------------------------------------------------------------------------
# Singleton de PortfolioClient
# ---------------------------------------------------------------------------

_client_instance = None


def get_portfolio_client(force_refresh: bool = False):
    """Devuelve un PortfolioClient singleton.

    Fuente de ordenes: TSV del broker si es el mas reciente, sino Excel, sino None.

    Args:
        force_refresh: si ``True``, crea siempre una instancia nueva ignorando la
            cache de disco de MStarProvider.
    """
    global _client_instance
    if _client_instance is None or force_refresh:
        from ..client import PortfolioClient
        cache_path = os.path.join(DATA_DIR, "cache")
        source = _get_orders_source()
        _client_instance = PortfolioClient(
            source=source,
            cache_path=cache_path,
            force_refresh=force_refresh,
        )
        logger.info(
            "PortfolioClient initialized from '%s' with %d positions (force_refresh=%s)",
            source,
            len(_client_instance.portfolio.positions),
            force_refresh,
        )
    return _client_instance


def reset_client(force_refresh: bool = False):
    """Fuerza la recarga del PortfolioClient.

    Args:
        force_refresh: si ``True``, la proxima instancia ignorara la cache .pkl
            de MStarProvider y descargara datos frescos de todos los proveedores.
            Usar al pulsar 'Recalcular Cotizaciones' para garantizar NAVs frescos.
    """
    global _client_instance
    _client_instance = None
    if force_refresh:
        # Pre-crear la instancia con force_refresh=True para que get_portfolio_client()
        # la reutilice con los providers correctos desde el primer uso.
        get_portfolio_client(force_refresh=True)


# ---------------------------------------------------------------------------
# Cache de JSON calculados (lectura / escritura)
# ---------------------------------------------------------------------------

def _save_json(filename: str, data: Any) -> None:
    path = os.path.join(CACHE_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, default=str)
    logger.info("Cache saved: %s", path)


def load_json(filename: str, default=None):
    path = os.path.join(CACHE_DIR, filename)
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning("Error loading %s: %s", path, e)
        return default


# ---------------------------------------------------------------------------
# Builders: construyen los datos para cada endpoint
# ---------------------------------------------------------------------------

def build_summary() -> Dict[str, Any]:
    """Construye el summary compatible con AnalysisResponse."""
    client = get_portfolio_client()
    pos = client.positions(live=True)

    if pos.empty:
        return {
            "summary": {"total_rv": 0, "total_rf": 0, "total_cash": 0, "total_alt": 0, "details": {}},
            "funds": [],
            "recommendation": {"rf_sug": {"title": "Sin datos", "text": "No se han encontrado posiciones."}},
        }

    # Enriquecer fondos
    enriched = client.enrich()

    # Clasificar y calcular pesos
    total_val = pos["Valor_Actual"].sum() if pos["Valor_Actual"].notna().any() else pos["Capital_Invertido"].sum()

    total_rv = total_rf = total_cash = total_alt = 0.0
    details: Dict[str, float] = {}
    funds_list: List[Dict] = []

    for _, row in pos.iterrows():
        isin = row["ISIN"]
        info = client.provider.get_fund_info(isin) or {}
        name = info.get("name", row.get("Fondo", isin))

        valor = safe_float(row.get("Valor_Actual", row.get("Capital_Invertido", 0)))
        peso = (valor / total_val * 100) if total_val > 0 else 0

        # Clasificar
        name_lower = name.lower() if name else ""
        cat = info.get("categoryName", "").lower() if info.get("categoryName") else ""
        combined = f"{name_lower} {cat}"

        if any(kw in combined for kw in ["bond", "renta fija", "fixed income", "government", "treasury"]):
            tipo = "RF"
            total_rf += peso
        elif any(kw in combined for kw in ["cash", "monetar", "money market", "liquidez"]):
            tipo = "CASH"
            total_cash += peso
        elif any(kw in combined for kw in ["gold", "oro", "commodity", "bitcoin", "crypto"]):
            tipo = "ORO"
            total_alt += peso
        else:
            tipo = "INDEX"
            total_rv += peso

        cat_display = _map_category(tipo)
        details[cat_display] = details.get(cat_display, 0) + peso

        # Clasificar indexado vs activo (por nombre/categoría)
        is_index = any(kw in combined for kw in ["index", "etf", "s&p", "vanguard", "stoxx", "tracker", "msci world"])

        # Buscar datos enriquecidos
        enr_row = enriched[enriched["ISIN"] == isin].iloc[0] if not enriched.empty and isin in enriched["ISIN"].values else {}
        price_str = f"{safe_float(row.get('Precio_Actual', 0)):.2f}" if pd.notna(row.get("Precio_Actual")) else "---"
        ganancia_pct = row.get("Ganancia_Pct")
        ganancia_abs = row.get("Ganancia_Abs", row.get("Ganancia_Euros", 0))
        ytd_str = f"{safe_float(ganancia_pct):+.1f}%" if pd.notna(ganancia_pct) else "---"

        valor_actual = safe_float(row.get("Valor_Actual", 0))
        capital_invertido = safe_float(row.get("Capital_Invertido", 0))

        rating = enr_row.get("Rating_MS") if isinstance(enr_row, (dict, pd.Series)) else None
        stars = "★" * int(rating) if pd.notna(rating) and rating else "---"

        funds_list.append({
            "Fondo": name,
            "TIPO": tipo,
            "Porcentaje": round(peso, 2),
            "ISIN": isin,
            "NAV (Precio)": price_str,
            "YTD (%)": ytd_str,
            "Estrellas MS": stars,
            "Categoría": cat_display,
            "IsIndex": is_index,
            "Valor_Actual": round(valor_actual, 2),
            "Capital_Invertido": round(capital_invertido, 2),
            "Ganancia_Abs": round(safe_float(ganancia_abs), 2),
            "Ganancia_Pct": round(safe_float(ganancia_pct), 2) if pd.notna(ganancia_pct) else None,
        })

    # Totales indexado vs activo
    total_indexed = sum(f["Porcentaje"] for f in funds_list if f["IsIndex"])
    total_active = sum(f["Porcentaje"] for f in funds_list if not f["IsIndex"])

    # Recommendation: solo si hay liquidez excesiva
    rec: Dict[str, Any] = {}
    if total_cash > 15:
        rec["cash_warn"] = {
            "title": "Exceso de Liquidez",
            "text": f"Tienes {total_cash:.1f}% en liquidez. Podrías considerar invertirlo para combatir la inflación.",
        }

    return {
        "summary": {
            "total_rv": round(total_rv, 2),
            "total_rf": round(total_rf, 2),
            "total_cash": round(total_cash, 2),
            "total_alt": round(total_alt, 2),
            "total_indexed": round(total_indexed, 2),
            "total_active": round(total_active, 2),
            "details": {k: round(v, 2) for k, v in details.items() if k != "Liquidez"},
        },
        "funds": funds_list,
        "recommendation": rec,
    }


def build_details() -> Dict[str, Any]:
    """Construye los detalles (sector/region) por fondo compatible con /details.

    Aplica normalización de nombres de regiones y sectores para unificar
    resultados de distintos proveedores (Finect, FT, FMP, etc.).
    """
    client = get_portfolio_client()
    pos = client.positions(live=True)
    if pos.empty:
        return {}

    total_val = pos["Valor_Actual"].sum() if pos["Valor_Actual"].notna().any() else pos["Capital_Invertido"].sum()
    result = {}

    for _, row in pos.iterrows():
        isin = row["ISIN"]
        info = client.provider.get_fund_info(isin) or {}
        name = info.get("name", row.get("Fondo", isin))

        sectors_raw = client.provider.get_sector_weights(isin) or {}
        regions_raw = client.provider.get_country_weights(isin) or {}

        # Normalizar nombres de sectores y regiones
        sectors = normalize_sectors({k: safe_float(v) for k, v in sectors_raw.items()})
        regions = normalize_regions({k: safe_float(v) for k, v in regions_raw.items()})

        valor = safe_float(row.get("Valor_Actual", row.get("Capital_Invertido", 0)))
        pct = (valor / total_val * 100) if total_val > 0 else 0

        name_lower = name.lower() if name else ""
        cat = info.get("categoryName", "").lower() if info.get("categoryName") else ""
        combined = f"{name_lower} {cat}"

        if any(kw in combined for kw in ["bond", "renta fija", "fixed income"]):
            tipo = "RF"
        elif any(kw in combined for kw in ["cash", "monetar", "money market"]):
            tipo = "CASH"
        elif any(kw in combined for kw in ["gold", "oro", "crypto"]):
            tipo = "ORO"
        else:
            tipo = "INDEX"

        # Extraer métricas de riesgo/rendimiento de Finect
        metrics = _extract_fund_metrics(info)

        result[name] = {
            "isin": isin,
            "sector": sectors,
            "region": regions,
            "percentage": round(pct, 2),
            "tipo": tipo,
            "metrics": metrics,
        }

    return result


def build_history_batch() -> Dict[str, Any]:
    """Construye el histórico por fondo compatible con /history_batch.

    - Agrupa ISINs de la misma familia (FUND_GROUPS) bajo un solo nombre.
    - Añade una serie sintética "📊 Mi Cartera Actual" ponderada por los pesos actuales.
    """
    client = get_portfolio_client()
    hist = client.history(years=10)
    if hist.empty:
        return {}

    # --- 1. Construir result individual por columna (nombre de fondo) ---
    date_col = hist.columns[0]
    # Mapear nombre de columna → ISIN para detectar duplicados de grupo
    pos = client.positions(live=True)
    isin_to_name: Dict[str, str] = {}
    name_to_isin: Dict[str, str] = {}
    for _, row in pos.iterrows():
        isin = row["ISIN"]
        info = client.provider.get_fund_info(isin) or {}
        name = info.get("name", row.get("Fondo", isin))
        isin_to_name[isin] = name
        name_to_isin[name] = isin

    # Detectar columnas que pertenecen al mismo grupo y quedarnos solo con una
    seen_groups: Dict[str, str] = {}  # canonical → primer nombre de columna visto
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
    fund_series: Dict[str, pd.Series] = {}  # nombre → serie de precios (para portfolio)
    for col in hist.columns:
        if col == date_col or col in skip_cols:
            continue
        series = hist[[date_col, col]].dropna(subset=[col]).copy()
        series[date_col] = pd.to_datetime(series[date_col])
        result[col] = [
            {"date": row[date_col].strftime("%Y-%m-%d") if hasattr(row[date_col], "strftime") else str(row[date_col]),
             "price": safe_float(row[col])}
            for _, row in series.iterrows()
        ]
        fund_series[col] = series.set_index(date_col)[col]

    # --- 2. Construir serie "Mi Cartera Actual" con pesos actuales ---
    # Simula el rendimiento de la cartera como si siempre hubiera tenido los
    # pesos actuales (market-value) aplicados al histórico completo de NAVs.
    if len(fund_series) >= 2:
        try:
            # Calcular pesos normalizados
            total_val = pos["Valor_Actual"].sum() if pos["Valor_Actual"].notna().any() else pos["Capital_Invertido"].sum()
            weights: Dict[str, float] = {}
            for _, row in pos.iterrows():
                isin = row["ISIN"]
                canonical = get_canonical_isin(isin)
                name = isin_to_name.get(canonical, isin_to_name.get(isin, isin))
                val = safe_float(row.get("Valor_Actual", row.get("Capital_Invertido", 0)))
                w = val / total_val if total_val > 0 else 0
                # Acumular peso si el nombre ya existe (fondos agrupados)
                weights[name] = weights.get(name, 0) + w

            # Mínimo de puntos para incluir un fondo en la simulación
            MIN_HIST_POINTS = 30
            valid_series = {
                k: s for k, s in fund_series.items()
                if k in weights and len(s.dropna()) >= MIN_HIST_POINTS
            }
            if not valid_series:
                valid_series = fund_series  # fallback: usar todos si ninguno cumple

            # Construir DataFrame de retornos diarios
            all_prices = pd.concat(valid_series.values(), axis=1, join="outer").sort_index().ffill()
            daily_returns = all_prices.pct_change().dropna(how="all")

            # Calcular retorno ponderado con renormalización por fecha
            # Para cada fecha sólo contribuyen fondos con retorno válido (no NaN),
            # lo que evita que fondos sin histórico distorsionen la serie.
            weight_vec = pd.Series({k: weights.get(k, 0.0) for k in valid_series})
            valid_mask = daily_returns[list(valid_series.keys())].notna()
            period_weights = valid_mask.multiply(weight_vec)  # shape: (dates, funds)
            period_weight_sums = period_weights.sum(axis=1).replace(0, pd.NA)
            # Retorno diario ponderado: suma(w_i * r_i) / sum(w_i) por fecha
            portfolio_return = (
                daily_returns[list(valid_series.keys())]
                .fillna(0)
                .multiply(period_weights)
                .sum(axis=1)
                .div(period_weight_sums)
                .fillna(0)
            )

            # Convertir retornos acumulados a precio sintético (base=100)
            cum_return = (1 + portfolio_return).cumprod() * 100
            result["📊 Mi Cartera Actual"] = [
                {"date": d.strftime("%Y-%m-%d"), "price": round(float(v), 4)}
                for d, v in cum_return.items() if pd.notna(v)
            ]
        except Exception as e:
            logger.warning("Error building portfolio line: %s", e)

    return result


def build_correlation() -> Dict[str, Any]:
    """Construye la matriz de correlación compatible con /correlation.

    Usa retornos porcentuales diarios sobre el rango donde cada par de fondos
    tiene datos reales (sin forward-fill), lo que evita correlaciones artificiales.
    Agrupa fondos del mismo grupo (FUND_GROUPS) eliminando duplicados.
    """
    client = get_portfolio_client()
    hist = client.history(years=5)
    if hist.empty or len(hist.columns) < 3:
        return {"labels": [], "matrix": {}}

    # Eliminar columnas duplicadas por grupo de fondos
    pos = client.positions(live=True)
    name_to_isin: Dict[str, str] = {}
    for _, row in pos.iterrows():
        isin = row["ISIN"]
        info = client.provider.get_fund_info(isin) or {}
        name = info.get("name", row.get("Fondo", isin))
        name_to_isin[name] = isin

    seen_groups: Dict[str, str] = {}
    drop_cols = []
    for col in hist.columns:
        if col == "date":
            continue
        isin = name_to_isin.get(col, "")
        canonical = get_canonical_isin(isin)
        if canonical in seen_groups:
            drop_cols.append(col)
        else:
            seen_groups[canonical] = col

    if drop_cols:
        hist = hist.drop(columns=drop_cols)

    # Calcular retornos diarios sin dropna global (conserva columnas parciales)
    numeric = hist.set_index("date").pct_change()

    labels = list(numeric.columns)
    matrix: Dict[str, Dict[str, float]] = {}

    # Forward-fill gaps pequeños (hasta 5 días hábiles) para mejorar overlap
    numeric = numeric.ffill(limit=5)

    for col_a in labels:
        matrix[col_a] = {}
        for col_b in labels:
            if col_a == col_b:
                matrix[col_a][col_b] = 1.0
                continue
            # Usar solo filas donde AMBOS fondos tienen retorno válido
            pair = numeric[[col_a, col_b]].dropna()
            if len(pair) < 30:  # mínimo 30 observaciones para significancia
                matrix[col_a][col_b] = None  # None = datos insuficientes (vs 0.0 real)
                logger.warning(
                    "Correlación %s vs %s: solo %d puntos (mín 30)",
                    col_a, col_b, len(pair),
                )
            else:
                val = pair[col_a].corr(pair[col_b])
                matrix[col_a][col_b] = round(float(val), 4) if pd.notna(val) else None

    return {"labels": labels, "matrix": matrix}


# ---------------------------------------------------------------------------
# Búsqueda de fondos en Finect
# ---------------------------------------------------------------------------

def search_funds(query: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Busca fondos en el índice de sitemaps de Finect.

    Busca por ISIN (exacto o parcial) o por texto en la URL slug
    (que contiene el nombre normalizado del fondo).

    Args:
        query: Texto de búsqueda (ISIN parcial o nombre).
        limit: Máximo de resultados a devolver.

    Returns:
        Lista de dicts con ``isin`` y ``url``, ordenados por relevancia.
    """
    from .finect_provider import _load_sitemap_index

    index = _load_sitemap_index()
    if not index:
        return []

    query_lower = query.lower().strip()
    client = get_portfolio_client()
    pos = client.positions(live=True)
    portfolio_isins = set(pos["ISIN"].tolist()) if not pos.empty else set()

    results: List[Dict[str, Any]] = []
    exact_matches: List[Dict[str, Any]] = []

    for isin, url in index.items():
        # Extraer nombre del slug de la URL
        # URL format: https://www.finect.com/fondos-inversion/ISIN-Slug_name
        slug = url.rsplit("/", 1)[-1] if "/" in url else url
        # Quitar el prefijo del ISIN del slug (ej: "IE00B4L5Y983-Ishares_core_msci_world")
        if "-" in slug:
            slug_name = slug.split("-", 1)[1] if slug.startswith(isin) else slug
        else:
            slug_name = slug[len(isin):].lstrip("-_") if slug.startswith(isin) else slug
        slug_name = slug_name.replace("_", " ").replace("-", " ")

        # Match por ISIN exacto
        if query_lower == isin.lower():
            exact_matches.append({
                "isin": isin,
                "name": slug_name,
                "url": url,
                "in_portfolio": isin in portfolio_isins,
            })
            continue

        # Match parcial por ISIN o slug
        if query_lower in isin.lower() or query_lower in slug_name.lower():
            results.append({
                "isin": isin,
                "name": slug_name,
                "url": url,
                "in_portfolio": isin in portfolio_isins,
            })

    # Exact matches primero, luego el resto
    combined = exact_matches + results
    return combined[:limit]


def get_fund_detail_full(isin: str) -> Dict[str, Any]:
    """Detalle completo de un fondo incluyendo métricas, alloc, and market cap.

    Args:
        isin: Código ISIN del fondo.

    Returns:
        Dict compatible con FundDetailResponse.
    """
    client = get_portfolio_client()
    provider = client.provider

    info = provider.get_fund_info(isin) or {}
    sectors = provider.get_sector_weights(isin) or {}
    countries = provider.get_country_weights(isin) or {}
    holdings_df = provider.get_holdings(isin)
    holdings = holdings_df.to_dict("records") if not holdings_df.empty else []

    # Asset allocation y market cap (métodos de FinectProvider)
    asset_alloc: Dict[str, float] = {}
    market_cap: Dict[str, float] = {}
    try:
        asset_alloc = provider.get_asset_allocation(isin) or {}
    except AttributeError:
        pass
    try:
        market_cap = provider.get_market_cap(isin) or {}
    except AttributeError:
        pass

    metrics = _extract_fund_metrics(info)

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
        "metrics": metrics if metrics else None,
        "sectors": {k: safe_float(v) for k, v in sectors.items()},
        "countries": {k: safe_float(v) for k, v in countries.items()},
        "asset_allocation": {k: safe_float(v) for k, v in asset_alloc.items()},
        "market_cap": {k: safe_float(v) for k, v in market_cap.items()},
        "holdings": holdings,
        "source": info.get("source", ""),
    }


# ---------------------------------------------------------------------------
# Helpers para simulación de portfolio
# ---------------------------------------------------------------------------

def _portfolio_return_series(
    datasets: Dict[str, List],
    weights: Dict[str, float],
    min_points: int = 30,
) -> pd.Series:
    """Construye serie acumulada base-100 del portfolio a partir de históricos.

    Args:
        datasets: {nombre_fondo: [{date, price}, ...]}
        weights: {nombre_fondo: fracción (0-1)}
        min_points: Mínimo de puntos para incluir un fondo.

    Returns:
        pd.Series indexada por datetime con valores base-100, o vacía si no hay datos.
    """
    valid: Dict[str, pd.Series] = {}
    for name, data in datasets.items():
        w = weights.get(name, 0)
        if w <= 0 or not data or len(data) < min_points:
            continue
        df = pd.DataFrame(data)
        df["date"] = pd.to_datetime(df["date"])
        df = df.sort_values("date").drop_duplicates("date").set_index("date")
        valid[name] = df["price"]

    if not valid:
        return pd.Series(dtype=float)

    prices_df = pd.concat(valid.values(), axis=1, keys=valid.keys()).sort_index().ffill()
    daily_ret = prices_df.pct_change().dropna(how="all")

    w_series = pd.Series({k: weights[k] for k in valid})
    w_series = w_series / w_series.sum()  # renormalizar

    valid_mask = daily_ret.notna()
    period_w = valid_mask.multiply(w_series)
    period_w_sum = period_w.sum(axis=1).replace(0, pd.NA)

    port_ret = (
        daily_ret.fillna(0).multiply(period_w).sum(axis=1) / period_w_sum
    ).fillna(0)

    return (1 + port_ret).cumprod() * 100


def _metrics_from_series(series: pd.Series, risk_free: float = 0.03) -> Dict[str, Optional[float]]:
    """Calcula métricas de riesgo/rendimiento a partir de una serie de precios base-100.

    Devuelve: sharpe_ratio, standard_deviation (%), max_drawdown (%).
    """
    if series.empty or len(series) < 30:
        return {"sharpe_ratio": None, "standard_deviation": None, "max_drawdown": None}

    daily_ret = series.pct_change().dropna()
    if len(daily_ret) < 10:
        return {"sharpe_ratio": None, "standard_deviation": None, "max_drawdown": None}

    vol = float(daily_ret.std() * (252 ** 0.5) * 100)

    # Retorno anualizado total
    n_years = max(len(daily_ret) / 252, 0.01)
    cagr = float((series.iloc[-1] / series.iloc[0]) ** (1 / n_years) - 1)

    sharpe = round((cagr - risk_free) / (vol / 100), 4) if vol > 0 else None

    rolling_max = series.expanding().max()
    drawdown = (series / rolling_max - 1) * 100
    max_dd = round(float(drawdown.min()), 4)

    return {
        "sharpe_ratio": sharpe,
        "standard_deviation": round(vol, 4),
        "max_drawdown": max_dd,
        # preserve None for fields not computable from series
        "alpha": None,
        "beta": None,
        "tracking_error": None,
    }


def _period_cagr(series: pd.Series, years: Optional[float]) -> Optional[float]:
    """CAGR para un período dado (años). Si years es None → todo el histórico."""
    if series.empty or len(series) < 2:
        return None
    end_val = float(series.iloc[-1])
    if years is None:
        n = max((series.index[-1] - series.index[0]).days / 365.25, 0.01)
        start_val = float(series.iloc[0])
    else:
        cutoff = series.index[-1] - pd.Timedelta(days=int(years * 365))
        sub = series[series.index >= cutoff]
        if sub.empty or len(sub) < 2:
            return None
        start_val = float(sub.iloc[0])
        n = years
    if start_val <= 0:
        return None
    raw = end_val / start_val - 1
    if years is not None and years > 1:
        return round(((end_val / start_val) ** (1 / n) - 1) * 100, 2)
    return round(raw * 100, 2)


def _series_to_points(series: pd.Series, max_pts: int = 600) -> List[Dict]:
    """Convierte pd.Series datetime → lista [{date, price}], bajando la resolución si hace falta."""
    if series.empty:
        return []
    step = max(1, len(series) // max_pts)
    return [
        {"date": d.strftime("%Y-%m-%d"), "price": round(float(v), 4)}
        for d, v in series.iloc[::step].items()
        if pd.notna(v)
    ]


# ---------------------------------------------------------------------------
# Simulación: Añadir Y€ a un fondo
# ---------------------------------------------------------------------------

def simulate_addition(isin: str, amount: float) -> Dict[str, Any]:
    """Simula añadir ``amount`` € al fondo ``isin`` y calcula métricas resultantes.

    Mejoras v2:
    - Métricas (Sharpe, vol, drawdown) calculadas desde series de precios reales,
      no como promedio ponderado de valores estáticos de Finect.
    - Retorna series históricas para graficar (cartera actual, fondo añadido,
      cartera simulada) y rentabilidades por período (1Y, 3Y, 5Y, 10Y, MAX).

    Args:
        isin: ISIN del fondo al que se añade dinero.
        amount: Cantidad en € a añadir.

    Returns:
        Dict compatible con SimulationResponse.
    """
    client = get_portfolio_client()
    pos = client.positions(live=True)

    total_val = 0.0
    if not pos.empty:
        total_val = (
            pos["Valor_Actual"].sum()
            if pos["Valor_Actual"].notna().any()
            else pos["Capital_Invertido"].sum()
        )

    simulated_total = total_val + amount

    # -----------------------------------------------------------------------
    # 1. Construir fund_details (pesos actuales y simulados) + isin-name maps
    # -----------------------------------------------------------------------
    fund_details: List[Dict[str, Any]] = []
    portfolio_isins: set = set()
    isin_to_name: Dict[str, str] = {}
    name_to_isin: Dict[str, str] = {}

    if not pos.empty:
        portfolio_isins = set(pos["ISIN"].tolist())

    cached_details = load_json("details.json") or {}
    _cached_isin_to_name: Dict[str, str] = {}
    _cached_name_to_metrics: Dict[str, Dict] = {}


# ---------------------------------------------------------------------------
# Pipeline completo (background)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Caché en memoria para fund detail (simulador)
# ---------------------------------------------------------------------------

_fund_detail_cache: Dict[str, Any] = {}  # isin → detail dict
_fund_detail_cache_ts: Dict[str, float] = {}  # isin → timestamp
_FUND_DETAIL_TTL = 3600  # 1 hora


def get_fund_detail_full_cached(isin: str) -> Dict[str, Any]:
    """Wrapper de get_fund_detail_full con caché en memoria (TTL 1h)."""
    now = time.time()
    if isin in _fund_detail_cache:
        if now - _fund_detail_cache_ts.get(isin, 0) < _FUND_DETAIL_TTL:
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
    """Obtiene los pesos sectoriales y geográficos del MSCI World ETF.

    Usa iShares Core MSCI World (IE00B4L5Y983) como proxy del índice.
    Resultado cacheado en benchmark_msci.json.
    """
    client = get_portfolio_client()
    provider = client.provider

    sectors_raw = provider.get_sector_weights(_MSCI_WORLD_ISIN) or {}
    regions_raw = provider.get_country_weights(_MSCI_WORLD_ISIN) or {}

    sectors = normalize_sectors({k: safe_float(v) for k, v in sectors_raw.items()})
    regions = normalize_regions({k: safe_float(v) for k, v in regions_raw.items()})

    result = {"sectors": sectors, "regions": regions}
    _save_json("benchmark_msci.json", result)
    return result


# ---------------------------------------------------------------------------
# Pipeline completo (background)
# ---------------------------------------------------------------------------

def run_nav_pipeline(force_download: bool = False):
    """Recalcula solo datos de cotizaciones (NAV): summary + history + correlation.

    Más rápido que el pipeline completo ya que usa solo la cadena NAV
    (Finect -> YFinance -> FMP -> MStar), sin consultar proveedores de datos lentos.

    Cuando ``force_download=True``:
    - Reseta el singleton de PortfolioClient.
    - Ignora la cache de disco de MStarProvider (evita .pkl obsoletos).
    - Los JSONs pre-calculados se regeneran desde cero con datos frescos.

    Args:
        force_download: si True, resetea el client y fuerza datos frescos.
    """
    logger.info("=== NAV Pipeline START (force=%s) ===", force_download)
    start = datetime.now()

    if force_download:
        reset_client(force_refresh=True)

    try:
        summary = build_summary()
        _save_json("summary.json", summary)
    except Exception as e:
        logger.error("Error building summary: %s", e)

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

    elapsed = (datetime.now() - start).total_seconds()
    logger.info("=== NAV Pipeline DONE in %.1fs ===", elapsed)


def run_details_pipeline(force_download: bool = False):
    """Recalcula solo los detalles (sectores, regiones, métricas).

    Usa la cadena de datos completa (Finect → FT → YFinance → FMP),
    que es más lenta pero proporciona información estructural completa.

    Args:
        force_download: si True, resetea el client y fuerza datos frescos.
    """
    logger.info("=== Details Pipeline START (force=%s) ===", force_download)
    start = datetime.now()

    if force_download:
        reset_client(force_refresh=True)

    try:
        details = build_details()
        _save_json("details.json", details)
    except Exception as e:
        logger.error("Error building details: %s", e)

    elapsed = (datetime.now() - start).total_seconds()
    logger.info("=== Details Pipeline DONE in %.1fs ===", elapsed)


def run_analytics_pipeline(force_download: bool = False):
    """
    Recalcula todos los datos y los escribe a DATA_DIR/calculated/.

    Args:
        force_download: si True, resetea el client y fuerza datos frescos
            (ignora cache de disco de MStarProvider).
    """
    logger.info("=== Analytics Pipeline START (force=%s) ===", force_download)
    start = datetime.now()

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

    elapsed = (datetime.now() - start).total_seconds()
    logger.info("=== Analytics Pipeline DONE in %.1fs ===", elapsed)

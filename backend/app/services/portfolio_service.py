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
from datetime import datetime
from typing import Any, Dict, List, Optional

import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Rutas
# ---------------------------------------------------------------------------

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(_BASE_DIR, "data")
CACHE_DIR = os.path.join(DATA_DIR, "calculated")
EXCEL_PATH = os.path.join(DATA_DIR, "Ordenes.xlsx")

os.makedirs(CACHE_DIR, exist_ok=True)

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


# ---------------------------------------------------------------------------
# Singleton de PortfolioClient
# ---------------------------------------------------------------------------

_client_instance = None


def get_portfolio_client():
    """Devuelve un PortfolioClient singleton (cargado desde Ordenes.xlsx)."""
    global _client_instance
    if _client_instance is None:
        from ..client import PortfolioClient
        cache_path = os.path.join(DATA_DIR, "cache")
        _client_instance = PortfolioClient(
            source=EXCEL_PATH if os.path.exists(EXCEL_PATH) else None,
            cache_path=cache_path,
        )
        logger.info("PortfolioClient initialized with %d positions", len(_client_instance.portfolio.positions))
    return _client_instance


def reset_client():
    """Fuerza la recarga del PortfolioClient (tras upload de nuevo Excel, etc.)."""
    global _client_instance
    _client_instance = None


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

        # Buscar datos enriquecidos
        enr_row = enriched[enriched["ISIN"] == isin].iloc[0] if not enriched.empty and isin in enriched["ISIN"].values else {}
        price_str = f"{safe_float(row.get('Precio_Actual', 0)):.2f}" if pd.notna(row.get("Precio_Actual")) else "---"
        ganancia_pct = row.get("Ganancia_Pct")
        ytd_str = f"{safe_float(ganancia_pct):+.1f}%" if pd.notna(ganancia_pct) else "---"

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
        })

    # Recommendation
    rec = {}
    if total_rf < 20:
        rec["rf_sug"] = {
            "title": "Considerar más Renta Fija",
            "text": f"Tu exposición a RF es {total_rf:.1f}%. Podrías considerar aumentarla para reducir volatilidad.",
        }
    if total_cash > 15:
        rec["cash_warn"] = {
            "title": "Exceso de Liquidez",
            "text": f"Tienes {total_cash:.1f}% en liquidez. Podrías considerar invertirlo para combatir la inflación.",
        }
    if not rec:
        rec["rf_sug"] = {"title": "Portfolio Equilibrado", "text": "Tu distribución de activos parece razonable."}

    return {
        "summary": {
            "total_rv": round(total_rv, 2),
            "total_rf": round(total_rf, 2),
            "total_cash": round(total_cash, 2),
            "total_alt": round(total_alt, 2),
            "details": {k: round(v, 2) for k, v in details.items()},
        },
        "funds": funds_list,
        "recommendation": rec,
    }


def build_details() -> Dict[str, Any]:
    """Construye los detalles (sector/region) por fondo compatible con /details."""
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

        sectors = client.provider.get_sector_weights(isin) or {}
        regions = client.provider.get_country_weights(isin) or {}
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

        result[name] = {
            "sector": {k: safe_float(v) for k, v in sectors.items()},
            "region": {k: safe_float(v) for k, v in regions.items()},
            "percentage": round(pct, 2),
            "tipo": tipo,
        }

    return result


def build_history_batch() -> Dict[str, Any]:
    """Construye el histórico por fondo compatible con /history_batch.

    - Agrupa ISINs de la misma familia (FUND_GROUPS) bajo un solo nombre.
    - Añade una serie sintética "📈 Mi Cartera" ponderada por los pesos actuales.
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

    # --- 2. Construir serie "Mi Cartera" con pesos actuales ---
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

            # Construir DataFrame de retornos diarios
            all_prices = pd.concat(fund_series.values(), axis=1, join="outer").sort_index().ffill()
            daily_returns = all_prices.pct_change().dropna(how="all")

            # Calcular retorno ponderado del portfolio
            portfolio_return = pd.Series(0.0, index=daily_returns.index)
            used_weight = 0.0
            for col_name, w in weights.items():
                if col_name in daily_returns.columns:
                    portfolio_return += daily_returns[col_name].fillna(0) * w
                    used_weight += w

            # Renormalizar si no todos los fondos tienen peso
            if used_weight > 0 and used_weight < 0.99:
                portfolio_return = portfolio_return / used_weight

            # Convertir retornos acumulados a precio sintético (base=100)
            cum_return = (1 + portfolio_return).cumprod() * 100
            result["📈 Mi Cartera"] = [
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

    for col_a in labels:
        matrix[col_a] = {}
        for col_b in labels:
            if col_a == col_b:
                matrix[col_a][col_b] = 1.0
                continue
            # Usar solo filas donde AMBOS fondos tienen retorno válido
            pair = numeric[[col_a, col_b]].dropna()
            if len(pair) < 30:  # mínimo 30 observaciones para significancia
                matrix[col_a][col_b] = 0.0
            else:
                val = pair[col_a].corr(pair[col_b])
                matrix[col_a][col_b] = round(float(val), 4) if pd.notna(val) else 0.0

    return {"labels": labels, "matrix": matrix}


# ---------------------------------------------------------------------------
# Pipeline completo (background)
# ---------------------------------------------------------------------------

def run_analytics_pipeline(force_download: bool = False):
    """
    Recalcula todos los datos y los escribe a DATA_DIR/calculated/.

    Args:
        force_download: si True, resetea el client para forzar datos frescos.
    """
    logger.info("=== Analytics Pipeline START (force=%s) ===", force_download)
    start = datetime.now()

    if force_download:
        reset_client()

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

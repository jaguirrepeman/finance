"""
fund_classifier.py — Clasificación unificada de fondos por tipo de activo.

Centraliza la heurística de clasificación que antes estaba duplicada en
client.py (summary, asset_allocation) y portfolio_service.py (build_summary,
build_details).

Uso:
    from app.services.fund_classifier import FundType, classify_fund

    tipo = classify_fund(info={"name": "Vanguard Global Bond", "categoryName": "..."})
    # → FundType.RF
"""

import logging
from enum import Enum
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class FundType(str, Enum):
    """Tipo de activo de un fondo."""

    RV = "Renta Variable"
    RF = "Renta Fija"
    CASH = "Liquidez"
    ALTERNATIVO = "Alternativo"
    OTROS = "Otros"


# ---------------------------------------------------------------------------
# Keywords por categoría (case-insensitive)
# ---------------------------------------------------------------------------

_RF_KEYWORDS = frozenset([
    "bond", "renta fija", "fixed income", "rf", "treasury",
    "government bond", "corporate bond", "high yield", "aggregate",
    "deuda", "obligaciones", "letras", "bonos",
])

_CASH_KEYWORDS = frozenset([
    "cash", "monetar", "money market", "liquidez",
    "ultra short", "overnight", "deposito",
])

_ALT_KEYWORDS = frozenset([
    "gold", "oro", "commodity", "commodities", "bitcoin", "crypto",
    "real estate", "reit", "infrastructure", "alternativ",
])

_INDEX_MARKERS = frozenset([
    "index", "etf", "s&p", "vanguard", "stoxx", "tracker",
    "msci", "nasdaq", "russell", "ftse", "ishares", "amundi index",
    "fidelity index", "xtrackers",
])

# ETFs / ETPs — NOT traspasable under Spanish law (Art. 94 Ley 35/2006 IRPF
# only applies to Instituciones de Inversión Colectiva registered as fondos
# de inversión). ETFs trade on stock exchanges and are treated as equity sales.
_ETF_ETP_KEYWORDS = frozenset([
    " etf", "(etf)", "exchange traded fund", "exchange-traded fund",
    " etp", "(etp)", "exchange traded product", "exchange-traded product",
    "physical gold", "physical silver", "physical bitcoin", "physical crypto",
    "bitcoin etp", "bitcoin etf", "crypto etp", "crypto etf",
    "xtrackers", "invesco qqq", "spdr",
])

# Known ETF/ETP ISINs in the portfolio (hardcoded as fallback detection)
_KNOWN_ETF_ETP_ISINS: frozenset[str] = frozenset([
    # iShares Physical Gold ETC (LSE/Xetra)
    "IE00B4ND3602",
    # iShares Core MSCI World ETF (common variants)
    "IE00B4L5Y983",
    # WisdomTree Physical Bitcoin
    "GB00BJYDH287",
    # 21Shares Bitcoin ETP
    "CH0454664001",
    # Generic iShares Bitcoin ETF
    "US46090E1038",
])


def classify_fund(
    info: Optional[Dict[str, Any]] = None,
    name: Optional[str] = None,
    category: Optional[str] = None,
) -> FundType:
    """Clasifica un fondo en su tipo de activo.

    Combina nombre + categoryName del proveedor para determinar la clase.
    Prioridad: CASH > RF > ALTERNATIVO > RV (default).

    Args:
        info: Dict con al menos 'name' y/o 'categoryName'.
        name: Nombre del fondo (override directo).
        category: Categoría del fondo (override directo).

    Returns:
        FundType enum value.
    """
    if info is None:
        info = {}

    fund_name = (name or info.get("name", "")).lower()
    fund_cat = (category or info.get("categoryName", "")).lower()
    combined = f"{fund_name} {fund_cat}"

    # CASH primero (más restrictivo)
    if any(kw in combined for kw in _CASH_KEYWORDS):
        return FundType.CASH

    # Renta Fija
    if any(kw in combined for kw in _RF_KEYWORDS):
        return FundType.RF

    # Alternativo
    if any(kw in combined for kw in _ALT_KEYWORDS):
        return FundType.ALTERNATIVO

    # Default: Renta Variable
    return FundType.RV


def is_etf_or_etp(
    isin: Optional[str] = None,
    info: Optional[Dict[str, Any]] = None,
    name: Optional[str] = None,
    category: Optional[str] = None,
) -> bool:
    """Determina si un producto es un ETF o ETP (no traspasable en España).

    Bajo el Art. 94 Ley 35/2006 IRPF, el régimen de diferimiento fiscal
    (traspaso sin tributar) solo aplica a Instituciones de Inversión Colectiva
    (IICs) registradas como **fondos de inversión**. Los ETFs y ETPs cotizan
    en bolsa y se tratan como ventas de acciones → siempre tributan.

    Args:
        isin: ISIN del producto (consulta lista de ISINs conocidos).
        info: Dict con al menos 'name' y/o 'categoryName'.
        name: Nombre del fondo (override directo).
        category: Categoría (override directo).

    Returns:
        True si el producto es un ETF o ETP (no traspasable).
    """
    if isin and isin.upper() in _KNOWN_ETF_ETP_ISINS:
        return True

    if info is None:
        info = {}

    fund_name = (name or info.get("name", "")).lower()
    fund_cat = (category or info.get("categoryName", "") or "").lower()
    combined = f" {fund_name} {fund_cat} "  # pad with spaces for word-boundary matching

    return any(kw in combined for kw in _ETF_ETP_KEYWORDS)


def is_index_fund(
    info: Optional[Dict[str, Any]] = None,
    name: Optional[str] = None,
    category: Optional[str] = None,
) -> bool:
    """Determina si un fondo es indexado/pasivo.

    Args:
        info: Dict con al menos 'name' y/o 'categoryName'.
        name: Nombre del fondo (override directo).
        category: Categoría (override directo).

    Returns:
        True si parece un fondo indexado/ETF.
    """
    if info is None:
        info = {}

    fund_name = (name or info.get("name", "")).lower()
    fund_cat = (category or info.get("categoryName", "")).lower()
    combined = f"{fund_name} {fund_cat}"

    return any(kw in combined for kw in _INDEX_MARKERS)

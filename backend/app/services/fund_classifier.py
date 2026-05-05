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

"""
region_normalizer.py — Normalización de nombres de regiones y sectores.

Unifica los nombres provenientes de distintos proveedores (Finect, FT,
FMP, Morningstar, YFinance) a un vocabulario canónico en inglés.

Funciones principales:
  - normalize_regions(regions)  → dict con nombres unificados
  - normalize_sectors(sectors)  → dict con nombres unificados
"""

import logging
from typing import Dict

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Mapas de normalización de regiones
# ---------------------------------------------------------------------------

# Finect (español) → nombre canónico inglés
_REGION_MAP: Dict[str, str] = {
    # Finect (español)
    "Estados Unidos": "United States",
    "Zona Euro": "Eurozone",
    "Europa (ex-Zona Euro)": "Europe ex-Euro",
    "Reino Unido": "United Kingdom",
    "Iberoamérica": "Latin America",
    "Canadá": "Canada",
    "Japón": "Japan",
    "Australasia": "Australasia",
    "Asia Desarrollada": "Asia Developed",
    "Asia Emergente": "Asia Emerging",
    "Europa Emergente": "Europe Emerging",
    "Oriente Medio": "Middle East",
    "África": "Africa",
    "Mercado Emergente": "Emerging Markets",
    # FT / MStar (inglés) variantes
    "Greater Europe": "Europe",
    "Greater Asia": "Asia",
    "Europe - ex Euro": "Europe ex-Euro",
    "Latin America": "Latin America",
    "Middle East": "Middle East",
    "United States": "United States",
    "United Kingdom": "United Kingdom",
    "Eurozone": "Eurozone",
    "Canada": "Canada",
    "Japan": "Japan",
    "Africa": "Africa",
    "Australasia": "Australasia",
}

# Super-categorías que engloban sub-regiones — se eliminan si hay desglose
_REGION_SUPER_CATEGORIES: Dict[str, list[str]] = {
    "País Desarrollado": [
        "United States", "Eurozone", "Europe ex-Euro", "United Kingdom",
        "Canada", "Japan", "Australasia", "Asia Developed",
    ],
    "Americas": [
        "United States", "Canada", "Latin America",
    ],
    "Europe": [
        "Eurozone", "Europe ex-Euro", "United Kingdom", "Europe Emerging",
    ],
    "Asia": [
        "Japan", "Asia Developed", "Asia Emerging", "Australasia",
    ],
    "Emerging Markets": [
        "Asia Emerging", "Europe Emerging", "Latin America", "Middle East", "Africa",
    ],
}

# ---------------------------------------------------------------------------
# Mapas de normalización de sectores
# ---------------------------------------------------------------------------

# Finect usa super-sectores Morningstar; FT/FMP usan GICS-like
_SECTOR_MAP: Dict[str, str] = {
    # Finect super-sectors (Morningstar style) — pasar tal cual si no hay desglose
    "cyclical": "Cyclical",
    "sensitive": "Sensitive",
    "defensive": "Defensive",
    # GICS / granular — normalizar capitalización
    "basic materials": "Basic Materials",
    "consumer cyclical": "Consumer Cyclical",
    "financial services": "Financial Services",
    "real estate": "Real Estate",
    "communication services": "Communication Services",
    "energy": "Energy",
    "industrials": "Industrials",
    "technology": "Technology",
    "consumer defensive": "Consumer Defensive",
    "healthcare": "Healthcare",
    "utilities": "Utilities",
    # Variantes comunes
    "financials": "Financial Services",
    "consumer discretionary": "Consumer Cyclical",
    "consumer staples": "Consumer Defensive",
    "information technology": "Technology",
    "health care": "Healthcare",
    "materials": "Basic Materials",
    "telecom": "Communication Services",
    "telecommunications": "Communication Services",
}

# Super-sectores Morningstar que engloban sub-sectores GICS
_SECTOR_SUPER_CATEGORIES: Dict[str, list[str]] = {
    "Cyclical": [
        "Basic Materials", "Consumer Cyclical", "Financial Services", "Real Estate",
    ],
    "Sensitive": [
        "Communication Services", "Energy", "Industrials", "Technology",
    ],
    "Defensive": [
        "Consumer Defensive", "Healthcare", "Utilities",
    ],
}


# ---------------------------------------------------------------------------
# Funciones públicas
# ---------------------------------------------------------------------------

def normalize_regions(regions: Dict[str, float]) -> Dict[str, float]:
    """Normaliza nombres de regiones y elimina super-categorías redundantes.

    Args:
        regions: dict {nombre_region: peso_%} con nombres heterogéneos.

    Returns:
        dict con nombres canónicos en inglés, sin super-categorías
        cuando hay desglose disponible.
    """
    if not regions:
        return {}

    # Paso 1: mapear nombres
    mapped: Dict[str, float] = {}
    unmapped_supers: Dict[str, float] = {}

    for name, weight in regions.items():
        weight = float(weight) if weight else 0.0
        if weight <= 0:
            continue

        # Comprobar si es super-categoría directa (clave sin mapear)
        if name in _REGION_SUPER_CATEGORIES:
            unmapped_supers[name] = weight
            continue

        canonical = _REGION_MAP.get(name)
        if canonical is None:
            # Intentar match case-insensitive
            for key, val in _REGION_MAP.items():
                if key.lower() == name.lower():
                    canonical = val
                    break

        if canonical is None:
            # Comprobar si el valor mapeado es una super-categoría
            canonical = name  # Pasar tal cual

        # Comprobar si el canonical resultante es super-categoría
        if canonical in _REGION_SUPER_CATEGORIES:
            unmapped_supers[canonical] = weight
            continue

        mapped[canonical] = mapped.get(canonical, 0.0) + weight

    # Paso 2: decidir qué hacer con super-categorías
    for super_name, super_weight in unmapped_supers.items():
        sub_regions = _REGION_SUPER_CATEGORIES.get(super_name, [])
        # Si alguna sub-región está presente, descartar la super-categoría
        has_subs = any(sub in mapped for sub in sub_regions)
        if not has_subs:
            # Mantener la super-categoría como entrada normal
            mapped[super_name] = super_weight

    # Paso 3: redondear
    result = {k: round(v, 2) for k, v in mapped.items() if v > 0}
    return dict(sorted(result.items(), key=lambda x: -x[1]))


def normalize_sectors(sectors: Dict[str, float]) -> Dict[str, float]:
    """Normaliza nombres de sectores y elimina super-categorías redundantes.

    Args:
        sectors: dict {nombre_sector: peso_%} con nombres heterogéneos.

    Returns:
        dict con nombres canónicos, sin super-sectores cuando hay desglose
        GICS disponible.
    """
    if not sectors:
        return {}

    # Paso 1: mapear nombres
    mapped: Dict[str, float] = {}
    unmapped_supers: Dict[str, float] = {}

    for name, weight in sectors.items():
        weight = float(weight) if weight else 0.0
        if weight <= 0:
            continue

        canonical = _SECTOR_MAP.get(name.lower())

        if canonical is None:
            # Intentar match parcial
            name_lower = name.lower()
            for key, val in _SECTOR_MAP.items():
                if key in name_lower or name_lower in key:
                    canonical = val
                    break

        if canonical is None:
            canonical = name  # Pasar tal cual

        # Comprobar si es super-categoría
        if canonical in _SECTOR_SUPER_CATEGORIES:
            unmapped_supers[canonical] = weight
            continue

        mapped[canonical] = mapped.get(canonical, 0.0) + weight

    # Paso 2: decidir qué hacer con super-categorías
    for super_name, super_weight in unmapped_supers.items():
        sub_sectors = _SECTOR_SUPER_CATEGORIES.get(super_name, [])
        has_subs = any(sub in mapped for sub in sub_sectors)
        if not has_subs:
            mapped[super_name] = super_weight

    # Paso 3: redondear
    result = {k: round(v, 2) for k, v in mapped.items() if v > 0}
    return dict(sorted(result.items(), key=lambda x: -x[1]))

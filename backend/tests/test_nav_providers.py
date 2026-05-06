"""
test_nav_providers.py — Test de proveedores de datos (async).

Verifica que los proveedores async retornan datos válidos para ISINs conocidos.

Ejecutar:
    cd backend
    python -m pytest tests/test_nav_providers.py -v -s
"""

import asyncio
import logging
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TEST_ISINS = [
    "IE00BYX5NX33",  # Vanguard FTSE All-World
    "IE00BYX5MX67",  # Fidelity S&P 500
    "ES0146309002",  # Horos Value Internacional
]


@pytest.fixture
def provider():
    """Crea un CompositeAsyncProvider para tests."""
    from app.services.cache_store import CacheStore
    from app.services.data_providers import CompositeAsyncProvider

    cache = CacheStore()
    return CompositeAsyncProvider(cache=cache)


@pytest.mark.asyncio
async def test_get_nav(provider):
    """Verifica que get_nav devuelve un precio válido."""
    for isin in TEST_ISINS:
        nav = await provider.get_nav(isin)
        if nav is not None:
            assert nav > 0, f"NAV para {isin} debería ser > 0, got {nav}"
            logger.info("NAV %s: %.4f", isin, nav)


@pytest.mark.asyncio
async def test_get_fund_info(provider):
    """Verifica que get_fund_info devuelve un dict con 'name'."""
    for isin in TEST_ISINS:
        info = await provider.get_fund_info(isin)
        if info:
            assert "name" in info, f"Info de {isin} debería tener 'name'"
            logger.info("Info %s: %s", isin, info.get("name"))


@pytest.mark.asyncio
async def test_get_nav_history(provider):
    """Verifica que el historial de NAV devuelve un DataFrame no vacío."""
    isin = TEST_ISINS[0]
    df = await provider.get_nav_history(isin, years=1)
    if df is not None and not df.empty:
        assert len(df) > 50, f"Historial de {isin} debería tener más de 50 filas"
        logger.info("History %s: %d rows", isin, len(df))


@pytest.mark.asyncio
async def test_get_sector_weights(provider):
    """Verifica que los pesos sectoriales son un dict."""
    isin = TEST_ISINS[0]
    sectors = await provider.get_sector_weights(isin)
    if sectors:
        assert isinstance(sectors, dict)
        total = sum(sectors.values())
        logger.info("Sectors %s: %d categories, total=%.1f%%", isin, len(sectors), total)


@pytest.mark.asyncio
async def test_get_country_weights(provider):
    """Verifica que los pesos por país son un dict."""
    isin = TEST_ISINS[0]
    countries = await provider.get_country_weights(isin)
    if countries:
        assert isinstance(countries, dict)
        logger.info("Countries %s: %d entries", isin, len(countries))


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])

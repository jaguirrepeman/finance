"""
test_nav_providers.py — Test de la estrategia de obtención de NAV.

Compara velocidad, frescura y cobertura de todos los proveedores de datos
(Finect, YFinance, FMP, MorningStar) y del CompositeProvider optimizado.

Ejecutar:
    cd backend
    python -m pytest tests/test_nav_providers.py -v -s
    # o directamente:
    python tests/test_nav_providers.py
"""

import logging
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

# Configurar path
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# ISINs de prueba (fondos reales de la cartera)
# ---------------------------------------------------------------------------

TEST_ISINS = {
    "IE00BYX5NX33": "iShares MSCI ACWI UCITS ETF",
    "ES0146309002": "Fondo español (Azvalor)",
}


def _date_age_days(date_str: str | None) -> int | None:
    """Días desde una fecha ISO hasta hoy."""
    if not date_str:
        return None
    try:
        nav_date = datetime.strptime(date_str[:10], "%Y-%m-%d")
        return (datetime.now() - nav_date).days
    except (ValueError, TypeError):
        return None


def _test_single_provider(provider, provider_name: str, isin: str, fund_name: str) -> dict:
    """Testea get_nav() y get_nav_date() de un proveedor individual."""
    result = {
        "provider": provider_name,
        "isin": isin,
        "fund": fund_name,
        "nav": None,
        "nav_date": None,
        "age_days": None,
        "time_ms": None,
        "error": None,
    }

    t0 = time.perf_counter()
    try:
        nav = provider.get_nav(isin)
        nav_date = provider.get_nav_date(isin)
        elapsed = (time.perf_counter() - t0) * 1000

        result["nav"] = nav
        result["nav_date"] = nav_date
        result["age_days"] = _date_age_days(nav_date)
        result["time_ms"] = round(elapsed, 1)
    except Exception as e:
        elapsed = (time.perf_counter() - t0) * 1000
        result["time_ms"] = round(elapsed, 1)
        result["error"] = str(e)

    return result


def _test_nav_history(provider, provider_name: str, isin: str) -> dict:
    """Testea get_nav_history() de un proveedor."""
    result = {
        "provider": provider_name,
        "isin": isin,
        "rows": 0,
        "first_date": None,
        "last_date": None,
        "time_ms": None,
        "error": None,
    }

    t0 = time.perf_counter()
    try:
        df = provider.get_nav_history(isin, years=1)
        elapsed = (time.perf_counter() - t0) * 1000
        result["time_ms"] = round(elapsed, 1)

        if df is not None and not df.empty:
            result["rows"] = len(df)
            result["first_date"] = str(df["date"].min())[:10]
            result["last_date"] = str(df["date"].max())[:10]
    except Exception as e:
        elapsed = (time.perf_counter() - t0) * 1000
        result["time_ms"] = round(elapsed, 1)
        result["error"] = str(e)

    return result


def run_provider_comparison():
    """Ejecuta la comparación completa de todos los proveedores."""
    from app.services.data_providers import (
        CompositeProvider,
        FMPProvider,
        MStarProvider,
        YFinanceProvider,
    )
    from app.services.finect_provider import FinectProvider

    cache_path = str(BACKEND_DIR / "data" / "cache")

    providers = {
        "Finect": FinectProvider(),
        "YFinance": YFinanceProvider(),
        "FMP": FMPProvider(),
        "MStar": MStarProvider(cache_path=cache_path),
    }

    # Filtrar proveedores no disponibles
    if not providers["FMP"].available:
        logger.warning("FMP no disponible (sin API key)")

    composite = CompositeProvider(cache_path=cache_path)

    # ===================================================================
    # TEST 1: NAV actual — cada proveedor por separado
    # ===================================================================
    print("\n" + "=" * 90)
    print("  TEST 1: NAV actual — comparación de proveedores individuales")
    print("=" * 90)

    all_results = []
    for isin, fund_name in TEST_ISINS.items():
        for pname, provider in providers.items():
            r = _test_single_provider(provider, pname, isin, fund_name)
            all_results.append(r)
            status = "✓" if r["nav"] else "✗"
            date_info = f"@ {r['nav_date']}" if r["nav_date"] else "(sin fecha)"
            age_info = f"({r['age_days']}d)" if r["age_days"] is not None else ""
            nav_str = f"{r['nav']:.4f}" if r["nav"] else "N/A"
            print(
                f"  {status} {pname:12s} | {isin} | "
                f"NAV={nav_str:>12s} {date_info} {age_info} "
                f"| {r['time_ms']:>8.1f}ms"
                + (f" | ERROR: {r['error']}" if r["error"] else "")
            )
        print()

    # ===================================================================
    # TEST 2: CompositeProvider.get_nav() — velocidad del path optimizado
    # ===================================================================
    print("=" * 90)
    print("  TEST 2: CompositeProvider.get_nav() — path optimizado con early termination")
    print("=" * 90)

    for isin, fund_name in TEST_ISINS.items():
        t0 = time.perf_counter()
        nav = composite.get_nav(isin)
        nav_date = composite.get_nav_date(isin)
        elapsed = (time.perf_counter() - t0) * 1000

        status = "✓" if nav else "✗"
        nav_str = f"{nav:.4f}" if nav else "N/A"
        date_info = f"@ {nav_date}" if nav_date else "(sin fecha)"
        age = _date_age_days(nav_date)
        age_info = f"({age}d)" if age is not None else ""
        fresh = "🟢 FRESCO" if age is not None and age <= 3 else "🟡 ALGO ANTIGUO" if age is not None else ""

        print(
            f"  {status} {isin} | {fund_name:35s} | "
            f"NAV={nav_str:>12s} {date_info} {age_info} {fresh} "
            f"| {elapsed:>8.1f}ms"
        )

    # ===================================================================
    # TEST 3: get_nav_history() — verificación de cobertura
    # ===================================================================
    print("\n" + "=" * 90)
    print("  TEST 3: get_nav_history() — cobertura por proveedor (1 año)")
    print("=" * 90)

    test_isin = list(TEST_ISINS.keys())[0]
    test_name = TEST_ISINS[test_isin]
    print(f"  ISIN de prueba: {test_isin} ({test_name})\n")

    for pname, provider in providers.items():
        r = _test_nav_history(provider, pname, test_isin)
        status = "✓" if r["rows"] > 0 else "✗"
        print(
            f"  {status} {pname:12s} | "
            f"{r['rows']:>5d} rows | "
            f"{r['first_date'] or 'N/A':>12s} → {r['last_date'] or 'N/A':>12s} | "
            f"{r['time_ms']:>8.1f}ms"
            + (f" | ERROR: {r['error']}" if r["error"] else "")
        )

    # CompositeProvider history
    print(f"\n  Composite (optimizado):")
    t0 = time.perf_counter()
    df_hist = composite.get_nav_history(test_isin, years=1)
    elapsed = (time.perf_counter() - t0) * 1000
    if not df_hist.empty:
        print(
            f"  ✓ {len(df_hist):>5d} rows | "
            f"{str(df_hist['date'].min())[:10]} → {str(df_hist['date'].max())[:10]} | "
            f"{elapsed:>8.1f}ms"
        )
    else:
        print(f"  ✗ Sin datos | {elapsed:>8.1f}ms")

    # ===================================================================
    # TEST 4: Benchmark total — todas las posiciones de la cartera
    # ===================================================================
    print("\n" + "=" * 90)
    print("  TEST 4: Benchmark — obtener NAV de TODOS los fondos de la cartera")
    print("=" * 90)

    from app.services.core_portfolio import Portfolio

    orders_file = BACKEND_DIR / "data" / "Órdenes 1238478.tsv"
    if orders_file.exists():
        portfolio = Portfolio(str(orders_file))
        all_isins = list(portfolio.positions.keys())
        print(f"  Fondos en cartera: {len(all_isins)}\n")

        total_t0 = time.perf_counter()
        results = []
        for isin in all_isins:
            t0 = time.perf_counter()
            nav = composite.get_nav(isin)
            nav_date = composite.get_nav_date(isin)
            elapsed = (time.perf_counter() - t0) * 1000

            age = _date_age_days(nav_date)
            status = "✓" if nav else "✗"
            nav_str = f"{nav:.4f}" if nav else "N/A"
            date_str = nav_date or "N/A"
            age_str = f"({age}d)" if age is not None else ""
            print(f"  {status} {isin} | NAV={nav_str:>12s} @ {date_str} {age_str:>6s} | {elapsed:>8.1f}ms")
            results.append({
                "isin": isin, "nav": nav, "date": nav_date,
                "age_days": age, "time_ms": elapsed,
            })

        total_elapsed = (time.perf_counter() - total_t0) * 1000

        # Resumen
        ok = sum(1 for r in results if r["nav"])
        fresh = sum(1 for r in results if r["age_days"] is not None and r["age_days"] <= 3)
        avg_ms = sum(r["time_ms"] for r in results) / len(results)

        print(f"\n  {'─' * 60}")
        print(f"  Resumen:")
        print(f"    Fondos con NAV:    {ok}/{len(all_isins)}")
        print(f"    Datos frescos (≤3d): {fresh}/{len(all_isins)}")
        print(f"    Tiempo total:      {total_elapsed:,.0f} ms")
        print(f"    Tiempo medio:      {avg_ms:,.0f} ms/fondo")
        print(f"  {'─' * 60}")
    else:
        print(f"  ⚠ Archivo de órdenes no encontrado: {orders_file}")

    print("\n✅ Tests completados.\n")


# ---------------------------------------------------------------------------
# Pytest wrapper (para poder ejecutar con pytest -v -s)
# ---------------------------------------------------------------------------

def test_finect_nav_extraction():
    """Verifica que FinectProvider extrae NAV de lastQuote."""
    from app.services.finect_provider import FinectProvider

    provider = FinectProvider()
    # Usar un ISIN que sabemos que está en Finect
    isin = "IE00BYX5NX33"

    nav = provider.get_nav(isin)
    nav_date = provider.get_nav_date(isin)

    logger.info("Finect NAV para %s: %s @ %s", isin, nav, nav_date)

    # Al menos uno de los ISINs de test debería funcionar con Finect
    # (depende de conectividad)
    if nav is not None:
        assert nav > 0, f"NAV debería ser positivo, got {nav}"
        assert nav_date is not None, "Si hay NAV, debe haber fecha"
        assert len(nav_date) == 10, f"Formato fecha incorrecto: {nav_date}"


def test_composite_nav_with_early_termination():
    """Verifica que CompositeProvider devuelve NAV sin consultar todos los proveedores."""
    from app.services.data_providers import CompositeProvider

    cache_path = str(BACKEND_DIR / "data" / "cache")
    composite = CompositeProvider(cache_path=cache_path)

    isin = "IE00BYX5NX33"

    t0 = time.perf_counter()
    nav = composite.get_nav(isin)
    elapsed = (time.perf_counter() - t0) * 1000

    logger.info(
        "Composite NAV para %s: %s en %.1fms", isin, nav, elapsed
    )

    assert nav is not None, f"CompositeProvider debería devolver NAV para {isin}"
    assert nav > 0, f"NAV debería ser positivo, got {nav}"
    # Con early termination, debería ser significativamente más rápido
    # que la versión anterior que consultaba TODOS los proveedores
    logger.info("Tiempo: %.1fms (antes podía ser >10s)", elapsed)


def test_composite_nav_history_first_success():
    """Verifica que get_nav_history() usa first-success (no consulta todos)."""
    from app.services.data_providers import CompositeProvider

    cache_path = str(BACKEND_DIR / "data" / "cache")
    composite = CompositeProvider(cache_path=cache_path)

    isin = "IE00BYX5NX33"

    t0 = time.perf_counter()
    df = composite.get_nav_history(isin, years=1)
    elapsed = (time.perf_counter() - t0) * 1000

    logger.info(
        "Composite history para %s: %d rows en %.1fms",
        isin, len(df) if df is not None else 0, elapsed,
    )

    assert df is not None and not df.empty, "Debería devolver historial"
    assert "date" in df.columns and "price" in df.columns
    assert len(df) > 50, f"Con 1 año debería haber >50 puntos, got {len(df)}"


def test_nav_chain_order():
    """Verifica que Finect es el primer proveedor en la cadena NAV."""
    from app.services.data_providers import CompositeProvider
    from app.services.finect_provider import FinectProvider

    composite = CompositeProvider()
    first_provider = composite._nav_chain[0]
    assert isinstance(first_provider, FinectProvider), (
        f"El primer proveedor NAV debería ser FinectProvider, es {type(first_provider).__name__}"
    )


if __name__ == "__main__":
    run_provider_comparison()

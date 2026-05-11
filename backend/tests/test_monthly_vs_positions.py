"""
test_monthly_vs_positions.py

Verifica que el total de patrimonio del último mes en la evolución real
(Comparativa entre Meses) coincide con la suma de Valor_Actual de las
posiciones de "Mi Cartera Base" (build_summary().funds).
"""
import logging
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

logger = logging.getLogger(__name__)

# Tolerancia: el NAV de la evolución puede tener 1-10 días de desfase respecto
# al precio live de las posiciones, por lo que se permite un 15 % de diferencia.
TOLERANCE_PCT = 15.0


@pytest.fixture(scope="module")
def _bootstrap():
    """Cambia al directorio backend para que las rutas relativas funcionen."""
    os.chdir(os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture(scope="module")
def portfolio_client(_bootstrap):
    from app.services.portfolio_service import get_portfolio_client, reset_client

    reset_client()
    return get_portfolio_client()


@pytest.fixture(scope="module")
def summary_data(portfolio_client):
    """Resultado de build_summary() — incluye funds (posiciones)."""
    from app.services.portfolio_service import build_summary

    return build_summary()


@pytest.fixture(scope="module")
def real_evolution(portfolio_client):
    """Resultado de build_real_portfolio_history() — incluye monthly y series."""
    from app.services.portfolio_service import build_real_portfolio_history

    return build_real_portfolio_history(years=20)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _positions_total(summary: dict) -> float:
    """Suma de Valor_Actual de todas las posiciones en el summary."""
    return sum(f.get("Valor_Actual", 0) or 0 for f in summary.get("funds", []))


def _last_monthly_value(evolution: dict) -> float | None:
    """Valor del último mes en la evolución real."""
    monthly = evolution.get("monthly", [])
    return monthly[-1]["value"] if monthly else None


def _last_series_value(evolution: dict) -> float | None:
    """Último valor de la serie diaria."""
    series = evolution.get("series", [])
    return series[-1]["value"] if series else None


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestMonthlyVsPositions:
    """Verifica coherencia entre el patrimonio mensual y las posiciones live."""

    def test_positions_total_positive(self, summary_data):
        """El total de posiciones debe ser > 0."""
        total = _positions_total(summary_data)
        assert total > 0, f"La suma de Valor_Actual es {total} — no hay posiciones."

    def test_monthly_not_empty(self, real_evolution):
        """La evolución real debe tener al menos un punto mensual."""
        monthly = real_evolution.get("monthly", [])
        assert len(monthly) > 0, "No hay datos mensuales en la evolución real."

    def test_last_monthly_vs_positions_total(self, summary_data, real_evolution):
        """El valor del último mes en la evolución ≈ suma de Valor_Actual (Mi Cartera Base).

        Ambos representan el patrimonio total; las diferencias provienen del
        desfase entre la fecha del último NAV diario y el precio live.
        """
        positions_total = _positions_total(summary_data)
        monthly_value = _last_monthly_value(real_evolution)

        assert monthly_value is not None, "No hay valor mensual."
        assert positions_total > 0, "El total de posiciones es 0."

        diff_pct = abs(monthly_value - positions_total) / positions_total * 100
        logger.info(
            "Último mes: %.2f€ | Posiciones: %.2f€ | Diff: %.1f%%",
            monthly_value,
            positions_total,
            diff_pct,
        )
        assert diff_pct <= TOLERANCE_PCT, (
            f"El patrimonio del último mes ({monthly_value:,.2f}€) difiere de la "
            f"suma de posiciones ({positions_total:,.2f}€) en {diff_pct:.1f}% "
            f"(tolerancia: {TOLERANCE_PCT}%)."
        )

    def test_last_series_vs_positions_total(self, summary_data, real_evolution):
        """El último punto de la serie diaria ≈ suma de posiciones.

        Es el dato más reciente de la evolución, no el cierre mensual.
        Debería ser incluso más cercano al valor live que el mensual.
        """
        positions_total = _positions_total(summary_data)
        series_value = _last_series_value(real_evolution)

        assert series_value is not None, "No hay serie diaria."
        assert positions_total > 0, "El total de posiciones es 0."

        diff_pct = abs(series_value - positions_total) / positions_total * 100
        logger.info(
            "Última serie: %.2f€ | Posiciones: %.2f€ | Diff: %.1f%%",
            series_value,
            positions_total,
            diff_pct,
        )
        assert diff_pct <= TOLERANCE_PCT, (
            f"El patrimonio de la serie ({series_value:,.2f}€) difiere de la "
            f"suma de posiciones ({positions_total:,.2f}€) en {diff_pct:.1f}% "
            f"(tolerancia: {TOLERANCE_PCT}%)."
        )

    def test_per_fund_monthly_sum_vs_positions_total(self, summary_data, real_evolution):
        """La suma de monthly_per_fund del último mes ≈ suma de posiciones.

        Verifica que el desglose por fondo es coherente con Mi Cartera Base.
        """
        positions_total = _positions_total(summary_data)
        monthly_pf = real_evolution.get("monthly_per_fund", {})

        if not monthly_pf:
            pytest.skip("No hay monthly_per_fund.")

        # Sumar el último punto de cada fondo
        sum_funds = 0.0
        for fund_name, entries in monthly_pf.items():
            if entries:
                sum_funds += entries[-1]["value"]

        assert positions_total > 0, "El total de posiciones es 0."

        diff_pct = abs(sum_funds - positions_total) / positions_total * 100
        logger.info(
            "Suma monthly_per_fund: %.2f€ | Posiciones: %.2f€ | Diff: %.1f%%",
            sum_funds,
            positions_total,
            diff_pct,
        )
        assert diff_pct <= TOLERANCE_PCT, (
            f"Suma monthly por fondo ({sum_funds:,.2f}€) difiere de la suma "
            f"de posiciones ({positions_total:,.2f}€) en {diff_pct:.1f}% "
            f"(tolerancia: {TOLERANCE_PCT}%)."
        )

    def test_fund_names_match_summary(self, summary_data, real_evolution):
        """Los nombres de fondos en la evolución deben coincidir con los de
        las posiciones (build_summary().funds), no ser simplemente ISINs.

        Al menos el 70% de los fondos de la evolución deben tener un nombre
        que aparezca en la lista de posiciones del summary.
        """
        summary_names = {f["Fondo"] for f in summary_data.get("funds", [])}
        evo_fund_names = set(real_evolution.get("funds", {}).keys())

        if not evo_fund_names:
            pytest.skip("No hay fondos en la evolución.")

        matching = evo_fund_names & summary_names
        pct = len(matching) / len(evo_fund_names) * 100

        logger.info(
            "Fondos en evolución: %d | En summary: %d | Coincidentes: %d (%.0f%%)",
            len(evo_fund_names),
            len(summary_names),
            len(matching),
            pct,
        )

        # Log no-coincidentes para depuración
        non_matching = evo_fund_names - summary_names
        if non_matching:
            logger.warning(
                "Fondos en evolución sin match en summary: %s",
                non_matching,
            )

        assert pct >= 70, (
            f"Solo {len(matching)}/{len(evo_fund_names)} ({pct:.0f}%) nombres "
            f"de fondos coinciden entre evolución y posiciones. "
            f"Sin match: {non_matching}"
        )

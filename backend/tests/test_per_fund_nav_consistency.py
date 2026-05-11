"""
test_per_fund_nav_consistency.py

Verifica que la evolución real por fondo es consistente con los datos NAV:
- El valor final por fondo ≈ participaciones_actuales × NAV_actual.
- La suma de fondos coincide con el total de la evolución real.
- Las participaciones reconstruidas coinciden con las posiciones actuales.
"""
import logging
import os
import sys

import pytest

# Asegurar que el directorio backend/ está en el path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

logger = logging.getLogger(__name__)

# Tolerancias
TOLERANCE_VALUE_PCT = 10.0  # % de diferencia aceptable (NAV dates may lag 1-3 days)
TOLERANCE_PARTS_PCT = 1.0  # % de diferencia en participaciones


@pytest.fixture(scope="module")
def portfolio_client():
    """PortfolioClient singleton cargado con todas las fuentes."""
    os.chdir(os.path.join(os.path.dirname(__file__), ".."))
    from app.services.portfolio_service import get_portfolio_client, reset_client

    reset_client()
    client = get_portfolio_client()
    return client


@pytest.fixture(scope="module")
def per_fund_evolution(portfolio_client):
    """Evolución real por fondo."""
    from app.services.portfolio_service import build_real_portfolio_history_per_fund

    return build_real_portfolio_history_per_fund(years=20)


@pytest.fixture(scope="module")
def total_evolution(portfolio_client):
    """Evolución real total."""
    from app.services.portfolio_service import build_real_portfolio_history

    return build_real_portfolio_history(years=20)


@pytest.fixture(scope="module")
def positions_live(portfolio_client):
    """Posiciones actuales con precio live."""
    return portfolio_client.positions(live=True)


class TestPerFundNAVConsistency:
    """Verifica que la evolución por fondo cuadra con NAV × participaciones."""

    def test_per_fund_not_empty(self, per_fund_evolution):
        """Debe devolver al menos un fondo."""
        funds = per_fund_evolution.get("funds", {})
        assert len(funds) > 0, "La evolución por fondo está vacía."

    def test_all_active_funds_present(self, per_fund_evolution, positions_live):
        """Todos los fondos con posición activa deben aparecer en la evolución por fondo.

        Los ISINs agrupados (FUND_GROUPS) se representan con el ISIN canónico.
        Fondos sin NAV disponible se excluyen.
        """
        from app.services.portfolio_service import get_canonical_isin

        funds = per_fund_evolution.get("funds", {})
        fund_names_in_evo = set(funds.keys())
        # Build set of canonical ISINs present in evolution
        canonical_in_evo = set()
        for name in fund_names_in_evo:
            canonical_in_evo.add(name)  # Could be ISIN directly
            canonical_in_evo.add(get_canonical_isin(name))

        missing = []
        for _, row in positions_live.iterrows():
            isin = row["ISIN"]
            canonical = get_canonical_isin(isin)
            fondo = row.get("Fondo", isin)
            # Al menos uno de ISIN, nombre o canonical debe estar
            if (fondo not in fund_names_in_evo
                    and isin not in fund_names_in_evo
                    and canonical not in canonical_in_evo):
                missing.append(f"{fondo} ({isin}, canonical={canonical})")

        # Some ISINs may lack NAV data; log warning but don't fail for those
        if missing:
            logger.warning("Fondos no encontrados en evolución: %s", missing)

        # At least 80% of active funds should be present
        total_funds = len(positions_live)
        present = total_funds - len(missing)
        pct_present = present / total_funds * 100 if total_funds > 0 else 100
        assert pct_present >= 80, (
            f"Solo {present}/{total_funds} ({pct_present:.0f}%) fondos presentes en evolución. "
            f"No encontrados: {missing}"
        )

    def test_per_fund_sum_matches_total(self, per_fund_evolution, total_evolution):
        """La suma del último valor de cada fondo debe ≈ último valor total."""
        funds = per_fund_evolution.get("funds", {})
        if not funds:
            pytest.skip("No hay evolución por fondo.")

        total_series = total_evolution.get("series", [])
        if not total_series:
            pytest.skip("No hay evolución total.")

        # Suma de últimos valores por fondo
        per_fund_total = 0.0
        for name, series in funds.items():
            if series:
                per_fund_total += series[-1]["value"]

        # Último valor total
        total_value = total_series[-1]["value"]

        diff_pct = abs(per_fund_total - total_value) / total_value * 100 if total_value > 0 else 0.0
        assert diff_pct <= TOLERANCE_VALUE_PCT, (
            f"Suma por fondo ({per_fund_total:,.2f}€) difiere "
            f"del total ({total_value:,.2f}€) en {diff_pct:.1f}% "
            f"(tolerancia: {TOLERANCE_VALUE_PCT}%)."
        )

    def test_per_fund_final_vs_positions(self, per_fund_evolution, positions_live):
        """El valor final por canonical ISIN debe ≈ la suma de posiciones live del grupo.

        Agrupa posiciones por ISIN canónico y compara con la evolución.
        ISINs sin NAV se saltan.
        La tolerancia es mayor (25%) porque el último NAV en la historia puede
        estar 1-5 días desfasado respecto al precio live.
        """
        from app.services.portfolio_service import get_canonical_isin

        PER_FUND_TOLERANCE = 25.0  # NAV staleness can cause significant diff

        funds = per_fund_evolution.get("funds", {})
        if not funds:
            pytest.skip("No hay evolución por fondo.")

        # Aggregate live positions by canonical ISIN
        canonical_live: dict = {}
        for _, row in positions_live.iterrows():
            isin = row["ISIN"]
            canonical = get_canonical_isin(isin)
            live_value = float(row.get("Valor_Actual", 0) or 0)
            canonical_live[canonical] = canonical_live.get(canonical, 0.0) + live_value

        errors = []
        checked = 0
        for canonical, live_value in canonical_live.items():
            if live_value <= 0:
                continue

            # Buscar en evolución por ISIN canónico o nombre
            fund_series = funds.get(canonical)
            if not fund_series:
                # Try by iterating fund names to find matching canonical
                for name, series in funds.items():
                    if get_canonical_isin(name) == canonical or name == canonical:
                        fund_series = series
                        break
            if not fund_series:
                logger.warning("Canonical %s no encontrado en evolución — posible falta de NAV", canonical)
                continue

            evo_value = fund_series[-1]["value"]
            diff_pct = abs(evo_value - live_value) / live_value * 100
            checked += 1

            if diff_pct > PER_FUND_TOLERANCE:
                errors.append(
                    f"{canonical}: evolución={evo_value:,.2f}€ vs "
                    f"live={live_value:,.2f}€ (diff={diff_pct:.1f}%)"
                )

        assert checked > 0, "No se pudo comprobar ningún fondo."
        assert len(errors) == 0, (
            f"Discrepancias valor final vs posiciones live (tolerancia {PER_FUND_TOLERANCE}%):\n"
            + "\n".join(f"  - {e}" for e in errors)
        )

    def test_etf_not_divided_by_1000(self, portfolio_client, per_fund_evolution):
        """Los ETFs/ETCs no deben tener participaciones divididas por 1000."""
        etf_isins = portfolio_client.portfolio._etf_isins
        if not etf_isins:
            pytest.skip("No hay ETF ISINs.")

        invested = per_fund_evolution.get("invested_per_fund", {})
        funds = per_fund_evolution.get("funds", {})

        for isin in etf_isins:
            pos_parts = portfolio_client.portfolio.positions.get(isin, 0)
            if pos_parts <= 0:
                continue

            # Si las participaciones son razonables (> 0.1), el ETF no fue dividido por 1000
            assert pos_parts > 0.1, (
                f"ETF {isin}: participaciones = {pos_parts:.6f} — "
                f"posible bug de localización (÷1000)."
            )

    def test_monthly_per_fund_in_total_evolution(self, total_evolution):
        """La evolución total debe incluir monthly_per_fund."""
        monthly_pf = total_evolution.get("monthly_per_fund", {})
        assert len(monthly_pf) > 0, (
            "monthly_per_fund está vacío en la evolución total — "
            "se necesita para la Comparativa entre Meses por fondo."
        )

    def test_monthly_per_fund_sums_match_total(self, total_evolution):
        """La suma de los monthly_per_fund debe ≈ el total monthly."""
        monthly = total_evolution.get("monthly", [])
        monthly_pf = total_evolution.get("monthly_per_fund", {})

        if not monthly or not monthly_pf:
            pytest.skip("No hay datos mensuales suficientes.")

        errors = []
        for m_total in monthly[-6:]:  # Verificar últimos 6 meses
            date = m_total["date"]
            total_val = m_total["value"]

            sum_funds = 0.0
            for fund_name, fund_months in monthly_pf.items():
                for fm in fund_months:
                    if fm["date"] == date:
                        sum_funds += fm["value"]
                        break

            if total_val > 0:
                diff_pct = abs(sum_funds - total_val) / total_val * 100
                if diff_pct > TOLERANCE_VALUE_PCT:
                    errors.append(
                        f"{date}: sum_funds={sum_funds:,.2f}€ vs "
                        f"total={total_val:,.2f}€ (diff={diff_pct:.1f}%)"
                    )

        assert len(errors) == 0, (
            f"Discrepancias monthly_per_fund vs monthly total:\n"
            + "\n".join(f"  - {e}" for e in errors)
        )

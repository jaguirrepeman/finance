"""
test_position_consistency.py

Verifica que el valor final de la Evolución Real del Patrimonio coincide con
el total de "Mi Cartera Base" (posiciones actuales × NAV) y que la
Comparativa entre Meses usa los mismos importes.

El test usa los mismos datos cargados que el backend (TSV + fuentes ETF),
garantizando que ambas rutas de cálculo son coherentes.
"""
import sys
import os
import pytest

# Asegurar que el directorio backend/ está en el path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Tolerancia muy ajustada: el pinning de la última fecha garantiza que
# la Evolución Real usa exactamente las mismas posiciones live que Mi Cartera Base.
TOLERANCE_PCT = 0.1  # ≤ 0.1% — solo diferencias de redondeo permitidas


@pytest.fixture(scope="module")
def portfolio_client():
    """Devuelve el PortfolioClient singleton cargado con las mismas fuentes que el backend."""
    os.chdir(os.path.join(os.path.dirname(__file__), ".."))
    from app.services.portfolio_service import get_portfolio_client, reset_client

    reset_client()
    client = get_portfolio_client()
    return client


def test_positions_not_empty(portfolio_client):
    """El portfolio debe tener al menos una posición."""
    positions = portfolio_client.portfolio.positions
    assert len(positions) > 0, "El portfolio no tiene posiciones — revisa el archivo de órdenes."


def test_etf_isins_populated(portfolio_client):
    """Se deben haber identificado ISINs de ETF/ETC para evitar la corrección de localización."""
    etf_isins = portfolio_client.portfolio._etf_isins
    assert len(etf_isins) > 0, (
        "No se encontraron ISINs de ETF/ETC. "
        "Verifica que MyInvestorETF.xlsx o Exportación de transacción.csv existen."
    )


def test_positions_live_value_positive(portfolio_client):
    """El valor actual total de las posiciones debe ser positivo."""
    df = portfolio_client.positions(live=True)
    total_value = df["Valor_Actual"].dropna().sum()
    assert total_value > 0, (
        f"Valor total de posiciones es {total_value:.2f}€ — debería ser positivo."
    )


def test_real_evolution_final_matches_positions(portfolio_client):
    """El último valor de la Evolución Real debe coincidir con el total de posiciones (±TOLERANCE_PCT%).

    Esta verificación detecta discrepancias causadas por:
    - Corrección de localización mal aplicada a ETCs (bug: dividir enteros por 1000).
    - Diferencias en los precios NAV usados en cada cálculo.
    - Tratamiento incorrecto de reembolsos/ventas.
    """
    from app.services.portfolio_service import build_real_portfolio_history

    # Valor actual de posiciones (Mi Cartera Base)
    df_pos = portfolio_client.positions(live=True)
    total_positions_value = float(df_pos["Valor_Actual"].dropna().sum())

    assert total_positions_value > 0, "El valor de las posiciones es 0 — no se puede comparar."

    # Valor final de la evolución real
    history = build_real_portfolio_history(years=20)
    series = history.get("series", [])
    assert len(series) > 0, "La Evolución Real no tiene datos — revisa los NAVs."

    final_evolution_value = series[-1]["value"]

    # Comparación con tolerancia
    diff_pct = abs(final_evolution_value - total_positions_value) / total_positions_value * 100
    assert diff_pct <= TOLERANCE_PCT, (
        f"Discrepancia entre Evolución Real ({final_evolution_value:,.2f}€) "
        f"y Mi Cartera Base ({total_positions_value:,.2f}€): "
        f"{diff_pct:.1f}% (tolerancia máx: {TOLERANCE_PCT}%).\n"
        f"Revisa la corrección de localización en ETCs y la consistencia de NAVs."
    )


def test_invested_capital_consistency(portfolio_client):
    """El capital invertido en la evolución real debe ser similar al de las posiciones."""
    from app.services.portfolio_service import build_real_portfolio_history

    df_pos = portfolio_client.positions(live=True)
    total_invested_positions = float(df_pos["Capital_Invertido"].dropna().sum())

    history = build_real_portfolio_history(years=20)
    series = history.get("series", [])

    if not series or total_invested_positions <= 0:
        pytest.skip("Datos insuficientes para comparar el capital invertido.")

    final_invested_evolution = series[-1]["invested"]
    diff_pct = abs(final_invested_evolution - total_invested_positions) / total_invested_positions * 100

    assert diff_pct <= TOLERANCE_PCT, (
        f"Discrepancia en Capital Invertido: Evolución Real ({final_invested_evolution:,.2f}€) "
        f"vs Posiciones ({total_invested_positions:,.2f}€): {diff_pct:.1f}% "
        f"(tolerancia máx: {TOLERANCE_PCT}%)."
    )


def test_etf_positions_reasonable(portfolio_client):
    """Verifica que las posiciones de ETF/ETC tienen participaciones razonables (no divididas por 1000).

    Una posición dividida por 1000 tendría un valor muy pequeño (< 1€) a pesar de que
    los ETCs suelen cotizar entre 10€ y 10.000€ por participación.
    """
    etf_isins = portfolio_client.portfolio._etf_isins
    if not etf_isins:
        pytest.skip("No hay ETF/ETC ISINs registrados.")

    df = portfolio_client.positions(live=True)
    etf_positions = df[df["ISIN"].isin(etf_isins)]

    if etf_positions.empty:
        pytest.skip("No hay posiciones de ETF/ETC con valor disponible.")

    for _, row in etf_positions.iterrows():
        valor = row.get("Valor_Actual")
        capital = row.get("Capital_Invertido", 0)
        if valor is None or capital <= 0:
            continue
        # Si el valor actual es < 0.1% del capital invertido, probablemente hay un bug
        # de localización (participaciones divididas por 1000).
        ratio = valor / capital
        assert ratio > 0.001, (
            f"ETC {row['ISIN']} ({row.get('Fondo', '')}): "
            f"Valor actual ({valor:.2f}€) es {ratio*100:.4f}% del capital invertido ({capital:.2f}€). "
            f"Posible bug: participaciones divididas por 1000."
        )


def test_ie00b4nd3602_nav_in_eur(portfolio_client):
    """IE00B4ND3602 (Physical Gold ETC USD) debe cotizar en EUR, no en USD.

    El precio en USD del oro ronda los $100-250/participación.
    Convertido a EUR debe ser un valor similar (no 100x mayor).
    Si el NAV supera $5 000, probablemente no se está convirtiendo de USD a EUR.
    """
    df = portfolio_client.positions(live=True)
    gold_etc = df[df["ISIN"] == "IE00B4ND3602"]

    if gold_etc.empty:
        pytest.skip("IE00B4ND3602 no está en el portfolio activo.")

    nav = float(gold_etc.iloc[0].get("Precio_Actual", 0) or 0)
    assert nav > 0, "IE00B4ND3602: NAV es 0 o no disponible."
    # iShares Physical Gold ETC cotiza ~$90-250 USD/participación;
    # en 2024-2026 el precio EUR equivalente ronda 80-250 €.
    # Un valor > 5 000 indicaría que se está usando el precio de otra unidad o sin convertir.
    assert nav < 5_000, (
        f"IE00B4ND3602: NAV = {nav:.2f} parece estar en USD o en unidades incorrectas "
        f"(esperado: 80-350 EUR/participación)."
    )


def test_xs2940466316_nav_in_eur(portfolio_client):
    """XS2940466316 (iShares Bitcoin ETP, Amsterdam USD listing) debe cotizar en EUR.

    yfinance devuelve este ETP en USD porque cotiza en AMS.
    Debe estar en _FORCE_YF_ISINS para aplicar la conversión USD→EUR.
    Un NAV > 200 EUR sugiere que se está usando el precio en USD sin convertir.
    """
    df = portfolio_client.positions(live=True)
    btc_etc = df[df["ISIN"] == "XS2940466316"]

    if btc_etc.empty:
        pytest.skip("XS2940466316 no está en el portfolio activo.")

    nav = float(btc_etc.iloc[0].get("Precio_Actual", 0) or 0)
    assert nav > 0, "XS2940466316: NAV es 0 o no disponible."
    # iShares Bitcoin ETP cotiza en el rango €5-50 (dependiendo del precio BTC).
    # Un valor > 200 indicaría que se está retornando en USD sin conversión.
    assert nav < 200, (
        f"XS2940466316: NAV = {nav:.2f} parece estar en USD "
        f"(esperado < 200 EUR/participación)."
    )


def test_monthly_last_value_matches_positions(portfolio_client):
    """El último mes de la Evolución Real debe mostrar el mismo total que Mi Cartera Base.

    La Comparativa entre Meses y la tabla General deben ser coherentes:
    el patrimonio del mes más reciente en la evolución = suma de Valor_Actual de posiciones.
    """
    from app.services.portfolio_service import build_real_portfolio_history

    df_pos = portfolio_client.positions(live=True)
    total_positions = float(df_pos["Valor_Actual"].dropna().sum())
    total_inv_positions = float(df_pos["Capital_Invertido"].dropna().sum())

    assert total_positions > 0, "Posiciones vacías."

    history = build_real_portfolio_history(years=20)
    monthly = history.get("monthly", [])
    assert len(monthly) > 0, "No hay datos mensuales en la Evolución Real."

    last_month = monthly[-1]
    last_value = float(last_month["value"])
    last_invested = float(last_month["invested"])

    # Value must match positions
    diff_value_pct = abs(last_value - total_positions) / total_positions * 100
    assert diff_value_pct <= TOLERANCE_PCT, (
        f"Comparativa entre Meses: Patrimonio del mes={last_month['date']} "
        f"({last_value:,.2f}€) != Posiciones ({total_positions:,.2f}€). "
        f"Diferencia: {diff_value_pct:.2f}% (max: {TOLERANCE_PCT}%)."
    )

    # Invested must match positions
    diff_inv_pct = abs(last_invested - total_inv_positions) / total_inv_positions * 100
    assert diff_inv_pct <= TOLERANCE_PCT, (
        f"Comparativa entre Meses: Capital Invertido del mes={last_month['date']} "
        f"({last_invested:,.2f}€) != Posiciones ({total_inv_positions:,.2f}€). "
        f"Diferencia: {diff_inv_pct:.2f}% (max: {TOLERANCE_PCT}%)."
    )


def test_general_tab_total_consistency(portfolio_client):
    """El total de Valor_Actual en pestaña General debe coincidir con la Evolución Real y la Comparativa.

    Verifica la cadena completa:
      Mi Cartera Base (positions)  ==  Evolución Real (ultimo valor)  ==  Comparativa Meses (ultimo mes)
    """
    from app.services.portfolio_service import build_real_portfolio_history

    # Mi Cartera Base
    df_pos = portfolio_client.positions(live=True)
    total_general = float(df_pos["Valor_Actual"].dropna().sum())

    # Evolución Real → serie diaria
    history = build_real_portfolio_history(years=20)
    series = history.get("series", [])
    monthly = history.get("monthly", [])

    assert series, "Evolución Real sin datos de serie."
    assert monthly, "Evolución Real sin datos mensuales."

    evo_last = float(series[-1]["value"])
    monthly_last = float(monthly[-1]["value"])

    # All three must be equal (within rounding)
    assert abs(evo_last - total_general) / total_general * 100 <= TOLERANCE_PCT, (
        f"General vs Evolución (serie): {total_general:,.2f} vs {evo_last:,.2f}"
    )
    assert abs(monthly_last - total_general) / total_general * 100 <= TOLERANCE_PCT, (
        f"General vs Comparativa Meses: {total_general:,.2f} vs {monthly_last:,.2f}"
    )

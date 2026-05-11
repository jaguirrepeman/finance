# %% [markdown]
# # Portfolio Tracker — Notebook Interactivo
#
# Réplica completa de la aplicación web usando `PortfolioClient`.
#
# **Secciones:**
# 1. Setup
# 2. Carga de datos
# 3. Resumen (KPIs)
# 4. Posiciones + Lotes abiertos
# 5. Movimientos + Resumen de Órdenes
# 6. Asset Allocation
# 7. Evolución Real del Patrimonio
# 8. Evolución Real por Fondo
# 9. Benchmark vs MSCI World
# 10. Detalle Individual de Fondo
# 11. Evolución Temporal (NAV base 100)
# 12. Métricas de Evolución por Fondo
# 13. Retornos Anuales (Heatmap)
# 14. Correlaciones
# 15. Simulador: Añadir Fondo
# 16. Simulador: Rebalanceo
# 17. Proyección What-If
# 18. Tax Optimizer (FIFO)
# 19. Análisis de Traspasos
# 20. Performance + Diagnósticos
# 21. Oportunidades de Compra — Timing de Entrada

# %% [markdown]
# ## 1. Setup

# %%
# ── Magics ────────────────────────────────────────────────────────────────────
# NOTA: las magics solo funcionan dentro del Python Interactive de VS Code.
# Si ves "SyntaxError: invalid syntax" asegúrate de ejecutar con
# "Run Cell" (Shift+Enter) y NO con python portfolio_tracker.py desde terminal.
%load_ext autoreload
%autoreload 2

# ── Imports ───────────────────────────────────────────────────────────────────
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots

from IPython.display import display

warnings.filterwarnings("ignore")
pd.set_option("display.max_columns", 30)
pd.set_option("display.float_format", "{:,.2f}".format)

# ── Path ──────────────────────────────────────────────────────────────────────
# __file__ no existe en contextos interactivos → fallback robusto
try:
    _this_file = Path(__file__).resolve()
except NameError:
    # Python Interactive / Jupyter: usar la ubicación conocida del fichero
    _this_file = Path(r"c:\Users\jaguirrepeman\OneDrive - Deloitte (O365D)\Documents\DS\Finance\backend\notebooks\portfolio_tracker.py")

BACKEND_DIR = _this_file.parent.parent   # …/Finance/backend
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.client import PortfolioClient  # noqa: E402

print(f"✅ Python       : {sys.executable}")
print(f"✅ Backend dir  : {BACKEND_DIR}")
print(f"✅ En sys.path  : {str(BACKEND_DIR) in sys.path}")
print(f"✅ PortfolioClient importado")

# %% [markdown]
# ## 2. Carga de Datos
#
# Cargamos el fichero de órdenes CSV (sep=';') y creamos el `PortfolioClient`.

# %%
CSV_PATH = str(BACKEND_DIR / "data" / "Órdenes 1238478.csv")
client = PortfolioClient(CSV_PATH)
print(client)

mov = client.movements()
print(f"\nMovimientos cargados: {len(mov)}")
mov.tail(10)

# %% [markdown]
# ## 2b. Fuentes extra de órdenes: MyInvestor ETF + Trade Republic

# %%
import importlib
import app.services.core_portfolio as _cp_mod
importlib.reload(_cp_mod)

from app.services.core_portfolio import Portfolio
from app.services.portfolio_service import (
    MYINVESTOR_ETF_PATH,
    TRADEREPUBLIC_CSV_PATH,
)

# ── Trade Republic ────────────────────────────────────────────────────────────
print("=" * 65)
print("TRADE REPUBLIC — Exportación de transacción.csv")
print("=" * 65)
if TRADEREPUBLIC_CSV_PATH.exists():
    df_tr = Portfolio._normalize_traderepublic_df(str(TRADEREPUBLIC_CSV_PATH))
    print(f"  Filas cargadas (TRADING):  {len(df_tr)}")
    print(f"  ISINs distintos:           {df_tr['ISIN'].nunique()}")
    print(f"  Rango de fechas:           {df_tr['Fecha'].min().date()} → {df_tr['Fecha'].max().date()}")
    print(f"  Importe total invertido:   €{df_tr['Importe'].sum():,.2f}")
    print()
    print("  ISINs y nombres:")
    print(df_tr.groupby("ISIN")["Fondo"].first().reset_index().to_string(index=False))
    print()
    display(df_tr.head(10))
else:
    print(f"  ⚠️  Fichero no encontrado: {TRADEREPUBLIC_CSV_PATH}")

# ── MyInvestor ETF ────────────────────────────────────────────────────────────
print()
print("=" * 65)
print("MYINVESTOR ETF — MyInvestorETF.xlsx")
print("=" * 65)
if MYINVESTOR_ETF_PATH.exists():
    df_mi = Portfolio._normalize_myinvestor_etf_df(str(MYINVESTOR_ETF_PATH))
    print(f"  Filas cargadas:            {len(df_mi)}")
    print(f"  ISINs distintos:           {df_mi['ISIN'].nunique()}")
    print(f"  Rango de fechas:           {df_mi['Fecha'].min().date()} → {df_mi['Fecha'].max().date()}")
    print(f"  Importe total invertido:   €{df_mi['Importe'].sum():,.2f}")
    print()
    print("  ISINs y nombres:")
    print(df_mi.groupby("ISIN")["Fondo"].first().reset_index().to_string(index=False))
    print()
    display(df_mi.head(10))
else:
    print(f"  ⚠️  Fichero no encontrado: {MYINVESTOR_ETF_PATH}")

# %%
# Resumen consolidado de todas las fuentes de órdenes
print("=" * 65)
print("RESUMEN CONSOLIDADO DE TODAS LAS FUENTES")
print("=" * 65)

df_tsv = mov.copy()
df_tsv["Fuente"] = "TSV (Fondos Indexa)"

frames = [df_tsv]
if "df_tr" in dir() and not df_tr.empty:
    _dtr = df_tr.copy()
    _dtr["Fuente"] = "Trade Republic (ETC)"
    frames.append(_dtr)
if "df_mi" in dir() and not df_mi.empty:
    _dmi = df_mi.copy()
    _dmi["Fuente"] = "MyInvestor (ETF)"
    frames.append(_dmi)

mov_all = pd.concat(frames, ignore_index=True)
mov_all["Fecha"] = pd.to_datetime(mov_all["Fecha"])

print(f"\nTotal órdenes:        {len(mov_all)}")
print(f"ISINs únicos totales: {mov_all['ISIN'].nunique()}")
print(f"Importe total:        €{mov_all['Importe'].sum():,.2f}")
print()

summary_fuente = mov_all.groupby("Fuente").agg(
    Órdenes=("ISIN", "count"),
    ISINs=("ISIN", "nunique"),
    Importe_Total=("Importe", "sum"),
    Desde=("Fecha", "min"),
    Hasta=("Fecha", "max"),
)
summary_fuente["Desde"] = summary_fuente["Desde"].dt.strftime("%Y-%m-%d")
summary_fuente["Hasta"] = summary_fuente["Hasta"].dt.strftime("%Y-%m-%d")
display(summary_fuente.style.format({"Importe_Total": "€{:,.2f}"}))

print()
fondo_col = "Fondo" if "Fondo" in mov_all.columns else "ISIN"
agg_dict = {
    "Fuente": ("Fuente", "first"),
    "Órdenes": ("ISIN", "count"),
    "Participaciones": ("Participaciones", "sum"),
    "Importe": ("Importe", "sum"),
}
if fondo_col == "Fondo":
    agg_dict["Nombre"] = ("Fondo", "first")

resumen_isin = (
    mov_all.groupby("ISIN")
    .agg(**agg_dict)
    .sort_values("Importe", ascending=False)
)
display(resumen_isin.style.format({"Participaciones": "{:,.4f}", "Importe": "€{:,.2f}"}))

# %% [markdown]
# ## 3. Resumen (KPIs)

# %%
pos = client.positions(live=True)

total_valor = pos["Valor_Actual"].sum()
total_inv = pos["Capital_Invertido"].sum()
ganancia = total_valor - total_inv
ganancia_pct = (ganancia / total_inv * 100) if total_inv > 0 else 0

print("═" * 60)
print(f"{'RESUMEN DE CARTERA':^60}")
print("═" * 60)
print(f"  Patrimonio:        €{total_valor:>12,.2f}")
print(f"  Capital Invertido: €{total_inv:>12,.2f}")
print(f"  Ganancia:          €{ganancia:>12,.2f} ({ganancia_pct:+.2f}%)")
print(f"  Nº Fondos:         {len(pos)}")
print("═" * 60)

# %% [markdown]
# ## 4. Posiciones + Lotes Abiertos

# %%
display(pos)

# %%
# Lotes abiertos (FIFO)
lots = client.open_lots()
print(f"Lotes abiertos: {len(lots)}")
display(lots.head(20))

# %% [markdown]
# ## 5. Movimientos + Resumen de Órdenes

# %%
client.plot_orders_summary(mode="monthly").show()
client.plot_orders_summary(mode="yearly").show()

orders = client.orders_summary()
yearly = orders["yearly"]
if yearly:
    df_yearly = pd.DataFrame([
        {"Año": k, "Total Invertido (€)": v} for k, v in sorted(yearly.items())
    ])
    print("\n📅 Inversiones por Año:")
    display(df_yearly.style.format({"Total Invertido (€)": "€{:,.2f}"}))
    print(f"\nTotal histórico: €{sum(yearly.values()):,.2f}")

# %% [markdown]
# ## 6. Asset Allocation

# %%
client.plot_asset_allocation().show()

# %%
client.plot_fund_weights().show()

# %% [markdown]
# ## 7. Evolución Real del Patrimonio
#
# Reconstrucción diaria del valor de la cartera basada en las **fechas reales de ejecución** de cada orden.

# %%
client.plot_real_evolution(years=20).show()

# %%
# Tabla mensual de snapshots
evolution = client.real_evolution(years=20)
if evolution["monthly"]:
    df_monthly_evo = pd.DataFrame(evolution["monthly"])
    df_monthly_evo = df_monthly_evo.sort_values("date", ascending=False)
    display(
        df_monthly_evo[["label", "value", "invested", "gain", "gain_pct", "mom"]]
        .rename(columns={
            "label": "Mes", "value": "Patrimonio (€)", "invested": "Invertido (€)",
            "gain": "Ganancia (€)", "gain_pct": "Ganancia (%)", "mom": "MoM (%)",
        })
        .head(24)
        .style.format({
            "Patrimonio (€)": "€{:,.2f}", "Invertido (€)": "€{:,.2f}",
            "Ganancia (€)": "€{:,.2f}", "Ganancia (%)": "{:.2f}%",
            "MoM (%)": "{:.2f}%",
        })
        .background_gradient(subset=["Ganancia (%)"], cmap="RdYlGn", vmin=-10, vmax=10)
    )

# %% [markdown]
# ## 8. Evolución Real por Fondo

# %%
client.plot_per_fund_evolution(years=20).show()

# %% [markdown]
# ## 9. Benchmark vs MSCI World

# %%
client.plot_benchmark_sectors().show()
client.plot_benchmark_regions().show()

# %%
fm = client.fund_metrics()
if not fm.empty:
    display(fm.style.format(precision=2))

# %% [markdown]
# ## 10. Detalle Individual de Fondo
#
# Selecciona un ISIN de tu cartera para ver sectores, regiones y top holdings.

# %%
FUND_ISIN = pos["ISIN"].iloc[0] if not pos.empty else "IE00B4L5Y983"
print(f"Detalle del fondo: {FUND_ISIN}")

detail = client.fund_details(FUND_ISIN)
info_rows = detail[~detail["Metric"].str.startswith(("sector_", "country_", "holding_"))]
holding_rows = detail[detail["Metric"].str.startswith("holding_")].copy()

print("\n📋 Información general:")
display(info_rows)

client.plot_fund_sectors(FUND_ISIN).show()
client.plot_fund_regions(FUND_ISIN).show()

if not holding_rows.empty:
    holding_rows["Holding"] = holding_rows["Metric"].str.replace("holding_", "")
    holding_rows["Peso"] = pd.to_numeric(holding_rows["Value"], errors="coerce")
    print("\n🏢 Top Holdings:")
    display(holding_rows[["Holding", "Peso"]].reset_index(drop=True))

# %% [markdown]
# ## 11. Evolución Temporal (NAV base 100)

# %%
client.plot_history_base100(years=5).show()

# %%
client.plot_history_nav(years=5).show()

# %% [markdown]
# ## 12. Métricas de Evolución por Fondo
#
# Rentabilidad Total, CAGR, Volatilidad, Sharpe, Alpha, Beta por fondo.

# %%
evo_metrics = client.evolution_metrics(years=5)

if not evo_metrics.empty:
    print(f"Benchmark: {evo_metrics.attrs.get('benchmark', 'N/A')}")
    print(f"Período: {evo_metrics.attrs.get('years', 5)} años | Risk-free: {evo_metrics.attrs.get('risk_free_annual', 0.03)*100:.1f}%")
    display(
        evo_metrics.style.format({
            "Rentab_Total_Pct": "{:.2f}%",
            "CAGR_Pct": "{:.2f}%",
            "Volatilidad_Pct": "{:.2f}%",
            "Sharpe": "{:.3f}",
            "Alpha_Pct": "{:.2f}%",
            "Beta": "{:.3f}",
            "Peso_Cartera_Pct": "{:.2f}%",
        })
        .background_gradient(subset=["Sharpe"], cmap="RdYlGn", vmin=-0.5, vmax=1.5)
    )

client.plot_evolution_metrics(years=5, metric="CAGR_Pct").show()
client.plot_evolution_metrics(years=5, metric="Sharpe").show()

# %% [markdown]
# ## 13. Retornos Anuales (Heatmap)

# %%
client.plot_annual_returns(years=10).show()

# %% [markdown]
# ## 14. Correlaciones

# %%
client.plot_correlation(years=5).show()

corr = client.correlation(years=5)
if not corr.empty:
    pairs = []
    for i in range(len(corr.columns)):
        for j in range(i + 1, len(corr.columns)):
            val = corr.iloc[i, j]
            if not np.isnan(val):
                pairs.append({
                    "Par": f"{corr.columns[i][:20]} — {corr.columns[j][:20]}",
                    "Correlación": val,
                })
    df_pairs = pd.DataFrame(pairs).sort_values("Correlación")
    print("\n🔻 Menos correlacionados:")
    display(df_pairs.head(5))
    print("\n🔺 Más correlacionados:")
    display(df_pairs.tail(5))

# %% [markdown]
# ## 15. Simulador: Añadir Fondo

# %%
SIM_ISIN = "IE00B4L5Y983"  # iShares MSCI World
SIM_AMOUNT = 10_000  # €

sim = client.simulate_addition(SIM_ISIN, SIM_AMOUNT)
meta = sim.get("metadata", {})
print(f"Simulando añadir €{SIM_AMOUNT:,.0f} de {SIM_ISIN}")
if meta:
    print(f"Fondo añadido:  {meta.get('added_name', SIM_ISIN)}")
    print(f"Total actual:   €{meta.get('current_total', 0):,.2f}")
    print(f"Total simulado: €{meta.get('simulated_total', 0):,.2f}")
    print()

if "metrics" in sim:
    display(sim["metrics"])

client.plot_simulation_weights(SIM_ISIN, SIM_AMOUNT).show()

# %% [markdown]
# ## 16. Simulador: Rebalanceo

# %%
n_funds = len(pos)
equal_weight = round(100 / n_funds, 2) if n_funds > 0 else 0
target_weights = {row["ISIN"]: equal_weight for _, row in pos.iterrows()}

print(f"Simulando rebalanceo equiponderado ({equal_weight:.1f}% cada fondo)")
print("=" * 50)

try:
    rebal = client.simulate_rebalance(target_weights)

    if "funds" in rebal:
        df_rebal = pd.DataFrame(rebal["funds"])
        if "weight_before" in df_rebal.columns and "weight_after" in df_rebal.columns:
            fig = go.Figure()
            fig.add_trace(go.Bar(name="Antes", x=df_rebal["name"], y=df_rebal["weight_before"], marker_color="#4fc3f7"))
            fig.add_trace(go.Bar(name="Después", x=df_rebal["name"], y=df_rebal["weight_after"], marker_color="#66bb6a"))
            fig.update_layout(barmode="group", title="Rebalanceo: Pesos Antes vs Después",
                              template="plotly_dark", height=400, xaxis_tickangle=-45)
            fig.show()

    if "history_current" in rebal and "history_simulated" in rebal:
        h_curr = rebal["history_current"]
        h_sim = rebal["history_simulated"]
        if h_curr and h_sim:
            df_hc = pd.DataFrame(h_curr)
            df_hs = pd.DataFrame(h_sim)
            if "date" in df_hc.columns and "value" in df_hc.columns:
                fig = go.Figure()
                fig.add_trace(go.Scatter(x=df_hc["date"], y=df_hc["value"], name="Actual", line=dict(color="#4fc3f7")))
                fig.add_trace(go.Scatter(x=df_hs["date"], y=df_hs["value"], name="Rebalanceada", line=dict(color="#66bb6a")))
                fig.update_layout(title="Evolución Histórica: Actual vs Rebalanceada (Base 100)",
                                  template="plotly_dark", height=400, hovermode="x unified")
                fig.show()
except Exception as e:
    print(f"Error en simulación de rebalanceo: {e}")

# %% [markdown]
# ## 17. Proyección What-If

# %%
HORIZON_YEARS = 10
ANNUAL_CONTRIBUTION = 12_000  # € anuales adicionales
LOOKBACK_YEARS = 5
SIGMA_LEVEL = 1.0

client.plot_projection(
    years=LOOKBACK_YEARS,
    horizon=HORIZON_YEARS,
    annual_contribution=ANNUAL_CONTRIBUTION,
    sigma_level=SIGMA_LEVEL,
).show()

# %% [markdown]
# ## 18. Tax Optimizer (FIFO)

# %%
TARGET_WITHDRAWAL = 50_000  # € que quiero retirar

tax_plan = client.tax_optimize(TARGET_WITHDRAWAL)

if not tax_plan.empty:
    print(f"Plan de retirada óptimo para €{TARGET_WITHDRAWAL:,.0f}")
    print(f"  Importe retirado:     €{tax_plan.attrs.get('withdrawn_amount', 0):,.2f}")
    print(f"  Ganancia patrimonial: €{tax_plan.attrs.get('total_capital_gain', 0):,.2f}")
    print(f"  Impuestos estimados:  €{tax_plan.attrs.get('estimated_tax', 0):,.2f}")
    print(f"  Neto tras impuestos:  €{tax_plan.attrs.get('net_amount', 0):,.2f}")
    display(tax_plan)

client.plot_tax_brackets(TARGET_WITHDRAWAL).show()

# %% [markdown]
# ## 19. Análisis de Traspasos

# %%
try:
    traspaso = client.traspaso_analysis()
    if traspaso:
        df_t = pd.DataFrame(traspaso)
        print("📋 Análisis de Fondos Traspasables (Art. 94 LIRPF)")
        print("=" * 60)
        display(df_t)
        if "Plusvalia_Latente" in df_t.columns:
            print(f"\nPlusvalía latente total diferible: €{df_t['Plusvalia_Latente'].sum():,.2f}")
        if "Ahorro_Traspaso" in df_t.columns:
            print(f"Ahorro fiscal potencial (vs vender): €{df_t['Ahorro_Traspaso'].sum():,.2f}")
    else:
        print("No hay datos de análisis de traspasos.")
except Exception as e:
    print(f"Error: {e}")

# %%
TRASPASO_AMOUNT = 30_000  # € que quiero retirar de forma óptima

try:
    opt_result = client.optimize_withdrawal_via_traspaso(TRASPASO_AMOUNT)
    if opt_result:
        print(f"🎯 Optimización de retirada de €{TRASPASO_AMOUNT:,.0f}")
        print("=" * 60)
        if "scenario_direct" in opt_result and "scenario_optimized" in opt_result:
            direct = opt_result["scenario_direct"]
            optimized = opt_result["scenario_optimized"]
            print(f"\n{'Escenario':<30} {'Directo':>12} {'Optimizado':>12} {'Ahorro':>12}")
            print("-" * 70)
            for key in ["impuesto_total", "neto_retirado", "plusvalia_diferida"]:
                d_val = direct.get(key, 0)
                o_val = optimized.get(key, 0)
                saving = d_val - o_val if "impuesto" in key else o_val - d_val
                print(f"  {key:<28} €{d_val:>10,.2f} €{o_val:>10,.2f} €{saving:>10,.2f}")
        if "steps" in opt_result:
            print(f"\n📝 Plan paso a paso ({len(opt_result['steps'])} operaciones):")
            for i, step in enumerate(opt_result["steps"][:10], 1):
                tipo = step.get("tipo", "")
                fondo = step.get("Fondo", "")[:30]
                importe = step.get("Importe", 0)
                print(f"  {i}. [{tipo}] {fondo} → €{importe:,.2f}")
except Exception as e:
    print(f"Error en optimización de traspasos: {e}")

# %% [markdown]
# ## 20. Performance + Diagnósticos

# %%
perf = client.performance(years=5)
if not perf.empty:
    print("📊 Performance del Portfolio (5Y)")
    print("=" * 40)
    for _, row in perf.iterrows():
        print(f"  {row['Metric']:.<30} {row['Value']}")
else:
    print("No hay métricas de performance disponibles.")

# %%
diag = client.diagnostics(years=5)
if not diag.empty:
    print("🔍 Diagnóstico de Datos")
    print("=" * 40)
    display(diag)
else:
    print("No hay datos de diagnóstico.")

# %% [markdown]
# ## 21. Oportunidades de Compra — Timing de Entrada
#
# Esta sección analiza **cuándo** es buen momento para aportar más a cada
# fondo de la cartera. No evalúa calidad (ya sabes que son buenos) — solo
# si cotizan por debajo, en línea o por encima de su tendencia histórica.
#
# **6 dimensiones del Timing Score:**
# 1. **📐 Tendencia** — Z-score vs regresión log-lineal (10Y)
# 2. **📉 Pullback** — Caída desde máx. 3M
# 3. **🔀 Divergencia** — Momentum 1M vs 6M
# 4. **📊 RSI** — Sobrevendido/sobrecomprado (mean reversion)
# 5. **🌊 Vol. Régimen** — Volatilidad actual vs histórica
# 6. **⚡ Corto Plazo** — Dips 3d/1w/2w
#
# Pesos por defecto (ajustables): 25/15/15/15/10/20

# %% [markdown]
# ### 21a. Tabla resumen de oportunidades

# %%
opps = client.opportunities()

if opps:
    df_opp = pd.DataFrame(opps)
    cols_display = [
        "name", "isin", "fund_type", "timing_score",
        "trend_score", "pullback_score", "divergence_score",
        "rsi_score", "vol_regime_score", "short_term_score",
        "z_trend", "pullback_3m_pct", "momentum_1m",
        "momentum_6m", "rsi_14", "level",
    ]
    cols_available = [c for c in cols_display if c in df_opp.columns]
    df_show = df_opp[cols_available].copy()
    df_show = df_show.rename(columns={
        "name": "Fondo", "isin": "ISIN", "fund_type": "Tipo",
        "timing_score": "Score", "trend_score": "Trend",
        "pullback_score": "Pullback", "divergence_score": "Diverg.",
        "rsi_score": "RSI Sc.", "vol_regime_score": "Vol.Reg",
        "short_term_score": "ShortT",
        "z_trend": "Z-Trend", "pullback_3m_pct": "Pull.3M%",
        "momentum_1m": "Mom1M%", "momentum_6m": "Mom6M%",
        "rsi_14": "RSI-14", "level": "Señal",
    })

    print("🔍 Timing de Compra — Tu Cartera")
    print("=" * 70)
    print()

    # Estilizar la tabla con colores
    def _score_color(val):
        if pd.isna(val):
            return ""
        v = float(val)
        if v >= 75:
            return "background-color: #1b5e20; color: white"
        if v >= 60:
            return "background-color: #1565c0; color: white"
        if v >= 40:
            return "background-color: #37474f; color: white"
        if v >= 25:
            return "background-color: #f57f17; color: white"
        return "background-color: #bf360c; color: white"

    score_cols = ["Score", "Trend", "Pullback", "Diverg.", "RSI Sc.",
                  "Vol.Reg", "ShortT"]
    styled = df_show.style.applymap(
        _score_color,
        subset=[c for c in score_cols if c in df_show.columns],
    )
    display(styled)
else:
    print("No se encontraron fondos con suficiente histórico.")

# %% [markdown]
# ### 21b. Gráfica de timing por fondo
#
# Para cada fondo se muestra:
# - **Serie de precios** (12 meses)
# - **Regresión log-lineal** (línea de tendencia)
# - **Bandas ±1σ / ±2σ** (zonas de descuento/premium)
# - **SMA-200** (tendencia largo plazo)
# - **Máximo 3M** (referencia del pullback)
# - **RSI-14** (panel inferior)
# - **Crossovers de momentum** (marcadores)

# %%
from app.services.opportunity_scanner import (
    _trend_deviation,
    _compute_rsi_series,
    compute_timing_chart_data,
    compute_timing_signals,
    DEFAULT_TIMING_WEIGHTS,
    TIMING_PRESETS,
)
from app.services.fund_classifier import classify_fund


def plot_timing_chart(
    prices: pd.Series,
    signals: dict,
    name: str,
    chart_months: int = 12,
) -> go.Figure:
    """Genera gráfica plotly con overlays de timing sobre la serie de precios.

    Muestra visualmente POR QUÉ el timing score es el que es:
    - Precio actual vs regresión log-lineal = z-trend
    - Posición dentro de bandas ±σ = zonas de descuento/premium
    - RSI en panel inferior = sobrevendido/sobrecomprado
    - Crossovers de momentum = puntos de giro

    Args:
        prices: Serie completa de precios (DatetimeIndex).
        signals: Dict de compute_timing_signals().
        name: Nombre legible del fondo.
        chart_months: Meses a mostrar.

    Returns:
        plotly Figure con sub-panels.
    """
    chart = compute_timing_chart_data(prices, chart_months=chart_months)
    if not chart:
        fig = go.Figure()
        fig.add_annotation(text="Datos insuficientes", x=0.5, y=0.5,
                           showarrow=False, font=dict(size=16))
        return fig

    # Extraer series
    df_price = pd.DataFrame(chart["price_series"])
    df_price["date"] = pd.to_datetime(df_price["date"])

    df_reg = pd.DataFrame(chart["regression"])
    df_reg["date"] = pd.to_datetime(df_reg["date"])

    df_b1u = pd.DataFrame(chart["band_1_upper"])
    df_b1u["date"] = pd.to_datetime(df_b1u["date"])
    df_b1l = pd.DataFrame(chart["band_1_lower"])
    df_b1l["date"] = pd.to_datetime(df_b1l["date"])
    df_b2u = pd.DataFrame(chart["band_2_upper"])
    df_b2u["date"] = pd.to_datetime(df_b2u["date"])
    df_b2l = pd.DataFrame(chart["band_2_lower"])
    df_b2l["date"] = pd.to_datetime(df_b2l["date"])

    # Crear subplots: precio arriba (75%), RSI abajo (25%)
    fig = make_subplots(
        rows=2, cols=1, shared_xaxes=True,
        row_heights=[0.75, 0.25],
        vertical_spacing=0.04,
        subplot_titles=[None, None],
    )

    # ── PANEL 1: Precio + Overlays ──

    # Banda +2σ (zona premium — roja tenue)
    fig.add_trace(go.Scatter(
        x=df_b2u["date"], y=df_b2u["value"],
        line=dict(width=0), showlegend=False, hoverinfo="skip",
    ), row=1, col=1)
    fig.add_trace(go.Scatter(
        x=df_b1u["date"], y=df_b1u["value"],
        fill="tonexty", fillcolor="rgba(255,82,82,0.08)",
        line=dict(width=0), showlegend=False, hoverinfo="skip",
    ), row=1, col=1)

    # Banda +1σ a regresión (amarillo tenue)
    fig.add_trace(go.Scatter(
        x=df_b1u["date"], y=df_b1u["value"],
        line=dict(width=0), showlegend=False, hoverinfo="skip",
    ), row=1, col=1)
    fig.add_trace(go.Scatter(
        x=df_reg["date"], y=df_reg["value"],
        fill="tonexty", fillcolor="rgba(255,235,59,0.06)",
        line=dict(width=0), showlegend=False, hoverinfo="skip",
    ), row=1, col=1)

    # Banda regresión a -1σ (verde tenue)
    fig.add_trace(go.Scatter(
        x=df_reg["date"], y=df_reg["value"],
        line=dict(width=0), showlegend=False, hoverinfo="skip",
    ), row=1, col=1)
    fig.add_trace(go.Scatter(
        x=df_b1l["date"], y=df_b1l["value"],
        fill="tonexty", fillcolor="rgba(76,175,80,0.10)",
        line=dict(width=0), showlegend=False, hoverinfo="skip",
    ), row=1, col=1)

    # Banda -1σ a -2σ (verde más intenso)
    fig.add_trace(go.Scatter(
        x=df_b1l["date"], y=df_b1l["value"],
        line=dict(width=0), showlegend=False, hoverinfo="skip",
    ), row=1, col=1)
    fig.add_trace(go.Scatter(
        x=df_b2l["date"], y=df_b2l["value"],
        fill="tonexty", fillcolor="rgba(76,175,80,0.15)",
        line=dict(width=0), showlegend=False, hoverinfo="skip",
    ), row=1, col=1)

    # Línea de regresión
    fig.add_trace(go.Scatter(
        x=df_reg["date"], y=df_reg["value"],
        name="Tendencia (regresión log)",
        line=dict(color="#ffd600", width=2, dash="dash"),
        hovertemplate="%{y:.2f}",
    ), row=1, col=1)

    # SMA-200
    if chart["sma200"]:
        df_sma = pd.DataFrame(chart["sma200"])
        df_sma["date"] = pd.to_datetime(df_sma["date"])
        fig.add_trace(go.Scatter(
            x=df_sma["date"], y=df_sma["value"],
            name="SMA-200",
            line=dict(color="rgba(158,158,158,0.6)", width=1.5, dash="dot"),
            hovertemplate="%{y:.2f}",
        ), row=1, col=1)

    # Máximo 3M (pullback reference)
    pull = chart["pullback_levels"]
    fig.add_hline(
        y=pull["max_3m"], line_dash="dot", line_color="rgba(68,138,255,0.5)",
        line_width=1, annotation_text=f"Máx 3M: {pull['max_3m']:.2f}",
        annotation_position="top right",
        annotation_font_size=9,
        annotation_font_color="rgba(68,138,255,0.7)",
        row=1, col=1,
    )

    # Serie de precios (encima de todo)
    fig.add_trace(go.Scatter(
        x=df_price["date"], y=df_price["price"],
        name="Precio",
        line=dict(color="#ffffff", width=2.5),
        hovertemplate="%{x|%d %b %Y}<br>Precio: %{y:.4f}<extra></extra>",
    ), row=1, col=1)

    # Momentum crossovers
    if chart.get("crossovers"):
        bulls = [c for c in chart["crossovers"]
                 if c["type"] == "bullish" and c["price"]]
        bears = [c for c in chart["crossovers"]
                 if c["type"] == "bearish" and c["price"]]
        if bulls:
            fig.add_trace(go.Scatter(
                x=[c["date"] for c in bulls],
                y=[c["price"] for c in bulls],
                mode="markers", name="Mom. ↗ (bullish)",
                marker=dict(symbol="triangle-up", size=10,
                            color="#00c853", line=dict(width=1, color="#fff")),
            ), row=1, col=1)
        if bears:
            fig.add_trace(go.Scatter(
                x=[c["date"] for c in bears],
                y=[c["price"] for c in bears],
                mode="markers", name="Mom. ↘ (bearish)",
                marker=dict(symbol="triangle-down", size=10,
                            color="#ff5252", line=dict(width=1, color="#fff")),
            ), row=1, col=1)

    # ── PANEL 2: RSI ──
    if chart.get("rsi_series"):
        df_rsi = pd.DataFrame(chart["rsi_series"])
        df_rsi["date"] = pd.to_datetime(df_rsi["date"])
        fig.add_trace(go.Scatter(
            x=df_rsi["date"], y=df_rsi["value"],
            name="RSI-14",
            line=dict(color="#ce93d8", width=1.5),
            hovertemplate="RSI: %{y:.1f}<extra></extra>",
        ), row=2, col=1)
        # Líneas de referencia
        fig.add_hline(y=70, line_dash="dot", line_color="rgba(255,82,82,0.4)",
                      line_width=1, row=2, col=1)
        fig.add_hline(y=30, line_dash="dot", line_color="rgba(76,175,80,0.4)",
                      line_width=1, row=2, col=1)
        fig.add_hline(y=50, line_dash="dot",
                      line_color="rgba(255,255,255,0.1)",
                      line_width=1, row=2, col=1)
        fig.add_hrect(y0=0, y1=30, fillcolor="rgba(76,175,80,0.05)",
                      line_width=0, row=2, col=1)
        fig.add_hrect(y0=70, y1=100, fillcolor="rgba(255,82,82,0.05)",
                      line_width=0, row=2, col=1)

    # ── Layout ──
    score = signals.get("timing_score", "?")
    z = signals.get("z_trend", "?")
    rsi_val = signals.get("rsi_14", "?")
    st_score = signals.get("short_term_score", "?")
    level = signals.get("level", "") if "level" not in signals else ""

    # Color del score
    if isinstance(score, (int, float)):
        if score >= 75:
            sc_color = "#00c853"
        elif score >= 60:
            sc_color = "#448aff"
        elif score >= 40:
            sc_color = "#90a4ae"
        elif score >= 25:
            sc_color = "#ffd600"
        else:
            sc_color = "#ff9100"
    else:
        sc_color = "#90a4ae"

    fig.update_layout(
        title=dict(
            text=(
                f"<b>{name}</b>"
                f"<br><span style='font-size:13px;color:{sc_color}'>"
                f"Timing Score: {score}</span>"
                f"  <span style='font-size:11px;color:#999'>"
                f"Z-Trend: {z} | RSI: {rsi_val} | Short-Term: {st_score}"
                f"</span>"
            ),
        ),
        template="plotly_dark",
        height=550,
        hovermode="x unified",
        legend=dict(
            orientation="h", yanchor="bottom", y=1.02,
            xanchor="right", x=1, font=dict(size=10),
        ),
        margin=dict(l=60, r=20, t=80, b=30),
    )
    fig.update_yaxes(title_text="Precio", row=1, col=1)
    fig.update_yaxes(title_text="RSI", range=[0, 100], row=2, col=1)

    return fig


# %% [markdown]
# ### 21c. Visualización de todos los fondos de la cartera

# %%
for opp in opps:
    isin = opp["isin"]
    name = opp.get("name", isin)
    print(f"\n{'='*60}")
    print(f"📊 {name} ({isin}) — Score: {opp.get('timing_score', '?')}")
    print(f"{'='*60}")

    try:
        nav_df = client.fund_nav_history(isin, years=10)
        if nav_df.empty:
            print("  ⚠️ Sin histórico de NAV disponible")
            continue

        prices = nav_df.set_index("date")["price"].sort_index()
        prices.index = pd.to_datetime(prices.index)

        fig = plot_timing_chart(prices, opp, name, chart_months=12)
        fig.show()

        # Tabla de sub-scores con interpretación
        scores_data = {
            "📐 Tendencia": opp.get("trend_score"),
            "📉 Pullback": opp.get("pullback_score"),
            "🔀 Divergencia": opp.get("divergence_score"),
            "📊 RSI": opp.get("rsi_score"),
            "🌊 Vol.Régimen": opp.get("vol_regime_score"),
            "⚡ Corto Plazo": opp.get("short_term_score"),
        }
        indicators = {
            "Z-Trend": opp.get("z_trend"),
            "Pull. 3M%": opp.get("pullback_3m_pct"),
            "Mom 1M%": opp.get("momentum_1m"),
            "Mom 6M%": opp.get("momentum_6m"),
            "Mom 3D%": opp.get("momentum_3d"),
            "Mom 1W%": opp.get("momentum_1w"),
            "Mom 2W%": opp.get("momentum_2w"),
            "Pull. 1W%": opp.get("pullback_1w_pct"),
            "Pull. 2W%": opp.get("pullback_2w_pct"),
            "RSI-14": opp.get("rsi_14"),
            "Vol.Ratio": opp.get("vol_regime_ratio"),
            "Sharpe": opp.get("sharpe"),
            "MaxDD%": opp.get("max_drawdown_pct"),
        }

        print(f"\n  Sub-scores (pesos default):")
        for k, v in scores_data.items():
            bar = "█" * (v // 5) + "░" * (20 - v // 5) if v else ""
            print(f"    {k:<18} {bar} {v or '—':>3}")
        print(f"\n  Indicadores:")
        for k, v in indicators.items():
            print(f"    {k:<14} {v if v is not None else '—':>8}")
        print(f"\n  Señal: {opp.get('level', '—')}")
        print(f"  {opp.get('description', '')}")

    except Exception as exc:
        print(f"  ⚠️ Error: {exc}")

# %% [markdown]
# ### 21d. Detalle expandido + histórico completo de un fondo

# %%
# Selecciona el fondo con mejor timing score para demo
DETAIL_ISIN = opps[0]["isin"] if opps else pos["ISIN"].iloc[0]
DETAIL_NAME = opps[0].get("name", DETAIL_ISIN) if opps else DETAIL_ISIN

print(f"📊 Detalle expandido: {DETAIL_NAME} ({DETAIL_ISIN})")
print("=" * 60)

detail = client.fund_opportunity(DETAIL_ISIN)
if "error" not in detail:
    # Gráfica con todo el histórico (no solo 12 meses)
    nav_df = client.fund_nav_history(DETAIL_ISIN, years=10)
    if not nav_df.empty:
        prices_full = nav_df.set_index("date")["price"].sort_index()
        prices_full.index = pd.to_datetime(prices_full.index)

        # Gráfico con 24 meses para vista más amplia
        fig_detail = plot_timing_chart(
            prices_full, detail, DETAIL_NAME, chart_months=24,
        )
        fig_detail.update_layout(
            title_text=(
                f"<b>{DETAIL_NAME}</b> — Vista extendida (24M)"
                f"<br><span style='font-size:13px'>"
                f"Timing Score: {detail.get('timing_score', '?')}</span>"
            ),
            height=600,
        )
        fig_detail.show()

    print(f"\n  Todas las señales:")
    for k, v in sorted(detail.items()):
        if k not in ("level", "description", "name", "isin",
                      "category", "expense_ratio", "rating",
                      "weights_used"):
            print(f"    {k:.<30} {v}")
    print(f"\n  {detail.get('level', '')}")
    print(f"  {detail.get('description', '')}")
else:
    print(f"  ⚠️ {detail.get('error', 'Error desconocido')}")

# %% [markdown]
# ### 21e. Presets de pesos — comparativa
#
# Aplicamos los 4 presets al mismo fondo para ver cómo cambian los scores.

# %%
print(f"⚖️ Comparativa de presets para: {DETAIL_NAME}")
print("=" * 60)

nav_df = client.fund_nav_history(DETAIL_ISIN, years=10)
if not nav_df.empty:
    prices_cmp = nav_df.set_index("date")["price"].sort_index()
    prices_cmp.index = pd.to_datetime(prices_cmp.index)

    preset_info = client.timing_presets()
    rows_preset = []

    for preset_key, preset_data in preset_info["presets"].items():
        w = preset_data["weights"]
        sigs = compute_timing_signals(prices_cmp, weights=w)
        if sigs:
            rows_preset.append({
                "Preset": preset_data["label"],
                "Score": sigs["timing_score"],
                "Trend": sigs["trend_score"],
                "Pullback": sigs["pullback_score"],
                "Diverg.": sigs["divergence_score"],
                "RSI": sigs["rsi_score"],
                "Vol.Reg": sigs["vol_regime_score"],
                "ShortT": sigs["short_term_score"],
            })

    if rows_preset:
        df_presets = pd.DataFrame(rows_preset)
        styled_p = df_presets.style.applymap(
            _score_color,
            subset=["Score", "Trend", "Pullback", "Diverg.",
                     "RSI", "Vol.Reg", "ShortT"],
        )
        display(styled_p)

        # Bar chart comparativo
        fig_presets = go.Figure()
        cats = ["Trend", "Pullback", "Diverg.", "RSI", "Vol.Reg", "ShortT"]
        colors_p = ["#4fc3f7", "#66bb6a", "#ffd54f", "#ce93d8",
                     "#ff8a65", "#80deea"]
        for i, row in df_presets.iterrows():
            fig_presets.add_trace(go.Bar(
                name=row["Preset"],
                x=cats,
                y=[row[c] for c in cats],
                text=[f"{row[c]}" for c in cats],
                textposition="auto",
            ))
        fig_presets.update_layout(
            title=f"Sub-scores por Preset — {DETAIL_NAME}",
            template="plotly_dark", barmode="group",
            height=400, yaxis_title="Score (0-100)",
        )
        fig_presets.show()

        print(f"\nLos sub-scores son IDÉNTICOS entre presets — solo cambia")
        print(f"el peso (y por tanto el composite Score) de cada dimensión.")

# %% [markdown]
# ### 21f. Mini-backtesting visual
#
# ¿El timing score predice retornos futuros? Calculamos el score en
# ventana rodante (cada 2 semanas del último año) y comparamos con el
# retorno real del mes siguiente.

# %%
print(f"📈 Mini-backtesting: {DETAIL_NAME}")
print("=" * 60)

nav_df = client.fund_nav_history(DETAIL_ISIN, years=10)
if not nav_df.empty:
    prices_bt = nav_df.set_index("date")["price"].sort_index()
    prices_bt.index = pd.to_datetime(prices_bt.index)

    # Ventana rodante: cada 2 semanas del último año
    end_date = prices_bt.index[-1]
    start_date = end_date - pd.DateOffset(years=1, months=1)
    eval_dates = pd.date_range(start_date, end_date - pd.DateOffset(days=21),
                               freq="2W")
    bt_results = []
    for eval_d in eval_dates:
        # Precios hasta eval_d
        p_up_to = prices_bt[prices_bt.index <= eval_d]
        if len(p_up_to) < 60:
            continue
        # Score en eval_d
        sigs = compute_timing_signals(p_up_to)
        if not sigs:
            continue
        # Retorno 1M posterior
        future_d = eval_d + pd.DateOffset(days=21)
        p_future = prices_bt[
            (prices_bt.index > eval_d)
            & (prices_bt.index <= future_d)
        ]
        if p_future.empty:
            continue
        ret_1m = (float(p_future.iloc[-1]) / float(p_up_to.iloc[-1]) - 1) * 100

        bt_results.append({
            "date": eval_d,
            "timing_score": sigs["timing_score"],
            "ret_1m_pct": round(ret_1m, 3),
        })

    if bt_results:
        df_bt = pd.DataFrame(bt_results)

        # Scatter: timing score vs retorno posterior
        fig_bt = px.scatter(
            df_bt, x="timing_score", y="ret_1m_pct",
            color="ret_1m_pct",
            color_continuous_scale="RdYlGn",
            trendline="ols",
            labels={
                "timing_score": "Timing Score (en el momento)",
                "ret_1m_pct": "Retorno 1M posterior (%)",
            },
            title=(
                f"¿El Timing Score predice retornos? — {DETAIL_NAME}"
                "<br><span style='font-size:12px;color:#999'>"
                "Cada punto = score en una fecha vs retorno del mes siguiente"
                "</span>"
            ),
            template="plotly_dark",
            height=420,
        )
        fig_bt.show()

        # Estadísticas
        corr = df_bt["timing_score"].corr(df_bt["ret_1m_pct"])
        avg_high = df_bt[df_bt["timing_score"] >= 60]["ret_1m_pct"].mean()
        avg_low = df_bt[df_bt["timing_score"] < 40]["ret_1m_pct"].mean()

        print(f"\n  📊 Correlación (Score vs Retorno 1M): {corr:.3f}")
        print(f"  📈 Ret. medio cuando Score ≥ 60:     {avg_high:.2f}%"
              if pd.notna(avg_high) else "  📈 Sin datos con Score ≥ 60")
        print(f"  📉 Ret. medio cuando Score < 40:     {avg_low:.2f}%"
              if pd.notna(avg_low) else "  📉 Sin datos con Score < 40")
        print(f"  📝 Observaciones:                    {len(df_bt)}")

        if corr > 0.1:
            print("\n  ✅ Correlación positiva: el score tiene valor predictivo.")
        elif corr > -0.1:
            print("\n  ⚪ Correlación neutra: el score no predice retornos claros.")
        else:
            print("\n  ⚠️ Correlación negativa: revisar la metodología.")
    else:
        print("  ⚠️ Datos insuficientes para backtesting.")

"""
charts.py — Plotly figure builders para PortfolioClient.

Cada función recibe los datos ya calculados (DataFrames o dicts devueltos
por los métodos de PortfolioClient) y devuelve un ``plotly.graph_objects.Figure``
con el estilo visual equivalente al frontend (dark theme, mismos colores).

Uso desde notebook:
    from app.charts import plot_real_evolution
    fig = plot_real_evolution(client.real_evolution(years=20))
    fig.show()
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px

# ── Paleta equivalente al frontend ──────────────────────────────────────────
COLORS: List[str] = [
    "#FFD700", "#4fc3f7", "#66bb6a", "#ef5350", "#ab47bc",
    "#ff7043", "#26c6da", "#8d6e63", "#78909c", "#d4e157",
    "#5c6bc0", "#ec407a",
]
_PORTFOLIO_COLOR = "#FFD700"   # gold — línea patrimonio
_INVESTED_COLOR = "rgba(255,255,255,0.45)"  # dashed white — capital invertido
_SUCCESS_COLOR = "#00d4aa"
_DANGER_COLOR = "#ef5350"
_ACCENT_COLOR = "#4fc3f7"      # light blue para barras
_BM_COLOR = "#8b5cf6"          # morado — MSCI World

_RANGE_BUTTONS = [
    dict(count=3, label="3M", step="month"),
    dict(count=6, label="6M", step="month"),
    dict(count=1, label="1Y", step="year"),
    dict(count=2, label="2Y", step="year"),
    dict(step="all", label="MAX"),
]

_DARK = "plotly_dark"


def _base_layout(**kwargs) -> dict:
    return dict(
        template=_DARK,
        hovermode="x unified",
        legend=dict(orientation="h", yanchor="bottom", y=-0.25),
        margin=dict(l=60, r=20, t=50, b=20),
        **kwargs,
    )


# ── 1. Evolución Real del Patrimonio ─────────────────────────────────────────

def plot_real_evolution(data: Dict[str, Any], *, height: int = 450) -> go.Figure:
    """Línea de patrimonio (gold) vs capital invertido (dashed), con fill.

    Equivale al ``PortfolioValueChart`` del frontend.

    Args:
        data: dict devuelto por ``client.real_evolution()``.
        height: altura en píxeles.

    Returns:
        go.Figure
    """
    series = data.get("series", [])
    if not series:
        return go.Figure().update_layout(title="Sin datos de evolución", template=_DARK)

    df = pd.DataFrame(series)
    df["date"] = pd.to_datetime(df["date"])

    fig = go.Figure()

    # Capital invertido (dashed, relleno inferior)
    fig.add_trace(go.Scatter(
        x=df["date"], y=df["invested"],
        name="Capital Invertido",
        line=dict(color=_INVESTED_COLOR, width=1.5, dash="dash"),
        fill=None,
        hovertemplate="Invertido: €%{y:,.0f}<extra></extra>",
    ))

    # Patrimonio (gold, relleno entre curvas)
    last_row = df.iloc[-1]
    fill_color = "rgba(0,212,170,0.12)" if last_row["value"] >= last_row["invested"] else "rgba(239,68,68,0.12)"
    fig.add_trace(go.Scatter(
        x=df["date"], y=df["value"],
        name="Patrimonio",
        line=dict(color=_PORTFOLIO_COLOR, width=2.5),
        fill="tonexty",
        fillcolor=fill_color,
        hovertemplate="Patrimonio: €%{y:,.0f}<extra></extra>",
    ))

    fig.update_xaxes(rangeselector=dict(buttons=_RANGE_BUTTONS))
    fig.update_layout(
        **_base_layout(
            title="📈 Evolución Real del Patrimonio",
            height=height,
            yaxis_title="€",
        )
    )

    # Summary annotation
    gain = last_row["value"] - last_row["invested"]
    gain_pct = gain / last_row["invested"] * 100 if last_row["invested"] else 0
    sign = "+" if gain >= 0 else ""
    fig.add_annotation(
        x=0.01, y=0.97, xref="paper", yref="paper",
        text=f"Último: €{last_row['value']:,.0f} | {sign}€{gain:,.0f} ({sign}{gain_pct:.1f}%)",
        showarrow=False, font=dict(size=11, color=_SUCCESS_COLOR if gain >= 0 else _DANGER_COLOR),
        bgcolor="rgba(0,0,0,0.35)", borderpad=4,
    )
    return fig


# ── 2. Evolución Real por Fondo (Stacked Area) ───────────────────────────────

def plot_per_fund_evolution(data: Dict[str, Any], *, height: int = 500) -> go.Figure:
    """Stacked area chart con evolución diaria por fondo.

    Equivale al ``PerFundEvolutionChart`` del frontend.

    Args:
        data: dict devuelto por ``client.real_evolution_per_fund()``.
        height: altura en píxeles.

    Returns:
        go.Figure
    """
    funds = data.get("funds", {})
    if not funds:
        return go.Figure().update_layout(title="Sin datos por fondo", template=_DARK)

    all_rows: List[dict] = []
    for name, series in funds.items():
        for pt in series:
            all_rows.append({"date": pt["date"], "Fondo": name, "Valor": pt["value"]})

    df = pd.DataFrame(all_rows)
    df["date"] = pd.to_datetime(df["date"])

    fig = go.Figure()
    names = list(funds.keys())
    for idx, name in enumerate(names):
        sub = df[df["Fondo"] == name].sort_values("date")
        fig.add_trace(go.Scatter(
            x=sub["date"], y=sub["Valor"],
            name=name,
            stackgroup="one",
            mode="lines",
            line=dict(color=COLORS[idx % len(COLORS)], width=1),
            fillcolor=COLORS[idx % len(COLORS)] + "55",
            hovertemplate=f"{name}: €%{{y:,.0f}}<extra></extra>",
        ))

    buttons_5y = _RANGE_BUTTONS + [dict(count=5, label="5Y", step="year")]
    fig.update_xaxes(rangeselector=dict(buttons=buttons_5y))
    fig.update_layout(
        **_base_layout(
            title="📊 Evolución Real por Fondo",
            height=height,
            yaxis_title="€",
        )
    )
    return fig


# ── 3. Resumen de Órdenes (barras mensuales / anuales) ───────────────────────

def plot_orders_summary(
    data: Dict[str, Any],
    *,
    mode: str = "monthly",
    height: int = 350,
) -> go.Figure:
    """Barras de inversión mensual o anual.

    Equivale al ``OrdersSummaryChart`` del frontend.

    Args:
        data: dict devuelto por ``client.orders_summary()``.
        mode: ``'monthly'`` o ``'yearly'``.
        height: altura en píxeles.

    Returns:
        go.Figure
    """
    entries = data.get(mode, {})
    if not entries:
        return go.Figure().update_layout(title="Sin datos de órdenes", template=_DARK)

    items = sorted(entries.items())
    labels = [k[2:] if mode == "monthly" else str(k) for k, _ in items]  # YYYY-MM → MM
    values = [v for _, v in items]

    fig = go.Figure(go.Bar(
        x=labels,
        y=values,
        marker=dict(
            color=values,
            colorscale=[[0, "#1976d2"], [1, _ACCENT_COLOR]],
            showscale=False,
        ),
        hovertemplate="%{x}: €%{y:,.0f}<extra></extra>",
    ))

    total = sum(values)
    title_mode = "Mensual" if mode == "monthly" else "Anual"
    fig.update_layout(
        **_base_layout(
            title=f"💰 Inversiones {title_mode} — Total: €{total:,.0f}",
            height=height,
            yaxis_title="€ Invertido",
            xaxis_title="",
            hovermode="x",
        )
    )
    return fig


# ── 4. Asset Allocation ───────────────────────────────────────────────────────

def plot_asset_allocation(alloc_df: pd.DataFrame, *, height: int = 380) -> go.Figure:
    """Donut chart de asset allocation.

    Args:
        alloc_df: DataFrame devuelto por ``client.asset_allocation()``.
        height: altura en píxeles.

    Returns:
        go.Figure
    """
    df = alloc_df[alloc_df["Valor"] > 0].copy() if not alloc_df.empty else alloc_df

    if df.empty:
        return go.Figure().update_layout(title="Sin datos de asset allocation", template=_DARK)

    total = df["Valor"].sum()
    df["Pct"] = df["Valor"] / total * 100

    fig = go.Figure(go.Pie(
        labels=df["Tipo"],
        values=df["Valor"],
        hole=0.45,
        textinfo="label+percent",
        textposition="outside",
        marker=dict(colors=COLORS[: len(df)]),
        hovertemplate="%{label}: €%{value:,.0f} (%{percent})<extra></extra>",
    ))
    fig.update_layout(
        **_base_layout(
            title="Asset Allocation",
            height=height,
            hovermode=False,
        )
    )
    return fig


# ── 5. Peso de cada fondo ─────────────────────────────────────────────────────

def plot_fund_weights(pos_df: pd.DataFrame, *, height: int | None = None) -> go.Figure:
    """Barras horizontales con el peso de cada fondo en cartera.

    Args:
        pos_df: DataFrame devuelto por ``client.positions()``.  Necesita
            columnas ``Fondo`` y ``Peso_Pct`` (o ``Valor_Actual``).
        height: altura en píxeles (auto si es None).

    Returns:
        go.Figure
    """
    df = pos_df.copy()
    if "Peso_Pct" not in df.columns:
        total = df["Valor_Actual"].sum()
        df["Peso_Pct"] = df["Valor_Actual"] / total * 100 if total else 0

    df = df.sort_values("Peso_Pct", ascending=True)
    h = height or max(350, 40 * len(df))

    fig = go.Figure(go.Bar(
        x=df["Peso_Pct"],
        y=df["Fondo"],
        orientation="h",
        text=df["Peso_Pct"].apply(lambda v: f"{v:.1f}%"),
        textposition="outside",
        marker=dict(
            color=df["Peso_Pct"],
            colorscale="Viridis",
            showscale=False,
        ),
        hovertemplate="%{y}: %{x:.2f}%<extra></extra>",
    ))
    fig.update_layout(
        **_base_layout(
            title="Peso de cada Fondo en Cartera (%)",
            height=h,
            xaxis_title="Peso (%)",
            hovermode="y unified",
        ),
        margin=dict(l=250, r=40, t=50, b=20),
    )
    return fig


# ── 6 & 7. Benchmark vs MSCI World ────────────────────────────────────────────

def plot_benchmark_sectors(data: Dict[str, Any], *, height: int = 450) -> go.Figure:
    """Barras horizontales agrupadas: sectores cartera vs MSCI World.

    Args:
        data: dict devuelto por ``client.benchmark_comparison()``.
        height: altura en píxeles.

    Returns:
        go.Figure
    """
    return _plot_benchmark(data, key="sectors", name_col="Nombre",
                           port_col="Mi_Cartera", bm_col="Benchmark",
                           title="Sectores — Mi Cartera vs MSCI World",
                           height=height)


def plot_benchmark_regions(data: Dict[str, Any], *, height: int = 400) -> go.Figure:
    """Barras horizontales agrupadas: regiones cartera vs MSCI World.

    Args:
        data: dict devuelto por ``client.benchmark_comparison()``.
        height: altura en píxeles.

    Returns:
        go.Figure
    """
    return _plot_benchmark(data, key="regions", name_col="Nombre",
                           port_col="Mi_Cartera", bm_col="Benchmark",
                           title="Regiones — Mi Cartera vs MSCI World",
                           height=height)


def _plot_benchmark(
    data: Dict[str, Any],
    *,
    key: str,
    name_col: str,
    port_col: str,
    bm_col: str,
    title: str,
    height: int,
) -> go.Figure:
    df = data.get(key)
    if df is None or (isinstance(df, pd.DataFrame) and df.empty):
        return go.Figure().update_layout(title=f"Sin datos: {title}", template=_DARK)

    if not isinstance(df, pd.DataFrame):
        df = pd.DataFrame(df)

    df = df.sort_values(port_col, ascending=True)
    h = height or max(400, 35 * len(df))

    fig = go.Figure()
    fig.add_trace(go.Bar(
        name="Mi Cartera",
        y=df[name_col],
        x=df[port_col],
        orientation="h",
        marker_color=_SUCCESS_COLOR,
        hovertemplate="%{y}: %{x:.1f}%<extra>Mi Cartera</extra>",
    ))
    fig.add_trace(go.Bar(
        name="MSCI World",
        y=df[name_col],
        x=df[bm_col],
        orientation="h",
        marker_color=_BM_COLOR,
        hovertemplate="%{y}: %{x:.1f}%<extra>MSCI World</extra>",
    ))
    fig.update_layout(
        **_base_layout(
            title=title,
            height=h,
            barmode="group",
            xaxis_title="Peso (%)",
            hovermode="y unified",
        ),
        margin=dict(l=200, r=40, t=50, b=60),
        legend=dict(orientation="h", y=1.05, yanchor="bottom"),
    )
    return fig


# ── 8. Evolución normalizada base 100 ─────────────────────────────────────────

def plot_history_base100(hist_df: pd.DataFrame, *, height: int = 550) -> go.Figure:
    """Líneas normalizadas a base 100 para cada fondo.

    Equivale al ``InteractiveChart`` del frontend en modo base-100.

    Args:
        hist_df: DataFrame devuelto por ``client.history()``.
        height: altura en píxeles.

    Returns:
        go.Figure
    """
    if hist_df.empty:
        return go.Figure().update_layout(title="Sin historial disponible", template=_DARK)

    date_col = hist_df.columns[0]
    price_cols = [c for c in hist_df.columns if c != date_col]

    df = hist_df.copy()
    df[date_col] = pd.to_datetime(df[date_col])

    for col in price_cols:
        valid = df[col].dropna()
        first = valid.iloc[0] if len(valid) > 0 else None
        if first and first != 0:
            df[col] = (df[col] / first) * 100

    fig = go.Figure()
    for idx, col in enumerate(price_cols):
        fig.add_trace(go.Scatter(
            x=df[date_col], y=df[col],
            name=col,
            mode="lines",
            line=dict(color=COLORS[idx % len(COLORS)], width=1.5),
            hovertemplate=f"{col}: %{{y:.1f}}<extra></extra>",
        ))

    fig.add_hline(y=100, line_dash="dash", line_color="rgba(255,255,255,0.3)", annotation_text="Base 100")

    fig.update_xaxes(rangeselector=dict(buttons=[
        dict(count=3, label="3M", step="month"),
        dict(count=6, label="6M", step="month"),
        dict(count=1, label="1Y", step="year"),
        dict(count=3, label="3Y", step="year"),
        dict(step="all", label="MAX"),
    ]))
    fig.update_layout(**_base_layout(
        title="📈 Crecimiento Acumulado (Base 100)",
        height=height,
        yaxis_title="Valor (base 100)",
    ))
    return fig


def plot_history_nav(hist_df: pd.DataFrame, *, height: int = 480) -> go.Figure:
    """Líneas de NAV absoulto (€) por fondo.

    Args:
        hist_df: DataFrame devuelto por ``client.history()``.
        height: altura en píxeles.

    Returns:
        go.Figure
    """
    if hist_df.empty:
        return go.Figure().update_layout(title="Sin historial disponible", template=_DARK)

    date_col = hist_df.columns[0]
    price_cols = [c for c in hist_df.columns if c != date_col]
    df = hist_df.copy()
    df[date_col] = pd.to_datetime(df[date_col])

    fig = go.Figure()
    for idx, col in enumerate(price_cols):
        fig.add_trace(go.Scatter(
            x=df[date_col], y=df[col],
            name=col,
            mode="lines",
            line=dict(color=COLORS[idx % len(COLORS)], width=1.5),
            hovertemplate=f"{col}: €%{{y:.4f}}<extra></extra>",
        ))

    fig.update_xaxes(rangeselector=dict(buttons=_RANGE_BUTTONS))
    fig.update_layout(**_base_layout(
        title="Precio NAV Absoluto por Fondo (€)",
        height=height,
        yaxis_title="NAV (€)",
    ))
    return fig


# ── 9. Retornos Anuales (Heatmap) ────────────────────────────────────────────

def plot_annual_returns(data: Dict[str, Any], *, height: int | None = None) -> go.Figure:
    """Heatmap de retornos anuales por fondo.

    Equivale al calendario de rentabilidades del frontend.

    Args:
        data: dict devuelto por ``client.annual_returns()``.
        height: altura en píxeles (auto si es None).

    Returns:
        go.Figure
    """
    years_list = data.get("years", [])
    funds_dict = data.get("funds", {})

    if not funds_dict or not years_list:
        return go.Figure().update_layout(title="Sin datos de retornos anuales", template=_DARK)

    fund_names = list(funds_dict.keys())
    matrix = np.array([
        [funds_dict[name].get(yr, np.nan) for yr in years_list]
        for name in fund_names
    ])

    text_matrix = [
        [f"{v:.1f}%" if not np.isnan(v) else "—" for v in row]
        for row in matrix
    ]

    h = height or max(350, 30 * len(fund_names) + 80)

    fig = go.Figure(go.Heatmap(
        z=matrix,
        x=[str(y) for y in years_list],
        y=fund_names,
        colorscale=[
            [0.0, _DANGER_COLOR],
            [0.5, "#1e1e2e"],
            [1.0, _SUCCESS_COLOR],
        ],
        zmid=0,
        text=text_matrix,
        texttemplate="%{text}",
        hovertemplate="%{y} — %{x}: %{z:.1f}%<extra></extra>",
        colorbar=dict(title="Retorno (%)"),
    ))
    fig.update_layout(
        **_base_layout(
            title="📅 Retornos Anuales por Fondo (%)",
            height=h,
            xaxis_title="Año",
            hovermode=False,
        ),
        margin=dict(l=260, r=80, t=50, b=40),
    )
    return fig


# ── 10. Correlaciones ────────────────────────────────────────────────────────

def plot_correlation(corr_df: pd.DataFrame, *, height: int | None = None) -> go.Figure:
    """Heatmap de correlación de Pearson entre fondos.

    Args:
        corr_df: DataFrame devuelto por ``client.correlation()``.
        height: altura en píxeles (auto si es None).

    Returns:
        go.Figure
    """
    if corr_df.empty:
        return go.Figure().update_layout(title="Sin datos de correlación", template=_DARK)

    labels = list(corr_df.columns)
    matrix = corr_df.values.astype(float)

    # Mask upper triangle
    mask = np.triu(np.ones_like(matrix, dtype=bool), k=1)
    display_matrix = np.where(mask, np.nan, matrix)

    text_matrix = [
        [f"{v:.2f}" if not np.isnan(v) else "" for v in row]
        for row in display_matrix
    ]

    n = len(labels)
    h = height or max(500, 45 * n + 80)

    fig = go.Figure(go.Heatmap(
        z=display_matrix,
        x=labels,
        y=labels,
        colorscale=[
            [0.0, _DANGER_COLOR],
            [0.5, "#1a1a2e"],
            [1.0, _SUCCESS_COLOR],
        ],
        zmin=-1, zmax=1,
        text=text_matrix,
        texttemplate="%{text}",
        hovertemplate="%{x} vs %{y}: %{z:.2f}<extra></extra>",
        colorbar=dict(title="Correlación"),
    ))
    fig.update_layout(
        **_base_layout(
            title="Matriz de Correlación (rentabilidades diarias)",
            height=h,
            hovermode=False,
        ),
        margin=dict(l=160, r=80, t=50, b=120),
        xaxis=dict(tickangle=-45),
    )
    return fig


# ── 11. Simulador de pesos ───────────────────────────────────────────────────

def plot_simulation_weights(
    sim_data: Dict[str, Any],
    *,
    title: str = "Pesos: Actual vs Simulado",
    height: int = 420,
) -> go.Figure:
    """Barras agrupadas con peso actual vs simulado.

    Args:
        sim_data: dict devuelto por ``client.simulate_addition()`` o
            ``client.simulate_rebalance()``.
        title: título del gráfico.
        height: altura en píxeles.

    Returns:
        go.Figure
    """
    weights_df = sim_data.get("weights")
    if weights_df is None or (isinstance(weights_df, pd.DataFrame) and weights_df.empty):
        return go.Figure().update_layout(title="Sin datos de simulación", template=_DARK)

    df = weights_df.sort_values("Peso_Simulado", ascending=True)

    fig = go.Figure()
    fig.add_trace(go.Bar(
        name="Actual",
        y=df["Fondo"],
        x=df["Peso_Actual"],
        orientation="h",
        marker_color=_ACCENT_COLOR,
        hovertemplate="%{y}: %{x:.2f}%<extra>Actual</extra>",
    ))
    fig.add_trace(go.Bar(
        name="Simulado",
        y=df["Fondo"],
        x=df["Peso_Simulado"],
        orientation="h",
        marker_color=_BM_COLOR,
        hovertemplate="%{y}: %{x:.2f}%<extra>Simulado</extra>",
    ))
    fig.update_layout(
        **_base_layout(
            title=title,
            height=height,
            barmode="group",
            xaxis_title="Peso (%)",
            hovermode="y unified",
        ),
        margin=dict(l=250, r=40, t=50, b=60),
        legend=dict(orientation="h", y=1.05, yanchor="bottom"),
    )
    return fig


# ── 12. Tax brackets ─────────────────────────────────────────────────────────

def plot_tax_brackets(capital_gain: float, *, height: int = 380) -> go.Figure:
    """Barras de desglose fiscal por tramos IRPF España.

    Args:
        capital_gain: plusvalía total realizada en €.
        height: altura en píxeles.

    Returns:
        go.Figure
    """
    TAX_BRACKETS = [
        (6_000,        0.19, "0–6K €"),
        (50_000,       0.21, "6K–50K €"),
        (200_000,      0.23, "50K–200K €"),
        (300_000,      0.27, "200K–300K €"),
        (float("inf"), 0.28, ">300K €"),
    ]
    bracket_colors = ["#ffd93d", "#ff8a5c", "#ff6b6b", "#e17055", "#d63031"]

    if capital_gain <= 0:
        return go.Figure().update_layout(
            title="Sin ganancia patrimonial — sin impuestos", template=_DARK
        )

    remaining = capital_gain
    prev_limit = 0
    labels, bases, taxes = [], [], []
    for limit, rate, label in TAX_BRACKETS:
        if remaining <= 0:
            break
        bracket_size = limit - prev_limit
        aplicable = min(remaining, bracket_size)
        taxes.append(round(aplicable * rate, 2))
        bases.append(round(aplicable, 2))
        labels.append(label)
        remaining -= aplicable
        prev_limit = limit

    total_tax = sum(taxes)
    eff_rate = total_tax / capital_gain * 100

    fig = go.Figure(go.Bar(
        x=labels,
        y=taxes,
        text=[f"€{t:,.0f}" for t in taxes],
        textposition="outside",
        marker_color=bracket_colors[: len(labels)],
        hovertemplate="%{x}: €%{y:,.0f}<extra></extra>",
    ))
    fig.update_layout(
        **_base_layout(
            title=(
                f"Desglose Fiscal IRPF — Plusvalía €{capital_gain:,.0f} | "
                f"Impuesto €{total_tax:,.0f} ({eff_rate:.1f}% efectivo)"
            ),
            height=height,
            yaxis_title="Impuesto (€)",
            hovermode="x",
        )
    )
    return fig


# ── 13. Evolution metrics bar ─────────────────────────────────────────────────

# ── 15. What-If Projection ───────────────────────────────────────────────────

def plot_projection(
    start_value: float,
    annual_ret: float,
    annual_vol: float,
    horizon: int = 10,
    annual_contribution: float = 0.0,
    sigma_level: float = 1.0,
    *,
    height: int = 450,
) -> go.Figure:
    """Proyección de patrimonio a N años con bandas de incertidumbre (±σ).

    Args:
        start_value: valor inicial de la cartera (€).
        annual_ret: rentabilidad anual histórica (fracción, p.ej. 0.08).
        annual_vol: volatilidad anual histórica (fracción, p.ej. 0.15).
        horizon: horizonte en años.
        annual_contribution: aportación anual extra en €.
        sigma_level: nº de desviaciones estándar para las bandas.
        height: altura en píxeles.

    Returns:
        go.Figure
    """
    years_ahead = np.arange(0, horizon + 1)
    base_values, opt_values, pes_values = [], [], []

    for y in years_ahead:
        contributions = annual_contribution * y
        base_total = start_value + contributions
        base_values.append(base_total * (1 + annual_ret) ** y)
        opt_values.append(base_total * (1 + annual_ret + sigma_level * annual_vol) ** y)
        pes_values.append(base_total * (1 + max(annual_ret - sigma_level * annual_vol, -0.99)) ** y)

    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=years_ahead, y=opt_values,
        name=f"Optimista (+{sigma_level}σ)",
        line=dict(dash="dot", color=_SUCCESS_COLOR),
    ))
    fig.add_trace(go.Scatter(
        x=years_ahead, y=base_values,
        name="Base (CAGR)",
        line=dict(color=_PORTFOLIO_COLOR, width=3),
        fill="tonexty", fillcolor="rgba(0,212,170,0.08)",
    ))
    fig.add_trace(go.Scatter(
        x=years_ahead, y=pes_values,
        name=f"Pesimista (-{sigma_level}σ)",
        line=dict(dash="dot", color=_DANGER_COLOR),
        fill="tonexty", fillcolor="rgba(239,68,68,0.08)",
    ))
    fig.update_layout(**_base_layout(
        title=(
            f"🔮 Proyección a {horizon} años "
            f"(CAGR={annual_ret*100:.1f}%, Vol={annual_vol*100:.1f}%)"
        ),
        height=height,
        xaxis_title="Años",
        yaxis_title="€",
    ))
    return fig


# ── 14. Fund detail sectors / countries ──────────────────────────────────────

def plot_fund_sectors(detail_df: pd.DataFrame, *, isin: str = "", height: int = 350) -> go.Figure:
    """Barras horizontales de exposición sectorial de un fondo.

    Args:
        detail_df: DataFrame devuelto por ``client.fund_details(isin)``.
        isin: ISIN del fondo (para el título).
        height: altura en píxeles.

    Returns:
        go.Figure
    """
    df = detail_df[detail_df["Metric"].str.startswith("sector_")].copy()
    if df.empty:
        return go.Figure().update_layout(title="Sin datos sectoriales", template=_DARK)
    df["Sector"] = df["Metric"].str.removeprefix("sector_")
    df["Peso"] = pd.to_numeric(df["Value"], errors="coerce")
    df = df.dropna(subset=["Peso"]).sort_values("Peso", ascending=True)

    fig = go.Figure(go.Bar(
        x=df["Peso"], y=df["Sector"], orientation="h",
        marker_color=_ACCENT_COLOR,
        hovertemplate="%{y}: %{x:.1f}%<extra></extra>",
    ))
    fig.update_layout(**_base_layout(
        title=f"Sectores — {isin}", height=height, xaxis_title="Peso (%)", hovermode="y unified",
    ), margin=dict(l=180, r=40, t=50, b=20))
    return fig


def plot_fund_regions(detail_df: pd.DataFrame, *, isin: str = "", height: int = 350) -> go.Figure:
    """Barras horizontales de exposición geográfica de un fondo.

    Args:
        detail_df: DataFrame devuelto por ``client.fund_details(isin)``.
        isin: ISIN del fondo (para el título).
        height: altura en píxeles.

    Returns:
        go.Figure
    """
    df = detail_df[detail_df["Metric"].str.startswith("country_")].copy()
    if df.empty:
        return go.Figure().update_layout(title="Sin datos geográficos", template=_DARK)
    df["País"] = df["Metric"].str.removeprefix("country_")
    df["Peso"] = pd.to_numeric(df["Value"], errors="coerce")
    df = df.dropna(subset=["Peso"]).sort_values("Peso", ascending=True)

    fig = go.Figure(go.Bar(
        x=df["Peso"], y=df["País"], orientation="h",
        marker_color=_SUCCESS_COLOR,
        hovertemplate="%{y}: %{x:.1f}%<extra></extra>",
    ))
    fig.update_layout(**_base_layout(
        title=f"Regiones — {isin}", height=height, xaxis_title="Peso (%)", hovermode="y unified",
    ), margin=dict(l=180, r=40, t=50, b=20))
    return fig


def plot_evolution_metrics(
    metrics_df: pd.DataFrame,
    *,
    metric: str = "CAGR_Pct",
    height: int | None = None,
) -> go.Figure:
    """Barras horizontales de una métrica de evolución por fondo.

    Args:
        metrics_df: DataFrame devuelto por ``client.evolution_metrics()``.
        metric: columna a graficar (``CAGR_Pct``, ``Sharpe``, ``Volatilidad_Pct``, ...).
        height: altura en píxeles (auto si es None).

    Returns:
        go.Figure
    """
    if metrics_df.empty or metric not in metrics_df.columns:
        return go.Figure().update_layout(title="Sin métricas disponibles", template=_DARK)

    df = metrics_df.sort_values(metric, ascending=True)
    h = height or max(350, 40 * len(df))

    colors = [_SUCCESS_COLOR if v >= 0 else _DANGER_COLOR for v in df[metric]]

    fig = go.Figure(go.Bar(
        x=df[metric],
        y=df["Fondo"],
        orientation="h",
        marker_color=colors,
        text=df[metric].apply(lambda v: f"{v:.2f}"),
        textposition="outside",
        hovertemplate="%{y}: %{x:.2f}<extra></extra>",
    ))
    fig.update_layout(
        **_base_layout(
            title=f"{metric} por Fondo",
            height=h,
            hovermode="y unified",
        ),
        margin=dict(l=250, r=80, t=50, b=20),
    )
    return fig

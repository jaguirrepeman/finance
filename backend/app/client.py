"""
client.py — PortfolioClient: fachada sync sobre AsyncPortfolioCore.

Usa ``nest_asyncio`` para permitir llamadas sync desde notebooks (Jupyter)
y contextos con event loop activo (FastAPI).

Uso desde notebook:
    from app.client import PortfolioClient
    client = PortfolioClient('../data/Órdenes 1238478.tsv')
    client.positions()  # → DataFrame

Uso desde FastAPI (acceso async directo):
    client = get_portfolio_client()
    df = await client.core.positions(live=True)
"""

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import pandas as pd

from .client_async import AsyncPortfolioCore
from .services.cache_store import CacheStore
from .services.core_portfolio import Portfolio
from .services.data_providers import CompositeAsyncProvider
from .services.utils import run_sync as _run

logger = logging.getLogger(__name__)


class PortfolioClient:
    """Fachada sync que envuelve AsyncPortfolioCore.

    Todos los métodos son síncronos (sin await) y devuelven pd.DataFrame.
    Internamente ejecutan el core async via nest_asyncio.
    """

    def __init__(
        self,
        source: Union[str, List[Dict], Dict, None] = None,
        cache_path: Optional[str] = None,
        use_cache: bool = True,
        force_refresh: bool = False,
    ) -> None:
        """
        Args:
            source: ruta a TSV/Excel/CSV, lista de dicts, dict {ISIN: units}, o None.
            cache_path: ruta para la caché SQLite. Si None, usa data/cache/.
            use_cache: si usar cache (legacy compat, siempre True en v2).
            force_refresh: ignorar caches y forzar descarga fresca.
        """
        self.portfolio = Portfolio(source)

        # Cache unificado
        if cache_path:
            db_path = Path(cache_path) / "cache.db"
        else:
            db_path = None
        self._cache = CacheStore(db_path=db_path)

        # Provider async
        self.provider = CompositeAsyncProvider(
            cache=self._cache,
            force_refresh=force_refresh,
        )

        # Core async
        self.core = AsyncPortfolioCore(
            portfolio=self.portfolio,
            provider=self.provider,
            cache=self._cache,
        )

        # Flag para ejecutar fill_missing una sola vez (lazy)
        self._filled = False

    # ------------------------------------------------------------------
    # Métodos sync (API pública)
    # ------------------------------------------------------------------

    def _ensure_filled(self) -> None:
        """Lazy fill: rellena capital invertido la primera vez que se necesita."""
        if not self._filled:
            _run(self.core.fill_missing_invested_amounts())
            self._filled = True

    def positions(self, live: bool = True) -> pd.DataFrame:
        """Posiciones actuales con P&L."""
        self._ensure_filled()
        return _run(self.core.positions(live=live))

    def open_lots(self) -> pd.DataFrame:
        """Lotes FIFO abiertos."""
        lots = self.portfolio.get_open_lots()
        if not lots:
            return pd.DataFrame(columns=[
                "ISIN", "Fondo", "Fecha_Compra", "Participaciones_Iniciales",
                "Participaciones_Restantes", "Importe_Invertido", "Precio_Compra_Unitario",
            ])
        df = pd.DataFrame(lots).rename(columns={"Fecha": "Fecha_Compra"})
        expected_cols = [
            "ISIN", "Fondo", "Fecha_Compra", "Participaciones_Iniciales",
            "Participaciones_Restantes", "Importe_Invertido", "Precio_Compra_Unitario",
        ]
        for col in expected_cols:
            if col not in df.columns:
                df[col] = None
        return df[expected_cols].reset_index(drop=True)

    def movements(self, isin: Optional[str] = None, name: Optional[str] = None) -> pd.DataFrame:
        """Histórico de movimientos."""
        df = self.portfolio.movements.copy()
        if df.empty:
            return df
        if isin is not None:
            df = df[df["ISIN"].astype(str).str.upper() == isin.strip().upper()]
        if name is not None:
            fondo_col = df["Fondo"].astype(str) if "Fondo" in df.columns else pd.Series("", index=df.index)
            df = df[fondo_col.str.contains(name, case=False, na=False)]
        return df.reset_index(drop=True)

    def summary(self) -> pd.DataFrame:
        """Resumen por tipo de activo."""
        return _run(self.core.summary())

    def fund_details(self, isin: str) -> pd.DataFrame:
        """Métricas detalladas de un fondo."""
        async def _details():
            info = await self.provider.get_fund_info(isin) or {}
            sectors = await self.provider.get_sector_weights(isin) or {}
            countries = await self.provider.get_country_weights(isin) or {}
            holdings = await self.provider.get_holdings(isin)

            rows = []
            for k, v in info.items():
                rows.append({"Metric": k, "Value": v})
            for s, w in sectors.items():
                rows.append({"Metric": f"sector_{s}", "Value": w})
            for c, w in countries.items():
                rows.append({"Metric": f"country_{c}", "Value": w})
            if not holdings.empty:
                for _, h in holdings.head(10).iterrows():
                    rows.append({"Metric": f"holding_{h.get('name', '')}", "Value": h.get("weight", 0)})
            if not rows:
                rows.append({"Metric": "isin", "Value": isin})
            return pd.DataFrame(rows)

        return _run(_details())

    def history(self, isins: Optional[List[str]] = None, years: int = 3) -> pd.DataFrame:
        """Histórico de precios."""
        return _run(self.core.history(isins=isins, years=years))

    def correlation(self, isins: Optional[List[str]] = None, years: int = 3) -> pd.DataFrame:
        """Matriz de correlación."""
        return _run(self.core.correlation(isins=isins, years=years))

    def tax_optimize(self, target_amount: float) -> pd.DataFrame:
        """Plan de retirada fiscal óptimo."""
        return _run(self.core.tax_optimize(target_amount))

    def optimize_withdrawal_via_traspaso(self, target_amount: float) -> dict:
        """Optimiza retirada usando traspasos para minimizar impuestos (Art. 94 LIRPF).

        Args:
            target_amount: Cantidad en € a retirar en efectivo.

        Returns:
            Dict con escenarios directo/optimizado, ahorro fiscal y planes.
        """
        return _run(self.core.optimize_withdrawal_via_traspaso(target_amount))

    def enrich(self, isins: Optional[List[str]] = None) -> pd.DataFrame:
        """Datos detallados de todos los fondos."""
        return _run(self.core.enrich(isins=isins))

    def performance(self, years: int = 3) -> pd.DataFrame:
        """Métricas de rendimiento del portfolio."""
        return _run(self.core.performance(years=years))

    def evolution_metrics(
        self,
        years: int = 5,
        risk_free_annual: float = 0.03,
        benchmark_isin: Optional[str] = None,
    ) -> pd.DataFrame:
        """Métricas de evolución por fondo."""
        return _run(self.core.evolution_metrics(
            years=years,
            risk_free_annual=risk_free_annual,
            benchmark_isin=benchmark_isin,
        ))

    def asset_allocation(self) -> pd.DataFrame:
        """Distribución de activos."""
        return _run(self.core.asset_allocation())

    def sector_exposure(self) -> pd.DataFrame:
        """Exposición sectorial agregada."""
        return _run(self.core.sector_exposure())

    def region_exposure(self) -> pd.DataFrame:
        """Exposición regional agregada."""
        return _run(self.core.region_exposure())

    def benchmark_comparison(self, benchmark_isin: str = "IE00B4L5Y983") -> dict:
        """Comparación con benchmark."""
        return _run(self.core.benchmark_comparison(benchmark_isin=benchmark_isin))

    def fund_metrics(self) -> pd.DataFrame:
        """Métricas por fondo y período."""
        return _run(self.core.fund_metrics())

    def fund_characteristics(self) -> pd.DataFrame:
        """Características estáticas por fondo."""
        return _run(self.core.fund_characteristics())

    def simulate_addition(self, isin: str, amount: float) -> dict:
        """Simula incorporación de un fondo."""
        return _run(self.core.simulate_addition(isin, amount))

    def simulate_rebalance(self, target_weights: dict) -> dict:
        """Simula rebalanceo de cartera con pesos objetivos."""
        return _run(self.core.simulate_rebalance(target_weights))

    def diagnostics(self, years: int = 3) -> pd.DataFrame:
        """Diagnóstico de cobertura de datos."""
        return _run(self.core.diagnostics(years=years))

    # ------------------------------------------------------------------
    # Evolución real del patrimonio (basada en órdenes)
    # ------------------------------------------------------------------

    def real_evolution(self, years: int = 20) -> Dict[str, Any]:
        """Evolución real del portfolio: participaciones × NAV diario.

        Reconstruye el valor real de la cartera a partir de las fechas de
        ejecución de cada orden (no pesos actuales retroactivos).

        Returns:
            dict con claves:
                - series: [{date, value, invested}, ...]
                - monthly: [{date, label, value, invested, gain, gain_pct, mom}, ...]
        """
        from .services.portfolio_service import build_real_portfolio_history
        return build_real_portfolio_history(years=years)

    def real_evolution_per_fund(self, years: int = 20) -> Dict[str, Any]:
        """Evolución real desglosada por fondo (participaciones × NAV diario).

        Returns:
            dict con claves:
                - funds: {fund_name: [{date, value}, ...], ...}
                - invested_per_fund: {fund_name: [{date, invested}, ...], ...}
        """
        from .services.portfolio_service import build_real_portfolio_history_per_fund
        return build_real_portfolio_history_per_fund(years=years)

    # ------------------------------------------------------------------
    # Retornos anuales y resumen de órdenes
    # ------------------------------------------------------------------

    def annual_returns(self, years: int = 10) -> Dict[str, Any]:
        """Retornos anuales por fondo (año natural).

        Returns:
            dict: {years: [int], funds: {name: {year: pct, ...}, ...}}
        """
        from collections import defaultdict

        hist = _run(self.core.history(years=years))
        if hist.empty:
            return {"years": [], "funds": {}}

        date_col = hist.columns[0]
        price_cols = [c for c in hist.columns if c != date_col]
        df = hist.copy()
        df[date_col] = pd.to_datetime(df[date_col])
        df["_year"] = df[date_col].dt.year

        result: Dict[str, Dict[int, float]] = {}
        all_years: set = set()

        for col in price_cols:
            fund_returns: Dict[int, float] = {}
            for year, grp in df.groupby("_year"):
                prices = grp[col].dropna()
                if len(prices) < 2:
                    continue
                first_price = prices.iloc[0]
                last_price = prices.iloc[-1]
                if first_price > 0:
                    pct = round((last_price / first_price - 1) * 100, 2)
                    fund_returns[int(year)] = pct
                    all_years.add(int(year))
            if fund_returns:
                result[col] = fund_returns

        return {"years": sorted(all_years), "funds": result}

    def orders_summary(self) -> Dict[str, Any]:
        """Resumen de órdenes: importes invertidos por mes y por año.

        Returns:
            dict: {monthly: {"YYYY-MM": €}, yearly: {YYYY: €}}
        """
        from .services.utils import safe_float

        movements = self.portfolio.movements
        if movements.empty:
            return {"monthly": {}, "yearly": {}}

        buys = movements[movements["Participaciones"] > 0].copy()
        if buys.empty:
            return {"monthly": {}, "yearly": {}}

        buys["Fecha"] = pd.to_datetime(buys["Fecha"])
        buys["ym"] = buys["Fecha"].dt.strftime("%Y-%m")
        buys["year"] = buys["Fecha"].dt.year
        buys["_importe"] = buys["Importe"].apply(safe_float)

        monthly_s = buys.groupby("ym")["_importe"].sum()
        yearly_s = buys.groupby("year")["_importe"].sum()

        return {
            "monthly": {k: round(float(v), 2) for k, v in monthly_s.items()},
            "yearly": {int(k): round(float(v), 2) for k, v in yearly_s.items()},
        }

    # ------------------------------------------------------------------
    # Búsqueda de fondos y NAV externo
    # ------------------------------------------------------------------

    def search_funds(self, query: str, limit: int = 20) -> List[Dict]:
        """Busca fondos en el índice de Finect (por ISIN o nombre).

        Returns:
            List[dict]: [{isin, name, in_portfolio, url}, ...]
        """
        from .services.finect_provider import search_funds_async
        return _run(search_funds_async(query, limit=limit))

    def fund_nav_history(self, isin: str, years: int = 5) -> pd.DataFrame:
        """Historial de NAV para cualquier ISIN (no necesita estar en cartera).

        Returns:
            DataFrame con columnas [date, price].
        """
        async def _fetch():
            df = await self.provider.get_nav_history(isin, years=years)
            return df if df is not None else pd.DataFrame(columns=["date", "price"])
        return _run(_fetch())

    # ------------------------------------------------------------------
    # Análisis de traspasos
    # ------------------------------------------------------------------

    def traspaso_analysis(self) -> List[Dict]:
        """Análisis de fondos traspasables para diferir impuestos (Art. 94 LIRPF).

        Returns:
            List[dict]: [{ISIN, Fondo, Valor, Plusvalia_Latente, Impuesto_si_Vende,
                          Ahorro_Traspaso, Apto_Traspaso}, ...]
        """
        return _run(self.core.traspaso_analysis())

    # ------------------------------------------------------------------
    # Oportunidades de compra
    # ------------------------------------------------------------------

    def opportunities(
        self,
        weights: Dict[str, float] | None = None,
    ) -> List[Dict]:
        """Escanea el portfolio y calcula señales de timing de compra.

        Args:
            weights: Pesos personalizados para las 6 dimensiones del score.
                Si None, usa los defaults (25/15/15/15/10/20).

        Returns:
            List[dict]: Lista ordenada por timing_score (mayor = más oportunidad).
        """
        from .services.opportunity_scanner import scan_portfolio_opportunities
        return _run(scan_portfolio_opportunities(self, weights=weights))

    def fund_opportunity(
        self,
        isin: str,
        weights: Dict[str, float] | None = None,
    ) -> Dict:
        """Señales de timing para un fondo concreto.

        Args:
            isin: ISIN del fondo.
            weights: Pesos personalizados para las dimensiones del score.

        Returns:
            dict: Señales de timing e interpretación.
        """
        from .services.opportunity_scanner import scan_fund_opportunity
        return _run(scan_fund_opportunity(self, isin, weights=weights))

    def opportunity_chart_data(
        self,
        isin: str,
        months: int = 12,
    ) -> Dict:
        """Datos de gráfico de timing para un fondo.

        Devuelve serie de precios, regresión log-lineal, bandas ±1σ/±2σ,
        SMA-200, RSI, y crossovers de momentum para visualización.

        Args:
            isin: ISIN del fondo.
            months: Meses de histórico para la gráfica.

        Returns:
            dict: Series de precios, overlays y señales.
        """
        from .services.opportunity_scanner import get_opportunity_chart_data
        return _run(get_opportunity_chart_data(self, isin, months=months))

    @staticmethod
    def timing_presets() -> Dict:
        """Devuelve presets de pesos y defaults para configurar el timing.

        Returns:
            dict: {presets: {...}, default_weights: {...}}.
        """
        from .services.opportunity_scanner import (
            DEFAULT_TIMING_WEIGHTS,
            TIMING_PRESETS,
        )
        return {
            "presets": TIMING_PRESETS,
            "default_weights": DEFAULT_TIMING_WEIGHTS,
        }

    def compare_funds(self, isins: List[str], years: int = 5) -> Dict:
        """Compara múltiples fondos lado a lado.

        Returns:
            dict: {funds: [...], chart_data: {...}}.
        """
        from .services.opportunity_scanner import compare_funds
        return _run(compare_funds(self, isins, years=years))

    # ------------------------------------------------------------------
    # Gráficas (equivalentes al frontend)
    # ------------------------------------------------------------------

    def plot_real_evolution(self, years: int = 20, **kwargs) -> "go.Figure":
        """Evolución real del patrimonio vs capital invertido (gold/dashed).

        Equivale a ``PortfolioValueChart`` del frontend.
        """
        from .charts import plot_real_evolution as _plot
        return _plot(self.real_evolution(years=years), **kwargs)

    def plot_per_fund_evolution(self, years: int = 20, **kwargs) -> "go.Figure":
        """Stacked area por fondo. Equivale a ``PerFundEvolutionChart``."""
        from .charts import plot_per_fund_evolution as _plot
        return _plot(self.real_evolution_per_fund(years=years), **kwargs)

    def plot_orders_summary(self, mode: str = "monthly", **kwargs) -> "go.Figure":
        """Barras de inversión mensual/anual. Equivale a ``OrdersSummaryChart``."""
        from .charts import plot_orders_summary as _plot
        return _plot(self.orders_summary(), mode=mode, **kwargs)

    def plot_asset_allocation(self, **kwargs) -> "go.Figure":
        """Donut de asset allocation."""
        from .charts import plot_asset_allocation as _plot
        return _plot(self.asset_allocation(), **kwargs)

    def plot_fund_weights(self, live: bool = True, **kwargs) -> "go.Figure":
        """Barras horizontales de peso por fondo."""
        from .charts import plot_fund_weights as _plot
        return _plot(self.positions(live=live), **kwargs)

    def plot_benchmark_sectors(self, benchmark_isin: str = "IE00B4L5Y983", **kwargs) -> "go.Figure":
        """Barras agrupadas: sectores cartera vs MSCI World."""
        from .charts import plot_benchmark_sectors as _plot
        return _plot(self.benchmark_comparison(benchmark_isin=benchmark_isin), **kwargs)

    def plot_benchmark_regions(self, benchmark_isin: str = "IE00B4L5Y983", **kwargs) -> "go.Figure":
        """Barras agrupadas: regiones cartera vs MSCI World."""
        from .charts import plot_benchmark_regions as _plot
        return _plot(self.benchmark_comparison(benchmark_isin=benchmark_isin), **kwargs)

    def plot_history_base100(self, years: int = 5, **kwargs) -> "go.Figure":
        """Líneas normalizadas a base 100 por fondo."""
        from .charts import plot_history_base100 as _plot
        return _plot(self.history(years=years), **kwargs)

    def plot_history_nav(self, years: int = 5, **kwargs) -> "go.Figure":
        """Líneas de NAV absoluto (€) por fondo."""
        from .charts import plot_history_nav as _plot
        return _plot(self.history(years=years), **kwargs)

    def plot_annual_returns(self, years: int = 10, **kwargs) -> "go.Figure":
        """Heatmap de retornos anuales por fondo."""
        from .charts import plot_annual_returns as _plot
        return _plot(self.annual_returns(years=years), **kwargs)

    def plot_correlation(self, years: int = 5, **kwargs) -> "go.Figure":
        """Heatmap de correlación de Pearson entre fondos."""
        from .charts import plot_correlation as _plot
        return _plot(self.correlation(years=years), **kwargs)

    def plot_simulation_weights(
        self,
        isin: str,
        amount: float,
        **kwargs,
    ) -> "go.Figure":
        """Barras agrupadas de pesos actual vs simulado (añadir fondo)."""
        from .charts import plot_simulation_weights as _plot
        sim = self.simulate_addition(isin, amount)
        meta = sim.get("metadata", {})
        title = f"Pesos: Actual vs Simulado (+€{amount:,.0f} en {meta.get('added_name', isin)})"
        return _plot(sim, title=title, **kwargs)

    def plot_tax_brackets(self, target_amount: float, **kwargs) -> "go.Figure":
        """Barras de desglose fiscal IRPF para una retirada dada."""
        from .charts import plot_tax_brackets as _plot
        df = self.tax_optimize(target_amount)
        gain = float(df.attrs.get("total_capital_gain", 0))
        return _plot(gain, **kwargs)

    def plot_projection(
        self,
        years: int = 5,
        horizon: int = 10,
        annual_contribution: float = 0.0,
        sigma_level: float = 1.0,
        **kwargs,
    ) -> "go.Figure":
        """Proyección a N años basada en CAGR/volatilidad histórica del portfolio.

        Args:
            years: ventana histórica para calcular CAGR y volatilidad.
            horizon: años de proyección.
            annual_contribution: aportación anual extra en €.
            sigma_level: bandas de ±σ.
        """
        import numpy as np
        from .charts import plot_projection as _plot

        pos = self.positions(live=True)
        hist = self.history(years=years)

        if hist.empty:
            import plotly.graph_objects as _go
            return _go.Figure().update_layout(title="Sin historial para proyección", template="plotly_dark")

        date_col = hist.columns[0]
        price_cols = [c for c in hist.columns if c != date_col]
        weights = {}
        for _, row in pos.iterrows():
            w = row.get("Peso_Pct", row.get("Valor_Actual", 0))
            weights[row["Fondo"]] = w

        total_w = sum(weights.values())
        if total_w:
            weights = {k: v / total_w for k, v in weights.items()}

        import pandas as pd
        returns = hist.set_index(date_col)[price_cols].pct_change().dropna()
        portfolio_ret = pd.Series(0.0, index=returns.index)
        for col in returns.columns:
            portfolio_ret += returns[col].fillna(0) * weights.get(col, 0)

        n = len(portfolio_ret)
        annual_ret = (1 + portfolio_ret).prod() ** (252 / n) - 1 if n > 0 else 0.0
        annual_vol = float(portfolio_ret.std() * np.sqrt(252)) if n > 0 else 0.0

        start_value = float(pos["Valor_Actual"].sum())

        return _plot(
            start_value=start_value,
            annual_ret=annual_ret,
            annual_vol=annual_vol,
            horizon=horizon,
            annual_contribution=annual_contribution,
            sigma_level=sigma_level,
            **kwargs,
        )

    def plot_fund_sectors(self, isin: str, **kwargs) -> "go.Figure":
        """Barras horizontales de exposición sectorial de un fondo."""
        from .charts import plot_fund_sectors as _plot
        detail = self.fund_details(isin)
        return _plot(detail, isin=isin, **kwargs)

    def plot_fund_regions(self, isin: str, **kwargs) -> "go.Figure":
        """Barras horizontales de exposición geográfica de un fondo."""
        from .charts import plot_fund_regions as _plot
        detail = self.fund_details(isin)
        return _plot(detail, isin=isin, **kwargs)

    def plot_evolution_metrics(
        self,
        years: int = 5,
        metric: str = "CAGR_Pct",
        **kwargs,
    ) -> "go.Figure":
        """Barras horizontales de una métrica de evolución por fondo."""
        from .charts import plot_evolution_metrics as _plot
        return _plot(self.evolution_metrics(years=years), metric=metric, **kwargs)

    # ------------------------------------------------------------------
    # Representación
    # ------------------------------------------------------------------

    def __repr__(self) -> str:
        n = len(self.portfolio.positions)
        return f"PortfolioClient({n} positions)"

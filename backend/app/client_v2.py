"""
client_v2.py — PortfolioClient v2: facade sync sobre async core.

Usa ``nest_asyncio`` para permitir llamadas sync desde notebooks (Jupyter)
y contextos con event loop activo (FastAPI).

API pública idéntica al client.py original — todos los métodos devuelven
pd.DataFrame de forma síncrona.

Uso desde notebook:
    from app.client_v2 import PortfolioClient
    client = PortfolioClient('../data/Órdenes 1238478.tsv')
    client.positions()  # → DataFrame

Uso desde FastAPI (acceso async directo):
    client = get_portfolio_client()
    df = await client.core.positions(live=True)
"""

import asyncio
import logging
from pathlib import Path
from typing import Dict, List, Optional, Union

import nest_asyncio
import pandas as pd

from .client_async import AsyncPortfolioCore
from .services.cache_store import CacheStore
from .services.core_portfolio import Portfolio
from .services.data_providers_async import CompositeAsyncProvider

logger = logging.getLogger(__name__)

# Parchear el event loop para permitir llamadas anidadas (Jupyter + FastAPI)
nest_asyncio.apply()


def _run(coro):
    """Ejecuta una coroutine de forma síncrona, compatible con cualquier contexto."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


class PortfolioClient:
    """Fachada sync que envuelve AsyncPortfolioCore.

    Todos los métodos son síncroni (sin await) y devuelven pd.DataFrame.
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

    def diagnostics(self, years: int = 3) -> pd.DataFrame:
        """Diagnóstico de cobertura de datos."""
        return _run(self.core.diagnostics(years=years))

    # ------------------------------------------------------------------
    # Representación
    # ------------------------------------------------------------------

    def __repr__(self) -> str:
        n = len(self.portfolio.positions)
        return f"PortfolioClient(v2, {n} positions)"

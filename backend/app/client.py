"""
client.py — PortfolioClient: wrapper Python que devuelve DataFrames nativos.

Uso desde notebook:
    from app.client import PortfolioClient
    client = PortfolioClient('../data/Órdenes 1238478.tsv')

    client.positions()       → DataFrame con posiciones + P&L
    client.open_lots()       → DataFrame con lotes abiertos FIFO
    client.summary()         → DataFrame resumen por categoría
    client.fund_details(isin)→ DataFrame con sector/region/holdings/info
    client.history(years=3)  → DataFrame con histórico de precios
    client.correlation()     → DataFrame con matriz de correlación
    client.tax_optimize(amt) → DataFrame con plan de retirada óptimo
    client.enrich()          → DataFrame con datos detallados de todos los fondos
    client.performance()     → DataFrame con métricas de rendimiento
"""

import logging
from typing import Dict, List, Optional, Union

import numpy as np
import pandas as pd

from .services.core_portfolio import Portfolio
from .services.data_providers import CompositeProvider
from .services.tax_calculator import TaxOptimizer

logger = logging.getLogger(__name__)


class PortfolioClient:
    """
    Fachada Python que unifica Portfolio + DataProviders + TaxOptimizer.
    Todos los métodos devuelven pd.DataFrame.
    """

    def __init__(
        self,
        source: Union[str, List[Dict], Dict, None] = None,
        cache_path: Optional[str] = None,
        use_cache: bool = True,
    ):
        """
        Args:
            source: ruta a TSV/Excel/CSV de órdenes, lista de dicts, dict {ISIN: units}, o None.
            cache_path: ruta base para caché de datos de fondos.
            use_cache: usar caché de datos de fondos.
        """
        self.portfolio = Portfolio(source)
        self.provider = CompositeProvider(cache_path=cache_path)
        self.use_cache = use_cache
        self._prices_cache: Dict[str, float] = {}

    # ------------------------------------------------------------------
    # Precios live (con caché en sesión)
    # ------------------------------------------------------------------

    def _fetch_prices(self, isins: Optional[List[str]] = None, force: bool = False) -> Dict[str, float]:
        """Obtiene precios actuales para todos los ISINs del portfolio en paralelo."""
        from concurrent.futures import ThreadPoolExecutor, as_completed

        target_isins = [
            isin for isin in (isins or list(self.portfolio.positions.keys()))
            if isin not in self._prices_cache or force
        ]

        def _fetch_one(isin: str) -> tuple[str, float]:
            try:
                price = self.provider.get_nav(isin)
                return isin, price if price and price > 0 else 0.0
            except Exception as e:
                logger.warning("_fetch_prices: error fetching NAV for %s: %s", isin, e)
                return isin, 0.0

        if target_isins:
            with ThreadPoolExecutor(max_workers=min(len(target_isins), 8)) as executor:
                futures = {executor.submit(_fetch_one, isin): isin for isin in target_isins}
                for future in as_completed(futures):
                    isin, price = future.result()
                    self._prices_cache[isin] = price

        return self._prices_cache

    # ------------------------------------------------------------------
    # Posiciones (con P&L)
    # ------------------------------------------------------------------

    def positions(self, live: bool = True) -> pd.DataFrame:
        """
        Devuelve las posiciones actuales con P&L.

        Columnas: Fondo, Valor_Actual, Capital_Invertido, Ganancia_Euros,
                  Ganancia_Pct, Participaciones, Precio_Actual,
                  Fecha_Actualizacion, ISIN
        """
        from datetime import datetime

        prices = self._fetch_prices() if live else {}
        df = self.portfolio.to_dataframe(live_prices=prices)

        if df.empty:
            return df

        # Enriquecer Fondo con nombres reales desde los movimientos (sin red)
        mov = self.portfolio.movements
        if not mov.empty and "Fondo" in mov.columns:
            name_map = (
                mov[mov["Fondo"].astype(str).str.upper() != mov["ISIN"].astype(str).str.upper()]
                .groupby("ISIN")["Fondo"]
                .first()
                .to_dict()
            )
            df["Fondo"] = df["ISIN"].map(lambda x: name_map.get(x, df.loc[df["ISIN"] == x, "Fondo"].iloc[0]))  # noqa: B023

        # Columnas en el orden solicitado
        ordered = [
            "ISIN", "Fondo", "Valor_Actual", "Capital_Invertido",
            "Ganancia_Euros", "Ganancia_Pct", "Participaciones",
            "Precio_Actual", "Fecha_Actualizacion", 
        ]

        # Añadir fecha de actualización
        df["Fecha_Actualizacion"] = datetime.now().strftime("%Y-%m-%d %H:%M") if live else None

        # Añadir columnas faltantes (p.ej. si live=False algunas no existen)
        for col in ordered:
            if col not in df.columns:
                df[col] = None

        return df[ordered].reset_index(drop=True)

    # ------------------------------------------------------------------
    # Lotes abiertos
    # ------------------------------------------------------------------

    def open_lots(self) -> pd.DataFrame:
        """
        Devuelve todos los lotes FIFO abiertos.

        Columnas: ISIN, Fondo, Fecha_Compra, Participaciones_Iniciales,
                  Participaciones_Restantes, Importe_Invertido, Precio_Compra_Unitario
        """
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

    # ------------------------------------------------------------------
    # Movimientos (histórico de órdenes)
    # ------------------------------------------------------------------

    def movements(
        self,
        isin: Optional[str] = None,
        name: Optional[str] = None,
    ) -> pd.DataFrame:
        """
        Devuelve el histórico de movimientos (órdenes ejecutadas) del Excel.

        Args:
            isin: Filtrar por ISIN exacto (case-insensitive).
            name: Filtrar por nombre de fondo (contains, case-insensitive).

        Returns:
            DataFrame con todas las columnas del Excel de órdenes, ordenado por fecha.
        """
        df = self.portfolio.movements.copy()
        if df.empty:
            return df

        if isin is not None:
            df = df[df["ISIN"].astype(str).str.upper() == isin.strip().upper()]

        if name is not None:
            fondo_col = df["Fondo"].astype(str) if "Fondo" in df.columns else pd.Series("", index=df.index)
            df = df[fondo_col.str.contains(name, case=False, na=False)]

        return df.reset_index(drop=True)

    # ------------------------------------------------------------------
    # Resumen por categoría
    # ------------------------------------------------------------------

    def summary(self) -> pd.DataFrame:
        """
        Resumen del portfolio agrupado por tipo de activo.

        Columnas: Tipo, Num_Fondos, Capital_Invertido, Valor_Actual, Peso_Pct
        """
        pos = self.positions(live=True)
        if pos.empty:
            return pd.DataFrame(columns=["Tipo", "Num_Fondos", "Capital_Invertido", "Valor_Actual", "Peso_Pct"])

        # Clasificar ISINs por tipo (heurística basada en infos)
        tipo_map = {}
        for isin in pos["ISIN"]:
            info = self.provider.get_fund_info(isin)
            name = info.get("name", "").lower() if info else ""
            cat = info.get("categoryName", "").lower() if info else ""
            # Heurística de clasificación
            combined = f"{name} {cat}"
            if any(kw in combined for kw in ["bond", "renta fija", "fixed income", "rf", "treasury", "government bond"]):
                tipo_map[isin] = "Renta Fija"
            elif any(kw in combined for kw in ["cash", "monetar", "money market", "liquidez"]):
                tipo_map[isin] = "Liquidez"
            elif any(kw in combined for kw in ["gold", "oro", "commodity", "bitcoin", "crypto"]):
                tipo_map[isin] = "Alternativo"
            else:
                tipo_map[isin] = "Renta Variable"

        pos["Tipo"] = pos["ISIN"].map(tipo_map).fillna("Otros")
        total_val = pos["Valor_Actual"].sum() if pos["Valor_Actual"].notna().any() else pos["Capital_Invertido"].sum()

        summary = (
            pos.groupby("Tipo")
            .agg(
                Num_Fondos=("ISIN", "count"),
                Capital_Invertido=("Capital_Invertido", "sum"),
                Valor_Actual=("Valor_Actual", "sum"),
            )
            .reset_index()
        )
        summary["Peso_Pct"] = (summary["Valor_Actual"] / total_val * 100).round(2) if total_val else 0.0
        return summary.sort_values("Peso_Pct", ascending=False).reset_index(drop=True)

    # ------------------------------------------------------------------
    # Detalle de un fondo
    # ------------------------------------------------------------------

    def fund_details(self, isin: str) -> pd.DataFrame:
        """
        Devuelve todas las métricas disponibles de un fondo en formato DataFrame.

        Filas: name, category, expense_ratio, aum, sectors, countries, holdings, etc.
        """
        info = self.provider.get_fund_info(isin) or {}
        sectors = self.provider.get_sector_weights(isin) or {}
        countries = self.provider.get_country_weights(isin) or {}
        holdings = self.provider.get_holdings(isin)

        rows = []
        # Info general
        for k, v in info.items():
            rows.append({"Metric": k, "Value": v})

        # Sectores
        for s, w in sectors.items():
            rows.append({"Metric": f"sector_{s}", "Value": w})

        # Países
        for c, w in countries.items():
            rows.append({"Metric": f"country_{c}", "Value": w})

        # Holdings top
        if not holdings.empty:
            for _, h in holdings.head(10).iterrows():
                rows.append({"Metric": f"holding_{h.get('name', h.get('ticker', ''))}", "Value": h.get("weight", 0)})

        if not rows:
            rows.append({"Metric": "isin", "Value": isin})

        return pd.DataFrame(rows)

    # ------------------------------------------------------------------
    # Histórico de precios
    # ------------------------------------------------------------------

    def history(self, isins: Optional[List[str]] = None, years: int = 3) -> pd.DataFrame:
        """
        Histórico de precios como DataFrame con columnas [date, ISIN1, ISIN2, ...].

        Args:
            isins: lista de ISINs. Si None, usa todos los del portfolio.
            years: años de historia a obtener.
        """
        target = isins or list(self.portfolio.positions.keys())
        frames = {}
        for isin in target:
            df = self.provider.get_nav_history(isin, years=years)
            if not df.empty:
                # Get fund name
                info = self.provider.get_fund_info(isin)
                name = info.get("name", isin) if info else isin
                df = df.set_index("date")["price"].rename(name)
                frames[name] = df

        if not frames:
            return pd.DataFrame()

        result = pd.concat(frames.values(), axis=1, join="outer")
        result = result.sort_index().ffill()
        result.index.name = "date"
        return result.reset_index()

    # ------------------------------------------------------------------
    # Correlación
    # ------------------------------------------------------------------

    def correlation(self, isins: Optional[List[str]] = None, years: int = 3) -> pd.DataFrame:
        """Matriz de correlación de Pearson entre fondos."""
        hist = self.history(isins=isins, years=years)
        if hist.empty or len(hist.columns) < 3:  # date + al menos 2 fondos
            return pd.DataFrame()
        numeric = hist.drop(columns=["date"]).pct_change().dropna()
        return numeric.corr().round(4)

    # ------------------------------------------------------------------
    # Optimización fiscal
    # ------------------------------------------------------------------

    def tax_optimize(self, target_amount: float) -> pd.DataFrame:
        """
        Plan de retirada fiscal óptimo como DataFrame.

        Columnas: ISIN, Fondo, Fecha_Compra, Participaciones_Vendidas,
                  Importe_Retirado, Ganancia_Patrimonial
        + fila de totales al final.
        """
        prices = self._fetch_prices()
        optimizer = TaxOptimizer(self.portfolio, prices=prices)
        plan = optimizer.optimize_withdrawal(target_amount)

        rows = plan.get("plan", [])
        if not rows:
            return pd.DataFrame(columns=[
                "ISIN", "Fondo", "Fecha_Compra", "Participaciones_Vendidas",
                "Importe_Retirado", "Ganancia_Patrimonial",
            ])

        df = pd.DataFrame(rows)
        # Añadir fila de totales
        totals = pd.DataFrame([{
            "ISIN": "── TOTAL ──",
            "Fondo": "",
            "Fecha_Compra": None,
            "Participaciones_Vendidas": df["Participaciones_Vendidas"].sum(),
            "Importe_Retirado": plan["withdrawn_amount"],
            "Ganancia_Patrimonial": plan["total_capital_gain"],
        }])
        df = pd.concat([df, totals], ignore_index=True)

        # Añadir metadata como attrs
        df.attrs["target_amount"] = plan["target_amount"]
        df.attrs["withdrawn_amount"] = plan["withdrawn_amount"]
        df.attrs["total_capital_gain"] = plan["total_capital_gain"]
        df.attrs["estimated_tax"] = plan["estimated_tax"]
        df.attrs["net_amount"] = plan["net_amount"]

        return df

    # ------------------------------------------------------------------
    # Enriquecer fondos (datos detallados de todos)
    # ------------------------------------------------------------------

    def enrich(self, isins: Optional[List[str]] = None) -> pd.DataFrame:
        """
        Enriquece todos los fondos del portfolio con datos detallados.

        El ``CompositeProvider`` ya incluye Finect en la cadena de fallback,
        por lo que los datos de comisiones, ratios y holdings de Finect
        se integran automáticamente vía ``get_fund_info`` / ``get_holdings``.

        Columnas: ISIN, Nombre, Precio_Actual, Expense_Ratio, AUM,
                  Renta_Variable_Pct, Renta_Fija_Pct, EEUU_Pct, Europa_Pct,
                  Rating_MS, Risk_Score, Gestora, Source
        """
        target = isins or list(self.portfolio.positions.keys())
        rows = []
        for isin in target:
            price = self.provider.get_nav(isin)
            info = self.provider.get_fund_info(isin) or {}
            sectors = self.provider.get_sector_weights(isin) or {}
            countries = self.provider.get_country_weights(isin) or {}

            # Intentar extraer % RV/RF de los sectores o holdings
            rv_pct = (
                sum(v for k, v in sectors.items() if "bond" not in k.lower())
                if sectors
                else None
            )
            rf_pct = (
                sum(v for k, v in sectors.items() if "bond" in k.lower())
                if sectors
                else None
            )

            # Regional exposure
            usa_pct = countries.get(
                "United States", countries.get("northAmerica", 0)
            )
            eur_pct = sum(
                v
                for k, v in countries.items()
                if k.lower()
                in [
                    "united kingdom",
                    "germany",
                    "france",
                    "europe developed",
                    "eurozone",
                ]
            )

            rows.append({
                "ISIN": isin,
                "Nombre": info.get("name", isin),
                "Precio_Actual": price or 0.0,
                "Expense_Ratio": info.get("expense_ratio"),
                "AUM": info.get("aum"),
                "Inception_Date": info.get("inception_date"),
                "Rating_MS": info.get("overallMorningstarRating"),
                "Risk_Score": info.get("riskScore"),
                "Gestora": info.get("management_company"),
                "Renta_Variable_Pct": rv_pct,
                "Renta_Fija_Pct": rf_pct,
                "EEUU_Pct": usa_pct or 0,
                "Europa_Pct": eur_pct or 0,
                "Source": info.get("source", "Unknown"),
            })

        return pd.DataFrame(rows)

    # ------------------------------------------------------------------
    # Performance del portfolio
    # ------------------------------------------------------------------

    def performance(self, years: int = 3) -> pd.DataFrame:
        """
        Métricas de rendimiento del portfolio.

        Columnas: Metric, Value
        """
        hist = self.history(years=years)
        if hist.empty:
            return pd.DataFrame(columns=["Metric", "Value"])

        # Portfolio ponderado por valor actual
        pos = self.positions(live=True)
        total_val = pos["Valor_Actual"].sum() if pos["Valor_Actual"].notna().any() else 1
        weights = {}
        for _, row in pos.iterrows():
            info = self.provider.get_fund_info(row["ISIN"])
            name = info.get("name", row["ISIN"]) if info else row["ISIN"]
            w = (row["Valor_Actual"] / total_val) if pd.notna(row["Valor_Actual"]) and total_val > 0 else 0
            weights[name] = w

        # Calcular retorno diario ponderado del portfolio
        date_col = hist.columns[0]
        price_cols = [c for c in hist.columns if c != date_col]
        returns = hist.set_index(date_col)[price_cols].pct_change().dropna()

        if returns.empty:
            return pd.DataFrame(columns=["Metric", "Value"])

        # Portfolio return
        portfolio_returns = pd.Series(0.0, index=returns.index)
        for col in returns.columns:
            w = weights.get(col, 0)
            portfolio_returns += returns[col].fillna(0) * w

        # Métricas
        total_return = (1 + portfolio_returns).prod() - 1
        annual_return = (1 + total_return) ** (252 / len(portfolio_returns)) - 1 if len(portfolio_returns) > 0 else 0
        volatility = portfolio_returns.std() * np.sqrt(252)
        sharpe = annual_return / volatility if volatility > 0 else 0
        sortino_downside = portfolio_returns[portfolio_returns < 0].std() * np.sqrt(252)
        sortino = annual_return / sortino_downside if sortino_downside > 0 else 0

        # Max drawdown
        cum = (1 + portfolio_returns).cumprod()
        running_max = cum.cummax()
        drawdown = (cum - running_max) / running_max
        max_drawdown = drawdown.min()

        metrics = [
            {"Metric": "Retorno Total", "Value": f"{total_return * 100:.2f}%"},
            {"Metric": "Retorno Anualizado", "Value": f"{annual_return * 100:.2f}%"},
            {"Metric": "Volatilidad Anualizada", "Value": f"{volatility * 100:.2f}%"},
            {"Metric": "Sharpe Ratio", "Value": f"{sharpe:.2f}"},
            {"Metric": "Sortino Ratio", "Value": f"{sortino:.2f}"},
            {"Metric": "Max Drawdown", "Value": f"{max_drawdown * 100:.2f}%"},
            {"Metric": "Capital Invertido", "Value": f"{self.portfolio.get_total_invested():,.2f} €"},
            {"Metric": "Valor Actual", "Value": f"{total_val:,.2f} €"},
            {"Metric": "Ganancia Total", "Value": f"{total_val - self.portfolio.get_total_invested():,.2f} €"},
            {"Metric": "Num. Fondos", "Value": str(len(self.portfolio.positions))},
            {"Metric": "Num. Lotes Abiertos", "Value": str(len(self.portfolio.open_lots))},
        ]

        return pd.DataFrame(metrics)

    # ------------------------------------------------------------------
    # Representación
    # ------------------------------------------------------------------

    def __repr__(self) -> str:
        return f"PortfolioClient({self.portfolio})"

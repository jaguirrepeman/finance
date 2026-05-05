"""
client.py — PortfolioClient: wrapper Python que devuelve DataFrames nativos.

Uso desde notebook:
    from app.client import PortfolioClient
    client = PortfolioClient('../data/Órdenes 1238478.tsv')

    client.positions()             → DataFrame con posiciones + P&L
    client.open_lots()             → DataFrame con lotes abiertos FIFO
    client.summary()               → DataFrame resumen por categoría
    client.fund_details(isin)      → DataFrame con sector/region/holdings/info
    client.history(years=3)        → DataFrame con histórico de precios
    client.correlation()           → DataFrame con matriz de correlación
    client.tax_optimize(amt)       → DataFrame con plan de retirada óptimo
    client.enrich()                → DataFrame con datos detallados de todos los fondos
    client.fund_characteristics()  → DataFrame con estrellas, rating_riesgo y TER (constantes)
    client.fund_metrics()          → DataFrame con rentabilidad, vol, caída, alpha, beta, sharpe a 1Y/3Y/5Y/10Y
    client.performance()           → DataFrame con métricas de rendimiento del portfolio
    client.evolution_metrics()     → DataFrame con Rentab, CAGR, Vol, Sharpe, Alpha, Beta calculados desde NAV histórico
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
        force_refresh: bool = False,
    ):
        """
        Args:
            source: ruta a TSV/Excel/CSV de órdenes, lista de dicts, dict {ISIN: units}, o None.
            cache_path: ruta base para caché de datos de fondos.
            use_cache: usar caché de datos de fondos.
            force_refresh: si ``True``, ignora la cache de disco de MStarProvider
                y fuerza una descarga fresca de todos los proveedores.
        """
        self.portfolio = Portfolio(source)
        self.provider = CompositeProvider(cache_path=cache_path, force_refresh=force_refresh)
        self.use_cache = use_cache
        self._prices_cache: Dict[str, float] = {}
        self._nav_dates_cache: Dict[str, Optional[str]] = {}
        self._names_cache: Dict[str, str] = {}

        # Rellenar capital invertido faltante a partir de NAV histórico
        self._fill_missing_invested_amounts()

    # ------------------------------------------------------------------
    # Rellenar capital invertido faltante
    # ------------------------------------------------------------------

    def _fill_missing_invested_amounts(self) -> None:
        """Rellena ``Importe_Invertido`` y ``Precio_Compra_Unitario`` en lotes
        donde no se dispone del dato de capital invertido en las órdenes.

        Para cada lote con importe cero, consulta el histórico de NAV del fondo
        y busca el precio más cercano a la fecha de compra.  El capital invertido
        se calcula como ``NAV_fecha_compra × Participaciones_Iniciales``.
        """
        from concurrent.futures import ThreadPoolExecutor, as_completed

        # Identificar ISINs con lotes sin importe
        isins_needed: set[str] = set()
        for lot in self.portfolio.open_lots:
            if lot["Importe_Invertido"] <= 0 or lot["Precio_Compra_Unitario"] <= 0:
                isins_needed.add(lot["ISIN"])

        if not isins_needed:
            return

        logger.info(
            "Rellenando capital invertido para %d ISINs sin importe en órdenes...",
            len(isins_needed),
        )

        # Obtener históricos de NAV en paralelo (un request por ISIN)
        nav_histories: Dict[str, pd.DataFrame] = {}

        def _fetch_history(isin: str) -> tuple[str, pd.DataFrame]:
            try:
                df_hist = self.provider.get_nav_history(isin, years=10)
                if not df_hist.empty and "date" in df_hist.columns:
                    df_hist["date"] = pd.to_datetime(df_hist["date"])
                    df_hist = df_hist.sort_values("date").reset_index(drop=True)
                return isin, df_hist
            except Exception as e:
                logger.warning(
                    "_fill_missing_invested_amounts: error fetching history for %s: %s",
                    isin, e,
                )
                return isin, pd.DataFrame()

        with ThreadPoolExecutor(max_workers=min(len(isins_needed), 8)) as executor:
            futures = {executor.submit(_fetch_history, isin): isin for isin in isins_needed}
            for future in as_completed(futures):
                isin, df_hist = future.result()
                if not df_hist.empty:
                    nav_histories[isin] = df_hist

        # Rellenar cada lote con el NAV de la fecha de compra
        for lot in self.portfolio.open_lots:
            if lot["Importe_Invertido"] > 0 and lot["Precio_Compra_Unitario"] > 0:
                continue

            isin = lot["ISIN"]
            df_hist = nav_histories.get(isin)
            if df_hist is None or df_hist.empty:
                logger.warning(
                    "Sin histórico NAV para %s — no se puede calcular capital invertido.",
                    isin,
                )
                continue

            purchase_date = pd.to_datetime(lot["Fecha"])
            # Buscar el precio más cercano a la fecha de compra (sin ir al futuro)
            mask_before = df_hist["date"] <= purchase_date
            if mask_before.any():
                closest = df_hist.loc[mask_before].iloc[-1]
            else:
                # Si no hay datos anteriores, tomar el primer dato disponible
                closest = df_hist.iloc[0]

            nav_at_purchase = float(closest["price"])
            if nav_at_purchase <= 0:
                logger.warning(
                    "NAV <= 0 para %s en fecha %s — no se actualiza el lote.",
                    isin, purchase_date,
                )
                continue

            units = lot["Participaciones_Iniciales"]
            lot["Precio_Compra_Unitario"] = nav_at_purchase
            lot["Importe_Invertido"] = nav_at_purchase * units
            logger.info(
                "Lote %s @ %s: NAV=%.4f, Capital=%.2f € (calculado desde histórico)",
                isin,
                purchase_date.strftime("%Y-%m-%d"),
                nav_at_purchase,
                lot["Importe_Invertido"],
            )

    # ------------------------------------------------------------------
    # Precios live (con caché en sesión)
    # ------------------------------------------------------------------

    def _fetch_prices(self, isins: Optional[List[str]] = None, force: bool = False) -> Dict[str, float]:
        """Obtiene precios actuales para todos los ISINs del portfolio en paralelo.

        También rellena ``_nav_dates_cache`` con la última fecha de dato NAV de cada ISIN.
        """
        from concurrent.futures import ThreadPoolExecutor, as_completed

        target_isins = [
            isin for isin in (isins or list(self.portfolio.positions.keys()))
            if isin not in self._prices_cache or force
        ]

        def _fetch_one(isin: str) -> tuple[str, float, Optional[str]]:
            try:
                price = self.provider.get_nav(isin)
                nav_date = self.provider.get_nav_date(isin)
                return isin, price if price and price > 0 else 0.0, nav_date
            except Exception as e:
                logger.warning("_fetch_prices: error fetching NAV for %s: %s", isin, e)
                return isin, 0.0, None

        if target_isins:
            with ThreadPoolExecutor(max_workers=min(len(target_isins), 8)) as executor:
                futures = {executor.submit(_fetch_one, isin): isin for isin in target_isins}
                for future in as_completed(futures):
                    isin, price, nav_date = future.result()
                    self._prices_cache[isin] = price
                    self._nav_dates_cache[isin] = nav_date

        return self._prices_cache

    # ------------------------------------------------------------------
    # Posiciones (con P&L)
    # ------------------------------------------------------------------

    def positions(self, live: bool = True) -> pd.DataFrame:
        """
        Devuelve las posiciones actuales con P&L.

        Columnas: ISIN, Fondo, Valor_Actual, Capital_Invertido, Ganancia_Euros,
                  Ganancia_Pct, Participaciones, Precio_Actual, Fecha_NAV
        """
        from concurrent.futures import ThreadPoolExecutor, as_completed
        from datetime import datetime

        prices = self._fetch_prices() if live else {}
        df = self.portfolio.to_dataframe(live_prices=prices)

        if df.empty:
            return df

        # --- Resolver nombres de fondos ---
        # 1) Intentar desde movimientos (sin red)
        mov = self.portfolio.movements
        if not mov.empty and "Fondo" in mov.columns:
            name_map = (
                mov[mov["Fondo"].astype(str).str.upper() != mov["ISIN"].astype(str).str.upper()]
                .groupby("ISIN")["Fondo"]
                .first()
                .to_dict()
            )
            df["Fondo"] = df["ISIN"].map(  # noqa: B023
                lambda x: name_map.get(x, df.loc[df["ISIN"] == x, "Fondo"].iloc[0])
            )

        # 2) Resolver en paralelo los ISINs cuyo nombre sigue siendo el propio ISIN
        import re as _re
        _ISIN_PATTERN = _re.compile(r'^[A-Z]{2}[A-Z0-9]{9}\d$')

        def _looks_like_isin(name: str) -> bool:
            return bool(_ISIN_PATTERN.match(str(name).strip()))

        isins_sin_nombre = [
            row["ISIN"]
            for _, row in df.iterrows()
            if _looks_like_isin(row["Fondo"]) and row["ISIN"] not in self._names_cache
        ]

        def _fetch_name(isin: str) -> tuple[str, str]:
            try:
                info = self.provider.get_fund_info(isin)
                name = info.get("name", isin)
                return isin, name if name and not _looks_like_isin(name) else isin
            except Exception:
                return isin, isin

        if isins_sin_nombre:
            with ThreadPoolExecutor(max_workers=min(len(isins_sin_nombre), 8)) as ex:
                for isin, name in ex.map(_fetch_name, isins_sin_nombre):
                    self._names_cache[isin] = name

        # Aplicar nombres resueltos
        df["Fondo"] = df.apply(
            lambda row: (
                self._names_cache.get(row["ISIN"], row["Fondo"])
                if _looks_like_isin(row["Fondo"])
                else row["Fondo"]
            ),
            axis=1,
        )

        # Columnas en el orden solicitado
        ordered = [
            "ISIN", "Fondo", "Valor_Actual", "Capital_Invertido",
            "Ganancia_Euros", "Ganancia_Pct", "Participaciones",
            "Precio_Actual", "Fecha_NAV",
        ]

        # Última fecha de dato NAV por ISIN (de la caché poblada durante _fetch_prices)
        today_str = datetime.now().strftime("%Y-%m-%d")
        df["Fecha_NAV"] = df["ISIN"].map(
            lambda x: self._nav_dates_cache.get(x) or (today_str if live else None)  # noqa: B023
        )

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

    def _portfolio_weight_map(self) -> dict[str, float]:
        """Devuelve un mapa {nombre_fondo: peso_pct} ordenado por valor actual.

        Usa los precios de caché si están disponibles; en caso contrario devuelve
        pesos uniformes.  "Mi Cartera" (cartera agregada) se fuerza siempre a 0
        para que quede en primer lugar al ordenar descendentemente.
        """
        positions = self.portfolio.positions  # {isin: units}
        if not positions:
            return {}

        total_val = 0.0
        fund_vals: dict[str, float] = {}
        for isin, units in positions.items():
            price = self._prices_cache.get(isin) or 0.0
            val = float(units) * price
            info = self.provider.get_fund_info(isin)
            name = info.get("name", isin) if info else isin
            fund_vals[name] = fund_vals.get(name, 0.0) + val
            total_val += val

        if total_val == 0:
            n = max(len(fund_vals), 1)
            return {name: 100.0 / n for name in fund_vals}

        return {name: val / total_val * 100 for name, val in fund_vals.items()}

    def history(self, isins: Optional[List[str]] = None, years: int = 3) -> pd.DataFrame:
        """Histórico de precios como DataFrame con columnas [date, Fondo1, Fondo2, ...].

        Las columnas se ordenan por peso en la cartera (mayor peso primero).
        Si el histórico incluye una columna con "cartera" en el nombre se coloca
        siempre la primera.

        Args:
            isins: lista de ISINs. Si None, usa todos los del portfolio.
            years: años de historia a obtener.
        """
        target = isins or list(self.portfolio.positions.keys())
        frames = {}
        for isin in target:
            df = self.provider.get_nav_history(isin, years=years)
            if not df.empty:
                info = self.provider.get_fund_info(isin)
                name = info.get("name", isin) if info else isin
                df = df.set_index("date")["price"].rename(name)
                frames[name] = df

        if not frames:
            return pd.DataFrame()

        result = pd.concat(frames.values(), axis=1, join="outer")
        result = result.sort_index().ffill()
        result.index.name = "date"
        df_out = result.reset_index()

        # ── Ordenar columnas por peso en cartera ──────────────────────────
        weight_map = self._portfolio_weight_map()
        date_col = df_out.columns[0]
        price_cols = [c for c in df_out.columns if c != date_col]

        def _col_sort_key(col: str) -> tuple[float, str]:
            if "cartera" in col.lower():
                return (-9999.0, col)
            return (-weight_map.get(col, 0.0), col)

        sorted_cols = sorted(price_cols, key=_col_sort_key)
        return df_out[[date_col] + sorted_cols]

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
    # Métricas de evolución por fondo (Alpha, Beta, Sharpe, CAGR…)
    # ------------------------------------------------------------------

    def evolution_metrics(
        self,
        years: int = 5,
        risk_free_annual: float = 0.03,
        benchmark_isin: str | None = None,
    ) -> pd.DataFrame:
        """Métricas calculadas a partir del histórico de precios, por fondo.

        Calcula Rentabilidad Total, CAGR, Volatilidad Anualizada, Sharpe,
        Alpha Anualizado y Beta respecto a un benchmark (por defecto el primer
        fondo con "cartera" en el nombre, o el de mayor peso en cartera).

        Args:
            years: ventana histórica en años.
            risk_free_annual: tasa libre de riesgo anual (por defecto 3 %).
            benchmark_isin: ISIN del benchmark explícito.  Si ``None`` se
                usa la columna de cartera agregada o el fondo de mayor peso.

        Returns:
            DataFrame con columnas:
            Fondo, Rentab_Total_Pct, CAGR_Pct, Volatilidad_Pct,
            Sharpe, Alpha_Pct, Beta, Peso_Cartera_Pct

        Los fondos se ordenan por ``Peso_Cartera_Pct`` descendente
        ("Mi Cartera" primero si existe).
        """
        n_trading = 252
        rf_daily = (1 + risk_free_annual) ** (1 / n_trading) - 1

        # Obtener histórico ya ordenado por peso
        if benchmark_isin:
            isins = list(self.portfolio.positions.keys())
            if benchmark_isin not in isins:
                isins = [benchmark_isin] + isins
            df_hist = self.history(isins=isins, years=years)
        else:
            df_hist = self.history(years=years)

        if df_hist.empty:
            return pd.DataFrame(columns=[
                "Fondo", "Rentab_Total_Pct", "CAGR_Pct", "Volatilidad_Pct",
                "Sharpe", "Alpha_Pct", "Beta", "Peso_Cartera_Pct",
            ])

        date_col = df_hist.columns[0]
        price_cols = [c for c in df_hist.columns if c != date_col]

        # Identificar columna de benchmark
        if benchmark_isin:
            info = self.provider.get_fund_info(benchmark_isin)
            bm_col = info.get("name", benchmark_isin) if info else benchmark_isin
            bm_col = bm_col if bm_col in price_cols else price_cols[0]
        else:
            bm_col = next(
                (c for c in price_cols if "cartera" in c.lower()),
                price_cols[0],
            )

        returns = df_hist.set_index(date_col)[price_cols].pct_change().dropna(how="all")
        bm_returns = returns[bm_col].dropna()
        weight_map = self._portfolio_weight_map()

        records = []
        for col in price_cols:
            r = returns[col].dropna()
            if len(r) < 30:
                continue

            total_ret = ((1 + r).prod() - 1) * 100
            n_years = len(r) / n_trading
            cagr = ((1 + total_ret / 100) ** (1 / max(n_years, 1e-9)) - 1) * 100
            vol = r.std() * (n_trading ** 0.5) * 100
            mean_excess = r.mean() - rf_daily
            sharpe = (mean_excess / r.std() * (n_trading ** 0.5)) if r.std() > 0 else float("nan")

            # Alpha & Beta vs benchmark
            common = r.index.intersection(bm_returns.index)
            if len(common) >= 30 and col != bm_col:
                bm_r = bm_returns.loc[common]
                f_r = r.loc[common]
                var_bm = bm_r.var()
                beta = float(f_r.cov(bm_r) / var_bm) if var_bm > 0 else float("nan")
                alpha_daily = (
                    float(f_r.mean() - beta * bm_r.mean())
                    if not (isinstance(beta, float) and beta != beta)  # isnan check
                    else float("nan")
                )
                alpha = alpha_daily * n_trading * 100
            else:
                beta = float("nan")
                alpha = float("nan")

            records.append({
                "Fondo": col,
                "Rentab_Total_Pct": round(total_ret, 2),
                "CAGR_Pct": round(cagr, 2),
                "Volatilidad_Pct": round(vol, 2),
                "Sharpe": round(sharpe, 3) if sharpe == sharpe else float("nan"),
                "Alpha_Pct": round(alpha, 2) if alpha == alpha else float("nan"),
                "Beta": round(beta, 3) if beta == beta else float("nan"),
                "Peso_Cartera_Pct": round(weight_map.get(col, 0.0), 2),
            })

        df = pd.DataFrame(records)
        # Ordenar: "cartera" primero, luego por peso descendente
        cartera_mask = df["Fondo"].str.lower().str.contains("cartera", na=False)
        df_cartera = df[cartera_mask]
        df_rest = df[~cartera_mask].sort_values("Peso_Cartera_Pct", ascending=False)
        df = pd.concat([df_cartera, df_rest], ignore_index=True)

        # Añadir info del benchmark como atributo
        df.attrs["benchmark"] = bm_col
        df.attrs["risk_free_annual"] = risk_free_annual
        df.attrs["years"] = years
        return df

    # ------------------------------------------------------------------
    # Asset Allocation (para gráfico de tarta)
    # ------------------------------------------------------------------

    def asset_allocation(self) -> pd.DataFrame:
        """Devuelve la distribución de activos del portfolio.

        Columnas: Tipo, Valor, Peso_Pct

        Tipos: Renta Variable, Renta Fija, Liquidez, Alternativo.
        """
        summ = self.summary()
        if summ.empty:
            return pd.DataFrame(columns=["Tipo", "Valor", "Peso_Pct"])
        return summ[["Tipo", "Valor_Actual", "Peso_Pct"]].rename(
            columns={"Valor_Actual": "Valor"}
        )

    # ------------------------------------------------------------------
    # Exposición sectorial agregada
    # ------------------------------------------------------------------

    def sector_exposure(self) -> pd.DataFrame:
        """Pesos sectoriales agregados del portfolio ponderados por valor.

        Columnas: Sector, Peso_Pct
        """
        from .services.region_normalizer import normalize_sectors

        pos = self.positions(live=True)
        if pos.empty:
            return pd.DataFrame(columns=["Sector", "Peso_Pct"])

        total_val = pos["Valor_Actual"].sum() if pos["Valor_Actual"].notna().any() else pos["Capital_Invertido"].sum()
        sector_agg: dict[str, float] = {}

        for _, row in pos.iterrows():
            isin = row["ISIN"]
            sectors_raw = self.provider.get_sector_weights(isin) or {}
            sectors = normalize_sectors({k: float(v) for k, v in sectors_raw.items()})
            valor = row.get("Valor_Actual") or row.get("Capital_Invertido") or 0
            fund_weight = valor / total_val if total_val > 0 else 0

            for sector, pct in sectors.items():
                sector_agg[sector] = sector_agg.get(sector, 0) + pct * fund_weight

        rows = [{"Sector": k, "Peso_Pct": round(v, 4)} for k, v in sector_agg.items()]
        df = pd.DataFrame(rows).sort_values("Peso_Pct", ascending=False).reset_index(drop=True)
        return df

    # ------------------------------------------------------------------
    # Exposición regional agregada
    # ------------------------------------------------------------------

    def region_exposure(self) -> pd.DataFrame:
        """Pesos regionales agregados del portfolio ponderados por valor.

        Columnas: Region, Peso_Pct
        """
        from .services.region_normalizer import normalize_regions

        pos = self.positions(live=True)
        if pos.empty:
            return pd.DataFrame(columns=["Region", "Peso_Pct"])

        total_val = pos["Valor_Actual"].sum() if pos["Valor_Actual"].notna().any() else pos["Capital_Invertido"].sum()
        region_agg: dict[str, float] = {}

        for _, row in pos.iterrows():
            isin = row["ISIN"]
            regions_raw = self.provider.get_country_weights(isin) or {}
            regions = normalize_regions({k: float(v) for k, v in regions_raw.items()})
            valor = row.get("Valor_Actual") or row.get("Capital_Invertido") or 0
            fund_weight = valor / total_val if total_val > 0 else 0

            for region, pct in regions.items():
                region_agg[region] = region_agg.get(region, 0) + pct * fund_weight

        rows = [{"Region": k, "Peso_Pct": round(v, 4)} for k, v in region_agg.items()]
        df = pd.DataFrame(rows).sort_values("Peso_Pct", ascending=False).reset_index(drop=True)
        return df

    # ------------------------------------------------------------------
    # Métricas por fondo
    # ------------------------------------------------------------------

    def fund_characteristics(self) -> pd.DataFrame:
        """Características estáticas por fondo: rating, estrellas y TER.

        Columnas: ISIN, Fondo, Estrellas_MS, Rating_Riesgo, TER

        Estas columnas son constantes en el tiempo y no dependen del período
        de análisis elegido.
        """
        pos = self.positions(live=True)
        if pos.empty:
            return pd.DataFrame(columns=["ISIN", "Fondo", "Estrellas_MS", "Rating_Riesgo", "TER"])

        rows = []
        for _, row in pos.iterrows():
            isin = row["ISIN"]
            info = self.provider.get_fund_info(isin) or {}
            name = info.get("name", row.get("Fondo", isin))
            rows.append({
                "ISIN": isin,
                "Fondo": name,
                "Estrellas_MS": (
                    info.get("overallMorningstarRating")
                    or info.get("rating_morningstar")
                    or info.get("rating_morningstar_rating")
                ),
                "Rating_Riesgo": (
                    info.get("morningstar_risk_rating")
                    or info.get("srri")
                ),
                "TER": (
                    info.get("total_expense_ratio")
                    or info.get("ongoing_charge")
                    or info.get("ter")
                ),
            })

        return pd.DataFrame(rows)

    def fund_metrics(self) -> pd.DataFrame:
        """Métricas de rendimiento/riesgo por fondo y período temporal.

        Columnas: ISIN, Fondo,
                  Rent_1Y, Rent_3Y, Rent_5Y, Rent_10Y,
                  Vol_1Y,  Vol_3Y,  Vol_5Y,  Vol_10Y,
                  MaxCaida_1Y, MaxCaida_3Y, MaxCaida_5Y, MaxCaida_10Y,
                  Alpha_1Y, Alpha_3Y, Alpha_5Y, Alpha_10Y,
                  Beta_1Y,  Beta_3Y,  Beta_5Y,  Beta_10Y,
                  Sharpe_1Y, Sharpe_3Y, Sharpe_5Y, Sharpe_10Y

        Las métricas provienen de Finect (``stats.annualizedReturn``,
        ``stats.standardDeviation``, ``stats.maxDrawdown``, ``stats.alpha``,
        ``stats.beta``, ``stats.sharpeRatio``) desglosadas por período M12/M36/M60/M120.
        """
        _PERIODS = ("1y", "3y", "5y", "10y")
        _METRIC_MAP = {
            "Rent":     "annualized_return",
            "Vol":      "standard_deviation",
            "MaxCaida": "max_drawdown",
            "Alpha":    "alpha",
            "Beta":     "beta",
            "Sharpe":   "sharpe_ratio",
        }

        # Build ordered column list
        cols = ["ISIN", "Fondo"]
        for label in _METRIC_MAP:
            for p in _PERIODS:
                cols.append(f"{label}_{p.upper()}")

        pos = self.positions(live=True)
        if pos.empty:
            return pd.DataFrame(columns=cols)

        rows = []
        for _, row in pos.iterrows():
            isin = row["ISIN"]
            info = self.provider.get_fund_info(isin) or {}
            name = info.get("name", row.get("Fondo", isin))

            r: dict = {"ISIN": isin, "Fondo": name}
            for label, info_key in _METRIC_MAP.items():
                for p in _PERIODS:
                    col = f"{label}_{p.upper()}"
                    r[col] = info.get(f"{info_key}_{p}")
            rows.append(r)

        return pd.DataFrame(rows, columns=cols)

    # ------------------------------------------------------------------
    # Comparación con benchmark
    # ------------------------------------------------------------------

    def benchmark_comparison(
        self,
        benchmark_isin: str = "IE00B4L5Y983",
    ) -> dict[str, pd.DataFrame]:
        """Compara sectores y regiones del portfolio vs un benchmark.

        Args:
            benchmark_isin: ISIN del benchmark (por defecto MSCI World).

        Returns:
            Dict con claves ``sectors`` y ``regions``, cada una un DataFrame
            con columnas [Nombre, Mi_Cartera, Benchmark].
        """
        from .services.region_normalizer import normalize_regions, normalize_sectors

        # Portfolio exposure
        sector_df = self.sector_exposure()
        region_df = self.region_exposure()

        portfolio_sectors = dict(zip(sector_df["Sector"], sector_df["Peso_Pct"])) if not sector_df.empty else {}
        portfolio_regions = dict(zip(region_df["Region"], region_df["Peso_Pct"])) if not region_df.empty else {}

        # Benchmark exposure
        bench_sectors_raw = self.provider.get_sector_weights(benchmark_isin) or {}
        bench_regions_raw = self.provider.get_country_weights(benchmark_isin) or {}
        bench_sectors = normalize_sectors({k: float(v) for k, v in bench_sectors_raw.items()})
        bench_regions = normalize_regions({k: float(v) for k, v in bench_regions_raw.items()})

        # Build sector comparison
        all_sectors = sorted(set(list(portfolio_sectors.keys()) + list(bench_sectors.keys())))
        sector_rows = [
            {"Nombre": s, "Mi_Cartera": portfolio_sectors.get(s, 0), "Benchmark": bench_sectors.get(s, 0)}
            for s in all_sectors
        ]
        df_sectors = pd.DataFrame(sector_rows).sort_values("Mi_Cartera", ascending=False).reset_index(drop=True)

        # Build region comparison
        all_regions = sorted(set(list(portfolio_regions.keys()) + list(bench_regions.keys())))
        region_rows = [
            {"Nombre": r, "Mi_Cartera": portfolio_regions.get(r, 0), "Benchmark": bench_regions.get(r, 0)}
            for r in all_regions
        ]
        df_regions = pd.DataFrame(region_rows).sort_values("Mi_Cartera", ascending=False).reset_index(drop=True)

        return {"sectors": df_sectors, "regions": df_regions}

    # ------------------------------------------------------------------
    # Simulación de incorporación
    # ------------------------------------------------------------------

    def simulate_addition(
        self,
        isin: str,
        amount: float,
    ) -> dict[str, pd.DataFrame]:
        """Simula incorporar ``amount`` € en el fondo ``isin``.

        Returns:
            Dict con:
            - ``weights``: DataFrame [ISIN, Fondo, Peso_Actual, Peso_Simulado]
            - ``metrics``: DataFrame [Metrica, Actual, Simulado, Diferencia]
            - ``metadata``: dict con added_name, current_total, simulated_total
        """
        from .services.portfolio_service import simulate_addition as _sim

        result = _sim(isin, amount)

        # Weights DataFrame
        funds = result.get("funds", [])
        weight_rows = [
            {
                "ISIN": f["isin"],
                "Fondo": f["name"],
                "Peso_Actual": f.get("current_weight", 0),
                "Peso_Simulado": f.get("simulated_weight", 0),
            }
            for f in funds
        ]
        df_weights = pd.DataFrame(weight_rows).sort_values(
            "Peso_Simulado", ascending=False
        ).reset_index(drop=True)

        # Metrics comparison DataFrame
        cur_m = result.get("current_portfolio_metrics", {})
        sim_m = result.get("simulated_portfolio_metrics", {})
        all_keys = sorted(set(list(cur_m.keys()) + list(sim_m.keys())))
        metric_rows = []
        for key in all_keys:
            cur_v = cur_m.get(key)
            sim_v = sim_m.get(key)
            diff = None
            if isinstance(cur_v, (int, float)) and isinstance(sim_v, (int, float)):
                diff = round(sim_v - cur_v, 4)
            metric_rows.append({
                "Metrica": key,
                "Actual": cur_v,
                "Simulado": sim_v,
                "Diferencia": diff,
            })
        df_metrics = pd.DataFrame(metric_rows)

        return {
            "weights": df_weights,
            "metrics": df_metrics,
            "metadata": {
                "added_name": result.get("added_name", isin),
                "current_total": result.get("current_total", 0),
                "simulated_total": result.get("simulated_total", 0),
            },
        }

    # ------------------------------------------------------------------
    # Diagnóstico de datos
    # ------------------------------------------------------------------

    def diagnostics(self, years: int = 3) -> pd.DataFrame:
        """Diagnóstico de cobertura de datos por fondo.

        Columnas: ISIN, Fondo, Puntos_NAV, Desde, Hasta, Num_Sectores,
                  Num_Regiones, Tiene_TER, Tiene_Sharpe, Estado
        """
        pos = self.positions(live=True)
        if pos.empty:
            return pd.DataFrame()

        rows = []
        for _, row in pos.iterrows():
            isin = row["ISIN"]
            info = self.provider.get_fund_info(isin) or {}
            name = info.get("name", row.get("Fondo", isin))

            # NAV history coverage
            nav_df = self.provider.get_nav_history(isin, years=years)
            n_points = len(nav_df) if not nav_df.empty else 0
            if n_points > 0:
                first_date = nav_df["date"].min()
                last_date = nav_df["date"].max()
            else:
                first_date = last_date = None

            # Detail coverage
            sectors = self.provider.get_sector_weights(isin) or {}
            regions = self.provider.get_country_weights(isin) or {}

            has_ter = bool(info.get("total_expense_ratio") or info.get("ongoing_charge"))
            has_sharpe = bool(info.get("sharperatio"))

            if n_points >= 60:
                estado = "OK"
            elif n_points > 0:
                estado = "Poco historial"
            else:
                estado = "Sin datos"

            rows.append({
                "ISIN": isin,
                "Fondo": name,
                "Puntos_NAV": n_points,
                "Desde": first_date,
                "Hasta": last_date,
                "Num_Sectores": len(sectors),
                "Num_Regiones": len(regions),
                "Tiene_TER": has_ter,
                "Tiene_Sharpe": has_sharpe,
                "Estado": estado,
            })

        return pd.DataFrame(rows).sort_values("Puntos_NAV").reset_index(drop=True)

    # ------------------------------------------------------------------
    # Representación
    # ------------------------------------------------------------------

    def __repr__(self) -> str:
        return f"PortfolioClient({self.portfolio})"

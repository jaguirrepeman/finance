"""
client_async.py — Core async del PortfolioClient.

Contiene toda la lógica de orquestación de datos como métodos ``async``.
El ``PortfolioClient`` (facade sync) en ``client.py`` delegará a esta clase.

Uso directo (FastAPI endpoints):
    client = AsyncPortfolioCore(portfolio, provider, cache)
    df = await client.positions(live=True)

Uso indirecto (notebooks via sync facade):
    # Ver client.py — PortfolioClient envuelve en asyncio.run()
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from .services.cache_store import CacheStore, TTL_NAV_HISTORY
from .services.core_portfolio import Portfolio
from .services.data_providers import CompositeAsyncProvider
from .services.fund_classifier import FundType, classify_fund, is_index_fund
from .services.tax_calculator import TaxOptimizer

logger = logging.getLogger(__name__)


class AsyncPortfolioCore:
    """Core async de la lógica del PortfolioClient.

    Todos los métodos que hacen I/O son ``async def``.
    Los métodos puramente CPU (transform DataFrames) son ``def``.
    """

    def __init__(
        self,
        portfolio: Portfolio,
        provider: CompositeAsyncProvider,
        cache: CacheStore,
    ) -> None:
        self.portfolio = portfolio
        self.provider = provider
        self.cache = cache

    # ------------------------------------------------------------------
    # Posiciones (con P&L)
    # ------------------------------------------------------------------

    async def positions(self, live: bool = True) -> pd.DataFrame:
        """Posiciones actuales con P&L calculado.

        Columnas: ISIN, Fondo, Valor_Actual, Capital_Invertido, Ganancia_Euros,
                  Ganancia_Pct, Participaciones, Precio_Actual, Fecha_NAV
        """
        isins = list(self.portfolio.positions.keys())
        if not isins:
            return pd.DataFrame(columns=[
                "ISIN", "Fondo", "Valor_Actual", "Capital_Invertido",
                "Ganancia_Euros", "Ganancia_Pct", "Participaciones",
                "Precio_Actual", "Fecha_NAV",
            ])

        # Fetch precios y fechas en paralelo
        if live:
            prices = await self.provider.get_nav_batch(isins)
            nav_dates = await self.provider.get_nav_dates_batch(isins)
        else:
            prices = {}
            nav_dates = {}

        # Construir DataFrame desde open_lots
        df = self.portfolio.to_dataframe(live_prices=prices)
        if df.empty:
            return df

        # Resolver nombres en paralelo
        isins_need_name = []
        mov = self.portfolio.movements
        name_from_mov: Dict[str, str] = {}
        if not mov.empty and "Fondo" in mov.columns:
            name_from_mov = (
                mov[mov["Fondo"].astype(str).str.upper() != mov["ISIN"].astype(str).str.upper()]
                .groupby("ISIN")["Fondo"]
                .first()
                .to_dict()
            )

        import re
        _ISIN_PATTERN = re.compile(r'^[A-Z]{2}[A-Z0-9]{9}\d$')

        for isin in isins:
            name = name_from_mov.get(isin)
            if isinstance(name, str) and name and not _ISIN_PATTERN.match(name.strip()):
                continue
            isins_need_name.append(isin)

        # Fetch nombres desconocidos
        resolved_names = {}
        if isins_need_name:
            resolved_names = await self.provider.resolve_names_batch(isins_need_name)

        # Aplicar nombres
        def _get_name(isin: str) -> str:
            if isin in name_from_mov:
                n = name_from_mov[isin]
                if isinstance(n, str) and n and not _ISIN_PATTERN.match(n.strip()):
                    return n
            if isin in resolved_names:
                return resolved_names[isin]
            return isin

        df["Fondo"] = df["ISIN"].map(_get_name)

        # Fecha NAV
        today_str = datetime.now().strftime("%Y-%m-%d")
        df["Fecha_NAV"] = df["ISIN"].map(
            lambda x: nav_dates.get(x) or (today_str if live else None)
        )

        ordered = [
            "ISIN", "Fondo", "Valor_Actual", "Capital_Invertido",
            "Ganancia_Euros", "Ganancia_Pct", "Participaciones",
            "Precio_Actual", "Fecha_NAV",
        ]
        for col in ordered:
            if col not in df.columns:
                df[col] = None

        return df[ordered].reset_index(drop=True)

    # ------------------------------------------------------------------
    # Rellenar capital invertido faltante
    # ------------------------------------------------------------------

    async def fill_missing_invested_amounts(self) -> None:
        """Rellena Importe_Invertido en lotes donde no se dispone del dato."""
        import asyncio

        isins_needed: set = set()
        for lot in self.portfolio.open_lots:
            if lot["Importe_Invertido"] <= 0 or lot["Precio_Compra_Unitario"] <= 0:
                isins_needed.add(lot["ISIN"])

        if not isins_needed:
            return

        logger.info("Rellenando capital invertido para %d ISINs...", len(isins_needed))

        # Fetch historiales en paralelo
        async def _fetch(isin: str):
            df_hist = await self.provider.get_nav_history(isin, years=10)
            if not df_hist.empty and "date" in df_hist.columns:
                df_hist["date"] = pd.to_datetime(df_hist["date"])
                df_hist = df_hist.sort_values("date").reset_index(drop=True)
            return isin, df_hist

        results = await asyncio.gather(*[_fetch(isin) for isin in isins_needed])
        nav_histories = {isin: df for isin, df in results if not df.empty}

        # Rellenar lotes
        for lot in self.portfolio.open_lots:
            if lot["Importe_Invertido"] > 0 and lot["Precio_Compra_Unitario"] > 0:
                continue

            isin = lot["ISIN"]
            df_hist = nav_histories.get(isin)
            if df_hist is None or df_hist.empty:
                continue

            purchase_date = pd.to_datetime(lot["Fecha"])
            mask_before = df_hist["date"] <= purchase_date
            if mask_before.any():
                closest = df_hist.loc[mask_before].iloc[-1]
            else:
                closest = df_hist.iloc[0]

            nav_at_purchase = float(closest["price"])
            if nav_at_purchase <= 0:
                continue

            units = lot["Participaciones_Iniciales"]
            lot["Precio_Compra_Unitario"] = nav_at_purchase
            lot["Importe_Invertido"] = nav_at_purchase * units

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------

    async def summary(self) -> pd.DataFrame:
        """Resumen del portfolio agrupado por tipo de activo."""
        pos = await self.positions(live=True)
        if pos.empty:
            return pd.DataFrame(columns=["Tipo", "Num_Fondos", "Capital_Invertido", "Valor_Actual", "Peso_Pct"])

        # Clasificar fondos en paralelo
        import asyncio

        async def _classify(isin: str) -> tuple:
            info = await self.provider.get_fund_info(isin)
            return isin, classify_fund(info=info)

        results = await asyncio.gather(*[_classify(isin) for isin in pos["ISIN"]])
        tipo_map = {isin: ft.value for isin, ft in results}

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
    # History
    # ------------------------------------------------------------------

    async def history(self, isins: Optional[List[str]] = None, years: int = 3) -> pd.DataFrame:
        """Histórico de precios como DataFrame [date, Fondo1, Fondo2, ...]."""
        import asyncio

        target = isins or list(self.portfolio.positions.keys())

        async def _fetch_one(isin: str) -> tuple:
            df = await self.provider.get_nav_history(isin, years=years)
            if df.empty:
                return isin, None
            info = await self.provider.get_fund_info(isin)
            name = info.get("name", isin) if info else isin
            return name, df.set_index("date")["price"].rename(name)

        results = await asyncio.gather(*[_fetch_one(isin) for isin in target])
        frames = {name: series for name, series in results if series is not None}

        if not frames:
            return pd.DataFrame()

        result = pd.concat(frames.values(), axis=1, join="outer")
        result = result.sort_index().ffill()
        result.index.name = "date"
        df_out = result.reset_index()

        # Ordenar columnas por peso
        weight_map = await self._portfolio_weight_map()
        date_col = df_out.columns[0]
        price_cols = [c for c in df_out.columns if c != date_col]

        def _col_sort_key(col: str) -> tuple:
            if "cartera" in col.lower():
                return (-9999.0, col)
            return (-weight_map.get(col, 0.0), col)

        sorted_cols = sorted(price_cols, key=_col_sort_key)
        return df_out[[date_col] + sorted_cols]

    async def _portfolio_weight_map(self) -> Dict[str, float]:
        """Mapa {nombre_fondo: peso_pct}."""
        positions = self.portfolio.positions
        if not positions:
            return {}

        # Usar NAVs recientes del cache si disponible
        prices = await self.provider.get_nav_batch(list(positions.keys()))
        names = await self.provider.resolve_names_batch(list(positions.keys()))

        total_val = 0.0
        fund_vals: Dict[str, float] = {}
        for isin, units in positions.items():
            price = prices.get(isin, 0.0)
            val = float(units) * price
            name = names.get(isin, isin)
            fund_vals[name] = fund_vals.get(name, 0.0) + val
            total_val += val

        if total_val == 0:
            n = max(len(fund_vals), 1)
            return {name: 100.0 / n for name in fund_vals}

        return {name: val / total_val * 100 for name, val in fund_vals.items()}

    # ------------------------------------------------------------------
    # Correlation
    # ------------------------------------------------------------------

    async def correlation(self, isins: Optional[List[str]] = None, years: int = 3) -> pd.DataFrame:
        """Matriz de correlación de Pearson entre fondos."""
        hist = await self.history(isins=isins, years=years)
        if hist.empty or len(hist.columns) < 3:
            return pd.DataFrame()
        numeric = hist.drop(columns=["date"]).pct_change().dropna()
        return numeric.corr().round(4)

    # ------------------------------------------------------------------
    # Enrich
    # ------------------------------------------------------------------

    async def enrich(self, isins: Optional[List[str]] = None) -> pd.DataFrame:
        """Enriquece fondos con datos detallados (paralelo)."""
        import asyncio

        target = isins or list(self.portfolio.positions.keys())

        async def _enrich_one(isin: str) -> Dict:
            price = await self.provider.get_nav(isin)
            info = await self.provider.get_fund_info(isin) or {}
            sectors = await self.provider.get_sector_weights(isin) or {}
            countries = await self.provider.get_country_weights(isin) or {}

            rv_pct = sum(v for k, v in sectors.items() if "bond" not in k.lower()) if sectors else None
            rf_pct = sum(v for k, v in sectors.items() if "bond" in k.lower()) if sectors else None
            usa_pct = countries.get("United States", countries.get("northAmerica", 0))
            eur_pct = sum(
                v for k, v in countries.items()
                if k.lower() in ["united kingdom", "germany", "france", "europe developed", "eurozone"]
            )

            return {
                "ISIN": isin,
                "Nombre": info.get("name", isin),
                "Precio_Actual": price or 0.0,
                "Expense_Ratio": info.get("expense_ratio") or info.get("total_expense_ratio"),
                "AUM": info.get("aum") or info.get("total_net_asset"),
                "Rating_MS": info.get("overallMorningstarRating") or info.get("rating_morningstar"),
                "Risk_Score": info.get("riskScore") or info.get("srri"),
                "Gestora": info.get("management_company"),
                "Renta_Variable_Pct": rv_pct,
                "Renta_Fija_Pct": rf_pct,
                "EEUU_Pct": usa_pct or 0,
                "Europa_Pct": eur_pct or 0,
                "Source": info.get("source", "Unknown"),
            }

        results = await asyncio.gather(*[_enrich_one(isin) for isin in target])
        return pd.DataFrame(results)

    # ------------------------------------------------------------------
    # Tax Optimization
    # ------------------------------------------------------------------

    async def tax_optimize(self, target_amount: float) -> pd.DataFrame:
        """Plan de retirada fiscal óptimo."""
        isins = list(self.portfolio.positions.keys())
        prices = await self.provider.get_nav_batch(isins)
        optimizer = TaxOptimizer(self.portfolio, prices=prices)
        plan = optimizer.optimize_withdrawal(target_amount)

        rows = plan.get("plan", [])
        if not rows:
            return pd.DataFrame(columns=[
                "ISIN", "Fondo", "Fecha_Compra", "Participaciones_Vendidas",
                "Importe_Retirado", "Ganancia_Patrimonial",
            ])

        df = pd.DataFrame(rows)

        # ── Enriquecer nombres de fondo ──────────────────────────────────────
        import re as _re
        _ISIN_RE = _re.compile(r'^[A-Z]{2}[A-Z0-9]{9}\d$')
        mov = self.portfolio.movements
        name_from_mov: Dict[str, str] = {}
        if not mov.empty and "Fondo" in mov.columns:
            name_from_mov = (
                mov[mov["Fondo"].astype(str).str.upper() != mov["ISIN"].astype(str).str.upper()]
                .groupby("ISIN")["Fondo"]
                .first()
                .to_dict()
            )

        isins_need_name = [
            isin for isin in isins
            if not (name_from_mov.get(isin) and not _ISIN_RE.match(name_from_mov[isin].strip()))
        ]
        resolved: Dict[str, str] = {}
        if isins_need_name:
            resolved = await self.provider.resolve_names_batch(isins_need_name)

        def _name(isin: str) -> str:
            n = name_from_mov.get(isin, "")
            if n and not _ISIN_RE.match(n.strip()):
                return n
            return resolved.get(isin, isin)

        df["Fondo"] = df["ISIN"].map(_name)
        # ────────────────────────────────────────────────────────────────────

        totals = pd.DataFrame([{
            "ISIN": "── TOTAL ──",
            "Fondo": "",
            "Fecha_Compra": None,
            "Participaciones_Vendidas": df["Participaciones_Vendidas"].sum(),
            "Importe_Retirado": plan["withdrawn_amount"],
            "Ganancia_Patrimonial": plan["total_capital_gain"],
        }])
        df = pd.concat([df, totals], ignore_index=True)

        df.attrs["target_amount"] = plan["target_amount"]
        df.attrs["withdrawn_amount"] = plan["withdrawn_amount"]
        df.attrs["total_capital_gain"] = plan["total_capital_gain"]
        df.attrs["estimated_tax"] = plan["estimated_tax"]
        df.attrs["net_amount"] = plan["net_amount"]
        return df

    async def optimize_withdrawal_via_traspaso(
        self,
        target_amount: float,
    ) -> Dict[str, Any]:
        """
        Planifica la retirada óptima usando traspasos previos para minimizar IRPF.

        Algoritmo greedy global (óptimo para impuesto convexo):
          - Ordena TODOS los lotes de cartera por plusvalía% ascendente.
          - Selecciona los lotes más baratos para reembolso.
          - Los lotes FIFO-anteriores del mismo fondo van a traspaso (exento).
          - Elige el mejor fondo destino (indexado existente en cartera o sugerencia).

        Args:
            target_amount: Cantidad en € que se desea retirar en efectivo.

        Returns:
            Dict con escenarios directo/optimizado, ahorro fiscal y planes detallados.
        """
        import asyncio as _asyncio
        import re as _re
        _ISIN_RE = _re.compile(r'^[A-Z]{2}[A-Z0-9]{9}\d$')

        isins = list(self.portfolio.positions.keys())
        prices = await self.provider.get_nav_batch(isins)

        # ── Resolver nombres ──
        mov = self.portfolio.movements
        name_from_mov: Dict[str, str] = {}
        if not mov.empty and "Fondo" in mov.columns:
            name_from_mov = (
                mov[mov["Fondo"].astype(str).str.upper() != mov["ISIN"].astype(str).str.upper()]
                .groupby("ISIN")["Fondo"]
                .first()
                .to_dict()
            )
        isins_need_name = [
            i for i in isins
            if not (name_from_mov.get(i) and not _ISIN_RE.match(name_from_mov[i].strip()))
        ]
        resolved: Dict[str, str] = {}
        if isins_need_name:
            resolved = await self.provider.resolve_names_batch(isins_need_name)

        def _name(isin: str) -> str:
            n = name_from_mov.get(isin, "")
            if n and not _ISIN_RE.match(n.strip()):
                return n
            return resolved.get(isin, isin)

        # ── Construir fund_meta para selección de destino ──
        # Clasificar fondos en paralelo (is_index)
        from .services.fund_classifier import is_index_fund as _is_index

        async def _get_meta(isin: str):
            try:
                info = await self.provider.get_fund_info(isin) or {}
                name = _name(isin)
                idx = _is_index(info=info, name=name)
                return isin, {"name": name, "is_index": idx}
            except Exception:
                return isin, {"name": _name(isin), "is_index": False}

        meta_results = await _asyncio.gather(*[_get_meta(i) for i in isins])
        fund_meta: Dict[str, Dict] = dict(meta_results)

        # ── Enriquecer nombres en lotes abiertos ──
        for lot in self.portfolio.open_lots:
            isin = lot["ISIN"]
            if isin in fund_meta:
                lot["Fondo"] = fund_meta[isin]["name"]

        # ── Ejecutar optimizador ──
        optimizer = TaxOptimizer(self.portfolio, prices=prices, fund_meta=fund_meta)
        return optimizer.optimize_withdrawal_via_traspaso(target_amount)

    async def traspaso_analysis(self) -> List[Dict[str, Any]]:
        """
        Análisis de optimización mediante traspasos entre fondos de inversión.

        Los traspasos entre fondos de inversión (IICs) están regulados en el
        Art. 94 Ley 35/2006 del IRPF: el reembolso e inmediata suscripción en otro
        fondo de inversión no tributa; la plusvalía latente se difiere hasta la
        venta definitiva. No aplica a ETFs, acciones ni planes de pensiones.

        Returns:
            Lista de dicts por ISIN con:
                isin, nombre, valor_actual, capital_invertido,
                plusvalia_latente, plusvalia_pct,
                impuesto_si_vendes, ahorro_traspaso,
                num_lotes, cualifica_traspaso
        """
        isins = list(self.portfolio.positions.keys())
        if not isins:
            return []

        prices = await self.provider.get_nav_batch(isins)

        # Resolver nombres
        import re as _re
        _ISIN_RE = _re.compile(r'^[A-Z]{2}[A-Z0-9]{9}\d$')
        mov = self.portfolio.movements
        name_from_mov: Dict[str, str] = {}
        if not mov.empty and "Fondo" in mov.columns:
            name_from_mov = (
                mov[mov["Fondo"].astype(str).str.upper() != mov["ISIN"].astype(str).str.upper()]
                .groupby("ISIN")["Fondo"]
                .first()
                .to_dict()
            )
        isins_need_name = [
            i for i in isins
            if not (name_from_mov.get(i) and not _ISIN_RE.match(name_from_mov[i].strip()))
        ]
        resolved: Dict[str, str] = {}
        if isins_need_name:
            resolved = await self.provider.resolve_names_batch(isins_need_name)

        def _name(isin: str) -> str:
            n = name_from_mov.get(isin, "")
            if n and not _ISIN_RE.match(n.strip()):
                return n
            return resolved.get(isin, isin)

        # Tramos IRPF ahorro 2024 (Ley 26/2014 + PGE 2023)
        def _tax(ganancia: float) -> float:
            if ganancia <= 0:
                return 0.0
            tramos = [(6000, 0.19), (44000, 0.21), (150000, 0.23), (100000, 0.27), (float("inf"), 0.28)]
            tax = 0.0
            acum = 0.0
            for limite, tipo in tramos:
                tramo = min(ganancia - acum, limite)
                if tramo <= 0:
                    break
                tax += tramo * tipo
                acum += tramo
            return round(tax, 2)

        # Agrupar lotes abiertos por ISIN
        lots_by_isin: Dict[str, list] = {}
        for lot in self.portfolio.open_lots:
            lots_by_isin.setdefault(lot["ISIN"], []).append(lot)

        result = []
        for isin in isins:
            lots = lots_by_isin.get(isin, [])
            if not lots:
                continue
            price = prices.get(isin, 0.0)
            if not price:
                continue

            capital_invertido = sum(
                l["Precio_Compra_Unitario"] * l["Participaciones_Restantes"] for l in lots
            )
            valor_actual = sum(l["Participaciones_Restantes"] for l in lots) * price
            plusvalia = valor_actual - capital_invertido
            plusvalia_pct = (plusvalia / capital_invertido * 100) if capital_invertido > 0 else 0.0
            impuesto = _tax(plusvalia) if plusvalia > 0 else 0.0

            # Los fondos de inversión registrados en la CNMV / ESMA cualifican para traspaso.
            # Como heurística conservadora asumimos que todos los fondos de la cartera
            # son IICs (fondos de inversión / SICAV), no ETFs.
            # El usuario debe verificar que no hay ETFs o acciones en cartera.
            cualifica = True  # Asumir IIC hasta que se implemente clasificación automática

            result.append({
                "isin": isin,
                "nombre": _name(isin),
                "valor_actual": round(valor_actual, 2),
                "capital_invertido": round(capital_invertido, 2),
                "plusvalia_latente": round(plusvalia, 2),
                "plusvalia_pct": round(plusvalia_pct, 2),
                "impuesto_si_vendes": round(impuesto, 2),
                "ahorro_traspaso": round(impuesto, 2),  # = 0 si plusvalía < 0
                "num_lotes": len(lots),
                "cualifica_traspaso": cualifica,
            })

        # Ordenar: primero los que más ahorro generan
        result.sort(key=lambda x: x["ahorro_traspaso"], reverse=True)
        return result

    # ------------------------------------------------------------------
    # Performance
    # ------------------------------------------------------------------

    async def performance(self, years: int = 3) -> pd.DataFrame:
        """Métricas de rendimiento del portfolio."""
        hist = await self.history(years=years)
        if hist.empty:
            return pd.DataFrame(columns=["Metric", "Value"])

        pos = await self.positions(live=True)
        total_val = pos["Valor_Actual"].sum() if pos["Valor_Actual"].notna().any() else 1

        # Build weight map using already-fetched data
        weights: Dict[str, float] = {}
        for _, row in pos.iterrows():
            name = row["Fondo"]
            w = (row["Valor_Actual"] / total_val) if pd.notna(row["Valor_Actual"]) and total_val > 0 else 0
            weights[name] = w

        date_col = hist.columns[0]
        price_cols = [c for c in hist.columns if c != date_col]
        returns = hist.set_index(date_col)[price_cols].pct_change().dropna()

        if returns.empty:
            return pd.DataFrame(columns=["Metric", "Value"])

        portfolio_returns = pd.Series(0.0, index=returns.index)
        for col in returns.columns:
            w = weights.get(col, 0)
            portfolio_returns += returns[col].fillna(0) * w

        total_return = (1 + portfolio_returns).prod() - 1
        annual_return = (1 + total_return) ** (252 / max(len(portfolio_returns), 1)) - 1
        volatility = portfolio_returns.std() * np.sqrt(252)
        sharpe = annual_return / volatility if volatility > 0 else 0
        sortino_downside = portfolio_returns[portfolio_returns < 0].std() * np.sqrt(252)
        sortino = annual_return / sortino_downside if sortino_downside > 0 else 0

        cum = (1 + portfolio_returns).cumprod()
        max_drawdown = ((cum - cum.cummax()) / cum.cummax()).min()

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
        ]
        return pd.DataFrame(metrics)

    # ------------------------------------------------------------------
    # Evolution Metrics
    # ------------------------------------------------------------------

    async def evolution_metrics(
        self,
        years: int = 5,
        risk_free_annual: float = 0.03,
        benchmark_isin: Optional[str] = None,
    ) -> pd.DataFrame:
        """Métricas de evolución por fondo (CAGR, Vol, Sharpe, Alpha, Beta)."""
        n_trading = 252
        rf_daily = (1 + risk_free_annual) ** (1 / n_trading) - 1

        if benchmark_isin:
            isins = list(self.portfolio.positions.keys())
            if benchmark_isin not in isins:
                isins = [benchmark_isin] + isins
            df_hist = await self.history(isins=isins, years=years)
        else:
            df_hist = await self.history(years=years)

        if df_hist.empty:
            return pd.DataFrame(columns=[
                "Fondo", "Rentab_Total_Pct", "CAGR_Pct", "Volatilidad_Pct",
                "Sharpe", "Alpha_Pct", "Beta", "Peso_Cartera_Pct",
            ])

        date_col = df_hist.columns[0]
        price_cols = [c for c in df_hist.columns if c != date_col]

        if benchmark_isin:
            info = await self.provider.get_fund_info(benchmark_isin)
            bm_col = info.get("name", benchmark_isin) if info else benchmark_isin
            bm_col = bm_col if bm_col in price_cols else price_cols[0]
        else:
            bm_col = next((c for c in price_cols if "cartera" in c.lower()), price_cols[0])

        returns = df_hist.set_index(date_col)[price_cols].pct_change().dropna(how="all")
        bm_returns = returns[bm_col].dropna()
        weight_map = await self._portfolio_weight_map()

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

            common = r.index.intersection(bm_returns.index)
            if len(common) >= 30 and col != bm_col:
                bm_r = bm_returns.loc[common]
                f_r = r.loc[common]
                var_bm = bm_r.var()
                beta = float(f_r.cov(bm_r) / var_bm) if var_bm > 0 else float("nan")
                alpha_daily = float(f_r.mean() - beta * bm_r.mean()) if beta == beta else float("nan")
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
        cartera_mask = df["Fondo"].str.lower().str.contains("cartera", na=False)
        df = pd.concat([df[cartera_mask], df[~cartera_mask].sort_values("Peso_Cartera_Pct", ascending=False)], ignore_index=True)
        df.attrs["benchmark"] = bm_col
        df.attrs["risk_free_annual"] = risk_free_annual
        df.attrs["years"] = years
        return df

    # ------------------------------------------------------------------
    # Asset Allocation
    # ------------------------------------------------------------------

    async def asset_allocation(self) -> pd.DataFrame:
        """Distribución de activos: Tipo, Valor, Peso_Pct."""
        summ = await self.summary()
        if summ.empty:
            return pd.DataFrame(columns=["Tipo", "Valor", "Peso_Pct"])
        return summ[["Tipo", "Valor_Actual", "Peso_Pct"]].rename(columns={"Valor_Actual": "Valor"})

    # ------------------------------------------------------------------
    # Sector & Region Exposure
    # ------------------------------------------------------------------

    async def sector_exposure(self) -> pd.DataFrame:
        """Pesos sectoriales agregados del portfolio."""
        import asyncio
        from .services.region_normalizer import normalize_sectors

        pos = await self.positions(live=True)
        if pos.empty:
            return pd.DataFrame(columns=["Sector", "Peso_Pct"])

        total_val = pos["Valor_Actual"].sum() if pos["Valor_Actual"].notna().any() else pos["Capital_Invertido"].sum()

        async def _get_sectors(isin: str, valor: float):
            sectors_raw = await self.provider.get_sector_weights(isin) or {}
            return normalize_sectors({k: float(v) for k, v in sectors_raw.items()}), valor

        tasks = [
            _get_sectors(row["ISIN"], row.get("Valor_Actual") or row.get("Capital_Invertido") or 0)
            for _, row in pos.iterrows()
        ]
        results = await asyncio.gather(*tasks)

        sector_agg: Dict[str, float] = {}
        for sectors, valor in results:
            fund_weight = valor / total_val if total_val > 0 else 0
            for sector, pct in sectors.items():
                sector_agg[sector] = sector_agg.get(sector, 0) + pct * fund_weight

        rows = [{"Sector": k, "Peso_Pct": round(v, 4)} for k, v in sector_agg.items()]
        return pd.DataFrame(rows).sort_values("Peso_Pct", ascending=False).reset_index(drop=True)

    async def region_exposure(self) -> pd.DataFrame:
        """Pesos regionales agregados del portfolio."""
        import asyncio
        from .services.region_normalizer import normalize_regions

        pos = await self.positions(live=True)
        if pos.empty:
            return pd.DataFrame(columns=["Region", "Peso_Pct"])

        total_val = pos["Valor_Actual"].sum() if pos["Valor_Actual"].notna().any() else pos["Capital_Invertido"].sum()

        async def _get_regions(isin: str, valor: float):
            regions_raw = await self.provider.get_country_weights(isin) or {}
            return normalize_regions({k: float(v) for k, v in regions_raw.items()}), valor

        tasks = [
            _get_regions(row["ISIN"], row.get("Valor_Actual") or row.get("Capital_Invertido") or 0)
            for _, row in pos.iterrows()
        ]
        results = await asyncio.gather(*tasks)

        region_agg: Dict[str, float] = {}
        for regions, valor in results:
            fund_weight = valor / total_val if total_val > 0 else 0
            for region, pct in regions.items():
                region_agg[region] = region_agg.get(region, 0) + pct * fund_weight

        rows = [{"Region": k, "Peso_Pct": round(v, 4)} for k, v in region_agg.items()]
        return pd.DataFrame(rows).sort_values("Peso_Pct", ascending=False).reset_index(drop=True)

    # ------------------------------------------------------------------
    # Benchmark Comparison
    # ------------------------------------------------------------------

    async def benchmark_comparison(self, benchmark_isin: str = "IE00B4L5Y983") -> Dict[str, pd.DataFrame]:
        """Compara sectores y regiones del portfolio vs benchmark."""
        import asyncio
        from .services.region_normalizer import normalize_regions, normalize_sectors

        # Fetch all in parallel
        sector_df_task = self.sector_exposure()
        region_df_task = self.region_exposure()
        bench_sectors_task = self.provider.get_sector_weights(benchmark_isin)
        bench_regions_task = self.provider.get_country_weights(benchmark_isin)

        sector_df, region_df, bench_sec_raw, bench_reg_raw = await asyncio.gather(
            sector_df_task, region_df_task, bench_sectors_task, bench_regions_task
        )

        portfolio_sectors = dict(zip(sector_df["Sector"], sector_df["Peso_Pct"])) if not sector_df.empty else {}
        portfolio_regions = dict(zip(region_df["Region"], region_df["Peso_Pct"])) if not region_df.empty else {}
        bench_sectors = normalize_sectors({k: float(v) for k, v in (bench_sec_raw or {}).items()})
        bench_regions = normalize_regions({k: float(v) for k, v in (bench_reg_raw or {}).items()})

        all_sectors = sorted(set(list(portfolio_sectors.keys()) + list(bench_sectors.keys())))
        df_sectors = pd.DataFrame([
            {"Nombre": s, "Mi_Cartera": portfolio_sectors.get(s, 0), "Benchmark": bench_sectors.get(s, 0)}
            for s in all_sectors
        ]).sort_values("Mi_Cartera", ascending=False).reset_index(drop=True)

        all_regions = sorted(set(list(portfolio_regions.keys()) + list(bench_regions.keys())))
        df_regions = pd.DataFrame([
            {"Nombre": r, "Mi_Cartera": portfolio_regions.get(r, 0), "Benchmark": bench_regions.get(r, 0)}
            for r in all_regions
        ]).sort_values("Mi_Cartera", ascending=False).reset_index(drop=True)

        return {"sectors": df_sectors, "regions": df_regions}

    # ------------------------------------------------------------------
    # Fund Metrics & Characteristics
    # ------------------------------------------------------------------

    async def fund_metrics(self) -> pd.DataFrame:
        """Métricas de rendimiento/riesgo por fondo y período temporal."""
        import asyncio

        _PERIODS = ("1y", "3y", "5y", "10y")
        _METRIC_MAP = {
            "Rent": "annualized_return", "Vol": "standard_deviation",
            "MaxCaida": "max_drawdown", "Alpha": "alpha",
            "Beta": "beta", "Sharpe": "sharpe_ratio",
        }
        cols = ["ISIN", "Fondo"]
        for label in _METRIC_MAP:
            for p in _PERIODS:
                cols.append(f"{label}_{p.upper()}")

        pos = await self.positions(live=True)
        if pos.empty:
            return pd.DataFrame(columns=cols)

        async def _get_metrics(isin: str, fondo: str) -> Dict:
            info = await self.provider.get_fund_info(isin) or {}
            name = info.get("name", fondo)
            r: Dict = {"ISIN": isin, "Fondo": name}
            for label, info_key in _METRIC_MAP.items():
                for p in _PERIODS:
                    r[f"{label}_{p.upper()}"] = info.get(f"{info_key}_{p}")
            return r

        tasks = [_get_metrics(row["ISIN"], row["Fondo"]) for _, row in pos.iterrows()]
        results = await asyncio.gather(*tasks)
        return pd.DataFrame(results, columns=cols)

    async def fund_characteristics(self) -> pd.DataFrame:
        """Características estáticas: rating, estrellas, TER."""
        import asyncio

        pos = await self.positions(live=True)
        if pos.empty:
            return pd.DataFrame(columns=["ISIN", "Fondo", "Estrellas_MS", "Rating_Riesgo", "TER"])

        async def _get_chars(isin: str, fondo: str) -> Dict:
            info = await self.provider.get_fund_info(isin) or {}
            return {
                "ISIN": isin,
                "Fondo": info.get("name", fondo),
                "Estrellas_MS": info.get("overallMorningstarRating") or info.get("rating_morningstar"),
                "Rating_Riesgo": info.get("morningstar_risk_rating") or info.get("srri"),
                "TER": info.get("total_expense_ratio") or info.get("ongoing_charge"),
            }

        tasks = [_get_chars(row["ISIN"], row["Fondo"]) for _, row in pos.iterrows()]
        results = await asyncio.gather(*tasks)
        return pd.DataFrame(results)

    # ------------------------------------------------------------------
    # Diagnostics
    # ------------------------------------------------------------------

    async def diagnostics(self, years: int = 3) -> pd.DataFrame:
        """Diagnóstico de cobertura de datos por fondo."""
        import asyncio

        pos = await self.positions(live=True)
        if pos.empty:
            return pd.DataFrame()

        async def _diag_one(isin: str, fondo: str) -> Dict:
            info = await self.provider.get_fund_info(isin) or {}
            name = info.get("name", fondo)
            nav_df = await self.provider.get_nav_history(isin, years=years)
            n_points = len(nav_df) if not nav_df.empty else 0
            first_date = nav_df["date"].min() if n_points > 0 else None
            last_date = nav_df["date"].max() if n_points > 0 else None
            sectors = await self.provider.get_sector_weights(isin) or {}
            regions = await self.provider.get_country_weights(isin) or {}

            if n_points >= 60:
                estado = "OK"
            elif n_points > 0:
                estado = "Poco historial"
            else:
                estado = "Sin datos"

            return {
                "ISIN": isin, "Fondo": name, "Puntos_NAV": n_points,
                "Desde": first_date, "Hasta": last_date,
                "Num_Sectores": len(sectors), "Num_Regiones": len(regions),
                "Tiene_TER": bool(info.get("total_expense_ratio") or info.get("ongoing_charge")),
                "Tiene_Sharpe": bool(info.get("sharperatio") or info.get("sharpe_ratio_1y")),
                "Estado": estado,
            }

        tasks = [_diag_one(row["ISIN"], row["Fondo"]) for _, row in pos.iterrows()]
        results = await asyncio.gather(*tasks)
        return pd.DataFrame(results).sort_values("Puntos_NAV").reset_index(drop=True)

    @staticmethod
    def _normalize_price_history(df: pd.DataFrame) -> pd.DataFrame:
        """Limpia un histórico de NAV para cálculos posteriores."""
        if df is None or df.empty or "date" not in df.columns or "price" not in df.columns:
            return pd.DataFrame(columns=["date", "price"])

        hist = df[["date", "price"]].copy()
        hist["date"] = pd.to_datetime(hist["date"], errors="coerce")
        hist["price"] = pd.to_numeric(hist["price"], errors="coerce")
        hist = hist.dropna(subset=["date", "price"])
        hist = hist.loc[hist["price"] > 0].sort_values("date").drop_duplicates("date")
        return hist.reset_index(drop=True)

    @staticmethod
    def _series_to_points(series: pd.Series) -> List[Dict[str, Any]]:
        """Convierte una serie temporal en la shape esperada por el frontend."""
        if series is None or series.empty:
            return []

        clean = series.dropna().sort_index()
        return [
            {
                "date": idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx),
                "price": round(float(value), 6),
            }
            for idx, value in clean.items()
            if pd.notna(value)
        ]

    @staticmethod
    def _build_weighted_portfolio_series(
        price_df: pd.DataFrame,
        weights: Dict[str, float],
    ) -> pd.Series:
        """Construye una serie sintética de cartera usando pesos estáticos."""
        if price_df.empty or not weights:
            return pd.Series(dtype=float)

        valid_cols = [
            col for col in price_df.columns
            if col in weights and price_df[col].dropna().shape[0] >= 10
        ]
        if not valid_cols:
            valid_cols = [col for col in price_df.columns if col in weights]
        if not valid_cols:
            return pd.Series(dtype=float)

        prices = price_df[valid_cols].sort_index().ffill()
        if prices.empty:
            return pd.Series(dtype=float)

        daily_returns = prices.pct_change().dropna(how="all")
        if daily_returns.empty:
            first_col = prices[valid_cols[0]].dropna()
            if first_col.shape[0] < 2:
                return pd.Series(dtype=float)
            return (first_col / float(first_col.iloc[0])) * 100.0

        weight_vec = pd.Series(
            {col: float(weights.get(col, 0.0)) for col in valid_cols},
            dtype=float,
        )
        if weight_vec.sum() <= 0:
            weight_vec = pd.Series(1.0 / len(valid_cols), index=valid_cols, dtype=float)
        else:
            weight_vec = weight_vec / weight_vec.sum()

        period_weights = daily_returns.notna().mul(weight_vec, axis=1)
        period_weight_sum = period_weights.sum(axis=1).replace(0, np.nan)
        portfolio_return = (
            daily_returns.fillna(0)
            .mul(period_weights)
            .sum(axis=1)
            .div(period_weight_sum)
            .fillna(0)
        )
        return (1 + portfolio_return).cumprod() * 100.0

    @staticmethod
    def _compute_series_metrics(
        series: pd.Series,
        risk_free_annual: float = 0.03,
    ) -> Dict[str, Optional[float]]:
        """Calcula métricas de riesgo/rentabilidad desde una serie histórica."""
        if series is None:
            return {}

        clean = series.dropna().sort_index()
        if clean.shape[0] < 5:
            return {}

        first = float(clean.iloc[0])
        last = float(clean.iloc[-1])
        if first <= 0 or last <= 0:
            return {}

        total_return = (last / first - 1) * 100
        total_days = max((clean.index[-1] - clean.index[0]).days, 1)
        annualized_return = ((last / first) ** (365.25 / total_days) - 1) * 100

        log_returns = np.log(clean / clean.shift(1)).replace([np.inf, -np.inf], np.nan).dropna()
        pct_returns = clean.pct_change().replace([np.inf, -np.inf], np.nan).dropna()

        standard_deviation: Optional[float] = None
        sharpe_ratio: Optional[float] = None
        if log_returns.shape[0] >= 10:
            standard_deviation = float(log_returns.std(ddof=0) * np.sqrt(252) * 100)

        if pct_returns.shape[0] >= 10:
            rf_daily = (1 + risk_free_annual) ** (1 / 252) - 1
            pct_std = float(pct_returns.std(ddof=0))
            if pct_std > 0:
                sharpe_ratio = float(
                    ((float(pct_returns.mean()) - rf_daily) / pct_std) * np.sqrt(252)
                )

        drawdown = (clean / clean.cummax()) - 1
        max_drawdown = float(drawdown.min() * 100) if not drawdown.empty else None

        return {
            "total_return": round(total_return, 2),
            "annualized_return": round(annualized_return, 2),
            "standard_deviation": (
                round(standard_deviation, 2) if standard_deviation is not None else None
            ),
            "sharpe_ratio": round(sharpe_ratio, 3) if sharpe_ratio is not None else None,
            "max_drawdown": round(max_drawdown, 2) if max_drawdown is not None else None,
        }

    @classmethod
    def _build_period_returns(
        cls,
        current_series: pd.Series,
        fund_series: pd.Series,
        simulated_series: pd.Series,
    ) -> List[Dict[str, Any]]:
        """Construye comparativa de rentabilidades por período."""

        def _calc_period_return(
            series: pd.Series,
            timeframe: str,
            annualized: bool,
        ) -> Optional[float]:
            clean = series.dropna().sort_index() if series is not None else pd.Series(dtype=float)
            if clean.shape[0] < 2:
                return None

            end = clean.index[-1]
            if timeframe == "MAX":
                window = clean
            else:
                start = pd.Timestamp(end)
                if timeframe == "1M":
                    start = start - pd.DateOffset(months=1)
                elif timeframe == "3M":
                    start = start - pd.DateOffset(months=3)
                elif timeframe == "YTD":
                    start = pd.Timestamp(year=end.year, month=1, day=1)
                elif timeframe == "1Y":
                    start = start - pd.DateOffset(years=1)
                elif timeframe == "3Y":
                    start = start - pd.DateOffset(years=3)
                elif timeframe == "5Y":
                    start = start - pd.DateOffset(years=5)
                elif timeframe == "10Y":
                    start = start - pd.DateOffset(years=10)
                else:
                    return None
                window = clean.loc[clean.index >= start]

            if window.shape[0] < 2:
                return None

            first = float(window.iloc[0])
            last = float(window.iloc[-1])
            if first <= 0 or last <= 0:
                return None

            total_return = (last / first - 1) * 100
            if not annualized:
                return round(total_return, 2)

            days = max((window.index[-1] - window.index[0]).days, 1)
            annualized_return = ((last / first) ** (365.25 / days) - 1) * 100
            return round(annualized_return, 2)

        periods = [
            ("1 Mes", "1M", False),
            ("3 Meses", "3M", False),
            ("YTD", "YTD", False),
            ("1 Año", "1Y", True),
            ("3 Años", "3Y", True),
            ("5 Años", "5Y", True),
            ("10 Años", "10Y", True),
            ("Máx.", "MAX", True),
        ]

        rows: List[Dict[str, Any]] = []
        for label, timeframe, annualized in periods:
            current_value = _calc_period_return(current_series, timeframe, annualized)
            fund_value = _calc_period_return(fund_series, timeframe, annualized)
            simulated_value = _calc_period_return(simulated_series, timeframe, annualized)
            if current_value is None and fund_value is None and simulated_value is None:
                continue
            rows.append({
                "label": label,
                "current": current_value,
                "fund": fund_value,
                "simulated": simulated_value,
            })

        return rows

    # ------------------------------------------------------------------
    # Simulate Addition
    # ------------------------------------------------------------------

    async def simulate_addition(self, isin: str, amount: float) -> Dict[str, pd.DataFrame]:
        """Simula incorporar ``amount`` € en el fondo ``isin``."""
        import asyncio

        def _value_or_zero(value: Any) -> float:
            if value is None or pd.isna(value):
                return 0.0
            return float(value)

        pos = await self.positions(live=True)
        value_col = "Valor_Actual"
        if pos.empty or not pos["Valor_Actual"].notna().any():
            value_col = "Capital_Invertido"

        total_val = _value_or_zero(pos[value_col].sum()) if not pos.empty else 0.0

        info = await self.provider.get_fund_info(isin) or {}
        existing_name_map = {}
        if not pos.empty:
            existing_name_map = {
                str(row["ISIN"]): str(row.get("Fondo") or row["ISIN"])
                for _, row in pos.iterrows()
            }

        added_name = existing_name_map.get(isin) or info.get("name", isin)
        requested_added_name = added_name

        simulated_total = total_val + amount

        weight_rows = []
        current_values: Dict[str, float] = {}
        for _, row in pos.iterrows():
            row_isin = str(row["ISIN"])
            row_name = existing_name_map.get(row_isin, row_isin)
            current_value = _value_or_zero(row.get(value_col, 0.0))
            simulated_value = current_value + (amount if row_isin == isin else 0.0)
            current_values[row_name] = current_values.get(row_name, 0.0) + current_value
            cur_w = (current_value / total_val * 100) if total_val > 0 else 0.0
            sim_w = (simulated_value / simulated_total * 100) if simulated_total > 0 else 0.0
            weight_rows.append({
                "ISIN": row_isin,
                "Fondo": row_name,
                "Peso_Actual": round(cur_w, 2),
                "Peso_Simulado": round(sim_w, 2),
            })

        existing = [r for r in weight_rows if r["ISIN"] == isin]
        if existing:
            current_values[added_name] = current_values.get(added_name, 0.0)
        else:
            weight_rows.append({
                "ISIN": isin,
                "Fondo": added_name,
                "Peso_Actual": 0.0,
                "Peso_Simulado": round(amount / simulated_total * 100, 2),
            })

        simulated_values = dict(current_values)
        simulated_values[added_name] = simulated_values.get(added_name, 0.0) + amount

        df_weights = pd.DataFrame(weight_rows).sort_values("Peso_Simulado", ascending=False).reset_index(drop=True)

        history_isins = list(dict.fromkeys([*existing_name_map.keys(), isin]))

        async def _fetch_history(target_isin: str) -> tuple[str, str, pd.Series]:
            history_df = await self.provider.get_nav_history(target_isin, years=15)
            clean_history = self._normalize_price_history(history_df)

            display_name = existing_name_map.get(target_isin)
            if not display_name:
                if target_isin == isin:
                    display_name = added_name
                else:
                    target_info = await self.provider.get_fund_info(target_isin) or {}
                    display_name = target_info.get("name", target_isin)

            if clean_history.empty:
                return target_isin, display_name, pd.Series(dtype=float)

            series = clean_history.set_index("date")["price"].rename(display_name)
            return target_isin, display_name, series

        fetched_history = await asyncio.gather(*[_fetch_history(target_isin) for target_isin in history_isins])

        price_series: Dict[str, pd.Series] = {}
        history_name_by_isin: Dict[str, str] = {}
        for target_isin, display_name, series in fetched_history:
            history_name_by_isin[target_isin] = display_name
            if series.empty:
                continue
            current_best = price_series.get(display_name)
            if current_best is None or series.dropna().shape[0] > current_best.dropna().shape[0]:
                price_series[display_name] = series

        added_name = history_name_by_isin.get(isin, added_name)
        if added_name != requested_added_name:
            if requested_added_name in current_values:
                current_values[added_name] = current_values.get(added_name, 0.0) + current_values.pop(requested_added_name)
            if requested_added_name in simulated_values:
                simulated_values[added_name] = simulated_values.get(added_name, 0.0) + simulated_values.pop(requested_added_name)
            df_weights.loc[df_weights["ISIN"] == isin, "Fondo"] = added_name
        elif added_name in current_values or isin in existing_name_map:
            current_values[added_name] = current_values.get(added_name, 0.0)

        price_df = pd.concat(price_series.values(), axis=1, join="outer").sort_index() if price_series else pd.DataFrame()

        current_weights = {
            name: value / total_val
            for name, value in current_values.items()
            if total_val > 0 and value > 0
        }
        simulated_weights = {
            name: value / simulated_total
            for name, value in simulated_values.items()
            if simulated_total > 0 and value > 0
        }

        current_series = self._build_weighted_portfolio_series(price_df, current_weights)
        fund_series = price_series.get(added_name, pd.Series(dtype=float))
        simulated_series = self._build_weighted_portfolio_series(price_df, simulated_weights)

        current_portfolio_metrics = self._compute_series_metrics(current_series)
        simulated_portfolio_metrics = self._compute_series_metrics(simulated_series)
        period_returns = self._build_period_returns(current_series, fund_series, simulated_series)

        return {
            "weights": df_weights,
            "metrics": pd.DataFrame(),
            "metadata": {
                "added_name": added_name,
                "current_total": total_val,
                "simulated_total": simulated_total,
            },
            "current_portfolio_metrics": current_portfolio_metrics,
            "simulated_portfolio_metrics": simulated_portfolio_metrics,
            "history_current": self._series_to_points(current_series),
            "history_fund": self._series_to_points(fund_series),
            "history_simulated": self._series_to_points(simulated_series),
            "period_returns": period_returns,
        }
    async def simulate_rebalance(self, target_weights: Dict[str, float]) -> Dict:
        """Simula rebalanceo de cartera con pesos objetivos.

        Args:
            target_weights: Diccionario {isin: fracción} donde los valores
                suman 1.0 (p.ej. {"LU123": 0.4, "IE456": 0.6}).

        Returns:
            Diccionario con históricos, métricas y movimientos necesarios.
        """
        import asyncio

        def _val(v: Any) -> float:
            if v is None or pd.isna(v):
                return 0.0
            return float(v)

        pos = await self.positions(live=True)
        value_col = "Valor_Actual"
        if pos.empty or not pos["Valor_Actual"].notna().any():
            value_col = "Capital_Invertido"

        total_val = _val(pos[value_col].sum()) if not pos.empty else 0.0

        existing_name_map: Dict[str, str] = {}
        if not pos.empty:
            existing_name_map = {
                str(row["ISIN"]): str(row.get("Fondo") or row["ISIN"])
                for _, row in pos.iterrows()
            }

        # Current values and weights
        current_values: Dict[str, float] = {}
        for _, row in pos.iterrows():
            row_isin = str(row["ISIN"])
            name = existing_name_map.get(row_isin, row_isin)
            current_values[name] = current_values.get(name, 0.0) + _val(row.get(value_col, 0.0))

        # Target values by name
        isin_to_name: Dict[str, str] = {
            isin: existing_name_map.get(isin, isin) for isin in target_weights
        }
        target_values: Dict[str, float] = {
            isin_to_name[isin]: w * total_val for isin, w in target_weights.items()
        }

        # Build weight rows for UI (existing positions + new ISINs from target)
        seen_isins: set = set()
        weight_rows = []
        for _, row in pos.iterrows():
            row_isin = str(row["ISIN"])
            if row_isin in seen_isins:
                continue
            seen_isins.add(row_isin)
            name = existing_name_map.get(row_isin, row_isin)
            cur_val = _val(row.get(value_col, 0.0))
            tgt_w = target_weights.get(row_isin, 0.0)
            tgt_val = tgt_w * total_val
            delta_eur = tgt_val - cur_val
            weight_rows.append({
                "ISIN": row_isin,
                "Fondo": name,
                "Peso_Actual": round((cur_val / total_val * 100) if total_val > 0 else 0.0, 2),
                "Peso_Objetivo": round(tgt_w * 100, 2),
                "Delta_EUR": round(delta_eur, 2),
            })
        # Add new ISINs from target_weights that are not in current positions
        new_isins = [isin for isin in target_weights if isin not in seen_isins]
        if new_isins:
            resolved_new = await self.provider.resolve_names_batch(new_isins)
            for isin in new_isins:
                name = resolved_new.get(isin, isin)
                isin_to_name[isin] = name
                existing_name_map[isin] = name
                tgt_w = target_weights.get(isin, 0.0)
                weight_rows.append({
                    "ISIN": isin,
                    "Fondo": name,
                    "Peso_Actual": 0.0,
                    "Peso_Objetivo": round(tgt_w * 100, 2),
                    "Delta_EUR": round(tgt_w * total_val, 2),
                })
        df_weights = pd.DataFrame(weight_rows).sort_values("Peso_Objetivo", ascending=False).reset_index(drop=True)

        # Fetch price histories for all ISINs (existing + new)
        all_fetch_isins = list(existing_name_map.keys())

        async def _fetch(target_isin: str) -> tuple[str, str, pd.Series]:
            history_df = await self.provider.get_nav_history(target_isin, years=15)
            clean = self._normalize_price_history(history_df)
            name = existing_name_map.get(target_isin, target_isin)
            if clean.empty:
                return target_isin, name, pd.Series(dtype=float)
            series = clean.set_index("date")["price"].rename(name)
            return target_isin, name, series

        fetched = await asyncio.gather(*[_fetch(isin) for isin in all_fetch_isins])

        price_series: Dict[str, pd.Series] = {}
        for target_isin, name, series in fetched:
            if series.empty:
                continue
            cur = price_series.get(name)
            if cur is None or series.dropna().shape[0] > cur.dropna().shape[0]:
                price_series[name] = series

        price_df = (
            pd.concat(price_series.values(), axis=1, join="outer").sort_index()
            if price_series
            else pd.DataFrame()
        )

        current_weights_by_name = {
            name: val / total_val
            for name, val in current_values.items()
            if total_val > 0 and val > 0
        }
        simulated_weights_by_name = {
            isin_to_name[isin]: w
            for isin, w in target_weights.items()
            if w > 0 and isin in isin_to_name
        }

        current_series = self._build_weighted_portfolio_series(price_df, current_weights_by_name)
        simulated_series = self._build_weighted_portfolio_series(price_df, simulated_weights_by_name)

        current_metrics = self._compute_series_metrics(current_series)
        simulated_metrics = self._compute_series_metrics(simulated_series)
        period_returns = self._build_period_returns(current_series, pd.Series(dtype=float), simulated_series)

        return {
            "weights": df_weights,
            "metadata": {"total_value": total_val},
            "current_portfolio_metrics": current_metrics,
            "simulated_portfolio_metrics": simulated_metrics,
            "history_current": self._series_to_points(current_series),
            "history_simulated": self._series_to_points(simulated_series),
            "period_returns": period_returns,
        }
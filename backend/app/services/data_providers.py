"""
data_providers.py — Abstracción multi-fuente de datos financieros.

Proveedores soportados:
  - FMPProvider:     FinancialModelingPrep (free tier, 250 req/día)
  - MStarProvider:   Wrapper de mstarpy / clase Fund existente
  - YFinanceProvider: Yahoo Finance (NAV rápido)
  - FinectProvider:  Scraping de Finect (info, comisiones, ratios, holdings)
  - CompositeProvider: Estrategia dual — velocidad (NAV) vs completitud (datos)

Estrategia de adquisición de datos:
  1. **NAV / Histórico** (prioridad: velocidad ⚡)
     Cadena: FMP → YFinance → MorningStar(light)
     - FMP: ~300ms, 1 HTTP call, no deps externas, falla rápido si no resuelve
     - YFinance: ~500ms, sin API key, buena cobertura ISINs europeos
     - MorningStar: ~2-5s, backup cuando los otros fallan (usa caché)

  2. **Info / Sectores / Países / Holdings** (prioridad: completitud 📊)
     Cadena: MorningStar(detailed) → FMP → Finect
     - MorningStar: fuente más rica (ratings, sectores, regiones, holdings, risk)
     - FMP: excelente para ETFs (sector/country/holdings weightings)
     - Finect: complementa con comisiones, gestora, categoría, benchmark
     Para info: se fusionan TODOS los proveedores (primer valor no-nulo gana)
     Para sectores/países/holdings: se fusionan priorizando el proveedor más completo

Cada proveedor implementa la interfaz FundDataProvider.
"""

import logging
import os
import json
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import pandas as pd
import requests

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------

def _get_fmp_api_key() -> Optional[str]:
    """Lee la API key de FMP desde variable de entorno o config.json."""
    key = os.environ.get("FMP_API_KEY")
    if key:
        return key
    config_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "data", "config.json",
    )
    if os.path.exists(config_path):
        with open(config_path, "r") as f:
            cfg = json.load(f)
            return cfg.get("FMP_API_KEY")
    return None


# ---------------------------------------------------------------------------
# Interfaz base
# ---------------------------------------------------------------------------

class FundDataProvider(ABC):
    """Interfaz que todo proveedor de datos de fondos debe implementar."""

    @abstractmethod
    def get_nav(self, isin: str) -> Optional[float]:
        """Precio actual (NAV)."""

    @abstractmethod
    def get_nav_history(self, isin: str, years: int = 5) -> pd.DataFrame:
        """Histórico de precios. Devuelve DataFrame con columnas [date, price]."""

    @abstractmethod
    def get_fund_info(self, isin: str) -> Dict[str, Any]:
        """Info general: name, category, expense_ratio, aum, inception_date, rating, etc."""

    @abstractmethod
    def get_sector_weights(self, isin: str) -> Dict[str, float]:
        """Distribución sectorial {sector_name: weight %}."""

    @abstractmethod
    def get_country_weights(self, isin: str) -> Dict[str, float]:
        """Distribución geográfica {country_name: weight %}."""

    @abstractmethod
    def get_holdings(self, isin: str) -> pd.DataFrame:
        """Top holdings. Columnas: [name, ticker, weight, market_value]."""


# ---------------------------------------------------------------------------
# FMP Provider
# ---------------------------------------------------------------------------

class FMPProvider(FundDataProvider):
    """FinancialModelingPrep — free tier (250 req/día). Gran cobertura de ETFs."""

    BASE_URL = "https://financialmodelingprep.com/stable"

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or _get_fmp_api_key()
        self._symbol_cache: Dict[str, Optional[str]] = {}

    @property
    def available(self) -> bool:
        return self.api_key is not None

    def _get(self, endpoint: str, params: Optional[Dict] = None) -> Any:
        if not self.api_key:
            return None
        params = params or {}
        params["apikey"] = self.api_key
        url = f"{self.BASE_URL}/{endpoint}"
        try:
            resp = requests.get(url, params=params, timeout=15)
            if resp.status_code == 200:
                return resp.json()
            logger.warning("FMP %s returned %s", endpoint, resp.status_code)
        except Exception as e:
            logger.warning("FMP request failed for %s: %s", endpoint, e)
        return None

    def resolve_symbol(self, isin: str) -> Optional[str]:
        """Resuelve un ISIN a un ticker symbol de FMP.

        Intenta primero por ISIN directo; si falla, busca por texto
        usando el ISIN como query (útil para ETFs europeos).
        """
        if isin in self._symbol_cache:
            return self._symbol_cache[isin]

        # 1. Búsqueda directa por ISIN
        data = self._get("search-isin", {"isin": isin})
        symbol = None
        if data and isinstance(data, list) and len(data) > 0:
            symbol = data[0].get("symbol")

        # 2. Fallback: búsqueda por texto con el ISIN como query
        if not symbol:
            data = self._get("search", {"query": isin, "limit": "5"})
            if data and isinstance(data, list):
                for item in data:
                    # Priorizar coincidencias cuyo ISIN o nombre contengan el query
                    if item.get("isin") == isin or isin in (item.get("name") or ""):
                        symbol = item.get("symbol")
                        break
                # Si no hay match exacto, usar el primer resultado
                if not symbol and len(data) > 0:
                    symbol = data[0].get("symbol")
                    logger.info("FMP: no exact ISIN match, using first search result: %s", symbol)

        self._symbol_cache[isin] = symbol
        return symbol

    def get_nav(self, isin: str) -> Optional[float]:
        symbol = self.resolve_symbol(isin)
        if not symbol:
            return None
        data = self._get("quote-short", {"symbol": symbol})
        if data and isinstance(data, list) and len(data) > 0:
            return data[0].get("price")
        return None

    def get_nav_history(self, isin: str, years: int = 5) -> pd.DataFrame:
        symbol = self.resolve_symbol(isin)
        if not symbol:
            return pd.DataFrame(columns=["date", "price"])
        start = (datetime.now() - timedelta(days=years * 365)).strftime("%Y-%m-%d")
        data = self._get(
            "historical-price-eod/light",
            {"symbol": symbol, "from": start},
        )
        if not data or not isinstance(data, list):
            return pd.DataFrame(columns=["date", "price"])
        df = pd.DataFrame(data)
        if "date" in df.columns and "close" in df.columns:
            df = df.rename(columns={"close": "price"})[["date", "price"]]
            df["date"] = pd.to_datetime(df["date"])
            df = df.sort_values("date").reset_index(drop=True)
            return df
        return pd.DataFrame(columns=["date", "price"])

    def get_fund_info(self, isin: str) -> Dict[str, Any]:
        symbol = self.resolve_symbol(isin)
        if not symbol:
            return {}
        info = self._get("etf/info", {"symbol": symbol})
        if info and isinstance(info, list) and len(info) > 0:
            item = info[0]
            return {
                "name": item.get("name", ""),
                "symbol": symbol,
                "expense_ratio": item.get("expenseRatio"),
                "aum": item.get("aum"),
                "inception_date": item.get("inceptionDate"),
                "description": item.get("description", ""),
                "domicile": item.get("domicile", ""),
                "currency": item.get("currency", "EUR"),
                "source": "FMP",
            }
        # Fallback: try company profile
        profile = self._get("profile", {"symbol": symbol})
        if profile and isinstance(profile, list) and len(profile) > 0:
            item = profile[0]
            return {
                "name": item.get("companyName", ""),
                "symbol": symbol,
                "sector": item.get("sector", ""),
                "industry": item.get("industry", ""),
                "currency": item.get("currency", "EUR"),
                "source": "FMP",
            }
        return {}

    def get_sector_weights(self, isin: str) -> Dict[str, float]:
        symbol = self.resolve_symbol(isin)
        if not symbol:
            return {}
        data = self._get("etf/sector-weightings", {"symbol": symbol})
        if data and isinstance(data, list):
            return {item["sector"]: item["weightPercentage"] for item in data if "sector" in item}
        return {}

    def get_country_weights(self, isin: str) -> Dict[str, float]:
        symbol = self.resolve_symbol(isin)
        if not symbol:
            return {}
        data = self._get("etf/country-weightings", {"symbol": symbol})
        if data and isinstance(data, list):
            return {item["country"]: item["weightPercentage"] for item in data if "country" in item}
        return {}

    def get_holdings(self, isin: str) -> pd.DataFrame:
        symbol = self.resolve_symbol(isin)
        if not symbol:
            return pd.DataFrame(columns=["name", "ticker", "weight", "market_value"])
        data = self._get("etf/holdings", {"symbol": symbol})
        if data and isinstance(data, list):
            rows = []
            for h in data[:25]:  # top 25
                rows.append({
                    "name": h.get("name", ""),
                    "ticker": h.get("asset", ""),
                    "weight": h.get("weightPercentage", 0),
                    "market_value": h.get("marketValue", 0),
                })
            return pd.DataFrame(rows)
        return pd.DataFrame(columns=["name", "ticker", "weight", "market_value"])


# ---------------------------------------------------------------------------
# MorningStar Provider (via existing Fund class)
# ---------------------------------------------------------------------------

class MStarProvider(FundDataProvider):
    """Wrapper sobre la clase Fund existente (mstarpy + yfinance)."""

    def __init__(self, cache_path: Optional[str] = None, use_cache: bool = True):
        self.cache_path = cache_path
        self.use_cache = use_cache

    def _get_fund(self, isin: str, mode: str = "light", use_cache: Optional[bool] = None):
        from .functions_fund import Fund
        cache = use_cache if use_cache is not None else self.use_cache
        return Fund(isin=isin, mode=mode, cache_path=self.cache_path, use_cache=cache)

    @staticmethod
    def _has_error(fund) -> bool:
        """Detecta si los datos cacheados del fondo contienen un error."""
        df = fund.fund_data
        if df is None or df.empty:
            return True
        data_col = df["data"].iloc[0]
        if isinstance(data_col, pd.DataFrame) and "error" in data_col.columns:
            return data_col["error"].notna().any()
        return False

    def _get_fund_with_retry(self, isin: str, mode: str = "light") -> "Fund":  # noqa: F821
        """Obtiene un Fund; si el cache contiene errores, reintenta sin cache."""
        fund = self._get_fund(isin, mode=mode)
        if self._has_error(fund):
            logger.info("MStarProvider: cache de %s (%s) contiene errores, reintentando sin cache", isin, mode)
            fund = self._get_fund(isin, mode=mode, use_cache=False)
        return fund

    def _extract_price(self, fund) -> float:
        df = fund.fund_data
        if df is None or df.empty:
            return 0.0
        data_col = df["data"].iloc[0]
        if isinstance(data_col, list):
            try:
                data_col = pd.DataFrame(data_col)
            except Exception:
                return 0.0
        if isinstance(data_col, pd.DataFrame) and "precio_actual" in data_col.columns:
            val = data_col["precio_actual"].iloc[0]
            if pd.notna(val):
                return float(val)
        return 0.0

    def get_nav(self, isin: str) -> Optional[float]:
        """NAV actual — siempre obtiene precio fresco, sin caché de disco."""
        try:
            fund = self._get_fund(isin, mode="light", use_cache=False)
            price = self._extract_price(fund)
            return price if price > 0 else None
        except Exception as e:
            logger.warning("MStarProvider.get_nav(%s) failed: %s", isin, e)
            return None

    def get_nav_history(self, isin: str, years: int = 5) -> pd.DataFrame:
        try:
            fund = self._get_fund(isin, mode="light")
            df = fund.fund_data
            if df is None or df.empty:
                return pd.DataFrame(columns=["date", "price"])
            hist = df["historical_data"].iloc[0]
            if isinstance(hist, pd.DataFrame) and not hist.empty and "Close" in hist.columns:
                result = hist.reset_index()
                # Normalize column names
                if "Date" in result.columns:
                    result = result.rename(columns={"Date": "date", "Close": "price"})
                else:
                    result.columns = ["date"] + list(result.columns[1:])
                    if "Close" in result.columns:
                        result = result.rename(columns={"Close": "price"})
                    elif "price" not in result.columns:
                        result["price"] = result.iloc[:, 1]
                result["date"] = pd.to_datetime(result["date"]).dt.tz_localize(None)
                cutoff = datetime.now() - timedelta(days=years * 365)
                result = result[result["date"] >= cutoff]
                return result[["date", "price"]].reset_index(drop=True)
        except Exception as e:
            logger.warning("MStarProvider.get_nav_history(%s) failed: %s", isin, e)
        return pd.DataFrame(columns=["date", "price"])

    def get_fund_info(self, isin: str) -> Dict[str, Any]:
        try:
            fund = self._get_fund_with_retry(isin, mode="detailed")
            df = fund.fund_data
            if df is None or df.empty:
                return {}
            info: Dict[str, Any] = {"isin": isin, "source": "Morningstar"}

            # El nombre real está en la columna 'nombre' del DataFrame principal
            if "nombre" in df.columns:
                val = df["nombre"].iloc[0]
                if pd.notna(val) and str(val) != isin:
                    info["name"] = str(val)

            data_col = df["data"].iloc[0]

            # Normalizar data_col: si es una lista de dicts, convertir a DataFrame
            if isinstance(data_col, list):
                try:
                    data_col = pd.DataFrame(data_col)
                except Exception:
                    data_col = {}

            if isinstance(data_col, pd.DataFrame) and not data_col.empty:
                # Si no tenemos nombre aún, intentar desde la tabla de datos
                if "name" not in info or info["name"] == isin:
                    for name_key in ("name", "fundName"):
                        if name_key in data_col.columns:
                            val = data_col[name_key].iloc[0]
                            if pd.notna(val) and str(val) != isin:
                                info["name"] = str(val)
                                break

                # Extraer métricas adicionales
                for key in [
                    "overallMorningstarRating", "morningstarRatingFor3Year",
                    "morningstarRatingFor5Year", "riskScore", "riskLevel",
                    "ongoingCostsOtherCosts", "categoryName", "fundName",
                ]:
                    if key in data_col.columns:
                        val = data_col[key].iloc[0]
                        if pd.notna(val):
                            info[key] = val

            elif isinstance(data_col, dict):
                if "name" not in info or info["name"] == isin:
                    name = data_col.get("name")
                    if name and name != isin:
                        info["name"] = name
                for key in ["overallMorningstarRating", "categoryName", "riskScore"]:
                    if key in data_col and data_col[key] is not None:
                        info[key] = data_col[key]

            # Asegurar que siempre haya un nombre
            info.setdefault("name", isin)

            return info
        except Exception as e:
            logger.warning("MStarProvider.get_fund_info(%s) failed: %s", isin, e)
            return {}

    def get_sector_weights(self, isin: str) -> Dict[str, float]:
        try:
            fund = self._get_fund_with_retry(isin, mode="detailed")
            df = fund.fund_data
            if df is None or df.empty:
                return {}
            data_col = df["data"].iloc[0]
            if isinstance(data_col, list):
                try:
                    data_col = pd.DataFrame(data_col)
                except Exception:
                    return {}
            if isinstance(data_col, pd.DataFrame):
                sector_cols = [c for c in data_col.columns if c.startswith("perc_sector_")]
                result = {}
                for col in sector_cols:
                    name = col.replace("perc_sector_", "")
                    val = data_col[col].iloc[0]
                    if pd.notna(val):
                        result[name] = float(val)
                return result
        except Exception as e:
            logger.warning("MStarProvider.get_sector_weights(%s) failed: %s", isin, e)
        return {}

    def get_country_weights(self, isin: str) -> Dict[str, float]:
        try:
            fund = self._get_fund_with_retry(isin, mode="detailed")
            df = fund.fund_data
            if df is None or df.empty:
                return {}
            data_col = df["data"].iloc[0]
            if isinstance(data_col, list):
                try:
                    data_col = pd.DataFrame(data_col)
                except Exception:
                    return {}
            if isinstance(data_col, pd.DataFrame):
                region_cols = [c for c in data_col.columns if c.startswith("perc_region_")]
                result = {}
                for col in region_cols:
                    name = col.replace("perc_region_", "")
                    val = data_col[col].iloc[0]
                    if pd.notna(val):
                        result[name] = float(val)
                return result
        except Exception as e:
            logger.warning("MStarProvider.get_country_weights(%s) failed: %s", isin, e)
        return {}

    def get_holdings(self, isin: str) -> pd.DataFrame:
        try:
            fund = self._get_fund_with_retry(isin, mode="detailed")
            df = fund.fund_data
            if df is None or df.empty:
                return pd.DataFrame(columns=["name", "ticker", "weight", "market_value"])
            data_col = df["data"].iloc[0]
            if isinstance(data_col, list):
                try:
                    data_col = pd.DataFrame(data_col)
                except Exception:
                    return pd.DataFrame(columns=["name", "ticker", "weight", "market_value"])
            if isinstance(data_col, pd.DataFrame):
                holding_cols = [c for c in data_col.columns if c.startswith("perc_holding_")]
                if holding_cols:
                    rows = []
                    for col in holding_cols:
                        name = col.replace("perc_holding_", "")
                        val = data_col[col].iloc[0]
                        if pd.notna(val):
                            rows.append({"name": name, "ticker": "", "weight": float(val), "market_value": 0})
                    return pd.DataFrame(rows)
        except Exception as e:
            logger.warning("MStarProvider.get_holdings(%s) failed: %s", isin, e)
        return pd.DataFrame(columns=["name", "ticker", "weight", "market_value"])


# ---------------------------------------------------------------------------
# Yahoo Finance Provider (lightweight — NAV only)
# ---------------------------------------------------------------------------

class YFinanceProvider(FundDataProvider):
    """Proveedor ligero de último recurso: NAV y NAV histórico via yfinance.

    Características de velocidad:
      - get_nav: ~200-500ms (descarga 5 días de historia y toma el último cierre)
      - get_nav_history: ~500-2000ms dependiendo del período

    Es el primer proveedor en la cadena NAV por su buen balance
    entre velocidad y cobertura de ISINs europeos.
    """

    def get_nav(self, isin: str) -> Optional[float]:
        try:
            import yfinance as yf
            ticker = yf.Ticker(isin)
            hist = ticker.history(period="5d")
            if hist is not None and not hist.empty:
                return float(hist["Close"].iloc[-1])
        except Exception as e:
            logger.debug("YFinanceProvider.get_nav(%s) failed: %s", isin, e)
        return None

    def get_nav_history(self, isin: str, years: int = 5) -> pd.DataFrame:
        try:
            import yfinance as yf
            period_map = {1: "1y", 3: "3y", 5: "5y", 10: "10y"}
            period = period_map.get(years, f"{years}y")
            ticker = yf.Ticker(isin)
            hist = ticker.history(period=period)
            if hist is not None and not hist.empty:
                df = hist.reset_index()[["Date", "Close"]].rename(
                    columns={"Date": "date", "Close": "price"}
                )
                df["date"] = pd.to_datetime(df["date"]).dt.tz_localize(None)
                return df.reset_index(drop=True)
        except Exception as e:
            logger.debug("YFinanceProvider.get_nav_history(%s) failed: %s", isin, e)
        return pd.DataFrame(columns=["date", "price"])

    def get_fund_info(self, isin: str) -> Dict[str, Any]:
        try:
            import yfinance as yf
            ticker = yf.Ticker(isin)
            info = ticker.info or {}
            return {
                "name": info.get("longName", info.get("shortName", isin)),
                "currency": info.get("currency", "EUR"),
                "source": "YahooFinance",
            }
        except Exception:
            return {}

    def get_sector_weights(self, isin: str) -> Dict[str, float]:
        return {}  # yfinance no provee sector weights de fondos

    def get_country_weights(self, isin: str) -> Dict[str, float]:
        return {}

    def get_holdings(self, isin: str) -> pd.DataFrame:
        return pd.DataFrame(columns=["name", "ticker", "weight", "market_value"])


# ---------------------------------------------------------------------------
# Composite Provider (Dual-strategy: speed for NAV, completeness for data)
# ---------------------------------------------------------------------------

class CompositeProvider(FundDataProvider):
    """
    Proveedor compuesto con estrategia dual de adquisición de datos.

    **NAV / Histórico** → prioriza velocidad (FMP → YFinance → MStar light)
    **Info / Sectores / Países / Holdings** → prioriza completitud (MStar → FMP → Finect)

    Para ``get_fund_info``: fusiona TODOS los proveedores (primer valor gana).
    Para ``get_sector_weights`` / ``get_country_weights`` / ``get_holdings``:
        fusiona resultados priorizando la fuente con más datos.
    """

    def __init__(
        self,
        providers: Optional[List[FundDataProvider]] = None,
        cache_path: Optional[str] = None,
    ):
        if providers is not None:
            # Modo legacy: se proporcionan los proveedores directamente
            self.providers = providers
            self._nav_chain = providers
            self._data_chain = providers
        else:
            from .finect_provider import FinectProvider

            fmp = FMPProvider()
            mstar = MStarProvider(cache_path=cache_path)
            yf = YFinanceProvider()
            finect = FinectProvider()

            # Cadena NAV: prioriza velocidad
            # FMP (~300ms, solo 1 request) → YFinance (~500ms) → MStar (usa caché/yfinance)
            # FMP es preferido porque: 1 HTTP call, no depende de pytz,
            # devuelve None rápido si no encuentra el ISIN
            self._nav_chain: List[FundDataProvider] = []
            if fmp.available:
                self._nav_chain.append(fmp)
            self._nav_chain.append(yf)
            self._nav_chain.append(mstar)

            # Cadena datos: prioriza completitud
            # MStar (más completo) → FMP (ETFs) → Finect (comisiones/gestora)
            self._data_chain: List[FundDataProvider] = [mstar]
            if fmp.available:
                self._data_chain.append(fmp)
            self._data_chain.append(finect)

            # Mantener .providers para compatibilidad (unión de ambas cadenas, sin duplicados)
            seen = set()
            self.providers: List[FundDataProvider] = []
            for p in self._nav_chain + self._data_chain:
                pid = id(p)
                if pid not in seen:
                    seen.add(pid)
                    self.providers.append(p)

    def _first_success(self, chain: List[FundDataProvider], method_name: str, isin: str, **kwargs):
        """Ejecuta method_name en cada proveedor de la cadena hasta obtener resultado."""
        for p in chain:
            try:
                result = getattr(p, method_name)(isin, **kwargs)
                if result is not None:
                    if isinstance(result, pd.DataFrame):
                        if not result.empty:
                            return result
                    elif isinstance(result, dict):
                        if result:
                            return result
                    else:
                        return result
            except Exception as e:
                logger.debug(
                    "%s.%s(%s) failed: %s", type(p).__name__, method_name, isin, e
                )
                continue
        return None

    # ------------------------------------------------------------------
    # NAV (velocidad ⚡) — usa _nav_chain
    # ------------------------------------------------------------------

    def get_nav(self, isin: str) -> Optional[float]:
        """NAV actual — cadena rápida: FMP → YFinance → MStar."""
        return self._first_success(self._nav_chain, "get_nav", isin)

    def get_nav_history(self, isin: str, years: int = 5) -> pd.DataFrame:
        """Histórico de precios — cadena rápida."""
        result = self._first_success(self._nav_chain, "get_nav_history", isin, years=years)
        return result if result is not None else pd.DataFrame(columns=["date", "price"])

    # ------------------------------------------------------------------
    # Info (completitud 📊) — fusiona TODOS los proveedores de _data_chain
    # ------------------------------------------------------------------

    def get_fund_info(self, isin: str) -> Dict[str, Any]:
        """Info fusionada de todos los proveedores de datos.

        Itera la cadena de datos y fusiona los resultados: el primer valor
        no vacío de cada campo gana.
        """
        merged: Dict[str, Any] = {}
        for p in self._data_chain:
            try:
                info = p.get_fund_info(isin)
                if info:
                    for k, v in info.items():
                        if k not in merged or merged[k] is None or merged[k] == "":
                            merged[k] = v
                        # Si el "name" actual es el propio ISIN, seguir buscando
                        if k == "name" and merged.get("name") == isin and v != isin:
                            merged["name"] = v
            except Exception:
                continue
        return merged

    # ------------------------------------------------------------------
    # Sectores / Países / Holdings (completitud 📊) — fusiona _data_chain
    # ------------------------------------------------------------------

    def get_sector_weights(self, isin: str) -> Dict[str, float]:
        """Distribución sectorial — devuelve la fuente más completa.

        Consulta todos los proveedores de datos y devuelve el resultado
        con más sectores (mayor granularidad).
        """
        best: Dict[str, float] = {}
        for p in self._data_chain:
            try:
                result = p.get_sector_weights(isin)
                if result and len(result) > len(best):
                    best = result
            except Exception:
                continue
        return best

    def get_country_weights(self, isin: str) -> Dict[str, float]:
        """Distribución geográfica — devuelve la fuente más completa."""
        best: Dict[str, float] = {}
        for p in self._data_chain:
            try:
                result = p.get_country_weights(isin)
                if result and len(result) > len(best):
                    best = result
            except Exception:
                continue
        return best

    def get_holdings(self, isin: str) -> pd.DataFrame:
        """Top holdings — devuelve la fuente con más posiciones."""
        best = pd.DataFrame(columns=["name", "ticker", "weight", "market_value"])
        for p in self._data_chain:
            try:
                result = p.get_holdings(isin)
                if result is not None and not result.empty and len(result) > len(best):
                    best = result
            except Exception:
                continue
        return best

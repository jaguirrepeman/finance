"""
data_providers.py — Proveedores de datos financieros (async).

Usa httpx.AsyncClient con connection pooling.
Todos los métodos de I/O son ``async def``.

Proveedores soportados:
  - FinectAsyncProvider:   Finect (NAV, info, sectores, regiones, holdings, historial)
  - FTAsyncProvider:       Financial Times (info, sectores, holdings)
  - YFinanceAsyncProvider: Yahoo Finance via asyncio.to_thread (NAV, historial)
  - FMPAsyncProvider:      FinancialModelingPrep (NAV, historial, info, sectores)
  - CompositeAsyncProvider: Orquestador dual-strategy con asyncio.gather

Estrategia de adquisición de datos:
  1. NAV: Finect → YFinance → FMP (early termination si ≤3 días)
  2. Historial: asyncio.gather(todos), "longest wins", merge complementario
  3. Info/Sectores/Países/Holdings: asyncio.gather(_data_chain), merge/best
"""

import asyncio
import json
import logging
import re
import time
import unicodedata
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import unquote

import pandas as pd

from .cache_store import (
    TTL_FUND_INFO,
    TTL_HOLDINGS,
    TTL_NAV,
    TTL_NAV_HISTORY,
    TTL_NAMES,
    TTL_REGIONS,
    TTL_SECTORS,
    TTL_SITEMAP,
    CacheStore,
)
from .http_client import fetch_with_retry, get_http_client

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------

def _get_fmp_api_key() -> Optional[str]:
    """Lee la API key de FMP desde variable de entorno o config.json."""
    import os

    key = os.environ.get("FMP_API_KEY")
    if key:
        return key
    config_path = Path(__file__).resolve().parent.parent.parent / "data" / "config.json"
    if config_path.exists():
        with open(config_path, encoding="utf-8") as f:
            cfg = json.load(f)
            return cfg.get("FMP_API_KEY")
    return None


# Clave pública de la API de Finect
_FINECT_API_KEY = "OgcqanUxQ4S6Y5VVvnwlJayUuxeg8Ah5"
_FINECT_API_BASE = "https://api.finect.com/v4"

# Sitemaps de Finect
_SITEMAP_URLS = [
    "https://www.finect.com/v4/bff/sitemap/funds.xml",
    "https://www.finect.com/v4/bff/sitemap/etfs.xml",
]


# ---------------------------------------------------------------------------
# Interfaz base async
# ---------------------------------------------------------------------------


class AsyncFundDataProvider(ABC):
    """Interfaz que todo proveedor async de datos de fondos debe implementar."""

    @abstractmethod
    async def get_nav(self, isin: str) -> Optional[float]:
        """Precio actual (NAV)."""

    async def get_nav_date(self, isin: str) -> Optional[str]:
        """Fecha del último dato NAV (YYYY-MM-DD)."""
        return None

    @abstractmethod
    async def get_nav_history(self, isin: str, years: int = 5) -> pd.DataFrame:
        """Histórico de precios. Columnas: [date, price]."""

    @abstractmethod
    async def get_fund_info(self, isin: str) -> Dict[str, Any]:
        """Info general del fondo."""

    @abstractmethod
    async def get_sector_weights(self, isin: str) -> Dict[str, float]:
        """Distribución sectorial."""

    @abstractmethod
    async def get_country_weights(self, isin: str) -> Dict[str, float]:
        """Distribución geográfica."""

    @abstractmethod
    async def get_holdings(self, isin: str) -> pd.DataFrame:
        """Top holdings. Columnas: [name, ticker, weight, market_value]."""


# ---------------------------------------------------------------------------
# Finect Async Provider
# ---------------------------------------------------------------------------

# Helpers de parseo (sin I/O, reutilizados del módulo original)

def _clean_column_name(name: str) -> str:
    name = name.lower()
    name = "".join(
        c for c in unicodedata.normalize("NFKD", name)
        if unicodedata.category(c) != "Mn"
    )
    name = re.sub(r"\s+", "_", name)
    name = re.sub(r"[^a-z0-9_]", "", name)
    return name


def _extract_header(model: Dict[str, Any]) -> Dict[str, Any]:
    info: Dict[str, Any] = {}
    if name := model.get("name"):
        info["name"] = name
    mc = model.get("managementCompany", {})
    if mc and mc.get("name"):
        info["management_company"] = mc["name"]
    cat = model.get("category", {})
    if cat and cat.get("name"):
        info["category"] = cat["name"]
        info["categoryName"] = cat["name"]
    if desc := model.get("description"):
        info["description"] = desc
    if srri := model.get("srri"):
        info["srri"] = srri
    if tna := model.get("totalNetAsset"):
        info["total_net_asset"] = tna
    # Inception date: try managementStart at model level, then classes
    launch = model.get("managementStart")
    if not launch:
        for cls in model.get("classes", []):
            launch = cls.get("launchDate") or cls.get("managementStart")
            if launch:
                break
    if launch:
        # Normalize to YYYY-MM-DD
        info["inception_date"] = str(launch)[:10]
    return info


def _extract_ratings(model: Dict[str, Any]) -> Dict[str, Any]:
    ratings_data: Dict[str, Any] = {}
    for r in model.get("ratings", []):
        provider = r.get("provider", "unknown")
        value = r.get("value")
        if value is not None:
            ratings_data[f"rating_{provider}"] = value
    return ratings_data


def _extract_fees(model: Dict[str, Any], isin: str) -> Dict[str, Any]:
    fees: Dict[str, Any] = {}
    _FEE_NAME_MAP = {
        "mgr": "comision_de_gestion",
        "ter": "total_expense_ratio",
        "ogc": "ongoing_charge",
        "red": "comision_de_reembolso",
        "cus": "comision_de_custodia",
        "suc": "comision_de_suscripcion",
        "flo": "initial_charge",
    }
    for cls in model.get("classes", []):
        if cls.get("isin") == isin:
            cls_fees = cls.get("fees", {})
            for fee_key, fee_data in cls_fees.items():
                if fee_data and fee_data.get("value") is not None:
                    mapped = _FEE_NAME_MAP.get(fee_key, fee_key)
                    fees[mapped] = fee_data["value"]
            break
    return fees


def _extract_stats(model: Dict[str, Any]) -> Dict[str, Any]:
    stats: Dict[str, Any] = {}
    raw_stats = model.get("stats", {})
    _PERIOD_MAP = {"M12": "1y", "M36": "3y", "M60": "5y", "M120": "10y"}
    _METRIC_KEYS = (
        "annualizedReturn", "sharpeRatio", "alpha", "beta",
        "standardDeviation", "maxDrawdown", "trackingError",
        "correlation", "informationRatio", "r2",
    )
    for key in _METRIC_KEYS:
        periods = raw_stats.get(key, [])
        if not periods:
            continue
        col_base = _clean_column_name(key)
        for entry in periods:
            period_code = entry.get("period", "")
            suffix = _PERIOD_MAP.get(period_code)
            if suffix:
                stats[f"{col_base}_{suffix}"] = entry.get("value")
        best = max(periods, key=lambda p: int(p.get("period", "M0")[1:]))
        stats[col_base] = best.get("value")
    return stats


def _extract_breakdown(model: Dict[str, Any], breakdown_type: str) -> Dict[str, float]:
    result: Dict[str, float] = {}
    for b_block in model.get("breakdown", []):
        if b_block.get("type") != breakdown_type:
            continue
        for item in b_block.get("items", []):
            drawer = item.get("drawer", "")
            values = item.get("values", {})
            long_val = values.get("long", 0.0)
            if long_val:
                result[drawer] = round(long_val, 4)
    return result


def _extract_nav(model: Dict[str, Any], isin: str) -> tuple:
    for cls in model.get("classes", []):
        if cls.get("isin") == isin:
            quote = cls.get("lastQuote") or {}
            price = quote.get("price")
            dt = quote.get("datetime")
            if price is not None and price > 0:
                return float(price), dt[:10] if dt else None
    quote = model.get("lastQuote") or {}
    price = quote.get("price")
    dt = quote.get("datetime")
    if price is not None and price > 0:
        return float(price), dt[:10] if dt else None
    return None, None


def _extract_holdings(model: Dict[str, Any]) -> pd.DataFrame:
    portfolio = model.get("portfolio", {})
    holdings_list = portfolio.get("holdings", [])
    if not holdings_list:
        return pd.DataFrame(columns=["name", "ticker", "weight", "market_value"])
    rows = []
    for h in holdings_list:
        rows.append({
            "name": h.get("name", ""),
            "ticker": h.get("isin", "") or "",
            "weight": h.get("weight", 0.0),
            "market_value": float(h.get("amount", 0)),
        })
    return pd.DataFrame(rows)


def _parse_quotes_response(raw: Any) -> pd.DataFrame:
    rows = []
    if isinstance(raw, dict):
        items = raw.get("items") or raw.get("data") or raw.get("quotes") or []
    elif isinstance(raw, list):
        items = raw
    else:
        return pd.DataFrame(columns=["date", "price"])

    for item in items:
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            try:
                ts = int(item[0])
                price = float(item[1])
                date_str = pd.Timestamp(ts, unit="ms").strftime("%Y-%m-%d")
                rows.append({"date": date_str, "price": price})
            except (ValueError, TypeError, OverflowError):
                pass
        elif isinstance(item, dict):
            price = item.get("nav") or item.get("price") or item.get("close") or item.get("value")
            date = item.get("date") or item.get("datetime") or item.get("timestamp")
            if price is not None and date is not None:
                try:
                    if isinstance(date, (int, float)):
                        date = pd.Timestamp(int(date), unit="ms").strftime("%Y-%m-%d")
                    else:
                        date = str(date)[:10]
                    rows.append({"date": date, "price": float(price)})
                except (ValueError, TypeError):
                    pass

    if not rows:
        return pd.DataFrame(columns=["date", "price"])
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    return df.sort_values("date").drop_duplicates("date").reset_index(drop=True)


class FinectAsyncProvider(AsyncFundDataProvider):
    """Proveedor async basado en el JSON INITIAL_STATE de Finect."""

    def __init__(self, cache: CacheStore) -> None:
        self._cache = cache
        self._model_cache: Dict[str, Optional[Dict]] = {}
        self._nav_date_cache: Dict[str, str] = {}
        self._sitemap_index: Optional[Dict[str, str]] = None

    async def _load_sitemap_index(self) -> Dict[str, str]:
        """Carga el sitemap desde cache o lo descarga."""
        if self._sitemap_index is not None:
            return self._sitemap_index

        # Intentar cache SQLite
        cached = await self._cache.aget("finect:sitemap_index")
        if cached:
            self._sitemap_index = cached
            return cached

        # Descargar sitemaps
        logger.info("Descargando sitemaps de Finect...")
        index: Dict[str, str] = {}
        isin_pattern = re.compile(
            r"<loc>(https://www\.finect\.com/(?:fondos-inversion|etfs)/"
            r"([A-Z]{2}[A-Z0-9]{9}\d)-[^<]+)</loc>"
        )

        for sitemap_url in _SITEMAP_URLS:
            resp = await fetch_with_retry(sitemap_url)
            if resp:
                for match in isin_pattern.finditer(resp.text):
                    url = match.group(1)
                    isin_found = match.group(2)
                    if isin_found not in index:
                        index[isin_found] = url

        if index:
            await self._cache.aset("finect:sitemap_index", index, TTL_SITEMAP)
            logger.info("Índice Finect guardado: %d ISINs", len(index))

        self._sitemap_index = index
        return index

    async def _get_model(self, isin: str) -> Optional[Dict[str, Any]]:
        """Obtiene el modelo JSON del fondo (cache en sesión + HTTP)."""
        if isin in self._model_cache:
            return self._model_cache[isin]

        sitemap = await self._load_sitemap_index()
        url = sitemap.get(isin)
        if url is None:
            self._model_cache[isin] = None
            return None

        resp = await fetch_with_retry(url)
        if resp is None:
            self._model_cache[isin] = None
            return None

        # Extraer window.INITIAL_STATE
        match = re.search(r'window\.INITIAL_STATE\s*=\s*"([^"]+)"', resp.text)
        if not match:
            self._model_cache[isin] = None
            return None

        try:
            raw = match.group(1)
            decoded = unquote(raw).strip().rstrip(";").strip('"')
            data = json.loads(decoded)
            model = data.get("fund", {}).get("fund", {}).get("model")
            self._model_cache[isin] = model
            return model
        except (json.JSONDecodeError, KeyError, TypeError):
            self._model_cache[isin] = None
            return None

    async def get_nav(self, isin: str) -> Optional[float]:
        model = await self._get_model(isin)
        if model is None:
            return None
        price, date_str = _extract_nav(model, isin)
        if price is not None and date_str:
            self._nav_date_cache[isin] = date_str
        return price

    async def get_nav_date(self, isin: str) -> Optional[str]:
        if isin in self._nav_date_cache:
            return self._nav_date_cache[isin]
        model = await self._get_model(isin)
        if model is None:
            return None
        _, date_str = _extract_nav(model, isin)
        if date_str:
            self._nav_date_cache[isin] = date_str
        return date_str

    async def get_nav_history(self, isin: str, years: int = 5) -> pd.DataFrame:
        model = await self._get_model(isin)
        if model is None:
            return pd.DataFrame(columns=["date", "price"])

        class_id: Optional[str] = None
        for cls in model.get("classes", []):
            if cls.get("isin") == isin:
                class_id = cls.get("id")
                break
        if class_id is None:
            class_id = model.get("id")
        if class_id is None:
            return pd.DataFrame(columns=["date", "price"])

        start_date = (datetime.now() - timedelta(days=years * 365)).strftime("%Y-%m-%d")
        url = (
            f"{_FINECT_API_BASE}/products/collectives/funds/"
            f"{class_id}/timeseries?start={start_date}"
        )

        resp = await fetch_with_retry(
            url,
            headers={"Accept": "application/json", "key": _FINECT_API_KEY},
        )
        if resp is None:
            return pd.DataFrame(columns=["date", "price"])

        ct = resp.headers.get("content-type", "")
        if "json" not in ct:
            return pd.DataFrame(columns=["date", "price"])

        try:
            raw = resp.json()
            return _parse_quotes_response(raw)
        except Exception:
            return pd.DataFrame(columns=["date", "price"])

    async def get_fund_info(self, isin: str) -> Dict[str, Any]:
        model = await self._get_model(isin)
        if model is None:
            return {}
        info: Dict[str, Any] = {"isin": isin, "source": "Finect"}
        info.update(_extract_header(model))
        info.update(_extract_ratings(model))
        info.update(_extract_fees(model, isin))
        info.update(_extract_stats(model))
        return info

    async def get_sector_weights(self, isin: str) -> Dict[str, float]:
        model = await self._get_model(isin)
        if model is None:
            return {}
        return _extract_breakdown(model, "stock-sector")

    async def get_country_weights(self, isin: str) -> Dict[str, float]:
        model = await self._get_model(isin)
        if model is None:
            return {}
        return _extract_breakdown(model, "regional-exposure")

    async def get_holdings(self, isin: str) -> pd.DataFrame:
        model = await self._get_model(isin)
        if model is None:
            return pd.DataFrame(columns=["name", "ticker", "weight", "market_value"])
        return _extract_holdings(model)

    async def get_asset_allocation(self, isin: str) -> Dict[str, float]:
        model = await self._get_model(isin)
        if model is None:
            return {}
        return _extract_breakdown(model, "asset-allocation")


# ---------------------------------------------------------------------------
# FT Async Provider
# ---------------------------------------------------------------------------


class FTAsyncProvider(AsyncFundDataProvider):
    """Proveedor async para Financial Times (scraping HTML)."""

    def __init__(self) -> None:
        self._symbol_cache: Dict[str, Optional[str]] = {}

    async def _get_ft_symbol(self, isin: str) -> str:
        if isin in self._symbol_cache:
            return self._symbol_cache[isin] or f"{isin}:EUR"

        resp = await fetch_with_retry(
            f"https://markets.ft.com/data/searchapi/searchsecurities?query={isin}"
        )
        if resp:
            try:
                data = resp.json()
                securities = data.get("data", {}).get("security", [])
                if securities:
                    symbol = securities[0].get("symbol")
                    if symbol:
                        self._symbol_cache[isin] = symbol
                        return symbol
            except Exception:
                pass

        self._symbol_cache[isin] = None
        return f"{isin}:EUR"

    async def _fetch_soup(self, url: str):
        from bs4 import BeautifulSoup

        resp = await fetch_with_retry(url)
        if resp and len(resp.text) > 70000:
            return BeautifulSoup(resp.text, "html.parser")
        return None

    async def get_nav(self, isin: str) -> Optional[float]:
        symbol = await self._get_ft_symbol(isin)
        soup = await self._fetch_soup(
            f"https://markets.ft.com/data/funds/tearsheet/summary?s={symbol}"
        )
        if not soup:
            return None
        try:
            price_elem = soup.find("span", class_="mod-ui-data-list__value")
            if price_elem:
                return float(price_elem.text.replace(",", ""))
        except (ValueError, AttributeError):
            pass
        return None

    async def get_nav_history(self, isin: str, years: int = 5) -> pd.DataFrame:
        return pd.DataFrame(columns=["date", "price"])

    async def get_fund_info(self, isin: str) -> Dict[str, Any]:
        symbol = await self._get_ft_symbol(isin)
        soup = await self._fetch_soup(
            f"https://markets.ft.com/data/funds/tearsheet/summary?s={symbol}"
        )
        info: Dict[str, Any] = {"source": "FinancialTimes"}
        if not soup:
            return info

        try:
            title_elem = soup.find("h1", class_="mod-tearsheet-overview__header__name")
            if title_elem:
                info["name"] = title_elem.text.strip()
            for tbl in soup.find_all("table"):
                text = tbl.get_text()
                if "Ongoing charge" in text or "Fund type" in text:
                    for row in tbl.find_all("tr"):
                        th = row.find("th")
                        td = row.find("td")
                        if th and td:
                            k = th.text.strip().lower()
                            v = td.text.strip()
                            if "ongoing charge" in k:
                                info["ongoing_charge"] = v
                            elif "initial charge" in k:
                                info["initial_charge"] = v
                            elif "fund type" in k:
                                info["category"] = v
        except Exception as e:
            logger.debug("FTAsyncProvider: Error parsing info for %s: %s", isin, e)
        return info

    async def get_sector_weights(self, isin: str) -> Dict[str, float]:
        symbol = await self._get_ft_symbol(isin)
        soup = await self._fetch_soup(
            f"https://markets.ft.com/data/funds/tearsheet/holdings?s={symbol}"
        )
        sectors: Dict[str, float] = {}
        if not soup:
            return sectors

        try:
            for tbl in soup.find_all("table"):
                headers = [th.text.strip().lower() for th in tbl.find_all("th")]
                if "sector" in headers and "% net assets" in headers:
                    first_td = tbl.find("td")
                    if first_td:
                        txt = first_td.text.lower()
                        if any(kw in txt for kw in ("technology", "financial", "cyclical", "industrial", "energy")):
                            for row in tbl.find_all("tr"):
                                tds = row.find_all("td")
                                if len(tds) >= 2:
                                    name = tds[0].text.strip()
                                    val_str = tds[1].text.strip().replace("%", "")
                                    try:
                                        sectors[name] = float(val_str)
                                    except ValueError:
                                        pass
                            break
        except Exception as e:
            logger.debug("FTAsyncProvider: Error parsing sectors for %s: %s", isin, e)
        return sectors

    async def get_country_weights(self, isin: str) -> Dict[str, float]:
        symbol = await self._get_ft_symbol(isin)
        soup = await self._fetch_soup(
            f"https://markets.ft.com/data/funds/tearsheet/holdings?s={symbol}"
        )
        regions: Dict[str, float] = {}
        if not soup:
            return regions

        try:
            for tbl in soup.find_all("table"):
                headers = [th.text.strip().lower() for th in tbl.find_all("th")]
                if "sector" in headers and "% net assets" in headers:
                    first_td = tbl.find("td")
                    if first_td:
                        txt = first_td.text.lower()
                        if any(kw in txt for kw in ("eurozone", "america", "europe", "asia", "kingdom", "market", "state")):
                            for row in tbl.find_all("tr"):
                                tds = row.find_all("td")
                                if len(tds) >= 2:
                                    name = tds[0].text.strip()
                                    val_str = tds[1].text.strip().replace("%", "")
                                    try:
                                        regions[name] = float(val_str)
                                    except ValueError:
                                        pass
                            break
        except Exception as e:
            logger.debug("FTAsyncProvider: Error parsing countries for %s: %s", isin, e)
        return regions

    async def get_holdings(self, isin: str) -> pd.DataFrame:
        symbol = await self._get_ft_symbol(isin)
        soup = await self._fetch_soup(
            f"https://markets.ft.com/data/funds/tearsheet/holdings?s={symbol}"
        )
        rows: List[Dict] = []
        if not soup:
            return pd.DataFrame(columns=["name", "ticker", "weight", "market_value"])

        try:
            for tbl in soup.find_all("table"):
                headers = [th.text.strip().lower() for th in tbl.find_all("th")]
                if "company" in headers and "portfolio weight" in headers:
                    for row in tbl.find_all("tr"):
                        tds = row.find_all("td")
                        if len(tds) >= 3:
                            name_ticker = tds[0].text.strip()
                            weight_str = tds[2].text.strip().replace("%", "")
                            name = name_ticker
                            ticker = ""
                            ticker_span = tds[0].find("span", class_="mod-ui-symbol-and-name__symbol")
                            if ticker_span:
                                ticker = ticker_span.text.strip()
                                name = name.replace(ticker, "").strip()
                            try:
                                weight = float(weight_str)
                                rows.append({"name": name, "ticker": ticker, "weight": weight, "market_value": 0.0})
                            except ValueError:
                                pass
                    break
        except Exception as e:
            logger.debug("FTAsyncProvider: Error parsing holdings for %s: %s", isin, e)

        if not rows:
            return pd.DataFrame(columns=["name", "ticker", "weight", "market_value"])
        return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# YFinance Async Provider (via asyncio.to_thread)
# ---------------------------------------------------------------------------


class YFinanceAsyncProvider(AsyncFundDataProvider):
    """Wrapper async sobre yfinance (sync) usando asyncio.to_thread."""

    def __init__(self) -> None:
        self._last_nav_dates: Dict[str, str] = {}

    async def get_nav(self, isin: str) -> Optional[float]:
        def _sync():
            import yfinance as yf
            ticker = yf.Ticker(isin)
            hist = ticker.history(period="5d")
            if hist is not None and not hist.empty:
                last_idx = hist.index[-1]
                try:
                    date_str = last_idx.date().isoformat()
                except AttributeError:
                    date_str = str(last_idx)[:10]
                self._last_nav_dates[isin] = date_str
                price = float(hist["Close"].iloc[-1])
                currency = ticker.info.get("currency", "EUR") if ticker.info else "EUR"
                if currency == "USD":
                    fx = yf.Ticker("USDEUR=X")
                    fx_hist = fx.history(period="2d")
                    if fx_hist is not None and not fx_hist.empty:
                        price = price * float(fx_hist["Close"].iloc[-1])
                elif currency == "GBp":
                    # London-listed prices quoted in pence — convert to GBP then EUR
                    fx_gbp = yf.Ticker("GBPEUR=X")
                    fx_hist = fx_gbp.history(period="2d")
                    if fx_hist is not None and not fx_hist.empty:
                        price = (price / 100.0) * float(fx_hist["Close"].iloc[-1])
                return price
            return None

        try:
            return await asyncio.to_thread(_sync)
        except Exception as e:
            logger.debug("YFinanceAsync.get_nav(%s) failed: %s", isin, e)
            return None

    async def get_nav_date(self, isin: str) -> Optional[str]:
        return self._last_nav_dates.get(isin)

    async def get_nav_history(self, isin: str, years: int = 5) -> pd.DataFrame:
        def _sync():
            import yfinance as yf
            period_map = {1: "1y", 3: "3y", 5: "5y", 10: "10y"}
            period = period_map.get(years, f"{years}y")
            ticker = yf.Ticker(isin)
            hist = ticker.history(period=period)
            if hist is None or hist.empty:
                return pd.DataFrame(columns=["date", "price"])
            df = hist.reset_index()[["Date", "Close"]].rename(
                columns={"Date": "date", "Close": "price"}
            )
            df["date"] = pd.to_datetime(df["date"]).dt.tz_localize(None)
            # Convert USD/GBp prices to EUR
            currency = ticker.info.get("currency", "EUR") if ticker.info else "EUR"
            if currency == "USD":
                fx = yf.Ticker("USDEUR=X")
                fx_hist = fx.history(period=period)
                if fx_hist is not None and not fx_hist.empty:
                    fx_df = fx_hist.reset_index()[["Date", "Close"]].rename(
                        columns={"Date": "date", "Close": "fx"}
                    )
                    fx_df["date"] = pd.to_datetime(fx_df["date"]).dt.tz_localize(None)
                    df = df.merge(fx_df, on="date", how="left")
                    df["fx"] = df["fx"].ffill().bfill()
                    df["price"] = df["price"] * df["fx"]
                    df = df.drop(columns=["fx"])
            elif currency == "GBp":
                fx = yf.Ticker("GBPEUR=X")
                fx_hist = fx.history(period=period)
                if fx_hist is not None and not fx_hist.empty:
                    fx_df = fx_hist.reset_index()[["Date", "Close"]].rename(
                        columns={"Date": "date", "Close": "fx"}
                    )
                    fx_df["date"] = pd.to_datetime(fx_df["date"]).dt.tz_localize(None)
                    df = df.merge(fx_df, on="date", how="left")
                    df["fx"] = df["fx"].ffill().bfill()
                    df["price"] = (df["price"] / 100.0) * df["fx"]
                    df = df.drop(columns=["fx"])
            return df.reset_index(drop=True)

        try:
            return await asyncio.to_thread(_sync)
        except Exception as e:
            logger.debug("YFinanceAsync.get_nav_history(%s) failed: %s", isin, e)
            return pd.DataFrame(columns=["date", "price"])

    async def get_fund_info(self, isin: str) -> Dict[str, Any]:
        def _sync():
            import yfinance as yf
            ticker = yf.Ticker(isin)
            info = ticker.info or {}
            return {
                "name": info.get("longName", info.get("shortName", isin)),
                "currency": info.get("currency", "EUR"),
                "source": "YahooFinance",
            }

        try:
            return await asyncio.to_thread(_sync)
        except Exception:
            return {}

    async def get_sector_weights(self, isin: str) -> Dict[str, float]:
        # yfinance sector_weightings is unreliable for EU funds
        return {}

    async def get_country_weights(self, isin: str) -> Dict[str, float]:
        return {}

    async def get_holdings(self, isin: str) -> pd.DataFrame:
        return pd.DataFrame(columns=["name", "ticker", "weight", "market_value"])


# ---------------------------------------------------------------------------
# FMP Async Provider
# ---------------------------------------------------------------------------


class FMPAsyncProvider(AsyncFundDataProvider):
    """FinancialModelingPrep async — free tier (250 req/día)."""

    BASE_URL = "https://financialmodelingprep.com/stable"

    def __init__(self, api_key: Optional[str] = None) -> None:
        self.api_key = api_key or _get_fmp_api_key()
        self._symbol_cache: Dict[str, Optional[str]] = {}

    @property
    def available(self) -> bool:
        return self.api_key is not None

    async def _get(self, endpoint: str, params: Optional[Dict] = None) -> Any:
        if not self.api_key:
            return None
        params = params or {}
        params["apikey"] = self.api_key
        url = f"{self.BASE_URL}/{endpoint}"
        resp = await fetch_with_retry(url, params=params)
        if resp:
            try:
                return resp.json()
            except Exception:
                pass
        return None

    async def _resolve_symbol(self, isin: str) -> Optional[str]:
        if isin in self._symbol_cache:
            return self._symbol_cache[isin]

        data = await self._get("search-isin", {"isin": isin})
        symbol = None
        if data and isinstance(data, list) and len(data) > 0:
            symbol = data[0].get("symbol")

        if not symbol:
            data = await self._get("search", {"query": isin, "limit": "5"})
            if data and isinstance(data, list):
                for item in data:
                    if item.get("isin") == isin or isin in (item.get("name") or ""):
                        symbol = item.get("symbol")
                        break
                if not symbol and len(data) > 0:
                    symbol = data[0].get("symbol")

        self._symbol_cache[isin] = symbol
        return symbol

    async def get_nav(self, isin: str) -> Optional[float]:
        symbol = await self._resolve_symbol(isin)
        if not symbol:
            return None
        data = await self._get("quote-short", {"symbol": symbol})
        if data and isinstance(data, list) and len(data) > 0:
            return data[0].get("price")
        return None

    async def get_nav_date(self, isin: str) -> Optional[str]:
        # FMP no proporciona fecha de NAV de forma directa
        return None

    async def get_nav_history(self, isin: str, years: int = 5) -> pd.DataFrame:
        symbol = await self._resolve_symbol(isin)
        if not symbol:
            return pd.DataFrame(columns=["date", "price"])
        start = (datetime.now() - timedelta(days=years * 365)).strftime("%Y-%m-%d")
        data = await self._get("historical-price-eod/light", {"symbol": symbol, "from": start})
        if not data or not isinstance(data, list):
            return pd.DataFrame(columns=["date", "price"])
        df = pd.DataFrame(data)
        if "date" in df.columns and "close" in df.columns:
            df = df.rename(columns={"close": "price"})[["date", "price"]]
            df["date"] = pd.to_datetime(df["date"])
            df = df.sort_values("date").reset_index(drop=True)
            return df
        return pd.DataFrame(columns=["date", "price"])

    async def get_fund_info(self, isin: str) -> Dict[str, Any]:
        symbol = await self._resolve_symbol(isin)
        if not symbol:
            return {}
        info = await self._get("etf/info", {"symbol": symbol})
        if info and isinstance(info, list) and len(info) > 0:
            item = info[0]
            return {
                "name": item.get("name", ""),
                "symbol": symbol,
                "expense_ratio": item.get("expenseRatio"),
                "aum": item.get("aum"),
                "inception_date": item.get("inceptionDate"),
                "currency": item.get("currency", "EUR"),
                "source": "FMP",
            }
        profile = await self._get("profile", {"symbol": symbol})
        if profile and isinstance(profile, list) and len(profile) > 0:
            item = profile[0]
            return {
                "name": item.get("companyName", ""),
                "symbol": symbol,
                "sector": item.get("sector", ""),
                "currency": item.get("currency", "EUR"),
                "source": "FMP",
            }
        return {}

    async def get_sector_weights(self, isin: str) -> Dict[str, float]:
        symbol = await self._resolve_symbol(isin)
        if not symbol:
            return {}
        data = await self._get("etf/sector-weightings", {"symbol": symbol})
        if data and isinstance(data, list):
            return {item["sector"]: item["weightPercentage"] for item in data if "sector" in item}
        return {}

    async def get_country_weights(self, isin: str) -> Dict[str, float]:
        symbol = await self._resolve_symbol(isin)
        if not symbol:
            return {}
        data = await self._get("etf/country-weightings", {"symbol": symbol})
        if data and isinstance(data, list):
            return {item["country"]: item["weightPercentage"] for item in data if "country" in item}
        return {}

    async def get_holdings(self, isin: str) -> pd.DataFrame:
        symbol = await self._resolve_symbol(isin)
        if not symbol:
            return pd.DataFrame(columns=["name", "ticker", "weight", "market_value"])
        data = await self._get("etf/holdings", {"symbol": symbol})
        if data and isinstance(data, list):
            rows = []
            for h in data[:25]:
                rows.append({
                    "name": h.get("name", ""),
                    "ticker": h.get("asset", ""),
                    "weight": h.get("weightPercentage", 0),
                    "market_value": h.get("marketValue", 0),
                })
            return pd.DataFrame(rows)
        return pd.DataFrame(columns=["name", "ticker", "weight", "market_value"])


# ---------------------------------------------------------------------------
# Composite Async Provider (Dual-strategy orchestrator)
# ---------------------------------------------------------------------------


# ISINs priced in a foreign currency (e.g. USD) — Finect may return
# the raw foreign-currency price without conversion.  Force yfinance,
# which explicitly converts to EUR via the FX rate.
#
# XS2940466316: iShares Bitcoin ETP — listed on Amsterdam (AMS) in USD.
#   yfinance reports currency="USD"; the EUR-denominated class on Xetra
#   uses the same ISIN but yfinance resolves to the AMS/USD listing.
#   Adding here forces USD→EUR FX conversion in get_nav and get_nav_history.
_FORCE_YF_ISINS: frozenset = frozenset([
    "IE00B4ND3602",  # iShares Physical Gold ETC (USD-priced on exchange)
    "XS2940466316",  # iShares Bitcoin ETP (Amsterdam USD listing; need EUR conversion)
])


class CompositeAsyncProvider:
    """Proveedor compuesto async con estrategia dual.

    NAV/Histórico → prioriza velocidad (early termination)
    Info/Sectores/Países/Holdings → prioriza completitud (gather + merge)
    """

    def __init__(self, cache: CacheStore, force_refresh: bool = False) -> None:
        self._cache = cache
        self._force_refresh = force_refresh
        self._nav_freshness_days = 3

        # Instanciar providers
        self._finect = FinectAsyncProvider(cache)
        self._ft = FTAsyncProvider()
        self._yf = YFinanceAsyncProvider()
        self._fmp = FMPAsyncProvider()

        # Cadenas por propósito
        self._nav_chain: List[AsyncFundDataProvider] = [self._finect, self._yf]
        if self._fmp.available:
            self._nav_chain.append(self._fmp)

        self._history_chain: List[AsyncFundDataProvider] = [self._finect, self._yf]
        if self._fmp.available:
            self._history_chain.append(self._fmp)

        self._data_chain: List[AsyncFundDataProvider] = [self._finect, self._ft, self._yf]
        if self._fmp.available:
            self._data_chain.append(self._fmp)

    def _is_fresh(self, date_str: Optional[str]) -> bool:
        """Comprueba si una fecha es ≤ _nav_freshness_days."""
        if not date_str:
            return False
        try:
            nav_date = datetime.strptime(date_str[:10], "%Y-%m-%d")
            delta = (datetime.now() - nav_date).days
            return delta <= self._nav_freshness_days
        except (ValueError, TypeError):
            return False

    # ------------------------------------------------------------------
    # NAV (velocidad — early termination)
    # ------------------------------------------------------------------

    async def get_nav(self, isin: str) -> Optional[float]:
        """NAV actual con early termination sobre la cadena."""
        # For USD-priced instruments, always use yfinance (handles FX conversion).
        if isin in _FORCE_YF_ISINS:
            try:
                price = await self._yf.get_nav(isin)
                if price and price > 0:
                    nav_date = await self._yf.get_nav_date(isin)
                    await self._cache.aset(CacheStore.nav_key(isin), price, TTL_NAV)
                    if nav_date:
                        await self._cache.aset(CacheStore.nav_date_key(isin), nav_date, TTL_NAV)
                    return price
            except Exception as e:
                logger.debug("YF.get_nav(%s) fallback failed: %s", isin, e)

        # Check cache primero
        if not self._force_refresh:
            cached = await self._cache.aget(CacheStore.nav_key(isin))
            if cached is not None:
                cached_date = await self._cache.aget(CacheStore.nav_date_key(isin))
                if self._is_fresh(cached_date):
                    return cached

        best_price: Optional[float] = None
        best_date: Optional[str] = None

        for p in self._nav_chain:
            pname = type(p).__name__
            try:
                price = await p.get_nav(isin)
                if price is None or price <= 0:
                    continue

                nav_date = await p.get_nav_date(isin)

                if best_date is None or (nav_date and nav_date > best_date):
                    best_price = price
                    best_date = nav_date

                if self._is_fresh(nav_date):
                    logger.debug("NAV %s accepted from %s (fresh: %s)", isin, pname, nav_date)
                    break
            except Exception as e:
                logger.debug("%s.get_nav(%s) failed: %s", pname, isin, e)
                continue

        # Guardar en cache
        if best_price is not None:
            await self._cache.aset(CacheStore.nav_key(isin), best_price, TTL_NAV)
            if best_date:
                await self._cache.aset(CacheStore.nav_date_key(isin), best_date, TTL_NAV)

        return best_price

    async def get_nav_date(self, isin: str) -> Optional[str]:
        """Fecha del último NAV — recorre cadena con early termination."""
        cached = await self._cache.aget(CacheStore.nav_date_key(isin))
        if cached and self._is_fresh(cached):
            return cached

        best_date: Optional[str] = None
        for p in self._nav_chain:
            try:
                d = await p.get_nav_date(isin)
                if d and (best_date is None or d > best_date):
                    best_date = d
                    if self._is_fresh(d):
                        break
            except Exception:
                continue
        return best_date

    # ------------------------------------------------------------------
    # NAV History (completitud — parallel "longest wins")
    # ------------------------------------------------------------------

    async def get_nav_history(self, isin: str, years: int = 5) -> pd.DataFrame:
        """Histórico: gather todos los providers, devuelve la serie más larga."""
        # For USD-priced instruments, always fetch from yfinance (handles FX).
        if isin in _FORCE_YF_ISINS:
            try:
                df = await self._yf.get_nav_history(isin, years=years)
                if df is not None and not df.empty:
                    df = df.copy()
                    df["date"] = pd.to_datetime(df["date"]).dt.tz_localize(None)
                    cache_data = df[["date", "price"]].copy()
                    cache_data["date"] = cache_data["date"].dt.strftime("%Y-%m-%d")
                    await self._cache.aset(
                        CacheStore.nav_history_key(isin, years),
                        cache_data.to_dict(orient="records"),
                        TTL_NAV_HISTORY,
                    )
                    return df
            except Exception as e:
                logger.debug("YF.get_nav_history(%s) failed: %s", isin, e)

        # Check cache
        if not self._force_refresh:
            cached = await self._cache.aget(CacheStore.nav_history_key(isin, years))
            if cached is not None:
                df = pd.DataFrame(cached)
                if not df.empty:
                    df["date"] = pd.to_datetime(df["date"])
                    return df

        async def _fetch(p: AsyncFundDataProvider) -> pd.DataFrame:
            try:
                df = await p.get_nav_history(isin, years=years)
                if df is not None and not df.empty and "date" in df.columns:
                    df = df.copy()
                    df["date"] = pd.to_datetime(df["date"]).dt.tz_localize(None)
                    return df.dropna(subset=["price"]).reset_index(drop=True)
            except Exception as exc:
                logger.debug("%s history(%s) failed: %s", type(p).__name__, isin, exc)
            return pd.DataFrame(columns=["date", "price"])

        results = await asyncio.gather(*[_fetch(p) for p in self._history_chain])
        non_empty = [r for r in results if not r.empty]

        if not non_empty:
            return pd.DataFrame(columns=["date", "price"])

        if len(non_empty) == 1:
            result = non_empty[0]
        else:
            # Merge: concatenar y deduplicar por fecha (keep longest)
            sorted_by_len = sorted(non_empty, key=len)
            combined = pd.concat(sorted_by_len).drop_duplicates(subset="date", keep="last")
            result = combined.sort_values("date").reset_index(drop=True)

        # Guardar en cache
        cache_data = result[["date", "price"]].copy()
        cache_data["date"] = cache_data["date"].dt.strftime("%Y-%m-%d")
        await self._cache.aset(
            CacheStore.nav_history_key(isin, years),
            cache_data.to_dict(orient="records"),
            TTL_NAV_HISTORY,
        )

        return result

    # ------------------------------------------------------------------
    # Info (completitud — gather + merge first-non-null)
    # ------------------------------------------------------------------

    async def get_fund_info(self, isin: str) -> Dict[str, Any]:
        """Info fusionada: gather todos los providers de datos, merge first-non-null."""
        if not self._force_refresh:
            cached = await self._cache.aget(CacheStore.fund_info_key(isin))
            if cached:
                return cached

        async def _fetch(p: AsyncFundDataProvider) -> Dict[str, Any]:
            try:
                return await p.get_fund_info(isin)
            except Exception:
                return {}

        results = await asyncio.gather(*[_fetch(p) for p in self._data_chain])

        merged: Dict[str, Any] = {}
        for info in results:
            if not info:
                continue
            for k, v in info.items():
                if k not in merged or merged[k] is None or merged[k] == "":
                    merged[k] = v
                if k == "name" and merged.get("name") == isin and v != isin:
                    merged["name"] = v

        if merged:
            await self._cache.aset(CacheStore.fund_info_key(isin), merged, TTL_FUND_INFO)

        return merged

    # ------------------------------------------------------------------
    # Sectores / Países / Holdings (completitud — best wins)
    # ------------------------------------------------------------------

    async def get_sector_weights(self, isin: str) -> Dict[str, float]:
        """Sectores: gather providers, devuelve el más completo."""
        if not self._force_refresh:
            cached = await self._cache.aget(CacheStore.sectors_key(isin))
            if cached:
                return cached

        async def _fetch(p: AsyncFundDataProvider) -> Dict[str, float]:
            try:
                return await p.get_sector_weights(isin)
            except Exception:
                return {}

        results = await asyncio.gather(*[_fetch(p) for p in self._data_chain])
        best = max(results, key=len) if results else {}

        if best:
            await self._cache.aset(CacheStore.sectors_key(isin), best, TTL_SECTORS)
        return best

    async def get_country_weights(self, isin: str) -> Dict[str, float]:
        """Regiones: gather providers, devuelve el más completo."""
        if not self._force_refresh:
            cached = await self._cache.aget(CacheStore.regions_key(isin))
            if cached:
                return cached

        async def _fetch(p: AsyncFundDataProvider) -> Dict[str, float]:
            try:
                return await p.get_country_weights(isin)
            except Exception:
                return {}

        results = await asyncio.gather(*[_fetch(p) for p in self._data_chain])
        best = max(results, key=len) if results else {}

        if best:
            await self._cache.aset(CacheStore.regions_key(isin), best, TTL_REGIONS)
        return best

    async def get_holdings(self, isin: str) -> pd.DataFrame:
        """Holdings: gather providers, devuelve el más completo."""
        if not self._force_refresh:
            cached = await self._cache.aget(CacheStore.holdings_key(isin))
            if cached:
                return pd.DataFrame(cached)

        async def _fetch(p: AsyncFundDataProvider) -> pd.DataFrame:
            try:
                return await p.get_holdings(isin)
            except Exception:
                return pd.DataFrame(columns=["name", "ticker", "weight", "market_value"])

        results = await asyncio.gather(*[_fetch(p) for p in self._data_chain])
        best = max(results, key=len) if results else pd.DataFrame(columns=["name", "ticker", "weight", "market_value"])

        if not best.empty:
            await self._cache.aset(
                CacheStore.holdings_key(isin),
                best.to_dict(orient="records"),
                TTL_HOLDINGS,
            )
        return best

    async def get_asset_allocation(self, isin: str) -> Dict[str, float]:
        """Asset allocation del fondo (si disponible)."""
        best: Dict[str, float] = {}
        for p in self._data_chain:
            try:
                func = getattr(p, "get_asset_allocation", None)
                if func:
                    result = await func(isin)
                    if result and len(result) > len(best):
                        best = result
            except Exception:
                continue
        return best

    # ------------------------------------------------------------------
    # Batch helpers (para el Client)
    # ------------------------------------------------------------------

    async def get_nav_batch(self, isins: List[str]) -> Dict[str, float]:
        """Obtiene NAVs de todos los ISINs en paralelo."""
        async def _get_one(isin: str) -> tuple:
            try:
                price = await self.get_nav(isin)
                return isin, price if price and price > 0 else 0.0
            except Exception as exc:
                logger.warning("get_nav_batch: failed for %s: %s", isin, exc)
                return isin, 0.0

        results = await asyncio.gather(*[_get_one(isin) for isin in isins])
        return dict(results)

    async def get_nav_dates_batch(self, isins: List[str]) -> Dict[str, Optional[str]]:
        """Obtiene fechas de NAV de todos los ISINs en paralelo."""
        async def _get_one(isin: str) -> tuple:
            date = await self.get_nav_date(isin)
            return isin, date

        results = await asyncio.gather(*[_get_one(isin) for isin in isins])
        return dict(results)

    async def resolve_names_batch(self, isins: List[str]) -> Dict[str, str]:
        """Resuelve nombres para una lista de ISINs en paralelo."""
        async def _resolve(isin: str) -> tuple:
            # Primero cache
            cached = await self._cache.aget(CacheStore.name_key(isin))
            if cached:
                return isin, cached
            info = await self.get_fund_info(isin)
            name = info.get("name", isin) if info else isin
            if name and name != isin:
                await self._cache.aset(CacheStore.name_key(isin), name, TTL_NAMES)
            return isin, name

        results = await asyncio.gather(*[_resolve(isin) for isin in isins])
        return dict(results)

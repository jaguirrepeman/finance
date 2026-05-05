"""
finect_provider.py — Proveedor de datos de fondos desde Finect.

Implementa ``FundDataProvider`` para integrarse en la cadena de proveedores
del ``CompositeProvider``.  Ofrece información de cabecera, comisiones,
ratios, sectores, regiones, asset allocation, holdings y estadísticas
obtenidos del JSON embebido (``window.INITIAL_STATE``) en el HTML público de
https://www.finect.com/fondos-inversion/{isin}-{slug}.

La URL del fondo en Finect requiere un *slug* (nombre normalizado) que no
se puede deducir del ISIN.  Este módulo resuelve la URL consultando los
sitemaps públicos de Finect y cacheando el índice ISIN→URL en disco.

El enfoque de parseo por ``INITIAL_STATE`` es mucho más robusto que el
scraping de HTML, ya que la estructura del JSON viene del backend de Finect
y no depende de clases CSS ni de renderizado JavaScript.
"""

import json
import logging
import re
import time
import unicodedata
from pathlib import Path
from typing import Any, Dict
from urllib.parse import unquote

import pandas as pd
import requests

from .data_providers import FundDataProvider

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
}

_REQUEST_TIMEOUT = 15  # segundos

# Clave pública de la API de Finect (embebida en el JS del frontend)
_FINECT_API_KEY = "OgcqanUxQ4S6Y5VVvnwlJayUuxeg8Ah5"

# Base URL de la API de Finect para endpoints autenticados (timeseries, etc.)
_FINECT_API_BASE = "https://api.finect.com/v4"

# Sitemaps de Finect con todas las URLs de fondos y ETFs
_SITEMAP_URLS = [
    "https://www.finect.com/v4/bff/sitemap/funds.xml",
    "https://www.finect.com/v4/bff/sitemap/etfs.xml",
]

# Caché del índice ISIN→URL en disco (válido por 7 días)
_CACHE_DIR = Path(__file__).resolve().parent.parent / "data" / "cache"
_SITEMAP_CACHE_FILE = _CACHE_DIR / "finect_sitemap_index.json"
_SITEMAP_CACHE_TTL = 7 * 24 * 3600  # 7 días en segundos


# ---------------------------------------------------------------------------
# Funciones auxiliares privadas
# ---------------------------------------------------------------------------

def _clean_column_name(name: str) -> str:
    """Normaliza un string para usarlo como clave: sin acentos, snake_case."""
    name = name.lower()
    name = "".join(
        c for c in unicodedata.normalize("NFKD", name)
        if unicodedata.category(c) != "Mn"
    )
    name = re.sub(r"\s+", "_", name)
    name = re.sub(r"[^a-z0-9_]", "", name)
    return name


def _parse_numeric(text: str) -> float | str:
    """Intenta convertir un string a float; si no puede, devuelve el string."""
    cleaned = text.replace("%", "").replace(",", ".").replace(" ", "").strip()
    try:
        return float(cleaned)
    except (ValueError, TypeError):
        return text


# ---------------------------------------------------------------------------
# Descarga y extracción de INITIAL_STATE
# ---------------------------------------------------------------------------

def _fetch_initial_state(url: str) -> Dict[str, Any] | None:
    """Descarga la página de Finect y extrae el JSON de ``window.INITIAL_STATE``.

    Finect embede toda la información del fondo en un JSON codificado como
    URL-encoded string dentro de ``window.INITIAL_STATE = "...";`` en el HTML.

    Returns:
        Dict con el ``model`` del fondo (sub-árbol de ``fund.fund.model``),
        o ``None`` si falla la descarga o el parseo.
    """
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=_REQUEST_TIMEOUT)
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.debug("Finect fetch failed for %s: %s", url, exc)
        return None

    # Extraer window.INITIAL_STATE = "...";
    match = re.search(r'window\.INITIAL_STATE\s*=\s*"([^"]+)"', resp.text)
    if not match:
        logger.debug("Finect: no INITIAL_STATE found in %s", url)
        return None

    try:
        raw = match.group(1)
        decoded = unquote(raw).strip().rstrip(";").strip('"')
        data = json.loads(decoded)
        return data.get("fund", {}).get("fund", {}).get("model")
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        logger.debug("Finect: error parsing INITIAL_STATE from %s: %s", url, exc)
        return None


# ---------------------------------------------------------------------------
# Extractores de datos del modelo JSON
# ---------------------------------------------------------------------------

def _extract_header(model: Dict[str, Any]) -> Dict[str, Any]:
    """Extrae nombre, gestora, categoría y descripción del modelo."""
    info: Dict[str, Any] = {}
    if name := model.get("name"):
        info["name"] = name
    mc = model.get("managementCompany", {})
    if mc and mc.get("name"):
        info["management_company"] = mc["name"]
    cat = model.get("category", {})
    if cat and cat.get("name"):
        info["category"] = cat["name"]
    if desc := model.get("description"):
        info["description"] = desc
    if strategy := model.get("strategy"):
        info["strategy"] = strategy
    if srri := model.get("srri"):
        info["srri"] = srri
    if tna := model.get("totalNetAsset"):
        info["total_net_asset"] = tna
    return info


def _extract_ratings(model: Dict[str, Any]) -> Dict[str, Any]:
    """Extrae ratings (Morningstar, Finect) del modelo."""
    ratings_data: Dict[str, Any] = {}
    for r in model.get("ratings", []):
        provider = r.get("provider", "unknown")
        value = r.get("value")
        if value is not None:
            ratings_data[f"rating_{provider}"] = value
    return ratings_data


def _extract_fees(model: Dict[str, Any], isin: str) -> Dict[str, Any]:
    """Extrae comisiones de la clase correspondiente al ISIN.

    Finect almacena comisiones por clase (share class).  Buscamos la clase
    cuyo ``isin`` coincida con el solicitado y extraemos sus ``fees``.

    Claves de fees: ``mgr`` (gestión), ``red`` (reembolso), ``cus`` (custodia),
    ``suc`` (suscripción), ``flo`` (front load), ``ter`` (TER), ``ogc`` (OGC).
    """
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
    """Extrae estadísticas (sharpe, alpha, beta, retornos, etc.) del modelo.

    Genera claves por período (1y, 3y, 5y, 10y) para cada métrica y además
    mantiene la clave sin sufijo con el valor del período más largo (compat).

    Ejemplo de claves generadas::

        sharpe_ratio_1y, sharpe_ratio_3y, sharpe_ratio_5y, sharpe_ratio_10y
        annualized_return_1y, annualized_return_3y, ...
        standard_deviation_1y, ...
        max_drawdown_1y, ...
        alpha_1y, beta_1y, ...
    """
    stats: Dict[str, Any] = {}
    raw_stats = model.get("stats", {})

    # Mapeo período Finect → sufijo de columna
    _PERIOD_MAP: Dict[str, str] = {
        "M12": "1y",
        "M36": "3y",
        "M60": "5y",
        "M120": "10y",
    }

    # Métricas con estructura [{period, date, value}, ...]
    _METRIC_KEYS = (
        "annualizedReturn",      # rentabilidad anualizada ← clave para returns
        "sharpeRatio",
        "alpha",
        "beta",
        "standardDeviation",
        "maxDrawdown",
        "trackingError",
        "correlation",
        "informationRatio",
        "r2",
    )

    for key in _METRIC_KEYS:
        periods = raw_stats.get(key, [])
        if not periods:
            continue

        col_base = _clean_column_name(key)  # e.g. "sharpe_ratio", "annualized_return"

        for entry in periods:
            period_code = entry.get("period", "")
            suffix = _PERIOD_MAP.get(period_code)
            if suffix:
                stats[f"{col_base}_{suffix}"] = entry.get("value")

        # Backward-compat: clave sin sufijo = período más largo disponible
        best = max(periods, key=lambda p: int(p.get("period", "M0")[1:]))
        stats[col_base] = best.get("value")

    return stats


def _extract_breakdown(
    model: Dict[str, Any],
    breakdown_type: str,
) -> Dict[str, float]:
    """Extrae un desglose por tipo del array ``breakdown``.

    Args:
        model: Dict del modelo del fondo.
        breakdown_type: Uno de ``'asset-allocation'``, ``'stock-sector'``,
            ``'regional-exposure'``, ``'market-capitalization'``.

    Returns:
        Dict ``{drawer_name: long_pct}`` con las posiciones positivas.
    """
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


def _extract_nav(model: Dict[str, Any], isin: str) -> tuple[float | None, str | None]:
    """Extrae el NAV (precio) y su fecha del modelo JSON de Finect.

    Busca primero en la clase cuyo ISIN coincida (``classes[i].lastQuote``),
    y como fallback usa ``model.lastQuote`` (clase primaria del fondo).

    Args:
        model: Dict del modelo del fondo (de ``_fetch_initial_state``).
        isin: Código ISIN de la clase específica.

    Returns:
        Tupla ``(price, date_iso)`` o ``(None, None)`` si no hay datos.
    """
    # 1. Buscar en la clase concreta que coincida con el ISIN
    for cls in model.get("classes", []):
        if cls.get("isin") == isin:
            quote = cls.get("lastQuote") or {}
            price = quote.get("price")
            dt = quote.get("datetime")
            if price is not None and price > 0:
                date_str = dt[:10] if dt else None
                return float(price), date_str

    # 2. Fallback: lastQuote a nivel de modelo (clase principal)
    quote = model.get("lastQuote") or {}
    price = quote.get("price")
    dt = quote.get("datetime")
    if price is not None and price > 0:
        date_str = dt[:10] if dt else None
        return float(price), date_str

    return None, None


def _extract_holdings(model: Dict[str, Any]) -> pd.DataFrame:
    """Extrae las 10 mayores posiciones en cartera del modelo."""
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


# ---------------------------------------------------------------------------
# Resolución de URL — sitemap ISIN→URL
# ---------------------------------------------------------------------------

def _load_sitemap_index() -> Dict[str, str]:
    """Carga el índice ISIN→URL desde caché en disco, o lo regenera.

    El índice se persiste como JSON en ``_SITEMAP_CACHE_FILE`` y se
    refresca cuando el fichero no existe o supera el TTL de 7 días.

    Returns:
        Dict que mapea ISIN (str) a la URL completa en Finect.
    """
    # Intentar leer de caché
    if _SITEMAP_CACHE_FILE.exists():
        age = time.time() - _SITEMAP_CACHE_FILE.stat().st_mtime
        if age < _SITEMAP_CACHE_TTL:
            try:
                with open(_SITEMAP_CACHE_FILE, encoding="utf-8") as fh:
                    return json.load(fh)
            except (json.JSONDecodeError, OSError):
                logger.warning("Finect sitemap cache corrupto, regenerando.")

    # Descargar y parsear sitemaps
    logger.info("Descargando sitemaps de Finect para construir índice ISIN→URL...")
    index: Dict[str, str] = {}
    isin_pattern = re.compile(
        r"<loc>(https://www\.finect\.com/(?:fondos-inversion|etfs)/"
        r"([A-Z]{2}[A-Z0-9]{9}\d)-[^<]+)</loc>"
    )

    for sitemap_url in _SITEMAP_URLS:
        try:
            resp = requests.get(
                sitemap_url, headers=_HEADERS, timeout=30
            )
            resp.raise_for_status()
            for match in isin_pattern.finditer(resp.text):
                url = match.group(1)
                isin_found = match.group(2)
                # Primer hit gana (evita duplicados de distintas clases)
                if isin_found not in index:
                    index[isin_found] = url
        except requests.RequestException as exc:
            logger.warning("Error descargando sitemap %s: %s", sitemap_url, exc)

    # Persistir a disco
    if index:
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        try:
            with open(_SITEMAP_CACHE_FILE, "w", encoding="utf-8") as fh:
                json.dump(index, fh, ensure_ascii=False)
            logger.info(
                "Índice Finect guardado: %d ISINs en %s",
                len(index),
                _SITEMAP_CACHE_FILE,
            )
        except OSError as exc:
            logger.warning("No se pudo guardar caché sitemap: %s", exc)

    return index


# Caché en memoria para evitar lecturas de disco repetidas en la misma sesión
_sitemap_index_cache: Dict[str, str] | None = None


def _get_finect_url(isin: str, fund_name: str | None = None) -> str | None:
    """Resuelve la URL de detalle de un fondo/ETF en Finect.

    Utiliza el índice ISIN→URL construido a partir de los sitemaps
    públicos de Finect.  Devuelve ``None`` si el ISIN no se encuentra
    en el sitemap (el fondo no existe en Finect).

    Args:
        isin: Código ISIN del fondo.
        fund_name: (Ignorado) Se mantiene por compatibilidad de firma.

    Returns:
        URL completa o ``None`` si no está en el sitemap.
    """
    global _sitemap_index_cache  # noqa: PLW0603

    if _sitemap_index_cache is None:
        _sitemap_index_cache = _load_sitemap_index()

    url = _sitemap_index_cache.get(isin)
    if url:
        return url

    # Si no lo encontramos y el caché podría estar desactualizado, forzar
    # una recarga (solo una vez por sesión).
    if _SITEMAP_CACHE_FILE.exists():
        age = time.time() - _SITEMAP_CACHE_FILE.stat().st_mtime
        if age > 3600:  # más de 1h -> intentar refrescar
            logger.info("ISIN %s no encontrado, refrescando sitemap...", isin)
            _SITEMAP_CACHE_FILE.unlink(missing_ok=True)
            _sitemap_index_cache = _load_sitemap_index()
            url = _sitemap_index_cache.get(isin)
            if url:
                return url

    logger.debug("Finect: ISIN %s no encontrado en sitemap.", isin)
    return None


# ---------------------------------------------------------------------------
# FinectProvider — implementa FundDataProvider
# ---------------------------------------------------------------------------

class FinectProvider(FundDataProvider):
    """Proveedor basado en el JSON ``INITIAL_STATE`` de Finect.

    Extrae del HTML público de Finect el blob JSON embebido en
    ``window.INITIAL_STATE``, que contiene toda la información del fondo:
    NAV actual (``lastQuote.price`` + fecha), info general, comisiones,
    ratings, sectores, regiones, asset allocation, market cap, holdings
    y estadísticas (sharpe, alpha, beta, etc.).

    Es el **proveedor preferido para NAV** por su velocidad (~500ms) y
    frescura (devuelve el dato más reciente con fecha exacta).
    No aporta históricos de precios (solo el dato puntual).
    """

    def __init__(self) -> None:
        self._model_cache: Dict[str, Dict[str, Any] | None] = {}
        self._nav_date_cache: Dict[str, str] = {}

    # ---- helpers --------------------------------------------------------

    def _get_model(self, isin: str) -> Dict[str, Any] | None:
        """Descarga (o recupera de caché en sesión) el modelo JSON del fondo."""
        if isin not in self._model_cache:
            url = _get_finect_url(isin)
            if url is None:
                logger.info(
                    "Finect: ISIN %s no tiene URL en sitemap, saltando.", isin
                )
                self._model_cache[isin] = None
            else:
                logger.debug("Finect: fetching INITIAL_STATE from %s", url)
                self._model_cache[isin] = _fetch_initial_state(url)
        return self._model_cache[isin]

    # ---- FundDataProvider interface -------------------------------------

    def get_nav(self, isin: str) -> float | None:
        """NAV actual extraído de ``lastQuote`` en el JSON de Finect.

        Busca la clase cuyo ISIN coincida; fallback a la clase principal.
        """
        model = self._get_model(isin)
        if model is None:
            return None
        price, date_str = _extract_nav(model, isin)
        if price is not None and date_str:
            self._nav_date_cache[isin] = date_str
        return price

    def get_nav_date(self, isin: str) -> str | None:
        """Fecha del último NAV disponible en Finect."""
        # Si ya tenemos la fecha cacheada (de un get_nav previo), usarla
        if isin in self._nav_date_cache:
            return self._nav_date_cache[isin]
        # Si no, forzar la carga del modelo
        model = self._get_model(isin)
        if model is None:
            return None
        _, date_str = _extract_nav(model, isin)
        if date_str:
            self._nav_date_cache[isin] = date_str
        return date_str

    def get_nav_history(self, isin: str, years: int = 5) -> pd.DataFrame:
        """Histórico de NAV obtenido del endpoint de timeseries de la API de Finect.

        Endpoint: ``api.finect.com/v4/products/collectives/funds/{class_id}/timeseries``
        Requiere el header ``key`` con la clave pública de Finect.

        El ``class_id`` se extrae de ``model.classes[i].id`` donde
        ``classes[i].isin == isin``.

        Respuesta esperada:
            ``{"code": 200, "data": [{"datetime": "...", "price": X}, ...]}``
        """
        model = self._get_model(isin)
        if model is None:
            return pd.DataFrame(columns=["date", "price"])

        # Extraer class_id que coincida con el ISIN pedido
        class_id: str | None = None
        for cls in model.get("classes", []):
            if cls.get("isin") == isin:
                class_id = cls.get("id")
                break
        # Fallback: id del fondo directamente
        if class_id is None:
            class_id = model.get("id")
        if class_id is None:
            return pd.DataFrame(columns=["date", "price"])

        # Calcular fecha de inicio según los años solicitados
        from datetime import datetime, timedelta

        start_date = (datetime.now() - timedelta(days=years * 365)).strftime("%Y-%m-%d")

        url = (
            f"{_FINECT_API_BASE}/products/collectives/funds/"
            f"{class_id}/timeseries?start={start_date}"
        )

        try:
            headers = {
                **_HEADERS,
                "Accept": "application/json",
                "key": _FINECT_API_KEY,
            }
            resp = requests.get(url, headers=headers, timeout=_REQUEST_TIMEOUT)
            if resp.status_code != 200:
                logger.debug(
                    "Finect timeseries %s returned %d", url, resp.status_code
                )
                return pd.DataFrame(columns=["date", "price"])

            ct = resp.headers.get("content-type", "")
            if "json" not in ct:
                return pd.DataFrame(columns=["date", "price"])

            raw = resp.json()
            df = self._parse_quotes_response(raw)
            if not df.empty:
                logger.info(
                    "Finect timeseries: %d points for ISIN %s (class %s)",
                    len(df), isin, class_id,
                )
            return df
        except Exception as exc:
            logger.debug("Finect timeseries %s failed: %s", url, exc)

        return pd.DataFrame(columns=["date", "price"])

    @staticmethod
    def _parse_quotes_response(raw: Any) -> pd.DataFrame:
        """Parsea la respuesta JSON del endpoint de cotizaciones de Finect.

        Intenta múltiples estructuras conocidas.
        """
        import pandas as _pd
        rows = []

        if isinstance(raw, dict):
            items = raw.get("items") or raw.get("data") or raw.get("quotes") or []
        elif isinstance(raw, list):
            items = raw
        else:
            return _pd.DataFrame(columns=["date", "price"])

        for item in items:
            if isinstance(item, (list, tuple)) and len(item) >= 2:
                # Highcharts format: [timestamp_ms, price]
                try:
                    ts = int(item[0])
                    price = float(item[1])
                    date_str = _pd.Timestamp(ts, unit="ms").strftime("%Y-%m-%d")
                    rows.append({"date": date_str, "price": price})
                except (ValueError, TypeError, OverflowError):
                    pass
            elif isinstance(item, dict):
                price = item.get("nav") or item.get("price") or item.get("close") or item.get("value")
                date = item.get("date") or item.get("datetime") or item.get("timestamp")
                if price is not None and date is not None:
                    try:
                        if isinstance(date, (int, float)):
                            date = _pd.Timestamp(int(date), unit="ms").strftime("%Y-%m-%d")
                        else:
                            date = str(date)[:10]
                        rows.append({"date": date, "price": float(price)})
                    except (ValueError, TypeError):
                        pass

        if not rows:
            return _pd.DataFrame(columns=["date", "price"])
        df = _pd.DataFrame(rows)
        df["date"] = _pd.to_datetime(df["date"])
        return df.sort_values("date").drop_duplicates("date").reset_index(drop=True)

    def get_fund_info(self, isin: str) -> Dict[str, Any]:
        """Info general, comisiones, ratings y estadísticas del fondo."""
        model = self._get_model(isin)
        if model is None:
            return {}

        info: Dict[str, Any] = {"isin": isin, "source": "Finect"}
        info.update(_extract_header(model))
        info.update(_extract_ratings(model))
        info.update(_extract_fees(model, isin))
        info.update(_extract_stats(model))
        return info

    def get_sector_weights(self, isin: str) -> Dict[str, float]:
        """Distribución sectorial (stock-sector) del fondo."""
        model = self._get_model(isin)
        if model is None:
            return {}
        return _extract_breakdown(model, "stock-sector")

    def get_country_weights(self, isin: str) -> Dict[str, float]:
        """Distribución geográfica (regional-exposure) del fondo."""
        model = self._get_model(isin)
        if model is None:
            return {}
        return _extract_breakdown(model, "regional-exposure")

    def get_holdings(self, isin: str) -> pd.DataFrame:
        """Top 10 posiciones en cartera del fondo."""
        model = self._get_model(isin)
        if model is None:
            return pd.DataFrame(
                columns=["name", "ticker", "weight", "market_value"]
            )
        return _extract_holdings(model)

    def get_asset_allocation(self, isin: str) -> Dict[str, float]:
        """Desglose por tipo de activo (Renta Variable, RF, Liquidez, etc.)."""
        model = self._get_model(isin)
        if model is None:
            return {}
        return _extract_breakdown(model, "asset-allocation")

    def get_market_cap(self, isin: str) -> Dict[str, float]:
        """Desglose por capitalización bursátil (Giant, Large, Medium, etc.)."""
        model = self._get_model(isin)
        if model is None:
            return {}
        return _extract_breakdown(model, "market-capitalization")

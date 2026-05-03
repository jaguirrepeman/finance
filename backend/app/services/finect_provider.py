"""
finect_provider.py — Proveedor de datos de fondos desde Finect (scraping).

Implementa ``FundDataProvider`` para integrarse en la cadena de proveedores
del ``CompositeProvider``.  Ofrece información de cabecera, comisiones,
ratios, asset allocation y top-10 holdings obtenidos del HTML público de
https://www.finect.com/fondos-inversion/{isin}-{slug}.

La URL del fondo en Finect requiere un *slug* (nombre normalizado) que no
se puede deducir del ISIN.  Este módulo resuelve la URL consultando los
sitemaps públicos de Finect y cacheando el índice ISIN→URL en disco.
"""

import json
import logging
import re
import time
import unicodedata
from pathlib import Path
from typing import Any, Dict

import pandas as pd
import requests
from bs4 import BeautifulSoup

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


def _fetch_soup(url: str | None) -> BeautifulSoup | None:
    """Descarga una URL y devuelve el BeautifulSoup, o ``None`` si falla."""
    if url is None:
        return None
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=_REQUEST_TIMEOUT)
        resp.raise_for_status()
        return BeautifulSoup(resp.content, "html.parser")
    except requests.RequestException as exc:
        logger.debug("Finect fetch failed for %s: %s", url, exc)
        return None


# ---------------------------------------------------------------------------
# Extractores de secciones del HTML
# ---------------------------------------------------------------------------

def _extract_header(soup: BeautifulSoup) -> Dict[str, Any]:
    """Extrae nombre y gestora de la cabecera."""
    info: Dict[str, Any] = {}
    try:
        # El título puede tener varias clases; buscamos h1 con 'Title' en clase
        tag = soup.find("h1", class_=lambda c: c and "Title" in c)
        if tag:
            info["name"] = tag.get_text(strip=True)
        # Manager label link
        tag = soup.find("a", class_=lambda c: c and "Manager" in c)
        if tag:
            info["management_company"] = tag.get_text(strip=True)
    except Exception:
        logger.debug("Finect: error extracting header")
    return info


def _extract_ratios(soup: BeautifulSoup) -> Dict[str, Any]:
    """Extrae ratios del fondo (si están presentes en el HTML estático).

    Nota: normalmente los ratios se renderizan vía JavaScript, por lo que
    esta función puede devolver vacío en la mayoría de los casos.
    """
    ratios: Dict[str, Any] = {}
    try:
        header = soup.find("h2", string=lambda s: s and "Ratio" in s)
        if not header:
            return ratios
        section = header.find_parent("section")
        if section is None:
            return ratios
        for row in section.find_all(
            "div", class_=lambda c: c and "RowBlock" in c
        ):
            cols = row.find_all(
                "div", class_=lambda c: c and "Column" in c
            )
            if len(cols) == 2:
                key = _clean_column_name(cols[0].get_text(strip=True))
                ratios[key] = _parse_numeric(cols[1].get_text(strip=True))
    except Exception:
        logger.debug("Finect: error extracting ratios")
    return ratios


def _extract_fees(soup: BeautifulSoup) -> Dict[str, Any]:
    """Extrae info general y comisiones del fondo desde la sección Información.

    La sección 'Información' tiene 3 tabs:
      - Tab 0: datos generales (gestora, categoría, benchmark, patrimonio...)
      - Tab 1: comisiones
      - Tab 2: documentos (ignorados)
    """
    data: Dict[str, Any] = {}
    try:
        header = soup.find("h2", string=lambda s: s and "nformaci" in s)
        if not header:
            return data
        section = header.find_parent("section")
        if section is None:
            return data
        tabs = section.find_all(
            "div", class_=lambda c: c and "TabChild" in c
        )
        # Extraer datos de los 2 primeros tabs (general + comisiones)
        for tab in tabs[:2]:
            for row in tab.find_all(
                "div", class_=lambda c: c and "RowBlock" in c
            ):
                cols = row.find_all(
                    "div", class_=lambda c: c and "Column" in c
                )
                if len(cols) == 2:
                    key = _clean_column_name(cols[0].get_text(strip=True))
                    value = cols[1].get_text(strip=True)
                    # Intentar parsear numéricamente
                    data[key] = _parse_numeric(value)
    except Exception:
        logger.debug("Finect: error extracting fees/info")
    return data


def _extract_asset_allocation(soup: BeautifulSoup) -> Dict[str, float]:
    """Extrae exposición por asset allocation como ``{asset: pct}``."""
    allocations: Dict[str, float] = {}
    try:
        title = soup.find("p", string="Exposición por asset allocation")
        if not title:
            return allocations
        container = title.find_next_sibling("div")
        if not container:
            return allocations
        for row in container.find_all(
            "div", class_=lambda c: c and "partials__RowBlock" in c
        ):
            asset_tag = row.find(
                "div", class_=lambda c: c and "goFpZn" in c
            )
            pct_tag = row.find(
                "span", class_=lambda c: c and "Label-sc" in c
            )
            if asset_tag and pct_tag:
                asset = asset_tag.get_text(strip=True)
                pct = _parse_numeric(pct_tag.get_text(strip=True))
                if isinstance(pct, (int, float)):
                    allocations[asset] = float(pct)
    except Exception:
        logger.debug("Finect: error extracting asset allocation")
    return allocations


def _extract_holdings(soup: BeautifulSoup) -> pd.DataFrame:
    """Extrae las 10 mayores posiciones en cartera."""
    rows_data = []
    try:
        title = soup.find("p", string="10 mayores posiciones en cartera")
        if not title:
            return pd.DataFrame(columns=["name", "ticker", "weight", "market_value"])
        table_div = title.find_next(
            "div", class_=lambda c: c and "TableInner" in c
        )
        if not table_div:
            return pd.DataFrame(columns=["name", "ticker", "weight", "market_value"])
        tbody = table_div.find("tbody")
        if not tbody:
            return pd.DataFrame(columns=["name", "ticker", "weight", "market_value"])
        for tr in tbody.find_all("tr"):
            cells = tr.find_all("td")
            if len(cells) < 3:
                continue
            name_tag = cells[0].find("strong")
            isin_tag = cells[0].find("small")
            name = name_tag.get_text(strip=True) if name_tag else ""
            ticker = isin_tag.get_text(strip=True) if isin_tag else ""
            value_str = (
                cells[1]
                .get_text(strip=True)
                .replace("€", "")
                .replace(".", "")
                .replace(",", ".")
            )
            weight_str = (
                cells[2]
                .get_text(strip=True)
                .replace("%", "")
                .replace(",", ".")
            )
            try:
                market_value = float(value_str) if value_str.strip() else 0.0
            except ValueError:
                market_value = 0.0
            try:
                weight = float(weight_str) if weight_str.strip() else 0.0
            except ValueError:
                weight = 0.0
            rows_data.append({
                "name": name,
                "ticker": ticker,
                "weight": weight,
                "market_value": market_value,
            })
    except Exception:
        logger.debug("Finect: error extracting holdings")
    if rows_data:
        return pd.DataFrame(rows_data)
    return pd.DataFrame(columns=["name", "ticker", "weight", "market_value"])


# ---------------------------------------------------------------------------
# FinectProvider — implementa FundDataProvider
# ---------------------------------------------------------------------------

class FinectProvider(FundDataProvider):
    """Proveedor basado en scraping del HTML público de Finect.

    No aporta NAV ni históricos de precios (devuelve vacío), pero sí
    info del fondo, comisiones, ratios, asset allocation y holdings.
    """

    def __init__(self) -> None:
        self._soup_cache: Dict[str, BeautifulSoup | None] = {}

    # ---- helpers --------------------------------------------------------

    def _get_soup(self, isin: str, fund_name: str | None = None) -> BeautifulSoup | None:
        """Descarga (o recupera de caché en sesión) el HTML del fondo."""
        if isin not in self._soup_cache:
            url = _get_finect_url(isin, fund_name)
            if url is None:
                logger.info(
                    "Finect: ISIN %s no tiene URL en sitemap, saltando.", isin
                )
                self._soup_cache[isin] = None
            else:
                logger.debug("Finect: fetching %s", url)
                self._soup_cache[isin] = _fetch_soup(url)
        return self._soup_cache[isin]

    # ---- FundDataProvider interface -------------------------------------

    def get_nav(self, isin: str) -> float | None:
        """Finect no provee NAV programáticamente."""
        return None

    def get_nav_history(self, isin: str, years: int = 5) -> pd.DataFrame:
        """Finect no provee histórico de NAV."""
        return pd.DataFrame(columns=["date", "price"])

    def get_fund_info(self, isin: str) -> Dict[str, Any]:
        """Info general + ratios + comisiones del fondo."""
        soup = self._get_soup(isin)
        if soup is None:
            return {}

        info: Dict[str, Any] = {"isin": isin, "source": "Finect"}
        info.update(_extract_header(soup))
        info.update(_extract_ratios(soup))
        info.update(_extract_fees(soup))
        return info

    def get_sector_weights(self, isin: str) -> Dict[str, float]:
        """Devuelve asset allocation como proxy de distribución sectorial."""
        soup = self._get_soup(isin)
        if soup is None:
            return {}
        return _extract_asset_allocation(soup)

    def get_country_weights(self, isin: str) -> Dict[str, float]:
        """Finect no desglosa exposición geográfica de forma separada."""
        return {}

    def get_holdings(self, isin: str) -> pd.DataFrame:
        """Finect renderiza holdings vía JS. Scraping estático devuelve vacío."""
        return pd.DataFrame(columns=["name", "ticker", "weight", "market_value"])

    def get_asset_allocation(self, isin: str) -> Dict[str, float]:
        """Finect renderiza asset allocation vía JS. Scraping estático devuelve vacío."""
        return {}

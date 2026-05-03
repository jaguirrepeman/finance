"""
ft_provider.py — Proveedor de datos de fondos desde Financial Times.

Financial Times no bloquea activamente las peticiones, proporciona todos los datos avanzados
(sectores, países, holdings, comisiones) para fondos UCITS europeos y es extremadamente rápido.
"""

import logging
import re
from typing import Any, Dict, Optional

import pandas as pd
import requests
from bs4 import BeautifulSoup

from .data_providers import FundDataProvider

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
}
_TIMEOUT = 10

class FTProvider(FundDataProvider):
    """
    Scraper para markets.ft.com.
    Proporciona información de Holdings, Asset Allocation, Sector y Regiones.
    """
    
    def __init__(self):
        self._symbol_cache = {}
        self.available = True

    def _get_ft_symbol(self, isin: str) -> Optional[str]:
        if isin in self._symbol_cache:
            return self._symbol_cache[isin]
            
        try:
            url = f"https://markets.ft.com/data/searchapi/searchsecurities?query={isin}"
            r = requests.get(url, headers=_HEADERS, timeout=_TIMEOUT)
            if r.status_code == 200:
                data = r.json()
                securities = data.get("data", {}).get("security", [])
                if securities:
                    # Preferimos el símbolo con sufijo (ej. ES0146309002:EUR)
                    symbol = securities[0].get("symbol")
                    if symbol:
                        self._symbol_cache[isin] = symbol
                        return symbol
        except Exception as e:
            logger.debug(f"FTProvider: Error al resolver símbolo para {isin}: {e}")
            
        # Fallback a ISIN:EUR si la búsqueda falla
        return f"{isin}:EUR"

    def _fetch_soup(self, url: str) -> Optional[BeautifulSoup]:
        try:
            r = requests.get(url, headers=_HEADERS, timeout=_TIMEOUT)
            if r.status_code == 200 and len(r.text) > 70000: # Las páginas de error son pequeñas
                return BeautifulSoup(r.text, "html.parser")
        except Exception as e:
            logger.debug(f"FTProvider: Error fetching {url}: {e}")
        return None

    def get_nav(self, isin: str) -> Optional[float]:
        symbol = self._get_ft_symbol(isin)
        soup = self._fetch_soup(f"https://markets.ft.com/data/funds/tearsheet/summary?s={symbol}")
        if not soup: return None
        
        try:
            # Buscar el elemento con el precio (suele tener la clase mod-tearsheet-overview__quote__bar)
            price_elem = soup.find("span", class_="mod-ui-data-list__value")
            if price_elem:
                return float(price_elem.text.replace(",", ""))
        except:
            pass
        return None

    def get_nav_history(self, isin: str, years: int = 5) -> pd.DataFrame:
        # FT es más complejo para históricos porque es interactivo. Delegamos a YFinance.
        return pd.DataFrame()

    def get_fund_info(self, isin: str) -> Dict[str, Any]:
        symbol = self._get_ft_symbol(isin)
        soup = self._fetch_soup(f"https://markets.ft.com/data/funds/tearsheet/summary?s={symbol}")
        info = {"source": "FinancialTimes"}
        if not soup: return info
        
        try:
            # Nombre
            title_elem = soup.find("h1", class_="mod-tearsheet-overview__header__name")
            if title_elem:
                info["name"] = title_elem.text.strip()
                
            # Buscar en las tablas de resumen (Ongoing charge, Initial charge, etc)
            for tbl in soup.find_all("table"):
                text = tbl.get_text()
                if "Ongoing charge" in text or "Fund type" in text:
                    for row in tbl.find_all("tr"):
                        th = row.find("th")
                        td = row.find("td")
                        if th and td:
                            k = th.text.strip().lower()
                            v = td.text.strip()
                            if "ongoing charge" in k: info["ongoing_charge"] = v
                            elif "initial charge" in k: info["initial_charge"] = v
                            elif "fund type" in k: info["category"] = v
        except Exception as e:
            logger.debug(f"FTProvider: Error parsing info for {isin}: {e}")
            
        return info

    def get_asset_allocation(self, isin: str) -> Dict[str, float]:
        symbol = self._get_ft_symbol(isin)
        soup = self._fetch_soup(f"https://markets.ft.com/data/funds/tearsheet/holdings?s={symbol}")
        allocation = {}
        if not soup: return allocation
        
        try:
            for tbl in soup.find_all("table"):
                headers = [th.text.strip().lower() for th in tbl.find_all("th")]
                if "type" in headers and "% net assets" in headers:
                    # Es la tabla de Asset Allocation
                    for row in tbl.find_all("tr"):
                        tds = row.find_all("td")
                        if len(tds) >= 2:
                            name = tds[0].text.strip()
                            val_str = tds[1].text.strip().replace("%", "")
                            try:
                                allocation[name] = float(val_str)
                            except: pass
                    break
        except Exception as e:
            logger.debug(f"FTProvider: Error parsing asset allocation for {isin}: {e}")
        return allocation

    def get_sector_weights(self, isin: str) -> Dict[str, float]:
        symbol = self._get_ft_symbol(isin)
        soup = self._fetch_soup(f"https://markets.ft.com/data/funds/tearsheet/holdings?s={symbol}")
        sectors = {}
        if not soup: return sectors
        
        try:
            # Buscar tabla con cabeceras 'Sector' y '% Net assets'
            for tbl in soup.find_all("table"):
                headers = [th.text.strip().lower() for th in tbl.find_all("th")]
                if "sector" in headers and "% net assets" in headers:
                    # La página suele tener 2 tablas con "Sector" -> una es para sectores reales, otra es para Regiones
                    # Pero Financial Times a veces etiqueta la cabecera de Regiones como "Sector" también.
                    # Comprobamos los nombres de los elementos para deducir cuál es cuál.
                    is_sector_table = False
                    first_row_td = tbl.find("td")
                    if first_row_td:
                        # Si es tecnología, salud, etc -> Sectores
                        # Si es Eurozone, Americas -> Regiones
                        txt = first_row_td.text.lower()
                        if "technology" in txt or "financial" in txt or "cyclical" in txt or "industrial" in txt or "energy" in txt:
                            is_sector_table = True
                            
                    if is_sector_table:
                        for row in tbl.find_all("tr"):
                            tds = row.find_all("td")
                            if len(tds) >= 2:
                                name = tds[0].text.strip()
                                val_str = tds[1].text.strip().replace("%", "")
                                try:
                                    sectors[name] = float(val_str)
                                except: pass
                        break
        except Exception as e:
            logger.debug(f"FTProvider: Error parsing sectors for {isin}: {e}")
        return sectors

    def get_country_weights(self, isin: str) -> Dict[str, float]:
        symbol = self._get_ft_symbol(isin)
        soup = self._fetch_soup(f"https://markets.ft.com/data/funds/tearsheet/holdings?s={symbol}")
        regions = {}
        if not soup: return regions
        
        try:
            for tbl in soup.find_all("table"):
                headers = [th.text.strip().lower() for th in tbl.find_all("th")]
                if "sector" in headers and "% net assets" in headers:
                    is_region_table = False
                    first_row_td = tbl.find("td")
                    if first_row_td:
                        txt = first_row_td.text.lower()
                        if "eurozone" in txt or "america" in txt or "europe" in txt or "asia" in txt or "kingdom" in txt or "market" in txt or "state" in txt:
                            is_region_table = True
                            
                    if is_region_table:
                        for row in tbl.find_all("tr"):
                            tds = row.find_all("td")
                            if len(tds) >= 2:
                                name = tds[0].text.strip()
                                val_str = tds[1].text.strip().replace("%", "")
                                try:
                                    regions[name] = float(val_str)
                                except: pass
                        break
        except Exception as e:
            logger.debug(f"FTProvider: Error parsing countries for {isin}: {e}")
        return regions

    def get_holdings(self, isin: str) -> pd.DataFrame:
        symbol = self._get_ft_symbol(isin)
        soup = self._fetch_soup(f"https://markets.ft.com/data/funds/tearsheet/holdings?s={symbol}")
        
        rows = []
        if not soup: return pd.DataFrame(columns=["name", "ticker", "weight", "market_value"])
        
        try:
            # Buscar tabla con 'Company' y 'Portfolio weight'
            for tbl in soup.find_all("table"):
                headers = [th.text.strip().lower() for th in tbl.find_all("th")]
                if "company" in headers and "portfolio weight" in headers:
                    for row in tbl.find_all("tr"):
                        tds = row.find_all("td")
                        if len(tds) >= 3:
                            name_ticker = tds[0].text.strip()
                            weight_str = tds[2].text.strip().replace("%", "")
                            
                            # Parsear nombre y ticker (ej. "Microsoft CorpMSFT:NSQ")
                            name = name_ticker
                            ticker = ""
                            # Tratar de separar si hay mayúsculas al final, pero a veces es difícil con regex básico
                            # Usamos el <span> dentro del td si existe para el ticker
                            ticker_span = tds[0].find("span", class_="mod-ui-symbol-and-name__symbol")
                            if ticker_span:
                                ticker = ticker_span.text.strip()
                                name = name.replace(ticker, "").strip()
                                
                            try:
                                weight = float(weight_str)
                                rows.append({
                                    "name": name,
                                    "ticker": ticker,
                                    "weight": weight,
                                    "market_value": 0.0
                                })
                            except: pass
                    break
        except Exception as e:
            logger.debug(f"FTProvider: Error parsing holdings for {isin}: {e}")
            
        if not rows:
            return pd.DataFrame(columns=["name", "ticker", "weight", "market_value"])
            
        return pd.DataFrame(rows)

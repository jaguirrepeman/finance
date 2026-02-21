import time
import requests
import json

import pandas as pd
from bs4 import BeautifulSoup, Tag
from typing import Optional, Dict, List, Any
import re
import unicodedata
from urllib.parse import unquote



# Para evitar ser bloqueado, simulamos ser un navegador
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}

# --- Funciones Auxiliares ---

def get_soup_from_url(url: str) -> Optional[BeautifulSoup]:
    """Obtiene el contenido HTML de una URL y lo convierte en un objeto BeautifulSoup."""
    try:
        response = requests.get(url, headers=HEADERS, timeout=10)
        # Lanza un error para respuestas 4xx/5xx (ej. 403 Forbidden, 404 Not Found)
        response.raise_for_status()
        return BeautifulSoup(response.content, 'lxml')
    except requests.exceptions.HTTPError as e:
        print(f"Error HTTP al obtener la URL {url}: {e.response.status_code} {e.response.reason}")
        return None
    except requests.exceptions.RequestException as e:
        print(f"Error de conexión al obtener la URL {url}: {e}")
        return None

def _clean_column_name(name: str) -> str:
    """Limpia un string para usarlo como nombre de columna, eliminando acentos pero manteniendo la letra y normalizando encoding."""
    name = name.lower()
    # Eliminar acentos pero mantener la letra
    name = ''.join(c for c in unicodedata.normalize('NFKD', name) if unicodedata.category(c) != 'Mn')
    name = re.sub(r'\s+', '_', name)
    name = re.sub(r'[^a-z0-9_]', '', name)
    return name

def get_finect_url(isin: str, fund_name: str = None) -> str:
    """
    Construye la URL para consultar información de un fondo en Finect.
    Si se proporciona un nombre, se añade como slug descriptivo.
    Args:
        isin: ISIN del fondo
        fund_name: Nombre del fondo (opcional)
    Returns:
        str: URL completa para consultar el fondo en Finect
    """
    def slugify(text):
        text = text.lower()
        text = re.sub(r'[^\w\s-]', '', text)
        text = re.sub(r'[\s,]+', '_', text)
        return text

    base_url = f"https://www.finect.com/fondos-inversion/{isin}"
    if fund_name:
        slug = slugify(fund_name)
        if slug:
            return f"{base_url}-{slug}"
    return base_url

# --- Funciones de Extracción (sin cambios) ---

def extract_header_info(soup: BeautifulSoup) -> pd.DataFrame:
    """Extrae la información principal de la cabecera de la página del fondo y devuelve un DataFrame."""
    info = {}
    try:
        name_tag = soup.find('h1', class_=lambda c: c and 'partials__Title' in c)
        info['name'] = name_tag.get_text(strip=True) if name_tag else 'N/A'
        manager_tag = soup.find('a', class_=lambda c: c and 'ManagerLabel' in c)
        info['management_company'] = manager_tag.get_text(strip=True) if manager_tag else 'N/A'
        isin_container = soup.find('div', class_=lambda c: c and 'bXNjBo' in c)
        if isin_container:
            isin_tag = isin_container.find('div')
            info['isin'] = isin_tag.get_text(strip=True) if isin_tag else 'N/A'
        else:
            info['isin'] = 'N/A'
    except Exception as e:
        print(f"Error extrayendo información de la cabecera: {e}")
    # Normalizar nombres de columna y encoding
    info = { _clean_column_name(k): v for k, v in info.items() }
    return pd.DataFrame([info]) if info else pd.DataFrame()

def extract_asset_allocation(soup: BeautifulSoup) -> pd.DataFrame:
    """Extrae la tabla de 'asset allocation' y la convierte en un DataFrame."""
    datos = []
    try:
        titulo_p = soup.find('p', string='Exposición por asset allocation')
        if not titulo_p:
            return pd.DataFrame(columns=['Asset', 'Percentage'])
        contenedor_datos = titulo_p.find_next_sibling('div')
        if not contenedor_datos:
            return pd.DataFrame(columns=['Asset', 'Percentage'])
        filas = contenedor_datos.find_all('div', class_=lambda c: c and 'partials__RowBlock' in c)
        for fila in filas:
            asset = fila.find('div', class_=lambda c: c and 'goFpZn' in c).get_text(strip=True)
            porcentaje_str = fila.find('span', class_=lambda c: c and 'Label-sc' in c).get_text(strip=True)
            porcentaje = float(porcentaje_str.replace('%', '').replace(',', '.').strip())
            datos.append({'Asset': asset, 'Percentage': porcentaje})
    except Exception as e:
        print(f"Error extrayendo asset allocation: {e}")
    # Always return a DataFrame, even if empty
    return pd.DataFrame(datos) if datos else pd.DataFrame(columns=['Asset', 'Percentage'])

def extract_top_holdings(soup: BeautifulSoup) -> pd.DataFrame:
    """Extrae las 10 mayores posiciones en cartera."""
    holdings = []
    try:
        titulo_p = soup.find('p', string='10 mayores posiciones en cartera')
        if not titulo_p:
            return pd.DataFrame(columns=['Position', 'ISIN', 'Value_EUR', 'Weight_pct'])
        table_container = titulo_p.find_next('div', class_=lambda c: c and 'TableInner' in c)
        if not table_container:
            return pd.DataFrame(columns=['Position', 'ISIN', 'Value_EUR', 'Weight_pct'])
        rows = table_container.find('tbody').find_all('tr')
        for row in rows:
            cells = row.find_all('td')
            position_name = cells[0].find('strong').get_text(strip=True)
            position_isin = cells[0].find('small').get_text(strip=True)
            value_str = cells[1].get_text(strip=True).replace('€', '').replace('.', '').replace(',', '.')
            weight_str = cells[2].get_text(strip=True).replace('%', '').replace(',', '.')
            holdings.append({
                'Position': position_name, 'ISIN': position_isin,
                'Value_EUR': float(value_str) if value_str else 0.0,
                'Weight_pct': float(weight_str) if weight_str else 0.0
            })
    except Exception as e:
        print(f"Error extrayendo top holdings: {e}")
    # Always return a DataFrame, even if empty
    return pd.DataFrame(holdings) if holdings else pd.DataFrame(columns=['Position', 'ISIN', 'Value_EUR', 'Weight_pct'])

def extract_fees(soup: BeautifulSoup) -> pd.DataFrame:
    """Extrae las comisiones del fondo y devuelve un DataFrame con columnas normalizadas y valores float."""
    fees = {}
    try:
        info_header = soup.find('h2', string='Información')
        if not info_header:
            return pd.DataFrame()  # Always return a DataFrame
        info_section = info_header.find_parent('section')
        tab_children = info_section.find_all('div', class_=lambda c: c and 'TabChild' in c)
        if len(tab_children) > 1:
            fees_container = tab_children[1]
            rows = fees_container.find_all('div', class_=lambda c: c and 'partials__RowBlock' in c)
            for row in rows:
                cols = row.find_all('div', class_=lambda c: c and 'partials__Column' in c)
                if len(cols) == 2:
                    key = _clean_column_name(cols[0].get_text(strip=True))
                    value = cols[1].get_text(strip=True)
                    # Normalize encoding and convert to float if possible
                    if isinstance(value, str):
                        value = value.replace('%', '').replace(',', '.').replace(' ', '')
                        try:
                            value = float(value)
                        except Exception:
                            pass
                    fees[key] = value
    except Exception as e:
        print(f"Error extrayendo comisiones: {e}")
    # Always return a DataFrame, even if empty
    return pd.DataFrame([fees]) if fees else pd.DataFrame()

def extract_ratios(soup: BeautifulSoup) -> pd.DataFrame:
    """Extrae los ratios del fondo para el periodo por defecto (12 meses) y devuelve un DataFrame con columnas normalizadas y valores float."""
    ratios = {}
    try:
        ratios_header = soup.find('h2', string='Ratios')
        if not ratios_header:
            return pd.DataFrame()  # Always return a DataFrame
        ratios_section = ratios_header.find_parent('section')
        active_tab_content = ratios_section.find('div', class_=lambda c: c and 'xkoFx' in c)
        if active_tab_content:
            rows = active_tab_content.find_all('div', class_=lambda c: c and 'partials__RowBlock' in c)
            for row in rows:
                cols = row.find_all('div', class_=lambda c: c and 'partials__Column' in c)
                if len(cols) == 2:
                    key = _clean_column_name(cols[0].get_text(strip=True))
                    value = cols[1].get_text(strip=True)
                    # Normalize encoding and convert to float if possible
                    if isinstance(value, str):
                        value = value.replace('%', '').replace(',', '.').replace(' ', '')
                        try:
                            value = float(value)
                        except Exception:
                            pass
                    ratios[key] = value
    except Exception as e:
        print(f"Error extrayendo ratios: {e}")
    # Always return a DataFrame, even if empty
    return pd.DataFrame([ratios]) if ratios else pd.DataFrame()

# --- SECCION PARA SCRAPEAR UNA LISTA DE FONDOS ---

def scrape_fund_list_from_html(list_url: str) -> Optional[pd.DataFrame]:
    """
    Extrae la lista de todos los fondos de una página de listado de Finect
    parseando los datos JSON incrustados en una etiqueta <script>.

    Args:
        list_url (str): La URL de la página de listado (ej. la de una gestora).

    Returns:
        Optional[pd.DataFrame]: Un DataFrame con 'name', 'isin' y 'url' de cada fondo.
    """
    print(f"Extrayendo lista de fondos de: {list_url}")
    soup = get_soup_from_url(list_url)
    if not soup:
        return None

    try:
        # 1. Encontrar la etiqueta <script> que contiene el estado inicial de la aplicación.
        script_tag = soup.find('script', string=re.compile(r'window\.INITIAL_STATE'))
        if not script_tag:
            print("Error: No se encontró la etiqueta <script> con INITIAL_STATE.")
            return None

        # 2. Extraer el contenido JSON de la etiqueta.
        script_content = script_tag.string
        # El JSON está dentro de window.INITIAL_STATE="..."; lo extraemos.
        json_str_encoded = re.search(r'="(.+?)"', script_content).group(1)
        
        # 3. Decodificar y parsear el JSON.
        json_str_decoded = unquote(json_str_encoded)
        data = json.loads(json_str_decoded)

        # 4. Navegar por la estructura del JSON para encontrar la lista de fondos.
        funds_list = data.get('fund', {}).get('fundList', {}).get('items', [])
        
        if not funds_list:
            print("Advertencia: No se encontraron fondos en los datos de la página.")
            return pd.DataFrame(columns=['name', 'isin', 'url'])

        # 5. Procesar los datos y crear el DataFrame.
        all_funds = []
        for item in funds_list:
            fund_url = f"https://www.finect.com/fondos-inversion/{item.get('web', '')}"
            all_funds.append({
                'name': item.get('name', 'N/A'),
                'isin': item.get('isin', 'N/A'),
                'url': fund_url
            })
        
        print(f"Extracción de la lista de fondos finalizada. Total: {len(all_funds)} fondos.")
        return pd.DataFrame(all_funds)

    except (AttributeError, json.JSONDecodeError, KeyError) as e:
        print(f"Error al parsear los datos de la página: {e}")
        return None


import requests
import json
import time
import re
from urllib.parse import urlparse, parse_qs, unquote
from typing import Optional, List, Dict
import pandas as pd
from bs4 import BeautifulSoup


def get_soup_from_url(url: str, headers: Dict = None) -> Optional[BeautifulSoup]:
    """
    Función auxiliar para obtener BeautifulSoup de una URL.
    """
    if not headers:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, como Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        }
    
    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        return BeautifulSoup(response.content, 'html.parser')
    except Exception as e:
        print(f"Error obteniendo página: {e}")
        return None


def find_api_endpoints_in_html(soup: BeautifulSoup) -> List[str]:
    """
    Busca posibles endpoints de API en el JavaScript de la página.
    """
    endpoints = []
    script_tags = soup.find_all('script')
    
    api_patterns = [
        r'["\']([^"\']*api[^"\']*fund[^"\']*)["\']',
        r'["\']([^"\']*v\d+[^"\']*fund[^"\']*)["\']',
        r'["\']([^"\']*bff[^"\']*fund[^"\']*)["\']',
        r'["\']([^"\']*fund[^"\']*list[^"\']*)["\']',
        r'["\']([^"\']*listado[^"\']*)["\']',
        r'url\s*:\s*["\']([^"\']*)["\']',
        r'endpoint\s*:\s*["\']([^"\']*)["\']'
    ]
    
    for script in script_tags:
        if script.string:
            for pattern in api_patterns:
                matches = re.findall(pattern, script.string, re.IGNORECASE)
                for match in matches:
                    if 'fund' in match.lower() and len(match) > 5:
                        endpoints.append(match)
    
    return list(set(endpoints))


def analyze_initial_state(soup: BeautifulSoup) -> Dict:
    """
    Analiza el INITIAL_STATE para encontrar información sobre paginación y APIs.
    """
    try:
        script_tag = soup.find('script', string=re.compile(r'window\.INITIAL_STATE'))
        if not script_tag:
            return {}

        script_content = script_tag.string
        json_str_encoded = re.search(r'="(.+?)"', script_content).group(1)
        json_str_decoded = unquote(json_str_encoded)
        data = json.loads(json_str_decoded)

        # Buscar información de paginación
        fund_data = data.get('fund', {})
        fund_list = fund_data.get('fundList', {})
        
        info = {
            'total_items': fund_list.get('totalItems', 0),
            'items_per_page': fund_list.get('limit', 24),
            'current_page': fund_list.get('offset', 0),
            'items_loaded': len(fund_list.get('items', [])),
            'has_more': fund_list.get('totalItems', 0) > len(fund_list.get('items', [])),
        }
        
        print(f"Análisis del estado inicial:")
        print(f"  - Total de fondos: {info['total_items']}")
        print(f"  - Fondos cargados: {info['items_loaded']}")
        print(f"  - Hay más fondos: {info['has_more']}")
        
        return info
        
    except Exception as e:
        print(f"Error analizando INITIAL_STATE: {e}")
        return {}


def try_different_api_endpoints(company_id: str, session: requests.Session, headers: Dict) -> Optional[List[Dict]]:
    """
    Prueba diferentes endpoints de API que podrían funcionar.
    """
    possible_endpoints = [
        "https://www.finect.com/api/fund/list",
        "https://www.finect.com/api/v1/fund/list",
        "https://www.finect.com/api/v2/fund/list",
        "https://www.finect.com/api/v3/fund/list",
        "https://www.finect.com/api/v4/fund/list",
        "https://www.finect.com/v4/api/fund/list",
        "https://www.finect.com/bff/fund/list",
        "https://www.finect.com/api/funds",
        "https://www.finect.com/api/funds/search",
        "https://www.finect.com/funds/api/list",
        "https://www.finect.com/fondos-inversion/api/list",
    ]
    
    for endpoint in possible_endpoints:
        print(f"Probando endpoint: {endpoint}")
        
        payloads = [
            {
                "company": [company_id],
                "order": "-totalNetAsset",
                "type": "fund",
                "offset": 24,
                "limit": 24
            },
            {
                "company": company_id,
                "order": "-totalNetAsset",
                "offset": 24,
                "limit": 24
            },
            {
                "companyId": company_id,
                "offset": 24,
                "limit": 24
            }
        ]
        
        for payload in payloads:
            try:
                response = session.post(endpoint, json=payload, headers=headers, timeout=10)
                print(f"  -> Status: {response.status_code}")
                
                if response.status_code == 200:
                    data = response.json()
                    if 'items' in data and data['items']:
                        print(f"  -> ¡Éxito! Encontrados {len(data['items'])} fondos")
                        return endpoint, payload
                        
            except Exception as e:
                continue
    
    return None, None


def scrape_with_selenium_simulation(list_url: str) -> Optional[pd.DataFrame]:
    """
    Simula el comportamiento de Selenium usando requests para cargar contenido dinámico.
    """
    print(f"Intentando simular carga dinámica para: {list_url}")
    
    session = requests.Session()
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, como Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'es-ES,es;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Content-Type': 'application/json',
        'Origin': 'https://www.finect.com',
        'Referer': list_url,
        'DNT': '1',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
    }
    
    # 1. Cargar página inicial
    soup = get_soup_from_url(list_url)
    if not soup:
        return None
    
    # 2. Analizar estado inicial
    initial_info = analyze_initial_state(soup)
    if not initial_info.get('has_more', False):
        print("No hay más fondos para cargar según el estado inicial.")
        return scrape_fund_list_from_html(list_url)
    
    # 3. Buscar endpoints en el JavaScript
    api_endpoints = find_api_endpoints_in_html(soup)
    print(f"Endpoints encontrados en JS: {api_endpoints[:5]}...")  # Mostrar solo los primeros 5
    
    # 4. Extraer company_id
    parsed_url = urlparse(list_url)
    params = parse_qs(parsed_url.query)
    company_id = params.get('company', [None])[0]
    
    if not company_id:
        print("No se pudo extraer company_id")
        return scrape_fund_list_from_html(list_url)
    
    # 5. Probar endpoints conocidos y descubiertos
    working_endpoint, working_payload = try_different_api_endpoints(company_id, session, headers)
    
    if working_endpoint:
        print(f"¡Endpoint funcional encontrado: {working_endpoint}")
        return scrape_all_funds_with_api(working_endpoint, working_payload, session, headers, list_url)
    else:
        print("No se encontró un endpoint funcional. Usando datos del HTML inicial.")
        return scrape_fund_list_from_html(list_url)


def scrape_all_funds_with_api(endpoint: str, base_payload: Dict, session: requests.Session, 
                             headers: Dict, list_url: str) -> Optional[pd.DataFrame]:
    """
    Extrae todos los fondos usando el endpoint API funcional.
    """
    all_funds = []
    offset = 0
    limit = base_payload.get('limit', 24)
    
    # Primero obtener fondos iniciales del HTML
    initial_df = scrape_fund_list_from_html(list_url)
    if initial_df is not None:
        all_funds.extend(initial_df.to_dict('records'))
        offset = len(all_funds)
    
    print(f"Comenzando extracción API desde offset {offset}...")
    
    while True:
        payload = base_payload.copy()
        payload['offset'] = offset
        
        try:
            response = session.post(endpoint, json=payload, headers=headers, timeout=15)
            response.raise_for_status()
            data = response.json()
            
            current_items = data.get('items', [])
            if not current_items:
                break
            
            for item in current_items:
                fund_url = f"https://www.finect.com/fondos-inversion/{item.get('web', '')}"
                all_funds.append({
                    'name': item.get('name', 'N/A'),
                    'isin': item.get('isin', 'N/A'),
                    'url': fund_url
                })
            
            print(f"  -> Obtenidos {len(current_items)} fondos. Total: {len(all_funds)}")
            offset += limit
            time.sleep(1)
            
        except Exception as e:
            print(f"Error en offset {offset}: {e}")
            break
    
    return pd.DataFrame(all_funds) if all_funds else None


def scrape_fund_list_from_html(list_url: str) -> Optional[pd.DataFrame]:
    """
    Tu función original mejorada.
    """
    print(f"Extrayendo lista de fondos del HTML: {list_url}")
    soup = get_soup_from_url(list_url)
    if not soup:
        return None

    try:
        script_tag = soup.find('script', string=re.compile(r'window\.INITIAL_STATE'))
        if not script_tag:
            print("Error: No se encontró la etiqueta <script> con INITIAL_STATE.")
            return None

        script_content = script_tag.string
        json_str_encoded = re.search(r'="(.+?)"', script_content).group(1)
        json_str_decoded = unquote(json_str_encoded)
        data = json.loads(json_str_decoded)

        funds_list = data.get('fund', {}).get('fundList', {}).get('items', [])
        
        if not funds_list:
            print("Advertencia: No se encontraron fondos en los datos de la página.")
            return pd.DataFrame(columns=['name', 'isin', 'url'])

        all_funds = []
        for item in funds_list:
            fund_url = f"https://www.finect.com/fondos-inversion/{item.get('web', '')}"
            all_funds.append({
                'name': item.get('name', 'N/A'),
                'isin': item.get('isin', 'N/A'),
                'url': fund_url
            })
        
        print(f"Extracción del HTML finalizada. Total: {len(all_funds)} fondos.")
        return pd.DataFrame(all_funds)

    except (AttributeError, json.JSONDecodeError, KeyError) as e:
        print(f"Error al parsear los datos de la página: {e}")
        return None


def scrape_fund_list_ultimate(list_url: str) -> Optional[pd.DataFrame]:
    """
    Función principal que combina todos los métodos disponibles.
    """
    print(f"\n=== INICIANDO EXTRACCIÓN COMPLETA ===")
    print(f"URL: {list_url}")
    
    # Método 1: Simulación de carga dinámica
    print(f"\n--- Método 1: Simulación de carga dinámica ---")
    df_dynamic = scrape_with_selenium_simulation(list_url)
    
    if df_dynamic is not None and len(df_dynamic) > 24:
        print(f"✅ Éxito con método dinámico: {len(df_dynamic)} fondos")
        return df_dynamic
    
    # Método 2: Solo HTML (respaldo)
    print(f"\n--- Método 2: Extracción del HTML inicial ---")
    df_html = scrape_fund_list_from_html(list_url)
    
    if df_html is not None:
        print(f"✅ Datos obtenidos del HTML: {len(df_html)} fondos")
        return df_html
    
    print("❌ No se pudieron obtener datos con ningún método.")
    return None


def scrape_with_real_selenium(list_url: str) -> Optional[pd.DataFrame]:
    """
    Función completa que usa Selenium para cargar todo el contenido dinámico.
    Requiere: pip install selenium
    Y descargar ChromeDriver desde: https://chromedriver.chromium.org/
    """
    try:
        from selenium import webdriver
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.common.action_chains import ActionChains
        from selenium.common.exceptions import TimeoutException, NoSuchElementException
        
        print("🔄 Iniciando Selenium para cargar contenido dinámico...")
        
        # Configurar opciones de Chrome
        chrome_options = Options()
        chrome_options.add_argument("--headless")  # Ejecutar sin interfaz gráfica
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--window-size=1920,1080")
        chrome_options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, como Gecko) Chrome/120.0.0.0 Safari/537.36")
        
        # Inicializar driver
        driver = webdriver.Chrome(options=chrome_options)
        driver.implicitly_wait(10)
        
        print(f"📄 Cargando página: {list_url}")
        driver.get(list_url)
        
        # Esperar a que cargue el contenido inicial
        try:
            # Intentar diferentes selectores que podrían contener los fondos
            possible_selectors = [
                "tr[data-testid*='fund']",
                ".fund-item",
                ".fund-row",
                "tbody tr",
                "[class*='fund']",
                "table tbody tr"
            ]
            
            initial_funds_found = False
            for selector in possible_selectors:
                try:
                    WebDriverWait(driver, 5).until(
                        EC.presence_of_element_located((By.CSS_SELECTOR, selector))
                    )
                    print(f"✅ Fondos encontrados con selector: {selector}")
                    initial_funds_found = True
                    break
                except TimeoutException:
                    continue
            
            if not initial_funds_found:
                print("⚠️ No se encontraron fondos con selectores conocidos. Continuando...")
                time.sleep(3)  # Dar tiempo adicional para cargar
            
        except TimeoutException:
            print("⚠️ Timeout esperando contenido inicial, pero continuando...")
        
        # Obtener altura inicial
        last_height = driver.execute_script("return document.body.scrollHeight")
        funds_count_before = 0
        max_attempts = 20  # Máximo 20 intentos de scroll
        attempts = 0
        no_change_count = 0
        
        print("🔄 Iniciando scroll automático para cargar más fondos...")
        
        while attempts < max_attempts:
            attempts += 1
            
            # Contar fondos actuales (intentar diferentes selectores)
            current_funds_count = 0
            for selector in ["tbody tr", "tr", ".fund-item", "[class*='fund']"]:
                try:
                    elements = driver.find_elements(By.CSS_SELECTOR, selector)
                    if len(elements) > current_funds_count:
                        current_funds_count = len(elements)
                except:
                    continue
            
            print(f"📊 Intento {attempts}: {current_funds_count} fondos detectados")
            
            # Scroll suave hasta abajo
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(2)
            
            # Scroll adicional para activar lazy loading
            driver.execute_script("window.scrollBy(0, -100);")
            time.sleep(0.5)
            driver.execute_script("window.scrollBy(0, 200);")
            time.sleep(1)
            
            # Intentar hacer clic en botón "Cargar más" si existe
            load_more_selectors = [
                "button[class*='load']",
                "button[class*='more']",
                "button[class*='mas']",
                ".load-more",
                ".btn-load-more",
                "[data-testid*='load']",
                "button:contains('Cargar')",
                "button:contains('Más')"
            ]
            
            for selector in load_more_selectors:
                try:
                    load_button = driver.find_element(By.CSS_SELECTOR, selector)
                    if load_button.is_displayed() and load_button.is_enabled():
                        print(f"🔘 Haciendo clic en botón 'Cargar más': {selector}")
                        ActionChains(driver).move_to_element(load_button).click().perform()
                        time.sleep(3)
                        break
                except:
                    continue
            
            # Verificar si la altura ha cambiado
            new_height = driver.execute_script("return document.body.scrollHeight")
            
            # Verificar si hay cambios
            if current_funds_count == funds_count_before and new_height == last_height:
                no_change_count += 1
                if no_change_count >= 3:
                    print("🛑 No se detectan más cambios. Finalizando scroll.")
                    break
            else:
                no_change_count = 0
            
            funds_count_before = current_funds_count
            last_height = new_height
            
            # Pausa adicional cada 5 intentos
            if attempts % 5 == 0:
                print(f"⏸️ Pausa de {attempts//5 + 2} segundos...")
                time.sleep(attempts//5 + 2)
        
        print(f"✅ Scroll completado. Extrayendo datos finales...")
        
        # Extraer el HTML final
        page_source = driver.page_source
        current_url = driver.current_url
        
        # Cerrar driver
        driver.quit()
        print("🔒 Navegador cerrado.")
        
        # Procesar HTML con BeautifulSoup
        soup = BeautifulSoup(page_source, 'html.parser')
        
        # Método 1: Intentar extraer del INITIAL_STATE actualizado
        funds_from_state = extract_funds_from_initial_state(soup)
        
        # Método 2: Extraer directamente de la tabla HTML
        funds_from_table = extract_funds_from_table(soup)
        
        # Método 3: Buscar enlaces de fondos en toda la página
        funds_from_links = extract_funds_from_links(soup)
        
        # Combinar resultados y elegir el mejor
        all_methods = [
            ("INITIAL_STATE", funds_from_state),
            ("Tabla HTML", funds_from_table), 
            ("Enlaces", funds_from_links)
        ]
        
        best_result = None
        best_count = 0
        
        for method_name, funds_list in all_methods:
            if funds_list and len(funds_list) > best_count:
                best_result = funds_list
                best_count = len(funds_list)
                print(f"🏆 Mejor método: {method_name} con {best_count} fondos")
        
        if best_result:
            df = pd.DataFrame(best_result)
            # Eliminar duplicados basándose en ISIN
            df_unique = df.drop_duplicates(subset=['isin'], keep='first')
            print(f"📋 Fondos únicos después de eliminar duplicados: {len(df_unique)}")
            return df_unique
        else:
            print("❌ No se pudieron extraer fondos con ningún método.")
            return None
            
    except ImportError:
        print("❌ Selenium no está disponible. Instálalo con: pip install selenium")
        print("📥 También necesitas descargar ChromeDriver desde: https://chromedriver.chromium.org/")
        return None
    except Exception as e:
        print(f"❌ Error con Selenium: {e}")
        return None


def extract_funds_from_initial_state(soup: BeautifulSoup) -> List[Dict]:
    """
    Extrae fondos del INITIAL_STATE (similar a tu función original pero más robusta).
    """
    try:
        script_tag = soup.find('script', string=re.compile(r'window\.INITIAL_STATE'))
        if not script_tag:
            return []

        script_content = script_tag.string
        json_str_encoded = re.search(r'="(.+?)"', script_content).group(1)
        json_str_decoded = unquote(json_str_encoded)
        data = json.loads(json_str_decoded)

        funds_list = data.get('fund', {}).get('fundList', {}).get('items', [])
        
        result = []
        for item in funds_list:
            fund_url = f"https://www.finect.com/fondos-inversion/{item.get('web', '')}"
            result.append({
                'name': item.get('name', 'N/A'),
                'isin': item.get('isin', 'N/A'),
                'url': fund_url
            })
        
        print(f"🔍 Fondos extraídos del INITIAL_STATE: {len(result)}")
        return result

    except Exception as e:
        print(f"⚠️ Error extrayendo del INITIAL_STATE: {e}")
        return []


def extract_funds_from_table(soup: BeautifulSoup) -> List[Dict]:
    """
    Extrae fondos directamente de las filas de la tabla HTML.
    """
    try:
        result = []
        
        # Buscar todas las filas de tabla que podrían contener fondos
        possible_selectors = [
            "tbody tr",
            "tr[data-testid]",
            "tr:has(a[href*='fondos-inversion'])",
            ".fund-row",
            ".fund-item"
        ]
        
        all_rows = []
        for selector in possible_selectors:
            rows = soup.select(selector)
            if rows:
                all_rows.extend(rows)
                print(f"🔍 Encontradas {len(rows)} filas con selector: {selector}")
        
        # Eliminar duplicados de filas
        unique_rows = []
        seen_html = set()
        for row in all_rows:
            row_html = str(row)
            if row_html not in seen_html:
                unique_rows.append(row)
                seen_html.add(row_html)
        
        print(f"🔍 Total de filas únicas encontradas: {len(unique_rows)}")
        
        for row in unique_rows:
            # Buscar enlace al fondo
            fund_link = row.find('a', href=re.compile(r'/fondos-inversion/'))
            if not fund_link:
                continue
            
            fund_url = fund_link.get('href', '')
            if fund_url.startswith('/'):
                fund_url = f"https://www.finect.com{fund_url}"
            
            # Extraer nombre (texto del enlace)
            fund_name = fund_link.get_text(strip=True) or 'N/A'
            
            # Buscar ISIN en la fila (puede estar en diferentes lugares)
            isin = 'N/A'
            
            # Buscar en atributos data-*
            for attr in row.attrs:
                if 'isin' in attr.lower() and row.attrs[attr]:
                    isin = row.attrs[attr]
                    break
            
            # Buscar en el texto de la fila (patrón ISIN: 2 letras + 10 alfanuméricos)
            if isin == 'N/A':
                row_text = row.get_text()
                isin_match = re.search(r'\b[A-Z]{2}[A-Z0-9]{10}\b', row_text)
                if isin_match:
                    isin = isin_match.group()
            
            # Buscar en elementos con clases que contengan 'isin'
            if isin == 'N/A':
                isin_element = row.find(class_=re.compile(r'isin', re.I))
                if isin_element:
                    isin = isin_element.get_text(strip=True) or 'N/A'
            
            result.append({
                'name': fund_name,
                'isin': isin,
                'url': fund_url
            })
        
        print(f"📊 Fondos extraídos de tabla HTML: {len(result)}")
        return result

    except Exception as e:
        print(f"⚠️ Error extrayendo de tabla HTML: {e}")
        return []


def extract_funds_from_links(soup: BeautifulSoup) -> List[Dict]:
    """
    Extrae fondos buscando todos los enlaces a fondos en la página.
    """
    try:
        result = []
        
        # Buscar todos los enlaces a fondos
        fund_links = soup.find_all('a', href=re.compile(r'/fondos-inversion/[^/]+'))
        
        print(f"🔗 Enlaces a fondos encontrados: {len(fund_links)}")
        
        for link in fund_links:
            fund_url = link.get('href', '')
            if fund_url.startswith('/'):
                fund_url = f"https://www.finect.com{fund_url}"
            
            fund_name = link.get_text(strip=True) or 'N/A'
            
            # Intentar extraer ISIN del contexto del enlace
            isin = 'N/A'
            
            # Buscar en el elemento padre
            parent = link.parent
            if parent:
                parent_text = parent.get_text()
                isin_match = re.search(r'\b[A-Z]{2}[A-Z0-9]{10}\b', parent_text)
                if isin_match:
                    isin = isin_match.group()
            
            result.append({
                'name': fund_name,
                'isin': isin,
                'url': fund_url
            })
        
        print(f"🔗 Fondos extraídos de enlaces: {len(result)}")
        return result

    except Exception as e:
        print(f"⚠️ Error extrayendo enlaces: {e}")
        return []

# --- Función Principal Modificada ---

def scrape_finect_fund_data(isin: str) -> Optional[pd.DataFrame]:
    """
    Función principal para scrapear toda la información de un fondo en Finect.

    Devuelve un DataFrame de una fila donde la columna 'top_holdings' contiene
    otro DataFrame anidado con las principales posiciones.

    Args:
        url (str): La URL de la página del fondo en Finect.

    Returns:
        Optional[pd.DataFrame]: Un DataFrame de una fila con la información,
                                o None si la página no se pudo obtener.
    """
    print(f"Obteniendo datos de: {isin}")
    url = get_finect_url(isin)
    soup = get_soup_from_url(url)
    if not soup:
        return None

    print("Extrayendo y estructurando información...")
    
    flat_data = {}
    flat_data['url'] = url
    flat_data['scraped_at'] = pd.Timestamp.now().strftime('%Y-%m-%d %H:%M:%S')

    # 1. Información de la cabecera
    header_df = extract_header_info(soup)
    for col in header_df.columns:
        flat_data[f'header_{col}'] = header_df.iloc[0][col]

    # 2. Comisiones
    fees_df = extract_fees(soup)
    for col in fees_df.columns:
        flat_data[f'fee_{col}'] = fees_df.iloc[0][col]

    # 3. Ratios (12 meses por defecto)
    ratios_df = extract_ratios(soup)
    for col in ratios_df.columns:
        flat_data[f'ratio_12m_{col}'] = ratios_df.iloc[0][col]

    # 4. Asset Allocation (pivotar a columnas)
    asset_df = extract_asset_allocation(soup)
    if not asset_df.empty:
        for _, row in asset_df.iterrows():
            asset_name = _clean_column_name(row['Asset'])
            flat_data[f'asset_{asset_name}_pct'] = row['Percentage']

    # 5. Top Holdings (almacenar como DataFrame anidado)
    holdings_df = extract_top_holdings(soup)
    flat_data['top_holdings'] = [holdings_df] # Se almacena dentro de una lista para que Pandas lo trate correctamente.

    # Crear el DataFrame de una sola fila
    final_df = pd.DataFrame(flat_data, index=[0])
    # Convertir fee_comisi* y ratio_12m* a float si no lo son
    for col in final_df.columns:
        if col.startswith('fee_comisi') or col.startswith('ratio_12m'):
            try:
                val = final_df.at[0, col]
                if isinstance(val, str):
                    val = val.replace('%', '').replace(',', '.').replace(' ', '')
                    final_df.at[0, col] = float(val)
            except:
                pass

    print("Extracción completada.")
    return final_df


# --- Bloque de ejemplo de uso ---
if __name__ == "__main__":
    finect_url = "https://www.finect.com/fondos-inversion/ES0133337008-Estrategia_acumulacion_fi"
    
    # URL de ejemplo que podría fallar (para probar el manejo de errores)
    # finect_url_bad = "https://www.finect.com/fondos-inversion/ISIN_INEXISTENTE"

    # Obtener todos los datos en un DataFrame de una fila
    fund_df = scrape_finect_fund_data(finect_url)

    # <<<<<<< CORRECCIÓN APLICADA AQUÍ >>>>>>>>>
    # Comprobamos que `fund_df` no sea `None` antes de intentar usarlo.
    if fund_df is not None and not fund_df.empty:
        print("\n--- Información principal (1 fila) ---")
        # Imprimimos las columnas principales, excluyendo el DF anidado para mayor claridad
        main_info_cols = [col for col in fund_df.columns if col != 'top_holdings']
        print(fund_df[main_info_cols].T)

        print("\n--- DataFrame de Top Holdings (anidado en la columna 'top_holdings') ---")
        # Para acceder al DataFrame anidado:
        # Usamos .iloc[0] para acceder al DataFrame dentro de la primera (y única) fila
        holdings_dataframe = fund_df['top_holdings'].iloc[0]
        if not holdings_dataframe.empty:
            print(holdings_dataframe)
        else:
            print("No se encontraron datos de 'top holdings'.")
    else:
        print("\nNo se pudieron extraer los datos del fondo. El DataFrame está vacío o es nulo.")

def scrape_fund_list_finect_api(list_url: str) -> Optional[pd.DataFrame]:
    """
    Extrae la lista completa de fondos de Finect usando el API interno (POST) detectado en la web.
    """
    
    print(f"Extrayendo lista completa de fondos de Finect vía API: {list_url}")
    from urllib.parse import urlparse, parse_qs
    import requests
    # Extraer company_id del parámetro de la URL
    parsed_url = urlparse(list_url)
    params = parse_qs(parsed_url.query)
    company_id = params.get('company', [None])[0]
    if not company_id:
        print("No se pudo extraer company_id de la URL.")
        return None
    # Endpoint y payload detectados por ingeniería inversa
    endpoint = "https://www.finect.com/api/v4/fund/list"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, como Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'Origin': 'https://www.finect.com',
        'Referer': list_url,
    }
    all_funds = []
    offset = 0
    limit = 100
    while True:
        payload = {
            "company": [company_id],
            "order": "-totalNetAsset",
            "type": "fund",
            "offset": offset,
            "limit": limit
        }
        try:
            response = requests.post(endpoint, json=payload, headers=headers, timeout=15)
            response.raise_for_status()
            data = response.json()
            items = data.get('items', [])
            if not items:
                break
            for item in items:
                fund_url = f"https://www.finect.com/fondos-inversion/{item.get('web', '')}"
                all_funds.append({
                    'name': item.get('name', 'N/A'),
                    'isin': item.get('isin', 'N/A'),
                    'url': fund_url
                })
            print(f"  -> Obtenidos {len(items)} fondos. Total: {len(all_funds)}")
            offset += limit
            if len(items) < limit:
                break
        except Exception as e:
            print(f"Error en offset {offset}: {e}")
            break
    if all_funds:
        print(f"✅ Extracción API finalizada. Total: {len(all_funds)} fondos.")
        return pd.DataFrame(all_funds)
    print("❌ No se pudieron obtener fondos con el API.")
    return None
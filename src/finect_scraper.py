import requests
import pandas as pd
from bs4 import BeautifulSoup, Tag
from typing import Optional, Dict, List, Any
import re
import yfinance as yf


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
    """Limpia un string para usarlo como nombre de columna."""
    name = name.lower()
    name = re.sub(r'\s+', '_', name)
    name = re.sub(r'[^a-z0-9_]', '', name)
    return name

def get_finect_url(isin: str) -> str:
    """
    Construye la URL para consultar información de un fondo en Finect
    
    Args:
        isin: ISIN del fondo
        nombre: Nombre del fondo (opcional) para generar un slug más descriptivo
        
    Returns:
        str: URL completa para consultar el fondo en Finect
    """
    def slugify(text):
        text = text.lower()
        text = re.sub(r'[^\w\s-]', '', text)
        text = re.sub(r'[\s,]+', '_', text)
        return text
    
    base_url = f"https://www.finect.com/fondos-inversion/{isin}"
        # Si tenemos nombre, añadir slug
    
    stock = yf.Ticker(isin)
    info = stock.info
    nombre = info.get('longName', '')

    if nombre:
        slug = slugify(nombre)
        if slug:
            return f"{base_url}-{slug}"
    
    return base_url

# --- Funciones de Extracción (sin cambios) ---

def extract_header_info(soup: BeautifulSoup) -> Dict[str, str]:
    """Extrae la información principal de la cabecera de la página del fondo."""
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
    return info

def extract_asset_allocation(soup: BeautifulSoup) -> pd.DataFrame:
    """Extrae la tabla de 'asset allocation' y la convierte en un DataFrame."""
    datos = []
    try:
        titulo_p = soup.find('p', string='Exposición por asset allocation')
        if not titulo_p: return pd.DataFrame(columns=['Asset', 'Percentage'])
        contenedor_datos = titulo_p.find_next_sibling('div')
        if not contenedor_datos: return pd.DataFrame(columns=['Asset', 'Percentage'])
        filas = contenedor_datos.find_all('div', class_=lambda c: c and 'partials__RowBlock' in c)
        for fila in filas:
            asset = fila.find('div', class_=lambda c: c and 'goFpZn' in c).get_text(strip=True)
            porcentaje_str = fila.find('span', class_=lambda c: c and 'Label-sc' in c).get_text(strip=True)
            porcentaje = float(porcentaje_str.replace('%', '').replace(',', '.').strip())
            datos.append({'Asset': asset, 'Percentage': porcentaje})
    except Exception as e:
        print(f"Error extrayendo asset allocation: {e}")
    return pd.DataFrame(datos)

def extract_top_holdings(soup: BeautifulSoup) -> pd.DataFrame:
    """Extrae las 10 mayores posiciones en cartera."""
    holdings = []
    try:
        titulo_p = soup.find('p', string='10 mayores posiciones en cartera')
        if not titulo_p: return pd.DataFrame(columns=['Position', 'ISIN', 'Value_EUR', 'Weight_pct'])
        table_container = titulo_p.find_next('div', class_=lambda c: c and 'TableInner' in c)
        if not table_container: return pd.DataFrame(columns=['Position', 'ISIN', 'Value_EUR', 'Weight_pct'])
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
    return pd.DataFrame(holdings)

def extract_fees(soup: BeautifulSoup) -> Dict[str, str]:
    """Extrae las comisiones del fondo."""
    fees = {}
    try:
        info_header = soup.find('h2', string='Información')
        if not info_header: return fees
        info_section = info_header.find_parent('section')
        tab_children = info_section.find_all('div', class_=lambda c: c and 'TabChild' in c)
        if len(tab_children) > 1:
            fees_container = tab_children[1]
            rows = fees_container.find_all('div', class_=lambda c: c and 'partials__RowBlock' in c)
            for row in rows:
                cols = row.find_all('div', class_=lambda c: c and 'partials__Column' in c)
                if len(cols) == 2: fees[_clean_column_name(cols[0].get_text(strip=True))] = cols[1].get_text(strip=True)
    except Exception as e:
        print(f"Error extrayendo comisiones: {e}")
    return fees

def extract_ratios(soup: BeautifulSoup) -> Dict[str, str]:
    """Extrae los ratios del fondo para el periodo por defecto (12 meses)."""
    ratios = {}
    try:
        ratios_header = soup.find('h2', string='Ratios')
        if not ratios_header: return ratios
        ratios_section = ratios_header.find_parent('section')
        active_tab_content = ratios_section.find('div', class_=lambda c: c and 'xkoFx' in c)
        if active_tab_content:
            rows = active_tab_content.find_all('div', class_=lambda c: c and 'partials__RowBlock' in c)
            for row in rows:
                cols = row.find_all('div', class_=lambda c: c and 'partials__Column' in c)
                if len(cols) == 2: ratios[_clean_column_name(cols[0].get_text(strip=True))] = cols[1].get_text(strip=True)
    except Exception as e:
        print(f"Error extrayendo ratios: {e}")
    return ratios

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
    header_info = extract_header_info(soup)
    for key, value in header_info.items():
        flat_data[f'header_{_clean_column_name(key)}'] = value

    # 2. Comisiones
    fees = extract_fees(soup)
    for key, value in fees.items():
        flat_data[f'fee_{key}'] = value

    # 3. Ratios (12 meses por defecto)
    ratios = extract_ratios(soup)
    for key, value in ratios.items():
        flat_data[f'ratio_12m_{key}'] = value

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
    final_df = pd.DataFrame(flat_data)
    
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
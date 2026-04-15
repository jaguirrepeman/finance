import pandas as pd
from playwright.sync_api import sync_playwright
import time

# Datos de la cartera actual con sus ISINs para Finect
portfolio_data = [
    {"Fondo": "SP500 IE00BYX5MX67", "ISIN": "IE00BYX5MX67", "TIPO": "INDEX", "Porcentaje": 15.93},
    {"Fondo": "MSCI1 IE00BD0NCM55", "ISIN": "IE00BD0NCM55", "TIPO": "INDEX", "Porcentaje": 9.44},
    {"Fondo": "EUROSTOXX BBVA", "ISIN": "ES0182527237", "TIPO": "INDEX", "Porcentaje": 11.26}, # Proxy ISIN
    {"Fondo": "Horos", "ISIN": "ES0146309002", "TIPO": "VALUE", "Porcentaje": 6.11},
    {"Fondo": "Robeco", "ISIN": "LU0329355670", "TIPO": "VALUE", "Porcentaje": 2.74},
    {"Fondo": "Cobas Int", "ISIN": "LU1598719752", "TIPO": "VALUE", "Porcentaje": 2.74},
    {"Fondo": "DNB Tech", "ISIN": "LU0302296495", "TIPO": "SPECIALIZED", "Porcentaje": 5.90},
]

def scrape_finect(isin, page):
    print(f"🔍 Buscando {isin} en Finect...")
    
    # Vamos a la página y hacemos la búsqueda manual tal como haría un usuario
    page.goto("https://www.finect.com/")
    
    # Aceptar cookies si aparecen (botón "Aceptar y continuar")
    try:
        page.get_by_text("Aceptar y continuar").click(timeout=3000)
        time.sleep(1)
    except:
        pass
        
    try:
        # Buscar el fondo en la barra principal
        search_input = page.locator("input[placeholder*='Busca fondos']")
        search_input.wait_for(state="visible", timeout=5000)
        search_input.fill(isin)
        time.sleep(1.5) # Esperar a que el autocompletar cargue
        
        # Hacer clic en el resultado correcto
        result_link = page.locator(f"a[href*='{isin}']").first
        result_link.wait_for(state="visible", timeout=5000)
        result_link.click()
        
        # Esperar a que cargue la vista del fondo
        page.locator("h1").wait_for(state="visible", timeout=8000)
        time.sleep(1)
        
        # Extraer Precio (NAV)
        try:
            # Selector más estable según nuestra auditoría DOM
            price = page.locator("xpath=//h1/following-sibling::div[contains(., '€')]//span[1]").first.inner_text()
        except:
            price = "N/A"
            
        # Extraer Rentabilidad YTD (Año actual 2026/2025)
        try:
            # Buscamos la fila de rentabilidad del año en curso
            ytd = page.locator("xpath=//span[text()='2026' or text()='2025']/following-sibling::div").first.inner_text()
        except:
            ytd = "N/A"
            
        return {"NAV (Precio)": price, "YTD (%)": ytd}
        
    except Exception as e:
        print(f"⚠️ Error extrayendo {isin}: no se encontró en la búsqueda o superó el tiempo.")
        return {"NAV (Precio)": "Error", "YTD (%)": "Error"}

def main():
    print("="*50)
    print("🚀 ANALIZADOR FINANCIERO FINECT EN TIEMPO REAL 🚀")
    print("="*50)
    
    results = []
    
    # Iniciamos el motor de scraping de Playwright
    with sync_playwright() as p:
        # Headless mode True para que no te moleste la ventana
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
        )
        page = context.new_page()
        
        for item in portfolio_data:
            data = scrape_finect(item["ISIN"], page)
            item.update(data)
            results.append(item)
            
        browser.close()
        
    df = pd.DataFrame(results)
    print("\n--- COMPORTAMIENTOS ACTUALES (Extracción Directa Finect) ---")
    print(df[['Fondo', 'TIPO', 'NAV (Precio)', 'YTD (%)']].to_string(index=False))
    
    print("\n💡 NOTA DE MERCADO ACTUAL:")
    print("Recuerda que, según el cruce de datos y noticias actuales, los fondos tipo 'VALUE'")
    print("son los que cotizan más 'baratos' frente a métricas históricas, siendo los candidatos")
    print("ideales para inyectar ese 1-2% extra de liquidez en caídas del NAV.")

if __name__ == "__main__":
    main()

import sys
import os
import json
import time
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, os.path.abspath("."))
from app.services.core_portfolio import Portfolio
from app.services.data_providers import CompositeProvider

def run_prewarm():
    print("Iniciando pre-warming de la caché de la cartera...")
    
    # Cargar la cartera para obtener los ISINs
    try:
        portfolio = Portfolio('data/Ordenes.xlsx')
        positions_df = portfolio.get_positions()
        isins = positions_df['ISIN'].tolist()
        print(f"Cartera cargada. Encontrados {len(isins)} activos únicos: {isins}")
    except Exception as e:
        print(f"Error al cargar la cartera: {e}")
        return

    provider = CompositeProvider()
    portfolio_data = {}
    
    t0_total = time.time()
    
    for isin in isins:
        print(f"\\nRecopilando datos para: {isin}...")
        t0 = time.time()
        
        # Obtener toda la información a la vez
        nav = provider.get_nav(isin)
        info = provider.get_fund_info(isin)
        sectors = provider.get_sector_weights(isin)
        asset_alloc = provider.get_asset_allocation(isin)
        # Holdings is a dataframe, we need to convert it
        holdings_df = provider.get_holdings(isin)
        holdings = holdings_df.to_dict(orient="records") if not holdings_df.empty else []
        
        portfolio_data[isin] = {
            "nav": nav,
            "info": info,
            "sectors": sectors,
            "asset_allocation": asset_alloc,
            "holdings": holdings,
            "last_updated": time.time()
        }
        
        t_elapsed = time.time() - t0
        print(f"Datos obtenidos para {isin} en {t_elapsed:.2f}s")

    # Guardar en JSON
    cache_file = "data/portfolio_cache.json"
    os.makedirs("data", exist_ok=True)
    with open(cache_file, "w", encoding="utf-8") as f:
        json.dump(portfolio_data, f, indent=4, ensure_ascii=False)
        
    t_total_elapsed = time.time() - t0_total
    print(f"\\nPre-warming completado en {t_total_elapsed:.2f}s. Datos guardados en {cache_file}.")

if __name__ == "__main__":
    run_prewarm()

import sys
import os
import yfinance as yf
from datetime import datetime, timedelta

# Add backend to path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(backend_dir)

from app.services.core_portfolio import Portfolio
import mstarpy as ms

def get_nav_light(isin: str) -> dict:
    """Modo ligero: solo devuelve el NAV más reciente."""
    # 1. Intentar con mstarpy de forma rápida (solo NAV de los últimos 7 días)
    try:
        fund = ms.Funds(isin)
        end_date = datetime.now()
        start_date = end_date - timedelta(days=10)
        nav_history = fund.nav(start_date=start_date, end_date=end_date)
        
        if nav_history and len(nav_history) > 0:
            # El último elemento suele ser el más reciente
            latest = nav_history[-1]
            return {
                'isin': isin,
                'name': fund.name,
                'nav': float(latest.get('nav', 0.0) or latest.get('totalReturn', 0.0)),
                'date': latest.get('date'),
                'source': 'mstarpy'
            }
    except Exception as e:
        print(f"[{isin}] Error mstarpy: {e}")

    # 2. Si falla o es ETF, intentar con yfinance
    try:
        ticker = yf.Ticker(isin)
        hist = ticker.history(period="5d")
        if not hist.empty:
            latest_nav = hist['Close'].iloc[-1]
            return {
                'isin': isin,
                'name': ticker.info.get('shortName', isin),
                'nav': float(latest_nav),
                'date': str(hist.index[-1].date()),
                'source': 'yfinance'
            }
    except Exception as e:
        print(f"[{isin}] Error yfinance: {e}")
        
    return {'isin': isin, 'name': 'Unknown', 'nav': 0.0, 'date': None, 'source': 'none'}

if __name__ == "__main__":
    print("Iniciando prueba...")
    
    # ISINs de prueba (algunos de los tuyos)
    test_isins = [
        "IE00BYX5MX67", # SP500
        "IE00BD0NCM55", # MSCI1
        "LU0302296495", # DNB Tech
        "ES0146309002"  # Horos
    ]
    
    print("--- TEST MODO LIGERO ---")
    import time
    
    for isin in test_isins:
        start_t = time.time()
        res = get_nav_light(isin)
        end_t = time.time()
        print(f"[{res['source']}] {res['name']} ({res['isin']}): {res['nav']}€ - ({(end_t - start_t):.2f}s)")
        
    print("\n--- TEST CORE PORTFOLIO ---")
    data_file = os.path.join(backend_dir, "data", "Ordenes.xlsx")
    if os.path.exists(data_file):
        port = Portfolio(data_file)
        open_lots = port.get_open_lots()
        positions = port.get_positions()
        
        print(f"Total posiciones: {len(positions)}")
        for isin, units in positions.items():
            print(f"  {isin}: {units:.4f} participaciones")
            
        print(f"Total lotes abiertos: {len(open_lots)}")
    else:
        print(f"No se encontró Ordenes.xlsx en {data_file}")

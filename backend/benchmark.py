import sys
import os
import time
import pandas as pd

sys.path.insert(0, os.path.abspath("."))
from app.services.data_providers import YFinanceProvider, FMPProvider, MStarProvider
from app.services.finect_provider import FinectProvider

def run_benchmark():
    providers = {
        "YFinance": YFinanceProvider(),
        "FMP": FMPProvider(),
        "MStar": MStarProvider(cache_path="../data/cache"),
        "Finect": FinectProvider()
    }
    
    isins = [
        "IE00BYX5NX33", # Vanguard FTSE All-World
        "ES0146309002", # Horos Value
        "ES0112723004"  # Baelo Patrimonio
    ]
    
    results = []
    
    for name, p in providers.items():
        for isin in isins:
            # Benchmark NAV
            t0 = time.time()
            try:
                nav = p.get_nav(isin)
                nav_time = time.time() - t0
            except Exception:
                nav = None
                nav_time = time.time() - t0
                
            # Benchmark Info
            t0 = time.time()
            try:
                info = p.get_fund_info(isin)
                info_time = time.time() - t0
            except Exception:
                info = {}
                info_time = time.time() - t0
                
            results.append({
                "Provider": name,
                "ISIN": isin,
                "NAV_Success": nav is not None,
                "NAV_Time_ms": round(nav_time * 1000, 2),
                "Info_Success": bool(info),
                "Info_Time_ms": round(info_time * 1000, 2)
            })
            
    df = pd.DataFrame(results)
    print("=== RESULTADOS DEL BENCHMARK ===")
    print(df.to_string())
    
    print("\n=== TIEMPOS MEDIOS POR PROVEEDOR (ms) ===")
    mean_times = df.groupby("Provider")[["NAV_Time_ms", "Info_Time_ms"]].mean()
    print(mean_times.to_string())

if __name__ == "__main__":
    run_benchmark()

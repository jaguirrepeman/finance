import yfinance as yf
import requests

def get_yfinance_advanced(isin: str):
    # 1. Resolve ISIN
    search_url = f"https://query2.finance.yahoo.com/v1/finance/search?q={isin}"
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        r = requests.get(search_url, headers=headers)
        data = r.json()
        quotes = data.get("quotes", [])
        if not quotes:
            print(f"No symbol found for {isin}")
            return None
            
        # Priority logic for exchanges
        priority_suffixes = ['.DE', '.AS', '.MI', '.PA', '.L', '.F', '']
        best_symbol = None
        best_priority = 999
        
        for q in quotes:
            sym = q.get("symbol", "")
            for i, suffix in enumerate(priority_suffixes):
                if sym.endswith(suffix):
                    if i < best_priority:
                        best_priority = i
                        best_symbol = sym
                    break
        
        symbol = best_symbol if best_symbol else quotes[0]["symbol"]
    except Exception as e:
        print(f"Error resolving {isin}: {e}")
        return None

    print(f"Resolved {isin} -> {symbol}")
    t = yf.Ticker(symbol)
    
    info = t.info or {}
    fd = getattr(t, "funds_data", None)
    
    comisiones = info.get("annualReportExpenseRatio") or info.get("expenseRatio")
    capitalizacion = info.get("totalAssets") or info.get("marketCap")
    
    sectores = {}
    asset_allocation = {}
    holdings = {}
    
    if fd:
        try: sectores = fd.sector_weightings
        except: pass
        try: asset_allocation = fd.asset_classes
        except: pass
        try:
            h = fd.top_holdings
            if not h.empty: holdings = h.to_dict(orient='index')
        except: pass
        
    return {
        "symbol": symbol,
        "name": info.get("longName"),
        "comisiones": comisiones,
        "capitalizacion": capitalizacion,
        "sectores": sectores,
        "asset_allocation": asset_allocation,
        "holdings_count": len(holdings)
    }

print("ETF:")
print(get_yfinance_advanced("IE00BYX5NX33"))

print("\nMUTUAL FUND:")
print(get_yfinance_advanced("ES0146309002"))

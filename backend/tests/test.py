import sys
import os

# add backend path
sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

from backend.app.services.portfolio import get_portfolio_data
from backend.app.api.endpoints import _get_mapped_data
from backend.app.services.functions_portfolio import Portfolio
import pandas as pd
import math

data = get_portfolio_data()
mapped_data = _get_mapped_data(data)

df = pd.DataFrame(mapped_data)
port = Portfolio(df, use_cache=True)
analysis = port.analyze_portfolio(years=3)

alloc = analysis.get('composition', {}).get('asset_allocation', {})

def safe_float(val):
    if pd.isna(val) or val is None: return 0.0
    return float(val)

summary = {
    "total_rv": safe_float(alloc.get('Renta Variable', 0)) * 100.0,
    "total_rf": safe_float(alloc.get('Renta Fija', 0)) * 100.0,
    "total_cash": safe_float(alloc.get('Liquidez', 0)) * 100.0,
    "total_alt": safe_float(alloc.get('Otros', 0)) * 100.0,
    "details": {str(k): safe_float(v)*100.0 for k, v in alloc.items() if safe_float(v) > 0}
}
print(summary)

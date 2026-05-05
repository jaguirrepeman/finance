import sys
import os
import pandas as pd

sys.path.insert(0, os.path.abspath("."))

from app.services.data_providers import YFinanceProvider

yf_provider = YFinanceProvider()

print("Prueba de Vanguard ETF (IE00BYX5NX33)")
print("Sectores:", yf_provider.get_sector_weights("IE00BYX5NX33"))
print("Asset Allocation:", yf_provider.get_asset_allocation("IE00BYX5NX33"))
print("Info:", yf_provider.get_fund_info("IE00BYX5NX33"))
print("Holdings:")
print(yf_provider.get_holdings("IE00BYX5NX33").head(5))

print("\n-------------------------------\n")
print("Prueba de Horos Value (ES0146309002)")
print("Sectores:", yf_provider.get_sector_weights("ES0146309002"))
print("Asset Allocation:", yf_provider.get_asset_allocation("ES0146309002"))
print("Info:", yf_provider.get_fund_info("ES0146309002"))
print("Holdings:")
print(yf_provider.get_holdings("ES0146309002").head(5))


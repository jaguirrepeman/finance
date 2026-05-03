#!/usr/bin/env python3
"""Test script para FTProvider — ejecutar con: poetry run python test_ft_provider.py"""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.services.ft_provider import FTProvider

ft = FTProvider()

test_isins = [
    ("ES0146309002", "Horos Value Internacional FI"),
    ("IE00BYX5MX67", "Fidelity S&P 500 Index"),
    ("LU0302296495", "DNB Fund - Technology"),
    ("IE00BD0NCM55", "iShares Dev World"),
    ("LU0329355670", "Nordea 1 European High Yield"),
]

for isin, name in test_isins:
    t0 = time.time()
    print(f"\n=== {name} ({isin}) ===")
    symbol = ft._get_ft_symbol(isin)
    print(f"  Symbol: {symbol}")

    sectors = ft.get_sector_weights(isin)
    print(f"  Sectores ({len(sectors)}): {dict(list(sectors.items())[:3])}")

    alloc = ft.get_asset_allocation(isin)
    print(f"  Asset alloc ({len(alloc)}): {dict(list(alloc.items())[:3])}")

    countries = ft.get_country_weights(isin)
    print(f"  Regiones ({len(countries)}): {dict(list(countries.items())[:3])}")

    holdings = ft.get_holdings(isin)
    print(f"  Holdings ({len(holdings)} rows):")
    for _, row in holdings.head(3).iterrows():
        print(f"    - {row.get('name','?')} | {row.get('ticker','?')} | {row.get('weight',0):.2f}%")
    
    info = ft.get_fund_info(isin)
    print(f"  Info: {info}")
    print(f"  Tiempo: {time.time()-t0:.2f}s")

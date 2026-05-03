import nbformat as nbf
import os

nb = nbf.v4.new_notebook()

text1 = """\
# Análisis de Fondos con YFinanceProvider
Este notebook ha sido actualizado para usar la nueva arquitectura de datos.
El proveedor principal ahora es `YFinanceProvider`, que usa la API de búsqueda de Yahoo Finance para resolver ISINs y extrae la información de `funds_data` de forma ultrarrápida y sin errores de scraping (403).

Se extrae fundamentalmente: **comisiones, sectores, capitalización, y asset allocation**.
"""

code1 = """\
import sys
import os
import pandas as pd
from IPython.display import display

# Configuración del path para importar la app
if os.path.exists("../app"):
    sys.path.insert(0, os.path.abspath(".."))
else:
    sys.path.insert(0, os.path.abspath("./backend"))

from app.services.data_providers import CompositeProvider, YFinanceProvider

# Configuración de los fondos a analizar
isin_etf = "IE00BYX5NX33" # Vanguard FTSE All-World UCITS ETF
isin_fondo = "ES0146309002" # Horos Value Internacional FI

provider = CompositeProvider()

print("✅ Proveedores configurados correctamente")
"""

text2 = """\
## 1. Análisis de un Fondo de Inversión (Mutual Fund)
A continuación comprobamos los datos del fondo Horos Value Internacional FI.
"""

code2 = """\
print(f"🔍 Analizando Fondo: {isin_fondo}\\n")

nav = provider.get_nav(isin_fondo)
print(f"NAV Actual: {nav}\\n")

info = provider.get_fund_info(isin_fondo)
print("--- Info General (incluye Comisiones y Capitalización) ---")
display(pd.DataFrame(list(info.items()), columns=["Campo", "Valor"]))

sectores = provider.get_sector_weights(isin_fondo)
print("\\n--- Sectores ---")
if sectores:
    display(pd.DataFrame(list(sectores.items()), columns=["Sector", "Peso (%)"]))
else:
    print("(sin datos)")

asset_allocation = provider.get_asset_allocation(isin_fondo)
print("\\n--- Asset Allocation ---")
if asset_allocation:
    display(pd.DataFrame(list(asset_allocation.items()), columns=["Tipo de Activo", "Peso (%)"]))
else:
    print("(sin datos)")

holdings = provider.get_holdings(isin_fondo)
print(f"\\n--- Top Holdings ({len(holdings)} posiciones) ---")
display(holdings.head(10))
"""

text3 = """\
## 2. Análisis de un ETF
A continuación comprobamos los datos del ETF Vanguard FTSE All-World.
"""

code3 = """\
print(f"🔍 Analizando ETF: {isin_etf}\\n")

nav = provider.get_nav(isin_etf)
print(f"NAV Actual: {nav}\\n")

info = provider.get_fund_info(isin_etf)
print("--- Info General ---")
display(pd.DataFrame(list(info.items()), columns=["Campo", "Valor"]))

sectores = provider.get_sector_weights(isin_etf)
print("\\n--- Sectores ---")
if sectores:
    display(pd.DataFrame(list(sectores.items()), columns=["Sector", "Peso (%)"]))
else:
    print("(sin datos)")

asset_allocation = provider.get_asset_allocation(isin_etf)
print("\\n--- Asset Allocation ---")
if asset_allocation:
    display(pd.DataFrame(list(asset_allocation.items()), columns=["Tipo de Activo", "Peso (%)"]))
else:
    print("(sin datos)")

holdings = provider.get_holdings(isin_etf)
print(f"\\n--- Top Holdings ({len(holdings)} posiciones) ---")
display(holdings.head(10))
"""

nb['cells'] = [
    nbf.v4.new_markdown_cell(text1),
    nbf.v4.new_code_cell(code1),
    nbf.v4.new_markdown_cell(text2),
    nbf.v4.new_code_cell(code2),
    nbf.v4.new_markdown_cell(text3),
    nbf.v4.new_code_cell(code3)
]

notebook_path = r"d:\JESUS\PROYECTOS_PYTHON\portfolio_tracker\backend\notebooks\analisis_fondo_detallado.ipynb"
with open(notebook_path, 'w', encoding='utf-8') as f:
    nbf.write(nb, f)

print(f"Notebook actualizado: {notebook_path}")

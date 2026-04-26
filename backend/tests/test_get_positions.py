import sys, os
import pandas as pd

if os.path.exists('backend/app'):
    sys.path.append(os.path.abspath('backend'))
    path = 'backend/data/Ordenes.xlsx'
else:
    sys.path.append(os.path.abspath('..'))
    path = '../data/Ordenes.xlsx'

from app.services.core_portfolio import Portfolio

print("Inicializando...")
portfolio = Portfolio(path)
print("Llamando a get_positions()...")
df = portfolio.get_positions()
print(df)

import pandas as pd
from typing import Dict, Tuple

import os
import json

DATA_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "portfolio.json")

# Seed por defecto si el fichero no existe
DEFAULT_PORTFOLIO = [
    {"Fondo": "SP500 IE00BYX5MX67", "TIPO": "INDEX", "Porcentaje": 15.93, "ISIN": "IE00BYX5MX67"},
    {"Fondo": "MSCI1 IE00BD0NCM55", "TIPO": "INDEX", "Porcentaje": 9.44, "ISIN": "IE00BD0NCM55"},
    {"Fondo": "MSCI2 IE00BYX5NX33", "TIPO": "INDEX", "Porcentaje": 9.12, "ISIN": "IE00BYX5NX33"},
    {"Fondo": "EUROSTOXX BBVA", "TIPO": "INDEX", "Porcentaje": 11.26, "ISIN": "ES0182527237"},
    {"Fondo": "Space LU2466448532", "TIPO": "SPECIALIZED", "Porcentaje": 2.25, "ISIN": "LU2466448532"},
    {"Fondo": "DNB Tech LU0302296495", "TIPO": "SPECIALIZED", "Porcentaje": 5.90, "ISIN": "LU0302296495"},
    {"Fondo": "Horos ES0146309002", "TIPO": "VALUE", "Porcentaje": 6.11, "ISIN": "ES0146309002"},
    {"Fondo": "Robeco LU0329355670", "TIPO": "VALUE", "Porcentaje": 2.74, "ISIN": "LU0329355670"},
    {"Fondo": "Cobas Int LU1598719752", "TIPO": "VALUE", "Porcentaje": 2.74, "ISIN": "LU1598719752"},
    {"Fondo": "Bitcoin", "TIPO": "CRYPTO", "Porcentaje": 3.22, "ISIN": None},
    {"Fondo": "DWS Oro LU0273159177", "TIPO": "ORO", "Porcentaje": 2.79, "ISIN": "LU0273159177"},
    {"Fondo": "RF (Varios)", "TIPO": "RF", "Porcentaje": 6.22, "ISIN": None},
    {"Fondo": "Sabadell", "TIPO": "CASH", "Porcentaje": 2.68, "ISIN": None},
]

def load_portfolio():
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    if not os.path.exists(DATA_FILE):
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(DEFAULT_PORTFOLIO, f, indent=4, ensure_ascii=False)
        return DEFAULT_PORTFOLIO
    
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_portfolio(data):
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

# Variable global para retrocompatibilidad, aunque ahora es un getter
def get_portfolio_data():
    return load_portfolio()

def analyze_portfolio_logic(data) -> Tuple[Dict, Dict]:
    df = pd.DataFrame(data)
    
    # Agrupar por TIPO
    summary_df = df.groupby("TIPO")["Porcentaje"].sum().reset_index()
    summary_df = summary_df.sort_values(by="Porcentaje", ascending=False)
    
    total_rv = summary_df[summary_df['TIPO'].isin(['INDEX', 'SPECIALIZED', 'VALUE'])]['Porcentaje'].sum()
    total_rf = summary_df[summary_df['TIPO'] == 'RF']['Porcentaje'].sum()
    total_cash = summary_df[summary_df['TIPO'] == 'CASH']['Porcentaje'].sum()
    total_alt = summary_df[summary_df['TIPO'].isin(['ORO', 'CRYPTO'])]['Porcentaje'].sum()

    details = {row["TIPO"]: row["Porcentaje"] for _, row in summary_df.iterrows()}

    summary = {
        "total_rv": float(total_rv),
        "total_rf": float(total_rf),
        "total_cash": float(total_cash),
        "total_alt": float(total_alt),
        "details": details
    }

    # Lógica de rebalanceo
    target_rf = 10.0
    max_cash = 10.0
    
    recommendation = {}
    
    if total_rf < target_rf:
        diff_rf = target_rf - total_rf
        recommendation["rf_sug"] = {
            "title": "💡 Sugerencia Principal (Riesgo Bajo)",
            "text": f"Tu Renta Fija ({total_rf:.2f}%) está por debajo del {target_rf}% ideal para equilibrio. Considera inyectar ese 1-2% en tus fondos de RF (Gamma Global, B&H, DNCA)."
        }
    else:
        recommendation["rf_sug"] = {
            "title": "💡 Sugerencia Principal (Crecimiento)",
            "text": "Reforzar el 'Core' Indexado (ej. MSCI World / S&P 500) para aprovechar el interés compuesto de forma pasiva."
        }

    if total_cash > max_cash:
        recommendation["cash_warn"] = {
            "title": "⚠️ Nivel de Liquidez Alto",
            "text": f"Tienes un nivel de liquidez de {total_cash:.2f}%. Derívalo a monetarios/TradeRepublic o fondos VALUE con descuento."
        }
        
    return summary, recommendation

# DEPRECATED
# Este archivo ha sido movido a la carpeta 'deprecated/' y ya no se mantiene activamente.
# Fue reemplazado por la nueva arquitectura basada en core_portfolio.py + functions_fund.py.
# Se conserva como referencia histórica. NO importar desde código activo.
# Deprecado el: 2026-04-26
# ============================================================================
import os
import glob
import math
import pandas as pd
from datetime import datetime
from .portfolio import get_portfolio_data, save_portfolio
from .functions_fund import get_morningstar_fund_data

ORDENES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")

def clean_float(v):
    if pd.isna(v): return 0.0
    if isinstance(v, (int, float)): return float(v)
    v = str(v).replace('€', '').replace(' ', '').strip()
    # Manejar formato europeo 1.200,50
    if '.' in v and ',' in v:
        if v.rfind(',') > v.rfind('.'):
            v = v.replace('.', '').replace(',', '.')
        else:
            v = v.replace(',', '')
    elif ',' in v:
        v = v.replace(',', '.')
    try:
        return float(v)
    except ValueError:
        return 0.0

def normalize_columns(df):
    col_map = {}
    for col in df.columns:
        c_low = str(col).lower().strip()
        if 'isin' in c_low: col_map[col] = 'ISIN'
        elif 'fecha' in c_low: col_map[col] = 'Fecha'
        elif 'importe' in c_low: col_map[col] = 'Importe'
        elif 'participaciones' in c_low or 'nº' in c_low or 'nÂº' in c_low: col_map[col] = 'Participaciones'
        elif 'estado' in c_low: col_map[col] = 'Estado'
        elif 'tipo' in c_low: col_map[col] = 'Tipo'
        elif 'fondo' in c_low or 'nombre' in c_low or 'activo' in c_low: col_map[col] = 'Fondo'
    return df.rename(columns=col_map)

def process_transaction_ledger():
    try:
        import openpyxl
    except ImportError:
        import subprocess
        print("Instalando openpyxl...")
        subprocess.call(["pip", "install", "openpyxl"])

    filepath = os.path.join(ORDENES_DIR, 'Ordenes.xlsx')
    if not os.path.exists(filepath):
        return False

    print(f"🔄 Procesando Libro Mayor (Ledger) de Órdenes: {filepath}")
    df = pd.read_excel(filepath)
    df = normalize_columns(df)

    if 'Estado' in df.columns:
        valid_states = ['ejecutada', 'completada', 'procesada', 'finalizada', 'ok']
        df = df[df['Estado'].astype(str).str.lower().str.strip().isin(valid_states)]

    if 'ISIN' not in df.columns or 'Participaciones' not in df.columns:
        print("⚠️ El excel no tiene las columnas ISIN o Participaciones requeridas.")
        return False

    df['Participaciones'] = df['Participaciones'].apply(clean_float)
    
    # Algunas exportaciones ponen las ventas en positivo pero con un Tipo="Venta"
    if 'Tipo' in df.columns:
        ventas = df['Tipo'].astype(str).str.lower().str.contains('reembolso|venta', na=False)
        df.loc[ventas & (df['Participaciones'] > 0), 'Participaciones'] *= -1

    # Agrupar por ISIN para obtener el balance actual (Sum of units)
    balance = df.groupby('ISIN')['Participaciones'].sum().reset_index()
    # Eliminar fondos que ya hemos vendido al completo (o menos de 0.001 participaciones)
    balance = balance[balance['Participaciones'] >= 0.001]

    if balance.empty:
        print("⚠️ Tras procesar ventas/compras, no queda ninguna posición abierta en el excel.")
        return False

    # Para cada ISIN, obtener precio y calcular Efectivo actual (Valor Actualizado)
    old_data = get_portfolio_data()
    isin_dict = {f.get('ISIN'): f for f in old_data if f.get('ISIN')}

    new_portfolio = []
    total_efectivo = 0.0
    
    # Acumular primero el valor de todo en EUR
    for _, row in balance.iterrows():
        isin = str(row['ISIN']).strip()
        units = row['Participaciones']
        
        # Obtener NAV Actual
        ms_data = get_morningstar_fund_data(isin)
        nav = ms_data.get('precio_actual', 0.0)
        fund_name = ms_data.get('name', isin)
        
        if pd.isna(nav) or nav == 0:
            # Fallback a viejos datos
            old_f = isin_dict.get(isin, {})
            nav = old_f.get('NAV (Precio)', 0.0)
            if old_f.get('Fondo'): fund_name = old_f['Fondo']
            
        try: nav = float(nav)
        except: nav = 0.0
            
        efectivo = units * nav
        total_efectivo += efectivo
        
        # Mantener categoría anterior o asignar base
        tipo = isin_dict.get(isin, {}).get('TIPO', 'UNKNOWN')
        if tipo == 'UNKNOWN':
            if 'monetario' in fund_name.lower(): tipo = 'CASH'
            elif 'rf' in fund_name.lower() or 'renta' in fund_name.lower(): tipo = 'RF'
            else: tipo = 'INDEX'

        new_portfolio.append({
            "Fondo": fund_name,
            "TIPO": tipo,
            "ISIN": isin,
            "Efectivo_Calc": efectivo, # guardamos temporalmente para %.
            "Participaciones": units
        })

    # Calcular Porcentajes Finales
    final_portfolio = []
    for f in new_portfolio:
        pct = round((f['Efectivo_Calc'] / total_efectivo) * 100.0, 2) if total_efectivo > 0 else 0
        final_portfolio.append({
            "Fondo": f['Fondo'],
            "TIPO": f['TIPO'],
            "Porcentaje": pct,
            "ISIN": f['ISIN']
        })

    save_portfolio(final_portfolio)
    
    # Mover el archivo a un directorio de procesados
    processed_dir = os.path.join(ORDENES_DIR, 'imports_procesados')
    os.makedirs(processed_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    os.rename(filepath, os.path.join(processed_dir, f"Ordenes_procesado_{timestamp}.xlsx"))

    print(f"✅ Libro Mayor procesado con éxito. Posiciones recalculadas.")
    return True


# DEPRECATED
# Este archivo ha sido movido a la carpeta 'deprecated/' y ya no se mantiene activamente.
# Fue reemplazado por la nueva arquitectura basada en core_portfolio.py + functions_fund.py.
# Se conserva como referencia histórica. NO importar desde código activo.
# Deprecado el: 2026-04-26
# ============================================================================
import os
import glob
import pandas as pd
from datetime import datetime
from .portfolio import get_portfolio_data, save_portfolio

IMPORTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "imports")

def identify_file_type_and_read(filepath):
    if filepath.endswith('.csv'):
        # Intentar varias codificaciones y separadores típicos en España
        for sep in [';', ',']:
            for encoding in ['utf-8', 'latin1', 'iso-8859-1']:
                try:
                    df = pd.read_csv(filepath, sep=sep, encoding=encoding)
                    if len(df.columns) > 2: return df
                except Exception:
                    continue
    elif filepath.endswith('.xlsx') or filepath.endswith('.xls'):
        try:
            return pd.read_excel(filepath)
        except Exception:
            pass
    return None

def normalize_column_names(df):
    # MyInvestor / Inversis suele tener nombres varibles, normalizamos
    col_map = {}
    for col in df.columns:
        c_low = str(col).lower().strip()
        if 'isin' in c_low:
            col_map[col] = 'ISIN'
        elif any(k in c_low for k in ['descripción', 'nombre', 'activo', 'producto', 'fondo']):
            col_map[col] = 'Fondo'
        elif any(k in c_low for k in ['efectivo', 'valoración', 'saldo', 'importe', 'valor actual', 'total']):
            col_map[col] = 'Valor'
            
    return df.rename(columns=col_map)

def process_myinvestor_imports():
    os.makedirs(IMPORTS_DIR, exist_ok=True)
    files = glob.glob(os.path.join(IMPORTS_DIR, '*'))
    if not files:
        return False
        
    # Coger el archivo más reciente
    latest_file = max(files, key=os.path.getctime)
    df = identify_file_type_and_read(latest_file)
    
    if df is None or df.empty:
        print(f"⚠️ No se pudo leer correctamente el archivo {latest_file}")
        return False
        
    df = normalize_column_names(df)
    
    required = ['Fondo', 'Valor']
    if not all(c in df.columns for c in required):
        print(f"⚠️ El archivo no contiene las columnas reconocibles. Columnas detectadas: {list(df.columns)}")
        return False
        
    # Limpiar strings de moneda en 'Valor' (ej: "1.200,50 €" -> 1200.50)
    def clean_valor(v):
        if pd.isna(v): return 0.0
        if isinstance(v, (int, float)): return float(v)
        v = str(v).replace('€', '').replace(' ', '').strip()
        # Manejar formato europeo 1.200,50
        if '.' in v and ',' in v:
            if v.rfind(',') > v.rfind('.'): # 1.200,50
                v = v.replace('.', '').replace(',', '.')
            else: # 1,200.50
                v = v.replace(',', '')
        elif ',' in v: # 1200,50
            v = v.replace(',', '.')
        try:
            return float(v)
        except ValueError:
            return 0.0

    df['Valor'] = df['Valor'].apply(clean_valor)
    total_efectivo = df['Valor'].sum()
    if total_efectivo <= 0:
        return False
        
    # Encontrar TIPO cruzando con la base de datos previa para retener clasificaciones
    old_data = get_portfolio_data()
    isin_dict = {f.get('ISIN'): f.get('TIPO', 'INDEX') for f in old_data if f.get('ISIN')}
    name_dict = {f.get('Fondo', '').lower(): f.get('TIPO', 'INDEX') for f in old_data}
    
    new_portfolio = []
    for _, row in df.iterrows():
        val = row.get('Valor', 0)
        if val <= 0: continue
            
        fondo_name = str(row['Fondo']).strip()
        isin = str(row['ISIN']).strip() if 'ISIN' in row.columns and not pd.isna(row['ISIN']) else None
        if isin == 'nan' or isin == 'None': isin = None
        
        # Determinar TIPO
        tipo = 'UNKNOWN'
        if isin and isin in isin_dict:
            tipo = isin_dict[isin]
        else:
            # Buscar por nombre
            for old_name, old_tipo in name_dict.items():
                if old_name in fondo_name.lower():
                    tipo = old_tipo
                    break
        
        if tipo == 'UNKNOWN':
            # Asignaciones por defecto groseras si es un fondo nuevo
            if 'monetario' in fondo_name.lower() or 'liquidez' in fondo_name.lower():
                tipo = 'CASH'
            elif 'rf' in fondo_name.lower() or 'renta fija' in fondo_name.lower():
                tipo = 'RF'
            else:
                tipo = 'INDEX'
                
        pct = round((val / total_efectivo) * 100.0, 2)
        
        new_portfolio.append({
            "Fondo": fondo_name,
            "TIPO": tipo,
            "Porcentaje": pct,
            "ISIN": isin
        })
        
    save_portfolio(new_portfolio)
    
    # Renombrar el archivo para marcarlo como procesado
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    processed_name = f"{latest_file}.processed_{timestamp}"
    os.rename(latest_file, processed_name)
    
    return True


# DEPRECATED
# Este archivo ha sido movido a la carpeta 'deprecated/' y ya no se mantiene activamente.
# Fue reemplazado por la nueva arquitectura basada en core_portfolio.py + functions_fund.py.
# Se conserva como referencia histórica. NO importar desde código activo.
# Deprecado el: 2026-04-26
# ============================================================================
import os
import json
import pandas as pd
from datetime import datetime
from .portfolio import get_portfolio_data
from .functions_portfolio import Portfolio
from .transaction_parser import process_transaction_ledger
from ..api.endpoints import _get_mapped_data, safe_float

CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "calculated")


def save_cache(filename, data):
    os.makedirs(CACHE_DIR, exist_ok=True)
    path = os.path.join(CACHE_DIR, filename)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)

def build_summary(alloc, data):
    summary = {
        "total_rv": safe_float(alloc.get('Renta Variable', 0)) * 100.0,
        "total_rf": safe_float(alloc.get('Renta Fija', 0)) * 100.0,
        "total_cash": safe_float(alloc.get('Liquidez', 0)) * 100.0,
        "total_alt": safe_float(alloc.get('Otros', 0)) * 100.0,
        "details": {str(k): safe_float(v)*100.0 for k,v in alloc.items() if safe_float(v) > 0}
    }
    recommendation = {
        "rf_sug": {"title": "Motor Algorítmico Activo", "text": f"Calculo procesado en asíncrono. Último run: {datetime.now().strftime('%H:%M:%S')}"}
    }
    return {"summary": summary, "funds": data, "recommendation": recommendation}

def build_details(mapped_data, port, data):
    results = {}
    for f in data:
        isin = f.get("ISIN")
        if not isin: isin = f"MANUAL-{f.get('Fondo', 'Desconocido')}"
        if not isin or isin not in port.funds: continue
        obj = port.funds[isin]
        
        sector_dict = {}
        region_dict = {}
        
        if obj.fund_data is not None and not obj.fund_data.empty and 'data' in obj.fund_data.columns:
            ms_val = obj.fund_data['data'].iloc[0]
            if isinstance(ms_val, pd.DataFrame) and not ms_val.empty:
                for k, v in ms_val.iloc[0].items():
                    key_str = str(k)
                    if key_str.startswith("perc_sector_") and not pd.isna(v):
                        sector_dict[key_str.replace("perc_sector_", "")] = safe_float(v)
                    elif key_str.startswith("perc_region_") and not pd.isna(v):
                        region_dict[key_str.replace("perc_region_", "")] = safe_float(v)

        results[f["Fondo"]] = {
            "sector": sector_dict, 
            "region": region_dict,
            "percentage": safe_float(f.get("Porcentaje", 0)),
            "tipo": f.get("TIPO", "UNKNOWN")
        }
    return results

def build_history_batch(mapped_data, port, data):
    results = {}
    for f in data:
        isin = f.get("ISIN")
        if not isin: isin = f"MANUAL-{f.get('Fondo', 'Desconocido')}"
        if not isin or isin not in port.funds: continue
        obj = port.funds[isin]
        fp = obj.fund_data
        if fp is not None and not fp.empty and 'historical_data' in fp.columns and len(fp['historical_data']) > 0:
            hist_df = fp['historical_data'].iloc[0]
            if hist_df is not None and not hist_df.empty:
                records = []
                for date_idx, row in hist_df.iterrows():
                    val = safe_float(row['Close'])
                    records.append({"date": str(date_idx)[:10], "price": val})
                results[f["Fondo"]] = records
    return results

def build_correlation(mapped_data, port, data):
    history_dfs = []
    labels = []
    for f in data:
        isin = f.get("ISIN")
        if not isin: isin = f"MANUAL-{f.get('Fondo', 'Desconocido')}"
        if not isin or isin not in port.funds: continue
        obj = port.funds[isin]
        fp = obj.fund_data
        if fp is not None and not fp.empty and 'historical_data' in fp.columns and len(fp['historical_data']) > 0:
            hist_df = fp['historical_data'].iloc[0]
            if hist_df is not None and not hist_df.empty:
                df = hist_df[['Close']].copy()
                df.columns = [f["Fondo"]]
                df.index = pd.to_datetime(df.index)
                history_dfs.append(df)
                labels.append(f["Fondo"])
                
    if not history_dfs:
        return {"labels": [], "matrix": {}}
        
    merged_df = pd.concat(history_dfs, axis=1).dropna()
    corr = merged_df.corr().round(2)
    corr_dict = corr.to_dict()
    fixed_matrix = {
        str(k1): {str(k2): safe_float(v2) for k2, v2 in v1.items()}
        for k1, v1 in corr_dict.items()
    }
    return {"labels": labels, "matrix": fixed_matrix}

def run_analytics_pipeline(force_download=False):
    print("Iniciando pipeline de background...")
    # 1. Absorber MyInvestor CSV/Excel si existe
    processed_new = process_myinvestor_imports()
    if processed_new:
        print("Nuevos datos de MyInvestor absorbidos en portfolio.json")
        
    data = get_portfolio_data()
    mapped_data = _get_mapped_data(data)
    if not mapped_data: return
    
    # 2. Correr el motor
    print("Calculando Data Science Engine...")
    df = pd.DataFrame(mapped_data)
    port = Portfolio(df, use_cache=not force_download)
    analysis = port.analyze_portfolio(years=3)
    alloc = analysis.get('composition', {}).get('asset_allocation', {})
    
    # 3. Enriquecer los datos básicos con el NAV si está disponible (como lo hacía /enrich)
    for f in data:
        isin = f.get("ISIN")
        if not isin: isin = f"MANUAL-{f.get('Fondo', 'Desconocido')}"
        if isin in port.funds:
            obj = port.funds[isin]
            nav = obj.fund_data.get('precio_actual', "N/A") if obj.fund_data is not None and not obj.fund_data.empty else "N/A"
            if isinstance(nav, pd.Series): nav = nav.iloc[0] if not nav.empty else "N/A"
            if not pd.isna(nav) and nav != "N/A":
                f["NAV (Precio)"] = safe_float(nav)
            else:
                f["NAV (Precio)"] = "N/A"
                
    # 4. Guardar Cachés finalizados para FastAPI O(1) lectura
    save_cache('summary.json', build_summary(alloc, data))
    save_cache('details.json', build_details(mapped_data, port, data))
    save_cache('history_batch.json', build_history_batch(mapped_data, port, data))
    save_cache('correlation.json', build_correlation(mapped_data, port, data))
    print("Todo calculado y guardado en disco de forma instantánea.")

if __name__ == '__main__':
    run_analytics_pipeline(force_download=True)


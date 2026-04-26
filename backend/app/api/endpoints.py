from fastapi import APIRouter, HTTPException, BackgroundTasks
import os
import json
from typing import List
from ..schemas.portfolio import AnalysisResponse, FundBase
from ..services.portfolio import get_portfolio_data, save_portfolio
from ..services.background_calculator import CACHE_DIR, run_analytics_pipeline

router = APIRouter()

def get_cache(filename, default=None):
    path = os.path.join(CACHE_DIR, filename)
    if not os.path.exists(path):
        return default
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

# Las funciones antiguas (_map_category, _get_mapped_data, safe_float) ya no son necesarias aquí, 
# han sido migradas al background_calculator, pero mantenemos safe_float por si acaso.
import math
import pandas as pd
def safe_float(val):
    if pd.isna(val) or val is None: return 0.0
    try:
        val_float = float(val)
        if math.isnan(val_float) or math.isinf(val_float):
            return 0.0
        return val_float
    except (ValueError, TypeError):
        return 0.0

def _map_category(tipo):
    t = str(tipo).upper()
    if t in ['INDEX', 'VALUE', 'SPECIALIZED']:
        return 'Renta Variable'
    elif t == 'RF':
        return 'Renta Fija'
    elif t == 'CASH':
        return 'Liquidez'
    return 'Otros'

def _get_mapped_data(data):
    mapped_data = []
    for f in data:
        isin = f.get("ISIN")
        if not isin:
            isin = f"MANUAL-{f.get('Fondo', 'Desconocido')}"
        mapped_data.append({
            "Nombre": f["Fondo"],
            "ISIN": isin,
            "Inversion": float(f.get("Porcentaje", 10)),
            "Fecha": "2020-01-01",
            "categoria": _map_category(f.get("TIPO", "INDEX"))
        })
    return mapped_data

@router.get("/summary", response_model=AnalysisResponse)
async def get_portfolio_summary():
    cached = get_cache('summary.json')
    if cached:
        return cached
        
    data = get_portfolio_data()
    return {"summary": {"total_rv":0.0, "total_rf":0.0, "total_cash":0.0, "total_alt":0.0, "details":{}}, "funds": data, "recommendation": {"rf_sug": {"title": "Sin Datos Cacheables", "text": "Pulsa en Recalcular Morningstar para generar el caché base."}}}

@router.get("/enrich", response_model=AnalysisResponse)
async def get_enriched_portfolio(background_tasks: BackgroundTasks):
    background_tasks.add_task(run_analytics_pipeline, force_download=True)
    
    # Devolveremos la ultima caché pero marcando que se está calculando
    cached = get_cache('summary.json')
    data = get_portfolio_data()
    if not cached:
        cached = {"summary": {"total_rv":0.0, "total_rf":0.0, "total_cash":0.0, "total_alt":0.0, "details":{}}, "funds": data, "recommendation": {}}
        
    cached["recommendation"] = {
        "rf_sug": {"title": "Cálculo en Proceso (Background)", "text": "El motor de datos web está ejecutándose en paralelo. Refresca la ventana en unos segundos."}
    }
    return cached

@router.get("/history_batch")
async def get_history_batch():
    return get_cache('history_batch.json', {})

@router.get("/details")
async def get_portfolio_details():
    return get_cache('details.json', {})

@router.get("/correlation")
async def get_portfolio_correlation():
    corr = get_cache('correlation.json', {"labels": [], "matrix": {}})
    if not corr.get("labels"):
        raise HTTPException(status_code=500, detail="Cannot compute correlation or cache empty")
    return corr

@router.post("/")
async def add_fund(fund: FundBase, background_tasks: BackgroundTasks):
    data = get_portfolio_data()
    fund_dict = fund.model_dump(by_alias=True, exclude_none=True)
    data.append(fund_dict)
    save_portfolio(data)
    
    # Recalcular caches automáticamente 
    background_tasks.add_task(run_analytics_pipeline, force_download=False)
    return {"message": "✅ Fondo añadido correctamente. Calculando en background..."}

@router.delete("/{isin_or_name}")
async def delete_fund(isin_or_name: str, background_tasks: BackgroundTasks):
    data = get_portfolio_data()
    new_data = [f for f in data if f.get("ISIN") != isin_or_name and f.get("Fondo") != isin_or_name]
    if len(data) == len(new_data):
        raise HTTPException(status_code=404, detail="Fondo no encontrado en tu base de datos.")
    save_portfolio(new_data)
    
    # Recalcular caches automáticamente 
    background_tasks.add_task(run_analytics_pipeline, force_download=False)
    return {"message": "🗑️ Fondo eliminado. Calculando en background..."}


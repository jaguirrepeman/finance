from fastapi import APIRouter, HTTPException
from typing import List
from ..schemas.portfolio import AnalysisResponse, PortfolioSummary, FundBase
from ..services.portfolio import analyze_portfolio_logic, get_portfolio_data, save_portfolio
from ..services.finect_analyzer import scrape_finect, sync_playwright
from ..services.morningstar_analyzer import analyze_morningstar
import concurrent.futures
import datetime
import time
import pandas as pd
import mstarpy

router = APIRouter()

@router.get("/summary", response_model=AnalysisResponse)
async def get_portfolio_summary():
    # Llama a la lógica separada del portfolio
    data = get_portfolio_data()
    summary, recommendation = analyze_portfolio_logic(data)
    
    # Envolvemos funds en la respuesta (usando los datos básicos para la vista rápida)
    return {
        "summary": summary,
        "funds": data,
        "recommendation": recommendation
    }

import time

@router.get("/enrich", response_model=AnalysisResponse)
async def get_enriched_portfolio():
    # Ejecutamos Morningstar de forma **SECUENCIAL** con pausas
    # Morningstar bloquea las peticiones (403) si se hacen muchas a la vez (ThreadPool).
    import copy
    data = get_portfolio_data()
    enriched_data = copy.deepcopy(data)
    
    print("📡 Refrescando datos en tiempo real (Protección anti-bot activada)...")
    for fund in enriched_data:
        if fund.get("ISIN"):
            data_ms = analyze_morningstar(fund["ISIN"])
            fund.update(data_ms)
            time.sleep(1) # Pausa obligatoria de 1 segundo entre fondos para evitar baneo
        
    summary, recommendation = analyze_portfolio_logic(enriched_data)
    
    return {
        "summary": summary,
        "funds": enriched_data,
        "recommendation": recommendation
    }

@router.get("/history/{isin}")
async def get_fund_history(isin: str):
    """Obtiene el histórico completo de NAVs para un ISIN dado."""
    try:
        fund = mstarpy.Funds(term=isin)
        start_d = datetime.date(2010, 1, 1) # Máximo histórico
        end_d = datetime.date.today()
        nav_data = fund.nav(start_date=start_d, end_date=end_d)
        
        if not nav_data:
            return []
            
        # Filtramos para enviar un payload ligero (1 dato por semana o reducir tamaño si es gigante)
        # Para ser fieles al historial completo, enviamos todo pero optimizado:
        return [{"date": str(x["date"])[:10], "price": float(x["nav"])} for x in nav_data]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/history_batch")
async def get_history_batch():
    """Obtiene el histórico completo de TODOS los fondos de la base de datos de una vez."""
    data = get_portfolio_data()
    funds = [f for f in data if f.get("ISIN")]
    results = {}
    start_d = datetime.date(2000, 1, 1) # Full available history
    end_d = datetime.date.today()
    
    for f in funds:
        try:
            fund = mstarpy.Funds(term=f["ISIN"])
            nav_data = fund.nav(start_date=start_d, end_date=end_d)
            if nav_data:
                results[f["Fondo"]] = [{"date": str(x["date"])[:10], "price": float(x["nav"])} for x in nav_data]
            time.sleep(0.5)
        except Exception:
            pass
    return results

@router.get("/details")
async def get_portfolio_details():
    """Descarga e integra sectores y geografías para TODOS los fondos listados en la BB.DD."""
    data = get_portfolio_data()
    funds = [f for f in data if f.get("ISIN")]
    results = {}
    
    for f in funds:
        try:
            fund = mstarpy.Funds(term=f["ISIN"])
            # La librería puede fallar si el fondo no reporta estas métricas
            sect = fund.sector() if hasattr(fund, "sector") else {}
            reg = fund.regional_exposure() if hasattr(fund, "regional_exposure") else {}
            
            # Empaquetamos en formato JSON estructurado y normalizado
            results[f["Fondo"]] = {
                "sector": sect,
                "region": reg,
                "percentage": f.get("Porcentaje", 0),
                "tipo": f.get("TIPO", "UNKNOWN")
            }
            time.sleep(0.5) # Anti-bot estricto
        except Exception:
            pass
    return results

@router.get("/correlation")
async def get_portfolio_correlation():
    """Descarga históricos de TODOS los fondos y calcula matriz de Pearson."""
    # Obtenemos TODOS los fondos con ISIN válido
    portfolio = get_portfolio_data()
    funds_to_analyze = [f for f in portfolio if f.get("ISIN")]
    
    history_dfs = []
    labels = []
    
    for f in funds_to_analyze:
        try:
            fund = mstarpy.Funds(term=f["ISIN"])
            data = fund.nav(start_date=datetime.date(2023, 1, 1), end_date=datetime.date.today())
            if data:
                dates = [x["date"] for x in data]
                navs = [float(x["nav"]) for x in data]
                df = pd.DataFrame({"date": dates, f["Fondo"]: navs}).set_index("date")
                history_dfs.append(df)
                labels.append(f["Fondo"])
                time.sleep(0.5) # Anti-bot estricto
        except Exception:
            print(f"Error fetching correlation history for {f['ISIN']}")
            
    if not history_dfs:
        raise HTTPException(status_code=500, detail="Cannot compute correlation due to upstream blocking")
        
    merged_df = pd.concat(history_dfs, axis=1).dropna()
    corr = merged_df.corr().round(2)
    
    return {
        "labels": labels,
        "matrix": corr.to_dict()
    }

@router.post("/")
async def add_fund(fund: FundBase):
    """Añade un nuevo fondo a la base de datos."""
    data = get_portfolio_data()
    # Pydantic a dict (respetando alias si los hay, pero FundBase usa alias solo en lectura opcional)
    fund_dict = fund.model_dump(by_alias=True, exclude_none=True)
    data.append(fund_dict)
    save_portfolio(data)
    return {"message": "✅ Fondo añadido correctamente"}

@router.delete("/{isin_or_name}")
async def delete_fund(isin_or_name: str):
    """Elimina un fondo de la base de datos local por ISIN o nombre exacto."""
    data = get_portfolio_data()
    new_data = [f for f in data if f.get("ISIN") != isin_or_name and f.get("Fondo") != isin_or_name]
    if len(data) == len(new_data):
        raise HTTPException(status_code=404, detail="Fondo no encontrado en tu base de datos.")
    save_portfolio(new_data)
    return {"message": "🗑️ Fondo eliminado de forma segura"}

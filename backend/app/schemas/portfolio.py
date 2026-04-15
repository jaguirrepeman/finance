from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class FundBase(BaseModel):
    Fondo: str
    TIPO: str
    Porcentaje: float
    ISIN: Optional[str] = None
    
    # Datos extendidos que rellenarán los analyzers
    NAV_Precio: Optional[str] = Field(None, alias="NAV (Precio)")
    YTD: Optional[str] = Field(None, alias="YTD (%)")
    Morningstar_Name: Optional[str] = Field(None, alias="Morningstar Name")
    Estrellas_MS: Optional[str] = Field(None, alias="Estrellas MS")
    Categoria: Optional[str] = Field(None, alias="Categoría")

    class Config:
        populate_by_name = True

class PortfolioSummary(BaseModel):
    total_rv: float
    total_rf: float
    total_cash: float
    total_alt: float
    details: Dict[str, float]
    
class AnalysisResponse(BaseModel):
    summary: PortfolioSummary
    funds: List[FundBase]
    recommendation: Dict[str, Dict[str, str]]

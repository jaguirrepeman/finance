from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


# ---------------------------------------------------------------------------
# Modelos existentes (compatibilidad con frontend actual)
# ---------------------------------------------------------------------------

class FundBase(BaseModel):
    Fondo: str
    TIPO: str
    Porcentaje: float
    ISIN: Optional[str] = None

    # Datos extendidos que rellenan los analyzers
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


# ---------------------------------------------------------------------------
# Nuevos modelos
# ---------------------------------------------------------------------------

class PositionItem(BaseModel):
    ISIN: str
    Fondo: str
    Participaciones: float
    Precio_Compra_Medio: float = 0.0
    Capital_Invertido: float = 0.0
    Precio_Actual: Optional[float] = None
    Valor_Actual: Optional[float] = None
    Ganancia_Euros: Optional[float] = None
    Ganancia_Pct: Optional[float] = None


class PositionsResponse(BaseModel):
    positions: List[PositionItem]
    total_invested: float
    total_value: float
    total_gain: float
    total_gain_pct: float


class OpenLotItem(BaseModel):
    ISIN: str
    Fondo: str
    Fecha_Compra: Optional[str] = None
    Participaciones_Iniciales: float = 0.0
    Participaciones_Restantes: float = 0.0
    Importe_Invertido: float = 0.0
    Precio_Compra_Unitario: float = 0.0


class TaxOptimizeRequest(BaseModel):
    target_amount: float = Field(..., gt=0, description="Cantidad a retirar en €")


class TaxPlanStep(BaseModel):
    ISIN: str
    Fondo: str
    Fecha_Compra: Optional[str] = None
    Participaciones_Vendidas: float
    Importe_Retirado: float
    Ganancia_Patrimonial: float


class TaxOptimizeResponse(BaseModel):
    target_amount: float
    withdrawn_amount: float
    total_capital_gain: float
    estimated_tax: float
    net_amount: float
    plan: List[TaxPlanStep]


class FundDetailResponse(BaseModel):
    isin: str
    name: str = ""
    expense_ratio: Optional[float] = None
    aum: Optional[float] = None
    inception_date: Optional[str] = None
    rating: Optional[Any] = None
    risk_score: Optional[Any] = None
    sectors: Dict[str, float] = {}
    countries: Dict[str, float] = {}
    holdings: List[Dict[str, Any]] = []
    source: str = ""

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
    IsIndex: Optional[bool] = None
    Valor_Actual: Optional[float] = None
    Capital_Invertido: Optional[float] = None
    Ganancia_Abs: Optional[float] = None
    Ganancia_Pct: Optional[float] = None
    finect_url: Optional[str] = None  # Full Finect URL with slug

    class Config:
        populate_by_name = True


class PortfolioSummary(BaseModel):
    total_rv: float
    total_rf: float
    total_cash: float
    total_alt: float
    total_indexed: Optional[float] = 0.0
    total_active: Optional[float] = 0.0
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
    finect_url: Optional[str] = None  # Full Finect URL with slug


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


class FundMetrics(BaseModel):
    """Métricas de riesgo/rendimiento de un fondo (fuente: Finect)."""
    sharpe_ratio: Optional[float] = None
    alpha: Optional[float] = None
    beta: Optional[float] = None
    standard_deviation: Optional[float] = None
    max_drawdown: Optional[float] = None
    tracking_error: Optional[float] = None
    information_ratio: Optional[float] = None
    r2: Optional[float] = None
    correlation: Optional[float] = None


class FundDetailResponse(BaseModel):
    isin: str
    name: str = ""
    expense_ratio: Optional[float] = None
    aum: Optional[float] = None
    inception_date: Optional[str] = None
    rating: Optional[Any] = None
    risk_score: Optional[Any] = None
    srri: Optional[int] = None
    category: Optional[str] = None
    management_company: Optional[str] = None
    metrics: Optional[FundMetrics] = None
    sectors: Dict[str, float] = {}
    countries: Dict[str, float] = {}
    asset_allocation: Dict[str, float] = {}
    market_cap: Dict[str, float] = {}
    holdings: List[Dict[str, Any]] = []
    source: str = ""
    finect_url: Optional[str] = None


class FundSearchResult(BaseModel):
    """Resultado de búsqueda de un fondo en Finect."""
    isin: str
    name: str = ""
    category: Optional[str] = None
    management_company: Optional[str] = None
    in_portfolio: bool = False
    url: Optional[str] = None  # Full Finect URL with slug


class TraspasoFundItem(BaseModel):
    """Análisis de un fondo respecto a la optimización por traspaso."""
    isin: str
    nombre: str = ""
    valor_actual: float = 0.0
    capital_invertido: float = 0.0
    plusvalia_latente: float = 0.0
    plusvalia_pct: float = 0.0
    impuesto_si_vendes: float = 0.0
    ahorro_traspaso: float = 0.0
    num_lotes: int = 0
    cualifica_traspaso: bool = True


class SimulationRequest(BaseModel):
    """Petición de simulación: añadir X€ a un fondo."""
    isin: str
    amount: float = Field(..., gt=0, description="Cantidad a añadir en €")


class SimulatedFundDetail(BaseModel):
    """Detalle de un fondo en la simulación."""
    isin: str
    name: str = ""
    current_weight: float = 0.0
    simulated_weight: float = 0.0
    amount: float = 0.0
    metrics: Optional[FundMetrics] = None


class SimulationResponse(BaseModel):
    """Resultado de la simulación de añadir dinero a un fondo."""
    added_isin: str
    added_name: str = ""
    added_amount: float
    current_total: float
    simulated_total: float
    current_portfolio_metrics: Dict[str, Optional[float]] = {}
    simulated_portfolio_metrics: Dict[str, Optional[float]] = {}
    funds: List[SimulatedFundDetail] = []
    # Historical series for chart [{date, price}] — base 100
    history_current: List[Dict[str, Any]] = []
    history_fund: List[Dict[str, Any]] = []
    history_simulated: List[Dict[str, Any]] = []
    # Period returns [{label, current, fund, simulated}] — % total or CAGR
    period_returns: List[Dict[str, Any]] = []

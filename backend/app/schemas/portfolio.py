from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


# ---------------------------------------------------------------------------
# Modelos existentes (compatibilidad con frontend actual)
# ---------------------------------------------------------------------------

class FundBase(BaseModel):
    Fondo: str
    TIPO: str
    Porcentaje: float = 0.0
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
    Participaciones: Optional[float] = None
    Fecha_Compra: Optional[str] = None
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
    real_evolution: Optional[Dict[str, Any]] = None
    built_at: Optional[str] = None  # ISO timestamp when this response was built


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
    es_etf: bool = False  # True si es ETF/ETP (no traspasable en España)


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
    ticker: Optional[str] = None  # Exchange ticker (e.g. NUKL, WNUC)


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
    is_etf: bool = False  # True si es ETF/ETP (no traspasable en España)


# ---------------------------------------------------------------------------
# Optimización de retirada via traspaso (greedy global FIFO)
# ---------------------------------------------------------------------------

class TraspasoOptimizeRequest(BaseModel):
    """Petición de optimización de retirada vía traspaso."""
    target_amount: float = Field(..., gt=0, description="Cantidad a retirar en €")


class TraspasoLotStep(BaseModel):
    """Detalle de un lote en el plan de traspaso o reembolso."""
    ISIN: str
    Fondo: str = ""
    Fecha_Compra: Optional[str] = None
    Participaciones: float = 0.0
    # Reembolso
    Importe: Optional[float] = None
    Ganancia_Patrimonial: Optional[float] = None
    # Traspaso
    Importe_Traspasado: Optional[float] = None
    Plusvalia_Diferida: Optional[float] = None
    Destination_ISIN: Optional[str] = None
    Destination_Fondo: Optional[str] = None
    Precio_Compra_Unitario: float = 0.0
    Nota: Optional[str] = None
    es_etf: bool = False  # True si es ETF/ETP (no traspasable en España)


class EscenarioFiscal(BaseModel):
    """Resultado fiscal de un escenario (directo u optimizado)."""
    ganancia_patrimonial: float = 0.0
    impuesto: float = 0.0
    withdrawn_amount: float = 0.0
    neto_recibido: float = 0.0
    detalle: List[TraspasoLotStep] = []


class DestinationFund(BaseModel):
    """Fondo destino para los traspasos."""
    isin: str
    nombre: str = ""
    tipo: str = "new_suggestion"   # "portfolio_index" | "new_suggestion"
    is_index: bool = True
    motivo: str = ""


class LossHarvestingCandidate(BaseModel):
    """Un lote candidato a tax-loss harvesting."""
    ISIN: str
    Fondo: str = ""
    es_etf: bool = False
    Fecha_Compra: Optional[str] = None
    lot_loss: float = 0.0
    lot_value: float = 0.0
    preceding_forced_gain: float = 0.0
    preceding_forced_value: float = 0.0
    preceding_transfer_value: float = 0.0
    net_harvest_gain: float = 0.0
    additional_cash: float = 0.0
    antiaplicacion_plazo: str = ""


class LossHarvestingSuggestion(BaseModel):
    """Sugerencia bidireccional de harvesting fiscal.

    direction:
      - ``harvest_losses``: vender lotes en pérdida para compensar ganancias del plan.
      - ``harvest_gains``: vender lotes con ganancia aprovechando pérdidas del plan →
        dinero extra sin coste fiscal.
      - ``none``: sin sugerencia (ganancia neta = 0).
    """
    direction: str = "none"
    candidates: List[LossHarvestingCandidate] = []
    base_net_gain: float = 0.0
    base_tax: float = 0.0
    total_harvestable_loss: float = 0.0
    net_gain_after_harvest: float = 0.0
    tax_after_harvest: float = 0.0
    tax_savings: float = 0.0
    additional_cash: float = 0.0


class TraspasoOptimizeResponse(BaseModel):
    """Respuesta completa de la optimización global de retirada vía traspaso."""
    target_amount: float
    total_portfolio_value: float = 0.0
    escenario_directo: EscenarioFiscal
    escenario_optimizado: EscenarioFiscal
    ahorro_fiscal: float = 0.0
    ahorro_fiscal_pct: float = 0.0
    plan_traspasos: List[TraspasoLotStep] = []
    plan_reembolso: List[TraspasoLotStep] = []
    importe_traspasado: float = 0.0
    plusvalia_diferida: float = 0.0
    fondos_afectados: List[str] = []
    destination_fund: Optional[DestinationFund] = None
    destination_alternatives: List[Dict[str, Any]] = []
    portfolio_after: List[Dict[str, Any]] = []
    non_traspasable_isins: List[str] = []  # ETFs/ETPs en cartera (no traspasables)
    loss_harvesting: Optional[LossHarvestingSuggestion] = None
    notas: str = ""


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


class RebalanceFundDetail(BaseModel):
    """Movimiento necesario en el rebalanceo para un fondo."""
    isin: str
    name: str = ""
    current_weight: float = 0.0
    target_weight: float = 0.0
    delta_eur: float = 0.0


class RebalanceRequest(BaseModel):
    """Petición de rebalanceo: pesos objetivo por ISIN (fracción, suma = 1)."""
    weights: Dict[str, float] = Field(..., description="ISIN → fracción objetivo (0-1)")


class RebalanceResponse(BaseModel):
    """Resultado del rebalanceo simulado."""
    total_value: float
    current_portfolio_metrics: Dict[str, Optional[float]] = {}
    simulated_portfolio_metrics: Dict[str, Optional[float]] = {}
    funds: List[RebalanceFundDetail] = []
    history_current: List[Dict[str, Any]] = []
    history_simulated: List[Dict[str, Any]] = []
    period_returns: List[Dict[str, Any]] = []

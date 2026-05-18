/* ─── TypeScript types mirroring backend schemas ─────────────────────────── */

/** Fund basic information (matches backend FundBase) */
export interface Fund {
  Fondo: string;
  TIPO: string;
  Porcentaje: number;
  ISIN?: string;
  "NAV (Precio)"?: string;
  "YTD (%)"?: string;
  "Morningstar Name"?: string;
  "Estrellas MS"?: string;
  Categoría?: string;
  IsIndex?: boolean;
  Valor_Actual?: number;
  Capital_Invertido?: number;
  Ganancia_Abs?: number;
  Ganancia_Pct?: number;
  finect_url?: string;
}

/** Portfolio summary breakdown */
export interface PortfolioSummary {
  total_rv: number;
  total_rf: number;
  total_cash: number;
  total_alt: number;
  total_indexed?: number;
  total_active?: number;
  details: Record<string, number>;
}

/** Main API response for /api/portfolio/summary */
export interface AnalysisResponse {
  summary: PortfolioSummary;
  funds: Fund[];
  recommendation: Record<string, Record<string, string>>;
  real_evolution?: RealEvolution;
  built_at?: string;
}

/** Real evolution data from /api/portfolio/real-evolution */
export interface RealEvolution {
  series: EvolutionPoint[];
  monthly: MonthlyData[];
  per_fund?: Record<string, PerFundPoint[]>;
  funds?: Record<string, Array<{ date: string; value: number }>>;
  invested_per_fund?: Record<string, Array<{ date: string; invested: number }>>;
  monthly_per_fund?: Record<
    string,
    Array<{
      date: string;
      value: number;
      invested: number;
      gain: number;
      gain_pct: number;
    }>
  >;
}

export interface EvolutionPoint {
  date: string;
  value: number;
  invested: number;
  gain?: number;
  gain_pct?: number;
}

export interface MonthlyData {
  month: string;
  date?: string;
  label?: string;
  value: number;
  invested: number;
  gain: number;
  gain_pct: number;
  contributions: number;
  mom?: number;
}

export interface PerFundPoint {
  date: string;
  value: number;
  invested?: number;
}

/** Position item from /api/portfolio/positions */
export interface PositionItem {
  ISIN: string;
  Fondo: string;
  Participaciones: number;
  Precio_Compra_Medio: number;
  Capital_Invertido: number;
  Precio_Actual?: number;
  Valor_Actual?: number;
  Ganancia_Euros?: number;
  Ganancia_Pct?: number;
  finect_url?: string;
}

/** Fund detail response from /api/portfolio/fund/{isin}/details */
export interface FundDetail {
  isin: string;
  name: string;
  expense_ratio?: number;
  aum?: number;
  inception_date?: string;
  rating?: unknown;
  risk_score?: unknown;
  srri?: number;
  category?: string;
  management_company?: string;
  metrics?: FundMetrics;
  sectors: Record<string, number>;
  countries: Record<string, number>;
  asset_allocation: Record<string, number>;
  market_cap: Record<string, number>;
  holdings: Array<Record<string, unknown>>;
  source: string;
  finect_url?: string;
}

/** Fund risk/return metrics */
export interface FundMetrics {
  sharpe_ratio?: number;
  alpha?: number;
  beta?: number;
  standard_deviation?: number;
  max_drawdown?: number;
  tracking_error?: number;
  information_ratio?: number;
  r2?: number;
  correlation?: number;
}

/** Fund search result */
export interface FundSearchResult {
  isin: string;
  name: string;
  category?: string;
  management_company?: string;
  in_portfolio: boolean;
  url?: string;
  ticker?: string;
}

/** Orders summary response */
export interface OrdersSummaryResponse {
  monthly: Record<string, number>;
  yearly: Record<string, number>;
}

/** Annual returns data */
export interface AnnualReturnsData {
  annual: Record<string, Record<string, number>>;
  monthly?: Record<string, Record<string, Record<string, number>>>;
}

/** History batch response */
export interface HistoryBatchResponse {
  series: Record<string, Array<{ date: string; price: number }>>;
  base_date?: string;
}

/** Correlation matrix */
export interface CorrelationData {
  matrix: Record<string, Record<string, number>>;
  names: Record<string, string>;
}

/** Last update info */
export interface LastUpdateInfo {
  last_update: string;
  last_date?: string;
  fund_updates: Record<string, string>;
}

/** Benchmark data (MSCI World) */
export interface BenchmarkData {
  sectors?: Record<string, number>;
  regions?: Record<string, number>;
}

/** Portfolio Holdings response */
export interface PortfolioHoldingsResponse {
  holdings: Array<{
    name: string;
    weight: number;
  }>;
  total_funds: number;
  funds_with_holdings: number;
  coverage_pct: number;
}

/** Details response — keyed by fund name */
export interface FundDetailsMap {
  [fundName: string]: {
    isin?: string;
    percentage: number;
    finect_url?: string;
    sector?: Record<string, number>;
    region?: Record<string, number>;
  };
}

/* ─── Simulator types ────────────────────────────────────────────────────── */

/** POST /api/portfolio/simulate response */
export interface SimulationResult {
  current_total: number;
  contribution: number;
  updated_total: number;
  history: Record<string, Array<{ date: string; price: number }>>;
  correlation?: {
    labels: string[];
    matrix: Record<string, Record<string, number | null>>;
  };
  metrics?: Record<string, FundMetrics>;
  weight_changes?: Array<{
    fund: string;
    before: number;
    after: number;
    diff: number;
  }>;
}

/** POST /api/portfolio/rebalance request */
export interface RebalanceRequest {
  transfers: Array<{
    from_isin: string;
    to_isin: string;
    amount: number;
  }>;
  standalone_adds?: Array<{
    isin: string;
    name: string;
    amount: number;
  }>;
}

/** POST /api/portfolio/rebalance response */
export interface RebalanceResult {
  history?: Record<string, Array<{ date: string; price: number }>>;
  positions_before?: Array<{
    fund: string;
    isin: string;
    balance: number;
    weight: number;
  }>;
  positions_after?: Array<{
    fund: string;
    isin: string;
    balance: number;
    weight: number;
  }>;
  metrics_comparison?: Record<
    string,
    { current: Record<string, number>; rebalanced: Record<string, number> }
  >;
}

/* ─── Withdrawals types ──────────────────────────────────────────────────── */

/** GET /api/portfolio/traspaso-analysis response */
export interface TraspasoAnalysis {
  funds: Array<{
    fund: string;
    isin: string;
    current_value: number;
    latent_gain: number;
    tax_if_sold: number;
    transfer_savings: number;
    qualification: string;
    is_etf: boolean;
  }>;
  total_deferrable_gain: number;
  total_tax_savings: number;
}

/** POST /api/portfolio/traspaso-optimize response */
export interface TraspasoOptimizeResult {
  target_amount: number;
  total_portfolio_value: number;
  /** Escenario fiscal vendiedo directamente FIFO */
  escenario_directo: {
    ganancia_patrimonial: number;
    impuesto: number;
    withdrawn_amount?: number;
    neto_recibido: number;
    detalle: Array<Record<string, unknown>>;
  };
  /** Escenario fiscal optimizado mediante traspasos */
  escenario_optimizado: {
    ganancia_patrimonial: number;
    impuesto: number;
    withdrawn_amount?: number;
    neto_recibido: number;
    detalle: Array<Record<string, unknown>>;
  };
  ahorro_fiscal: number;
  ahorro_fiscal_pct: number;
  plan_traspasos: Array<Record<string, unknown>>;
  plan_reembolso: Array<Record<string, unknown>>;
  importe_traspasado: number;
  plusvalia_diferida: number;
  fondos_afectados: string[];
  destination_fund?: { isin: string; nombre: string; tipo: string; motivo: string } | null;
  non_traspasable_isins?: string[];  // ETFs/ETPs en cartera (no traspasables)
  /** Tax-loss / gain harvesting suggestions */
  loss_harvesting?: {
    /** "harvest_losses" = sell loss lots to offset plan gains;
     *  "harvest_gains" = sell gain lots covered by plan losses → tax-free cash;
     *  "none" = nothing to suggest */
    direction: "harvest_losses" | "harvest_gains" | "none";
    candidates: Array<{
      ISIN: string;
      Fondo: string;
      es_etf: boolean;
      Fecha_Compra?: string | null;
      lot_loss: number;
      lot_value: number;
      preceding_forced_gain: number;
      preceding_forced_value: number;
      preceding_transfer_value: number;
      net_harvest_gain: number;
      additional_cash: number;
      antiaplicacion_plazo: string;
    }>;
    base_net_gain: number;
    base_tax: number;
    total_harvestable_loss: number;
    net_gain_after_harvest: number;
    tax_after_harvest: number;
    tax_savings: number;
    additional_cash: number;
  } | null;
  notas?: string;
  // Legacy aliases (keep for backward compat)
  withdrawal_amount?: number;
  direct_fifo?: { total_gain: number; tax: number; net: number };
  optimized?: { total_gain: number; tax: number; net: number; savings: number };
}

/** POST /api/portfolio/tax-optimize response */
export interface TaxOptimizeResult {
  withdraw_amount: number;
  total_gain: number;
  estimated_tax: number;
  net_after_tax: number;
  optimal_plan: Array<{
    fund: string;
    isin?: string;
    purchase_date: string;
    shares: number;
    amount: number;
    gain: number;
    is_etf?: boolean;
  }>;
  tax_brackets?: Array<{
    bracket: string;
    rate: number;
    amount: number;
    tax: number;
  }>;
}

/* ─── Opportunities types ────────────────────────────────────────────────── */

/** GET /api/portfolio/timing-presets response */
export interface TimingPresetsResponse {
  presets: Record<
    string,
    { label: string; description: string; weights: Record<string, number> }
  >;
  default_weights: Record<string, number>;
}

/** Opportunity entry from GET /api/portfolio/opportunities */
export interface OpportunityEntry {
  isin: string;
  name: string;
  valor_actual?: number;
  ganancia_pct?: number;
  fund_type?: string;
  timing_score: number;
  trend_score: number;
  pullback_score: number;
  divergence_score: number;
  rsi_score: number;
  vol_regime_score: number;
  short_term_score: number;
  weights_used?: Record<string, number>;
  z_trend?: number;
  trend_deviation_pct?: number;
  pullback_3m_pct?: number;
  momentum_1m?: number;
  momentum_3m?: number;
  momentum_6m?: number;
  momentum_3d?: number;
  momentum_1w?: number;
  momentum_2w?: number;
  pullback_1w_pct?: number;
  pullback_2w_pct?: number;
  rsi_14?: number;
  vol_regime_ratio?: number;
  current_price?: number;
  ath?: number;
  drawdown_ath_pct?: number;
  sma200?: number;
  sma200_dist_pct?: number;
  sharpe?: number;
  sortino?: number;
  cagr_pct?: number;
  ret_1y?: number;
  ret_3y?: number;
  ret_5y?: number;
  rating?: number;
  ter_pct?: number;
  volatility_pct?: number;
  max_drawdown_pct?: number;
  consistency?: number;
  calmar?: number;
  level: string;
  description: string;
}

/** Chart data for a single opportunity fund */
export interface OpportunityChartData {
  isin: string;
  name: string;
  fund_type?: string;
  chart: {
    price_series: Array<{ date: string; price: number }>;
    regression?: Array<{ date: string; value: number }>;
    band_1_upper?: Array<{ date: string; value: number }>;
    band_1_lower?: Array<{ date: string; value: number }>;
    band_2_upper?: Array<{ date: string; value: number }>;
    band_2_lower?: Array<{ date: string; value: number }>;
    sma200?: Array<{ date: string; value: number }>;
    pullback_levels?: Record<string, number>;
    rsi_series?: Array<{ date: string; value: number }>;
    crossovers?: Array<{ date: string; type: string }>;
    chart_start?: string;
    chart_end?: string;
    std_residual?: number;
  };
  signals?: Record<string, unknown>;
  level?: string;
  description?: string;
}

/** Fund enrichment result */
export interface EnrichedFund {
  isin: string;
  name: string;
  category?: string;
  expense_ratio?: number;
  aum?: number;
  rating?: number;
  srri?: number;
  management_company?: string;
  fund_type?: string;
  returns?: Record<string, number>;
  metrics?: Record<string, number | null>;
  signals?: Record<string, unknown>;
  level?: string;
  description?: string;
  timing_score?: number;
  ret_1y?: number;
  ret_3y?: number;
  ret_5y?: number;
  sharpe?: number;
  ter?: number;
  volatility?: number;
  max_drawdown?: number;
  z_trend?: number;
  pullback?: number;
  momentum?: number;
}

/** POST /api/portfolio/compare-funds response */
export interface FundComparisonResult {
  funds: Array<{
    isin: string;
    name: string;
    category?: string;
    expense_ratio?: number;
    aum?: number;
    rating?: number;
    srri?: number;
    management_company?: string;
    returns?: Record<string, number>;
    metrics?: Record<string, number | null>;
    signals?: Record<string, unknown>;
    level?: string;
  }>;
  chart_data: Record<string, Array<{ date: string; price: number }>>;
}

/* ─── Portfolios types ───────────────────────────────────────────────────── */

/** Saved portfolio */
export interface SavedPortfolio {
  id: string;
  name: string;
  description?: string;
  color?: string;
  fund_count?: number;
  total_value?: number;
  funds: Array<{
    isin: string;
    name: string;
    weight: number;
  }>;
  created_at?: string;
  updated_at?: string;
}

/** Favorite fund */
export interface FavoriteFund {
  isin: string;
  name: string;
  category?: string;
  added_at?: string;
  url?: string;
}

/** POST /api/portfolio/portfolios/compare response */
export interface PortfolioComparisonResult {
  history: Record<string, Array<{ date: string; price: number }>>;
  metrics: Record<
    string,
    {
      total_return: number;
      ann_return: number;
      volatility: number;
      sharpe: number;
      max_drawdown: number;
    }
  >;
  weight_comparison?: Array<{
    fund: string;
    weight_a: number;
    weight_b: number;
  }>;
  availability?: Record<
    string,
    {
      data_start: string | null;
      fund_starts: Array<{ isin: string; name: string; first_date: string }>;
    }
  >;
}

/** Manually added position (not from CSV) */
export interface ManualPosition {
  id: number;
  isin: string;
  name: string;
  tipo: string;
  capital_invertido: number;
  valor_actual?: number | null;
  participaciones?: number | null;
  fecha_compra?: string | null;
  added_at?: string;
  updated_at?: string;
}

/** Transaction sign override (corrects CSV export omissions) */
export interface TransactionOverride {
  id: number;
  isin: string;
  fecha: string; // YYYY-MM-DD
  participaciones: number;
  notes?: string;
  created_at?: string;
  /** Enriched fields returned by the API */
  fondo?: string;                       // Resolved fund name
  actual_participaciones?: number | null; // Real value from movements (post override)
  importe?: number | null;              // Negative amount (€) from movements
}

/** Raw movement row returned by GET /api/portfolio/raw-movements */
export interface RawMovement {
  isin: string;
  fecha: string; // YYYY-MM-DD
  participaciones: number;
  importe: number;
  tipo: string;
  fondo: string;
  fuente: string;
}

/** Excluded movement returned by GET /api/portfolio/excluded-movements */
export interface ExcludedMovement {
  isin: string;
  fecha: string; // YYYY-MM-DD
  fondo: string;
  importe: number | null;
  participaciones: number | null;
}

/** Data provider status for one ISIN (GET /api/portfolio/providers-status) */
export interface ProviderStatus {
  isin: string;
  canonical: string;
  name: string;
  raw_isins: string[];
  rows: number;
  first_date: string | null;
  last_date: string | null;
  is_fresh: boolean;
  is_stale: boolean;
  no_data: boolean;
  /** Per-provider row counts: { Finect: 1234, YahooFinance: 1000, FMP: 0 } */
  providers?: Record<string, number>;
}

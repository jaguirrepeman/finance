const APP_BASE_URL = import.meta.env.BASE_URL || "/";
const BASE_URL = `${APP_BASE_URL.replace(/\/$/, "")}/api/portfolio`;

/** Custom error class for API errors */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Centralized fetch wrapper with error handling */
async function request<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "Unknown error");
    throw new ApiError(res.status, `${res.status}: ${body}`);
  }

  return res.json();
}

// ─── GET helpers ─────────────────────────────────────────────────────────────

export const api = {
  /** GET /api/portfolio/summary */
  getSummary: () =>
    request<import("@/types").AnalysisResponse>("/summary"),

  /** GET /api/portfolio/real-evolution */
  getRealEvolution: () =>
    request<import("@/types").RealEvolution>("/real-evolution"),

  /** GET /api/portfolio/details */
  getDetails: () =>
    request<import("@/types").FundDetailsMap>("/details"),

  /** GET /api/portfolio/positions */
  getPositions: () =>
    request<{
      positions: import("@/types").PositionItem[];
      total_invested: number;
      total_value: number;
      total_gain: number;
      total_gain_pct: number;
    }>("/positions"),

  /** GET /api/portfolio/fund/{isin}/details */
  getFundDetail: (isin: string, refresh = false) =>
    request<import("@/types").FundDetail>(
      `/fund/${isin}/details${refresh ? "?refresh=true" : ""}`,
    ),

  /** GET /api/portfolio/history_batch */
  getHistoryBatch: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : "";
    return request<import("@/types").HistoryBatchResponse>(
      `/history_batch${qs}`,
    );
  },

  /** GET /api/portfolio/correlation */
  getCorrelation: () =>
    request<import("@/types").CorrelationData>("/correlation"),

  /** GET /api/portfolio/annual-returns */
  getAnnualReturns: () =>
    request<import("@/types").AnnualReturnsData>("/annual-returns"),

  /** GET /api/portfolio/orders-summary */
  getOrdersSummary: () =>
    request<import("@/types").OrdersSummaryResponse>("/orders-summary"),

  /** GET /api/portfolio/last_update */
  getLastUpdate: () =>
    request<import("@/types").LastUpdateInfo>("/last_update"),

  /** GET /api/portfolio/benchmark/msci-world */
  getBenchmarkMsci: () =>
    request<import("@/types").BenchmarkData>("/benchmark/msci-world"),

  /** GET /api/portfolio/portfolio-holdings */
  getPortfolioHoldings: () =>
    request<import("@/types").PortfolioHoldingsResponse>("/portfolio-holdings"),

  /** GET /api/portfolio/refresh-nav */
  refreshNav: () => request<{ status: string }>("/refresh-nav"),

  /** POST /api/portfolio/recalculate — reset in-memory state without downloading */
  recalculatePortfolio: () =>
    request<{ message: string }>("/recalculate", { method: "POST" }),

  /** POST /api/portfolio/ — add a fund */
  addFund: (body: {
    Fondo: string;
    TIPO: string;
    Porcentaje: number;
    ISIN?: string;
    Valor_Actual?: number;
    Capital_Invertido?: number;
    Participaciones?: number;
    Fecha_Compra?: string;
  }) =>
    request<{ message: string }>("/", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /** DELETE /api/portfolio/{isin_or_name} — remove a fund */
  deleteFund: (isinOrName: string) =>
    request<{ message: string }>(`/${encodeURIComponent(isinOrName)}`, {
      method: "DELETE",
    }),

  /** GET /api/portfolio/fund/search */
  searchFund: (query: string) => {
    const qs = new URLSearchParams({ q: query });
    return request<import("@/types").FundSearchResult[]>(
      `/fund/search?${qs}`,
    );
  },

  // ─── POST helpers ───────────────────────────────────────────────────────

  /** POST /api/portfolio/simulate */
  simulate: (body: { isin: string; amount: number }) =>
    request<import("@/types").SimulationResult>("/simulate", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /** POST /api/portfolio/tax-optimize */
  taxOptimize: async (body: { target_amount: number }): Promise<import("@/types").TaxOptimizeResult> => {
    const r = await request<{
      target_amount: number;
      withdrawn_amount: number;
      total_capital_gain: number;
      estimated_tax: number;
      net_amount: number;
      plan: Array<{
        ISIN: string;
        Fondo: string;
        Fecha_Compra?: string | null;
        Participaciones_Vendidas: number;
        Importe_Retirado: number;
        Ganancia_Patrimonial: number;
        es_etf?: boolean;
      }>;
    }>("/tax-optimize", { method: "POST", body: JSON.stringify(body) });
    return {
      withdraw_amount: r.withdrawn_amount,
      total_gain: r.total_capital_gain,
      estimated_tax: r.estimated_tax,
      net_after_tax: r.net_amount,
      optimal_plan: r.plan.map((p) => ({
        fund: p.Fondo,
        isin: p.ISIN,
        purchase_date: p.Fecha_Compra ?? "",
        shares: p.Participaciones_Vendidas,
        amount: p.Importe_Retirado,
        gain: p.Ganancia_Patrimonial,
        is_etf: p.es_etf ?? false,
      })),
    };
  },

  /** POST /api/portfolio/rebalance */
  rebalance: (body: import("@/types").RebalanceRequest) =>
    request<import("@/types").RebalanceResult>("/rebalance", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // ─── Withdrawals ─────────────────────────────────────────────────────

  /** GET /api/portfolio/traspaso-analysis — backend returns list of TraspasoFundItem */
  getTraspasoAnalysis: async (): Promise<import("@/types").TraspasoAnalysis> => {
    const items = await request<Array<{
      isin: string;
      nombre: string;
      valor_actual: number;
      plusvalia_latente: number;
      impuesto_si_vendes: number;
      ahorro_traspaso: number;
      cualifica_traspaso: boolean;
      is_etf: boolean;
    }>>("/traspaso-analysis");
    const funds = items.map((f) => ({
      fund: f.nombre,
      isin: f.isin,
      current_value: f.valor_actual,
      latent_gain: f.plusvalia_latente,
      tax_if_sold: f.impuesto_si_vendes,
      transfer_savings: f.ahorro_traspaso,
      qualification: !f.cualifica_traspaso
        ? "ETF"
        : f.plusvalia_latente > 1000
          ? "ALTO"
          : f.plusvalia_latente > 300
            ? "MEDIO"
            : "BAJO",
      is_etf: f.is_etf,
    }));
    return {
      funds,
      total_deferrable_gain: funds.reduce((s, f) => s + f.latent_gain, 0),
      total_tax_savings: funds.reduce((s, f) => s + f.transfer_savings, 0),
    };
  },

  /** POST /api/portfolio/traspaso-optimize */
  traspasoOptimize: (body: { target_amount: number }) =>
    request<import("@/types").TraspasoOptimizeResult>("/traspaso-optimize", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // ─── Opportunities ───────────────────────────────────────────────────

  /** GET /api/portfolio/timing-presets */
  getTimingPresets: () =>
    request<import("@/types").TimingPresetsResponse>("/timing-presets"),

  /** GET /api/portfolio/opportunities */
  getOpportunities: (weights: Record<string, number>) => {
    const qs = new URLSearchParams({ weights: JSON.stringify(weights) });
    return request<import("@/types").OpportunityEntry[]>(
      `/opportunities?${qs}`,
    );
  },

  /** GET /api/portfolio/opportunity/{isin} */
  getOpportunityDetail: (isin: string) =>
    request<import("@/types").OpportunityEntry>(`/opportunity/${isin}`),

  /** GET /api/portfolio/opportunity/{isin}/chart-data */
  getOpportunityChartData: (isin: string, months = 12) =>
    request<import("@/types").OpportunityChartData>(
      `/opportunity/${isin}/chart-data?months=${months}`,
    ),

  /** POST /api/portfolio/fund/enrich */
  enrichFunds: (isins: string[]) =>
    request<import("@/types").EnrichedFund[]>("/fund/enrich", {
      method: "POST",
      body: JSON.stringify({ isins }),
    }),

  /** POST /api/portfolio/compare-funds */
  compareFunds: (isins: string[], years = 5) =>
    request<import("@/types").FundComparisonResult>("/compare-funds", {
      method: "POST",
      body: JSON.stringify({ isins, years }),
    }),

  /** GET /api/portfolio/fund/{isin}/nav_history */
  getFundNavHistory: (isin: string, years = 10) =>
    request<Array<{ date: string; price: number }>>(
      `/fund/${isin}/nav_history?years=${years}`,
    ),

  // ─── Portfolios ──────────────────────────────────────────────────────

  /** GET /api/portfolio/portfolios — backend returns {portfolios:[...]} */
  getPortfolios: async (): Promise<import("@/types").SavedPortfolio[]> => {
    const r = await request<{ portfolios?: unknown[] } | unknown[]>("/portfolios");
    const arr: unknown[] = Array.isArray(r) ? r : ((r as { portfolios?: unknown[] }).portfolios ?? []);
    return arr.map((p: unknown) => ({ ...(p as object), id: String((p as { id: unknown }).id) })) as import("@/types").SavedPortfolio[];
  },

  /** POST /api/portfolio/portfolios */
  createPortfolio: (
    body: Omit<import("@/types").SavedPortfolio, "id" | "created_at" | "updated_at">,
  ) =>
    request<import("@/types").SavedPortfolio>("/portfolios", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /** GET /api/portfolio/portfolios/{id} */
  getPortfolio: (id: string) =>
    request<import("@/types").SavedPortfolio>(`/portfolios/${id}`),

  /** PUT /api/portfolio/portfolios/{id} */
  updatePortfolio: (
    id: string,
    body: Partial<import("@/types").SavedPortfolio>,
  ) =>
    request<import("@/types").SavedPortfolio>(`/portfolios/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  /** DELETE /api/portfolio/portfolios/{id} */
  deletePortfolio: (id: string) =>
    request<{ status: string }>(`/portfolios/${id}`, { method: "DELETE" }),

  /** POST /api/portfolio/portfolios/clone-current */
  cloneCurrentPortfolio: () =>
    request<import("@/types").SavedPortfolio>("/portfolios/clone-current", {
      method: "POST",
      body: JSON.stringify({}),
    }),

  /** POST /api/portfolio/portfolios/compare */
  comparePortfolios: (body: {
    portfolio_a: string;
    portfolio_b: string;
    years?: number;
  }) =>
    request<import("@/types").PortfolioComparisonResult>(
      "/portfolios/compare",
      { method: "POST", body: JSON.stringify(body) },
    ),

  /** GET /api/portfolio/favorites — backend returns {favorites:[...]} */
  getFavorites: async (): Promise<import("@/types").FavoriteFund[]> => {
    const r = await request<{ favorites?: unknown[] } | unknown[]>("/favorites");
    const arr: unknown[] = Array.isArray(r) ? r : ((r as { favorites?: unknown[] }).favorites ?? []);
    return arr as import("@/types").FavoriteFund[];
  },

  /** POST /api/portfolio/favorites */
  addFavorite: (body: { isin: string; name: string }) =>
    request<import("@/types").FavoriteFund>("/favorites", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /** DELETE /api/portfolio/favorites/{isin} */
  removeFavorite: (isin: string) =>
    request<{ status: string }>(`/favorites/${isin}`, { method: "DELETE" }),

  // ─── Manual positions ────────────────────────────────────────────────────

  /** GET /api/portfolio/manual-positions */
  getManualPositions: () =>
    request<import("@/types").ManualPosition[]>("/manual-positions"),

  /** DELETE /api/portfolio/manual/entry/{id} — eliminates a single contribution */
  deleteManualFundEntry: (id: number) =>
    request<{ message: string }>(`/manual/entry/${id}`, { method: "DELETE" }),

  /** DELETE /api/portfolio/manual/{isin} — eliminates ALL contributions for an ISIN */
  deleteManualFund: (isin: string) =>
    request<{ message: string }>(`/manual/${encodeURIComponent(isin)}`, {
      method: "DELETE",
    }),

  // ─── Transaction overrides ───────────────────────────────────────────────

  /** GET /api/portfolio/transaction-overrides */
  getTransactionOverrides: () =>
    request<import("@/types").TransactionOverride[]>("/transaction-overrides"),

  /** POST /api/portfolio/transaction-overrides */
  upsertTransactionOverride: (body: {
    isin: string;
    fecha: string;
    participaciones: number;
    notes?: string;
  }) =>
    request<{ message: string; override: import("@/types").TransactionOverride }>(
      "/transaction-overrides",
      { method: "POST", body: JSON.stringify(body) },
    ),

  /** DELETE /api/portfolio/transaction-overrides/{id} */
  deleteTransactionOverride: (id: number) =>
    request<{ message: string }>(`/transaction-overrides/${id}`, {
      method: "DELETE",
    }),

  /** GET /api/portfolio/raw-movements */
  getRawMovements: () =>
    request<import("@/types").RawMovement[]>("/raw-movements"),

  /** DELETE /api/portfolio/raw-movements/{isin}/{fecha} — exclude a raw movement */
  deleteRawMovement: (isin: string, fecha: string) =>
    request<{ message: string }>(
      `/raw-movements/${encodeURIComponent(isin)}/${encodeURIComponent(fecha)}`,
      { method: "DELETE" },
    ),

  /** GET /api/portfolio/excluded-movements */
  getExcludedMovements: () =>
    request<import("@/types").ExcludedMovement[]>("/excluded-movements"),

  /** POST /api/portfolio/raw-movements/{isin}/{fecha}/restore — restore an excluded movement */
  restoreRawMovement: (isin: string, fecha: string) =>
    request<{ message: string }>(
      `/raw-movements/${encodeURIComponent(isin)}/${encodeURIComponent(fecha)}/restore`,
      { method: "POST" },
    ),

  // ─── Data Providers ──────────────────────────────────────────────────────

  /** GET /api/portfolio/providers-status */
  getProvidersStatus: () =>
    request<{ providers: import("@/types").ProviderStatus[] }>("/providers-status"),

  /** POST /api/portfolio/providers-status/refresh/{isin} */
  refreshProviderForIsin: (isin: string) =>
    request<{ message: string }>(`/providers-status/refresh/${isin}`, {
      method: "POST",
    }),

  /** POST /api/portfolio/providers-status/refresh/{isin}/provider/{provider} */
  refreshProviderForIsinWithChoice: (isin: string, provider: "finect" | "yahoo" | "fmp") =>
    request<{ message: string }>(`/providers-status/refresh/${isin}/provider/${provider}`, {
      method: "POST",
    }),

  /** POST /api/portfolio/upload-orders */
  uploadOrdersFile: async (file: File, sourceType: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("source_type", sourceType);

    const url = `${BASE_URL}/upload-orders`;
    const res = await fetch(url, {
      method: "POST",
      body: formData,
      // No Content-Type header so the browser sets it to multipart/form-data with boundary
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "Unknown error");
      throw new ApiError(res.status, `${res.status}: ${body}`);
    }
    return res.json() as Promise<{ message: string }>;
  },
} as const;

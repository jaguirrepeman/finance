Crea un notebook que permita hacer lo mismo que la app
En la app, conecta la pestaña Detalles con los detalles extraidos con Finect y los otros metodos. Revisalo para que sea lo más rápido posible, y cambia el boton de Recalcular Morningstar por Recalcular Cotizaciones (solo NAVs, todas las pestañas) y Recalcular Detalles (en la pestaña de detalles solo).
Ten cuidado con los porcentajes, ya que País Desarrollado sulue incluir Américas, y hay tanto United States como Estados Unidos. Si los sacas de sitios distintos habrá que hacer una conversión. 
Quiero también que me compares los pesos con el MSCI World

Añade una pestaña "Retirada de Fondos" donde se use TaxOptimizer

El simulador va muy lento, y si cambio de pestaña se borra, revisa la implementación.

Cambia el nombre a Portfolio Tracker, sin el Pro, y quita lo de Arquitectura local integrada

Revisa los datos de los NAVs para asegurar que haya histórico suficiente, si no comprueba fuentes alternativas (la primera debería ser la de finect). Hay varias correlaciones que dan 0. 

En la pestaña Evolución, los colores de la selección y del grafico deben ser los mismos para cada fondo


## Plan: Portfolio Tracker — Full Overhaul + Notebook

**TL;DR**: 13 work streams addressing: (1) rename branding, (2) split recalculate buttons into NAV-only + details-only, (3) connect Detalles tab to real multi-provider data with region/sector normalization, (4) add MSCI World weight comparison in Detalles, (5) add "Retirada de Fondos" tab using TaxOptimizer, (6) fix simulator performance + state persistence, (7) fix Evolución color consistency, (8) investigate Finect chart API for NAV history, (9) improve correlation reliability (zero-correlation funds), (10) normalize country/region names across providers, (11) create sequential Plotly notebook, (12) backend endpoint changes, (13) verification.

---

**Steps**

### 1. Rename Branding
- In [components.jsx](frontend/components.jsx#L1073): Change `"Portfolio Tracker Pro"` → `"Portfolio Tracker"`
- In [components.jsx](frontend/components.jsx#L1074): Remove the subtitle `"🚀 Arquitectura SQL/JSON Local Integrada"` entirely
- In [index.html](frontend/index.html#L5): Update `<title>` to `"Portfolio Tracker"`
- Rebuild `components.js` from `components.jsx` via [build.bat](frontend/build.bat)

### 2. Split Recalculate Buttons — Backend
- In [portfolio_service.py](backend/app/services/portfolio_service.py#L736-L775): Split `run_analytics_pipeline()` into two functions:
  - `run_nav_pipeline(force_download)` — calls `build_summary()` + `build_history_batch()` + `build_correlation()` (NAV chain only: FMP → YFinance)
  - `run_details_pipeline(force_download)` — calls `build_details()` only (full data chain: Finect → FT → YFinance → FMP)
- In [endpoints.py](backend/app/api/endpoints.py#L65-L83): Split `/enrich` into two endpoints:
  - `GET /api/portfolio/refresh-nav` — triggers `run_nav_pipeline` in background, returns current summary cache. Fast (~seconds).
  - `GET /api/portfolio/refresh-details` — triggers `run_details_pipeline` in background, returns current details cache. Slow (~minutes).
- Keep original `/enrich` as a convenience that calls both pipelines sequentially (backward compatibility).

### 3. Split Recalculate Buttons — Frontend
- In [components.jsx](frontend/components.jsx#L1085-L1094): Replace single `"Recalcular Morningstar"` button with:
  - **"Recalcular Cotizaciones"** — calls `/refresh-nav`. Visible in ALL tabs (header area). Updates NAVs, summary, history, correlations.
  - **"Recalcular Detalles"** — calls `/refresh-details`. Visible ONLY in the Detalles tab. Updates sector/region/metrics.
- Add a subtle loading indicator per button (spinner + "Actualizando..." text).

### 4. Country/Region Name Normalization
- Create a new module [backend/app/services/region_normalizer.py](backend/app/services/region_normalizer.py) with:
  - A mapping dictionary: `{"Estados Unidos": "United States", "Zona Euro": "Eurozone", "Iberoamérica": "Latin America", "Reino Unido": "United Kingdom", "Europa (ex-Zona Euro)": "Europe ex-Euro", "País Desarrollado": None, "Asia Desarrollada": "Asia Developed", "Asia Emergente": "Asia Emerging", "Europa Emergente": "Europe Emerging", "Oriente Medio": "Middle East", "Canadá": "Canada", "Japón": "Japan", ...}`
  - `"País Desarrollado"` mapped to `None` (skip/exclude) since it's a super-categaory that overlaps with individual countries. Same for `"Americas"` when individual countries are present.
  - Function `normalize_regions(regions: dict) -> dict` that: (a) maps names, (b) detects and removes super-categories when their sub-components are present (e.g., if `"United States"` + `"Canada"` exist, remove `"Americas"`), (c) ensures weights sum to ~100%.
  - Similar function `normalize_sectors(sectors: dict) -> dict` for Finect super-sectors (`"cyclical"`, `"sensitive"`, `"defensive"`) vs GICS names.
- Apply normalization in `build_details()` ([portfolio_service.py](backend/app/services/portfolio_service.py#L269-L311)) after fetching from providers, before saving to JSON.

### 5. MSCI World Weight Comparison (Detalles Tab)
- **Data source**: Use iShares MSCI World ETF (IE00B4L5Y983) as proxy. Fetch its sector/region weights via `CompositeProvider.get_sector_weights("IE00B4L5Y983")` and `get_country_weights("IE00B4L5Y983")`.
- **Backend**: Add endpoint `GET /api/portfolio/benchmark/msci-world` that returns `{sectors: {...}, regions: {...}}` for the MSCI World ETF. Cache result in `data/calculated/benchmark_msci.json`. Include this data alongside details response, or as a separate fetch.
- **Frontend** ([components.jsx DetailsTab](frontend/components.jsx#L125-L282)): Add side-by-side horizontal bar charts:
  - Left bar: "Mi Cartera" aggregated weight
  - Right bar: "MSCI World" weight
  - Color-coded difference indicator (overweight green, underweight red)
  - Show for both sectors and regions.

### 6. Connect Detalles Tab to Multi-Provider Data
- The current `DetailsTab` ([components.jsx](frontend/components.jsx#L125-L282)) already fetches `/api/portfolio/details` and renders sector/region bars + metrics.
- Ensure the backend `build_details()` applies the normalization from Step 4 so the frontend receives clean, consistent data.
- Verify the `aggregate()` function in the frontend ([components.jsx](frontend/components.jsx#L167-L202)) correctly weights by fund percentage.
- Add a "source" indicator showing which provider contributed each fund's details (useful for debugging).

### 7. Add "Retirada de Fondos" Tab
- **New component** `RetiradasTab` in [components.jsx](frontend/components.jsx):
  - Input: amount (€) with formatted number input
  - Button: "Optimizar Retirada" → calls `POST /api/portfolio/tax-optimize` with `{target_amount: X}`
  - Results display:
    - **Summary cards**: Total a retirar, Ganancia patrimonial, Impuestos estimados, Neto tras impuestos
    - **Step-by-step plan table**: columns [Fondo, ISIN, Participaciones, Precio compra, Precio actual, Ganancia, Importe venta]
    - **Tax bracket breakdown**: Show which bracket each gain falls into (19%/21%/23%/27%/28%)
- Update `activeTab` to include `'retiradas'` and add tab button in the tabs bar.
- Style consistent with other tabs.

### 8. Fix Simulator — State Persistence
- **Root cause**: In [components.jsx](frontend/components.jsx#L1107), `{activeTab === 'simulador' && <SimuladorTab />}` unmounts on tab switch, destroying all state.
- **Fix**: Use CSS `display: none` instead of conditional rendering. Change all tab rendering to render all tabs always, but hide inactive ones with `style={{display: activeTab === 'xxx' ? 'block' : 'none'}}`. This preserves DOM state for ALL tabs.
  - This also fixes any similar state loss in other tabs.

### 9. Fix Simulator — Performance
- **Fund search** is reasonably fast (300ms debounce + JSON string match). Keep as-is.
- **Fund detail** (`get_fund_detail_full`) is slow because it queries all providers. Optimize:
  - In [portfolio_service.py](backend/app/services/portfolio_service.py#L536-L586): Add an in-memory LRU cache (`functools.lru_cache` or dict) for `get_fund_detail_full()` results keyed by ISIN, with TTL of 1 hour.
  - Try Finect first (single HTTP request for all data) and only fall back to other providers if Finect doesn't have the fund.
- **Simulation** (`simulate_addition`) is slow because it re-fetches `get_fund_info()` for every portfolio fund. Optimize:
  - Cache `get_fund_info()` results in memory (already fetched during `build_details()`).
  - Reuse the cached `details.json` metrics instead of re-fetching per simulation.
  - In [portfolio_service.py](backend/app/services/portfolio_service.py#L600-L726): Refactor `simulate_addition()` to read from `data/calculated/details.json` for existing fund metrics, only fetch from providers for the new fund.

### 10. Fix Evolución Tab — Color Consistency
- **Root cause** ([components.jsx](frontend/components.jsx#L369-L374) vs [L760](frontend/components.jsx#L760)): Chart assigns colors by sequential index of `activeFunds` (after filtering), while checkboxes assign colors by index in `allFunds` (full list). When some are deselected, colors diverge.
- **Fix**: Create a `fundColorMap` computed once from `allFunds`:
  ```js
  const fundColorMap = useMemo(() => {
    const map = {};
    allFunds.forEach((f, i) => { map[f] = COLORS[i % COLORS.length]; });
    return map;
  }, [allFunds]);
  ```
  Pass `fundColorMap` to `InteractiveChart` as a prop and use `fundColorMap[fund]` for both checkboxes and chart lines, instead of sequential indexing.

### 11. Investigate Finect Chart API for NAV History
- **Research task**: The chart data is NOT in `window.INITIAL_STATE`. It's loaded lazily by a deferred React component. The likely endpoint follows the `/v4/bff/` pattern.
- **Investigation approach**:
  - Use the fund internal `id` from the model (e.g., `"eb3ce43e"`) to try common BFF patterns:
    - `GET https://www.finect.com/v4/bff/funds/{id}/quotes?period=5y`
    - `GET https://www.finect.com/v4/bff/products/{id}/chart?period=max`
    - `GET https://www.finect.com/v4/bff/funds/{id}/performance/chart`
  - Alternative: Finect uses Next.js — try `/_next/data/{buildId}/fondos-inversion/{slug}.json` with chart query params.
  - If discovered, implement `FinectProvider.get_nav_history()` to use this endpoint.
- **Fallback**: If Finect chart API can't be discovered programmatically, document the investigation and recommend the user capture the endpoint via browser DevTools.

### 12. Improve Correlation Reliability (Zero-Correlation Funds)
- **Diagnosis**: In `build_correlation()` ([portfolio_service.py](backend/app/services/portfolio_service.py#L444-L475)), correlation defaults to 0.0 when < 30 overlapping data points.
- **Improvements**:
  - Add MorningStar (`MStarProvider`) to the NAV history chain as a third fallback after YFinance.
  - If Finect chart API is discovered (Step 11), add it as the first source in the `_nav_chain`.
  - In `build_correlation()`: Log which fund pairs have < 30 data points and which provider was used, so the issue is diagnosable.
  - Consider using forward-fill (ffill) for small gaps (up to 5 business days) before computing correlation, to avoid dropping valid data points due to minor misalignment.
  - In the frontend correlation heatmap, visually distinguish 0.0 (insufficient data) from actual near-zero correlation — e.g., gray for "N/A" vs the normal color scale.

### 13. Create Sequential Notebook with Plotly
- New file: [backend/notebooks/portfolio_tracker.ipynb](backend/notebooks/portfolio_tracker.ipynb)
- Structure (mirrors app tabs):
  1. **Setup**: Imports, `sys.path` to `backend/app`, initialize `PortfolioClient`
  2. **Resumen General**: Positions table (styled DataFrame), asset allocation pie chart (Plotly), key metrics cards
  3. **Detalles**: Sector bars + region bars (Plotly grouped bars: Mi Cartera vs MSCI World), per-fund metrics table, normalization applied
  4. **Evolución**: NAV history line chart (Plotly, one trace per fund + portfolio synthetic line), correlation heatmap (Plotly `go.Heatmap`), timeframe selector buttons via `updatemenus`
  5. **Simulador**: Parametrized cell: `SIMULATE_ISIN = "IE00B4L5Y983"`, `SIMULATE_AMOUNT = 5000`. Show before/after weight comparison + metrics changes.
  6. **Retirada de Fondos**: Parametrized cell: `TARGET_AMOUNT = 50000`. Show TaxOptimizer plan table + tax summary.
  7. **Diagnóstico**: Coverage check per fund × provider (which providers provided sector/region/NAV data), zero-correlation fund list, NAV history length per fund.
- All cells use service classes directly (not API endpoints), consistent with [ejemplos_arquitectura.ipynb](backend/notebooks/ejemplos_arquitectura.ipynb) approach.
- Apply region normalization from the same `region_normalizer.py` module.

---

**Verification**

1. **Unit tests**: For `region_normalizer.py` — test mapping, super-category removal, edge cases (empty dict, all super-categories, mixed languages)
2. **API smoke test**: Hit `/refresh-nav`, `/refresh-details`, `/benchmark/msci-world`, `/tax-optimize` endpoints and verify JSON structure
3. **Frontend manual tests**:
   - Switch between all tabs rapidly — verify simulator state persists
   - In Evolución, deselect some funds → verify checkbox colors match chart line colors
   - In Detalles, verify no duplicate regions (e.g., "United States" + "Estados Unidos")
   - In Detalles, verify MSCI World comparison bars appear
   - In Retirada, enter amount → verify plan appears with tax breakdown
   - Verify "Portfolio Tracker" branding (no "Pro", no subtitle)
   - Verify "Recalcular Cotizaciones" appears in all tabs, "Recalcular Detalles" only in Detalles
4. **Notebook**: Run all cells sequentially, verify Plotly charts render, verify no `print()` statements (use `display()` / DataFrame rendering)
5. **Correlation check**: After NAV refresh, verify previously-zero correlations now have values (or are flagged as "insufficient data" rather than 0)

---

**Decisions**
- **Tab persistence via CSS `display:none`** over lifting state: simpler, preserves DOM for all tabs equally, no complex state refactoring
- **MSCI World via iShares ETF proxy** (IE00B4L5Y983): most liquid global tracker, publicly available data through existing providers
- **Super-category removal over manual mapping**: dynamically detect overlap (if sub-regions present, remove parent) rather than hardcoding which categories to exclude — more robust as portfolio changes
- **Finect chart API**: investigate programmatically first; if endpoint can't be discovered, flag for manual browser DevTools capture
- **Notebook uses service classes directly** (not HTTP API): consistent with existing notebook pattern, avoids needing the server running

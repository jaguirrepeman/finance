"""Portfolio Tracker — Services layer.

Módulos:
    cache_store.py       ← Cache SQLite unificado con TTL
    core_portfolio.py    ← Motor FIFO: parsing de órdenes, posiciones, lotes
    data_providers.py    ← Proveedores async (Finect, FT, YFinance, FMP)
    finect_provider.py   ← Proveedor sync de Finect + sitemap index
    fund_classifier.py   ← Clasificación de fondos (RV/RF/CASH/ALT)
    http_client.py       ← Singleton httpx.AsyncClient con retry
    portfolio_service.py ← Servicio central: adapta client → endpoints
    region_normalizer.py ← Normalización de regiones y sectores
    tax_calculator.py    ← Optimizador fiscal FIFO
    utils.py             ← Utilidades compartidas (run_sync, safe_float)
"""
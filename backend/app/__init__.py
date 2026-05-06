"""Portfolio Tracker — Backend FastAPI.

Arquitectura:
    main.py              ← Entrypoint FastAPI (lifespan, CORS, static files)
    client.py            ← Fachada sync (PortfolioClient) sobre async core
    client_async.py      ← Lógica de negocio async (AsyncPortfolioCore)
    api/endpoints.py     ← Todos los endpoints REST
    schemas/portfolio.py ← Modelos Pydantic de request/response
    services/            ← Proveedores de datos, cache, cálculos
"""

"""
http_client.py — Singleton httpx.AsyncClient con connection pooling y retry.

Centraliza todas las peticiones HTTP de los providers en un solo cliente
con conexiones persistentes (HTTP/1.1 keep-alive), retry con backoff
exponencial, y timeouts configurables.

Uso:
    from app.services.http_client import get_http_client, close_http_client

    async def fetch_something():
        client = get_http_client()
        resp = await client.get("https://api.example.com/data")
        return resp.json()
"""

import asyncio
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------

_DEFAULT_TIMEOUT = 15.0  # segundos
_MAX_CONNECTIONS = 20
_MAX_KEEPALIVE = 10
_RETRY_ATTEMPTS = 3
_RETRY_BACKOFF_FACTOR = 0.5  # 0.5s, 1s, 2s

# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_client_instance: Optional[httpx.AsyncClient] = None
_client_loop: Optional[asyncio.AbstractEventLoop] = None  # loop at creation time


def get_http_client() -> httpx.AsyncClient:
    """Retorna el singleton httpx.AsyncClient.

    Crea (o recrea) la instancia con connection pooling y timeouts configurados.
    Si el event loop actual difiere del loop en que se creó el cliente anterior,
    el cliente se recrea para evitar el error "Lock is bound to a different event loop".
    """
    global _client_instance, _client_loop

    # Detectar el loop actual (solo desde contexto async; es None en contextos sync)
    try:
        current_loop: Optional[asyncio.AbstractEventLoop] = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    loop_changed = (
        current_loop is not None
        and _client_loop is not None
        and _client_loop is not current_loop
    )

    if _client_instance is None or _client_instance.is_closed or loop_changed:
        if loop_changed:
            logger.debug("HTTP client: event loop changed, recreating AsyncClient")
        _client_instance = httpx.AsyncClient(
            timeout=httpx.Timeout(_DEFAULT_TIMEOUT, connect=10.0),
            limits=httpx.Limits(
                max_connections=_MAX_CONNECTIONS,
                max_keepalive_connections=_MAX_KEEPALIVE,
            ),
            follow_redirects=True,
            http2=False,  # HTTP/1.1 es más estable con los providers usados
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/125.0.0.0 Safari/537.36"
                ),
            },
        )
        _client_loop = current_loop
    return _client_instance


async def close_http_client() -> None:
    """Cierra el cliente HTTP. Llamar al apagar la aplicación."""
    global _client_instance
    if _client_instance is not None and not _client_instance.is_closed:
        await _client_instance.aclose()
        _client_instance = None
        logger.info("HTTP client closed.")


# ---------------------------------------------------------------------------
# Helper con retry
# ---------------------------------------------------------------------------


async def fetch_with_retry(
    url: str,
    *,
    params: Optional[dict] = None,
    headers: Optional[dict] = None,
    max_retries: int = _RETRY_ATTEMPTS,
    backoff_factor: float = _RETRY_BACKOFF_FACTOR,
) -> Optional[httpx.Response]:
    """GET con retry y exponential backoff.

    Retorna la Response si status 200, None en caso de fallo tras todos los reintentos.
    """
    import asyncio

    client = get_http_client()
    last_exc: Optional[Exception] = None

    for attempt in range(max_retries):
        try:
            resp = await client.get(url, params=params, headers=headers)
            if resp.status_code == 200:
                return resp
            if resp.status_code in (429, 503):
                # Rate limited o servicio no disponible — esperar y reintentar
                wait = backoff_factor * (2 ** attempt)
                logger.debug(
                    "HTTP %d from %s — retry in %.1fs (attempt %d/%d)",
                    resp.status_code, url, wait, attempt + 1, max_retries,
                )
                await asyncio.sleep(wait)
                continue
            # Otros errores (404, 500, etc.) — no reintentar
            logger.debug("HTTP %d from %s — no retry", resp.status_code, url)
            return None
        except (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError) as e:
            last_exc = e
            wait = backoff_factor * (2 ** attempt)
            logger.debug(
                "HTTP error for %s: %s — retry in %.1fs (attempt %d/%d)",
                url, e, wait, attempt + 1, max_retries,
            )
            await asyncio.sleep(wait)
        except Exception as e:
            logger.warning("Unexpected HTTP error for %s: %s", url, e)
            return None

    logger.warning(
        "All %d retries exhausted for %s. Last error: %s",
        max_retries, url, last_exc,
    )
    return None

"""
utils.py — Utilidades compartidas del backend.

Funciones auxiliares reutilizadas por múltiples módulos:
- run_sync: ejecuta una coroutine de forma síncrona (compatible con nest_asyncio).
- safe_float: conversión segura a float con manejo de NaN/Inf/None.
"""

import asyncio
import logging
import math
import sys
from typing import Any

import nest_asyncio
import pandas as pd

logger = logging.getLogger(__name__)


def _patch_loop_for_notebooks() -> None:
    """Apply nest_asyncio only for notebook-style event loops.

    In production (uvicorn + uvloop), forcing nest_asyncio can raise:
    "ValueError: Can't patch loop of type ...".
    """
    if "ipykernel" not in sys.modules:
        return

    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        return

    if "uvloop" in type(loop).__module__:
        logger.info("Skipping nest_asyncio patch on uvloop event loop")
        return

    try:
        nest_asyncio.apply(loop)
    except ValueError as exc:
        logger.warning("nest_asyncio patch skipped: %s", exc)


_patch_loop_for_notebooks()


def run_sync(coro) -> Any:
    """Ejecuta una coroutine de forma síncrona, compatible con cualquier contexto.

    Funciona tanto en Jupyter (event loop ya activo vía nest_asyncio) como
    en scripts o threads de FastAPI.

    Args:
        coro: Coroutine a ejecutar.

    Returns:
        El resultado de la coroutine.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


def safe_float(val) -> float:
    """Convierte un valor a float de forma segura.

    Maneja None, NaN, Inf y tipos no numéricos retornando 0.0.

    Args:
        val: Valor a convertir.

    Returns:
        Float válido o 0.0 si la conversión falla.
    """
    if pd.isna(val) or val is None:
        return 0.0
    try:
        val_float = float(val)
        if math.isnan(val_float) or math.isinf(val_float):
            return 0.0
        return val_float
    except (ValueError, TypeError):
        return 0.0

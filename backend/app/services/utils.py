"""
utils.py — Utilidades compartidas del backend.

Funciones auxiliares reutilizadas por múltiples módulos:
- run_sync: ejecuta una coroutine de forma síncrona (compatible con nest_asyncio).
- safe_float: conversión segura a float con manejo de NaN/Inf/None.
"""

import asyncio
import math
from typing import Any

import nest_asyncio
import pandas as pd

# Parchear event loop para compatibilidad con Jupyter y FastAPI
nest_asyncio.apply()


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

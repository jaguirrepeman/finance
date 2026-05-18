"""
opportunity_scanner.py — Escáner de timing de compra para fondos de inversión.

Enfoque: solo **momento de entrada** (timing)
=============================================

El usuario ya sabe que sus fondos son buenos — la pregunta es
**¿es buen momento para aportar más?**

El score mide exclusivamente si el fondo cotiza por debajo, en línea o
por encima de su propia tendencia histórica.  NO evalúa calidad del fondo.

Dimensiones del Timing Score (0-100)
------------------------------------

1. **Posición en tendencia (40 %)** — Z-score del log-precio actual vs
   regresión log-lineal sobre todo el histórico disponible.
   Negativo → por debajo de tendencia = oportunidad.

2. **Pullback reciente (30 %)** — Caída desde máximo de 3 meses,
   ajustada por tipo de fondo (RV necesita caídas mayores que RF
   para considerarse "descuento significativo").

3. **Divergencia de momentum (30 %)** — Compara momentum 1M vs 6M.
   Si 6M positivo pero 1M negativo → "dip en tendencia alcista" →
   oportunidad.  Si ambos positivos → "sin descuento".

Interpretación
--------------
- ≥75  🟢 Descuento significativo vs tendencia
- ≥60  🔵 Ligeramente por debajo de tendencia
- ≥40  ⚪ En tendencia — momento neutro
- ≥25  🟡 Por encima de tendencia reciente
- <25  🟠 Rally extendido — considerar esperar

NOTA: Incluso un score bajo NO significa "vender" sino "no es el mejor
momento para aportaciones adicionales grandes".

Parámetros internos
-------------------
- Histórico: se pide **siempre 10 años** internamente.  No hay dropdown
  de años en la interfaz para evitar confusión.
- Los thresholds se ajustan por tipo de fondo (RV, RF, CASH, Alternativo).

Métricas informativas adicionales (no forman parte del score)
-------------------------------------------------------------
- Sharpe, Sortino, CAGR, Volatilidad, MaxDD, Consistencia, Calmar
- Datos del proveedor: retornos 1Y/3Y/5Y, rating, TER, categoría

TODO — Fase posterior: crawl completo del universo Finect
---------------------------------------------------------
Crear ``fund_universe.py`` con:
  1. ``crawl_fund_universe()`` — iterar sitemap Finect (~30K ISINs),
     llamar ``get_fund_info()`` para cada uno, almacenar en CacheStore.
     Rate limiting: 5 req concurrentes, 200ms delay entre lotes.
  2. Progreso en ``data/cache/crawl_progress.json``.
  3. ``build_universe_table()`` → ``data/cache/fund_universe.json``
     con columnas: isin, name, category, management_company,
     annualized_return_1y/3y/5y, sharpe_ratio, standard_deviation,
     max_drawdown, total_expense_ratio, rating_morningstar, srri, aum.
  4. Endpoint ``GET /fund-universe`` para servir ese JSON.
  5. Management command: ``python -m app.services.fund_universe``.

Referencias:
  - Sharpe, W.F. (1994). "The Sharpe Ratio" — Journal of Portfolio Mgmt.
  - Clare, A. et al. (2016). "Measuring the Costs of Active Investing".
"""

import asyncio
import logging
import time
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd

from .fund_classifier import FundType, classify_fund
from .utils import safe_float

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-memory TTL cache for expensive computations
# ---------------------------------------------------------------------------

_CACHE_TTL = 300  # 5 minutes

# opportunity scan: (weights_key, timestamp, data)
_opp_scan_cache: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
# single fund opportunity: (isin+weights_key, timestamp, data)
_opp_fund_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}


def _weights_cache_key(weights: Dict[str, float] | None) -> str:
    """Deterministic cache key from weights dict."""
    if not weights:
        return "default"
    return ",".join(f"{k}:{v}" for k, v in sorted(weights.items()))


def _cache_get(cache: dict, key: str) -> Any | None:
    """Return cached value if it exists and hasn't expired."""
    entry = cache.get(key)
    if entry and (time.monotonic() - entry[0]) < _CACHE_TTL:
        return entry[1]
    if entry:
        del cache[key]
    return None


def _cache_set(cache: dict, key: str, value: Any) -> None:
    cache[key] = (time.monotonic(), value)

# Años de histórico que se piden SIEMPRE internamente.
_INTERNAL_YEARS = 10


# ---------------------------------------------------------------------------
# Pesos por defecto y presets de configuración
# ---------------------------------------------------------------------------

DEFAULT_TIMING_WEIGHTS: Dict[str, float] = {
    "trend": 0.25,        # Posición vs regresión log-lineal — más robusto
    "pullback": 0.15,     # Parcialmente redundante con trend — menor peso
    "divergence": 0.15,   # Dip en tendencia alcista — confirming signal
    "rsi": 0.15,          # Mean-reversion independiente — bien validado
    "vol_regime": 0.10,   # Filtro de calidad — mejora precisión de otros
    "short_term": 0.20,   # Timing semanal dentro del mes
}

TIMING_PRESETS: Dict[str, Dict[str, float]] = {
    "balanced": {
        "label": "⚖️ Balanceado",
        "description": "Detecta todo tipo de oportunidades equilibradamente.",
        "weights": {
            "trend": 0.25, "pullback": 0.15, "divergence": 0.15,
            "rsi": 0.15, "vol_regime": 0.10, "short_term": 0.20,
        },
    },
    "dip_hunter": {
        "label": "🎯 Cazador de Dips",
        "description": "Busca caídas fuertes recientes para entrar.",
        "weights": {
            "trend": 0.10, "pullback": 0.25, "divergence": 0.10,
            "rsi": 0.20, "vol_regime": 0.10, "short_term": 0.25,
        },
    },
    "trend_follower": {
        "label": "📐 Trend-Follower",
        "description": "Prefiere fondos por debajo de tendencia largo plazo.",
        "weights": {
            "trend": 0.35, "pullback": 0.10, "divergence": 0.25,
            "rsi": 0.10, "vol_regime": 0.10, "short_term": 0.10,
        },
    },
    "mean_reversion": {
        "label": "🔄 Mean Reversion",
        "description": "Se basa en RSI + volatilidad para encontrar sobreventa.",
        "weights": {
            "trend": 0.15, "pullback": 0.15, "divergence": 0.10,
            "rsi": 0.30, "vol_regime": 0.20, "short_term": 0.10,
        },
    },
}


# ---------------------------------------------------------------------------
# Indicadores técnicos
# ---------------------------------------------------------------------------


def _compute_rsi(prices: pd.Series, period: int = 14) -> float | None:
    """RSI de Wilder — indicador complementario."""
    if len(prices) < period + 1:
        return None
    delta = prices.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(window=period, min_periods=period).mean().iloc[-1]
    avg_loss = loss.rolling(window=period, min_periods=period).mean().iloc[-1]
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 2)


def _compute_sma(prices: pd.Series, period: int = 200) -> float | None:
    """Media móvil simple."""
    if len(prices) < period:
        return None
    return float(prices.rolling(window=period).mean().iloc[-1])


def _compute_cagr(prices: pd.Series) -> float | None:
    """Tasa de crecimiento anualizado compuesto."""
    if len(prices) < 60:
        return None
    first = float(prices.iloc[0])
    last = float(prices.iloc[-1])
    if first <= 0 or last <= 0:
        return None
    n_years = len(prices) / 252
    if n_years < 0.1:
        return None
    return (last / first) ** (1 / n_years) - 1


def _compute_max_drawdown(prices: pd.Series) -> float:
    """Máxima caída desde pico (fracción negativa)."""
    running_max = prices.cummax()
    drawdowns = (prices - running_max) / running_max
    return float(drawdowns.min()) if not drawdowns.empty else 0.0


def _compute_volatility(prices: pd.Series, annualize: bool = True) -> float:
    """Volatilidad anualizada (desviación estándar de retornos diarios)."""
    rets = prices.pct_change().dropna()
    if len(rets) < 20:
        return 0.0
    vol = float(rets.std())
    return vol * (252 ** 0.5) if annualize else vol


def _compute_sharpe(
    prices: pd.Series, risk_free_annual: float = 0.02,
) -> float | None:
    """Sharpe Ratio calculado a partir de precios diarios."""
    rets = prices.pct_change().dropna()
    if len(rets) < 60:
        return None
    daily_rf = (1 + risk_free_annual) ** (1 / 252) - 1
    excess = rets - daily_rf
    mean_excess = float(excess.mean())
    std_excess = float(excess.std())
    if std_excess == 0:
        return None
    return round(mean_excess / std_excess * (252 ** 0.5), 3)


def _compute_sortino(
    prices: pd.Series, risk_free_annual: float = 0.02,
) -> float | None:
    """Sortino Ratio: Sharpe pero solo penaliza volatilidad negativa."""
    rets = prices.pct_change().dropna()
    if len(rets) < 60:
        return None
    daily_rf = (1 + risk_free_annual) ** (1 / 252) - 1
    excess = rets - daily_rf
    mean_excess = float(excess.mean())
    downside = excess[excess < 0]
    if len(downside) < 10:
        return None
    downside_std = float(downside.std())
    if downside_std == 0:
        return None
    return round(mean_excess / downside_std * (252 ** 0.5), 3)


def _trend_deviation(prices: pd.Series) -> tuple[float, float]:
    """Z-score de la desviación del precio actual respecto a su tendencia.

    Ajusta regresión lineal sobre log(precios) y calcula cuántas
    desviaciones típicas está el precio actual por encima/debajo.

    Returns:
        (z_trend, trend_pct): z-score y desviación porcentual.
    """
    if len(prices) < 60:
        return 0.0, 0.0
    log_p = np.log(prices.values.astype(float))
    x = np.arange(len(log_p))
    coeffs = np.polyfit(x, log_p, 1)
    trend_line = np.polyval(coeffs, x)
    residuals = log_p - trend_line
    std_res = float(np.std(residuals))
    if std_res == 0:
        return 0.0, 0.0
    z_trend = float(residuals[-1] / std_res)
    trend_pct = float((np.exp(residuals[-1]) - 1) * 100)
    return round(z_trend, 2), round(trend_pct, 2)


def _consistency_ratio(prices: pd.Series, window: int = 63) -> float:
    """% de ventanas de *window* días con retorno positivo."""
    if len(prices) < window + 1:
        return 0.5
    rolling_ret = prices.pct_change(window).dropna()
    if len(rolling_ret) == 0:
        return 0.5
    return round(float((rolling_ret > 0).sum() / len(rolling_ret)), 3)


def _momentum(prices: pd.Series, n_days: int) -> float | None:
    """Retorno porcentual en los últimos n_days."""
    if len(prices) < n_days + 1:
        return None
    current = float(prices.iloc[-1])
    old = float(prices.iloc[-n_days - 1])
    return round(((current - old) / old) * 100, 2) if old > 0 else None


def _pullback_from_window(prices: pd.Series, window: int) -> float:
    """Caída porcentual del precio actual desde el máximo de *window* sesiones."""
    if len(prices) < window + 1:
        return 0.0
    w = min(window, len(prices) - 1)
    window_max = float(prices.iloc[-w:].max())
    current = float(prices.iloc[-1])
    if window_max <= 0:
        return 0.0
    return round(((current - window_max) / window_max) * 100, 2)


def _compute_rsi_series(
    prices: pd.Series, period: int = 14,
) -> pd.Series:
    """Serie completa de RSI (para chart data)."""
    delta = prices.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(window=period, min_periods=period).mean()
    avg_loss = loss.rolling(window=period, min_periods=period).mean()
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    return rsi


# ---------------------------------------------------------------------------
# Fund-type-aware thresholds
# ---------------------------------------------------------------------------


_FUND_TYPE_THRESHOLDS = {
    FundType.RV: {
        "pullback_significant": -5.0,
        "pullback_deep": -15.0,
        "trend_z_neutral_low": -0.5,
        "trend_z_neutral_high": 1.0,
        "vol_expected": 0.15,
    },
    FundType.RF: {
        "pullback_significant": -2.0,
        "pullback_deep": -6.0,
        "trend_z_neutral_low": -0.3,
        "trend_z_neutral_high": 0.5,
        "vol_expected": 0.04,
    },
    FundType.CASH: {
        "pullback_significant": -0.5,
        "pullback_deep": -2.0,
        "trend_z_neutral_low": -0.2,
        "trend_z_neutral_high": 0.3,
        "vol_expected": 0.01,
    },
    FundType.ALTERNATIVO: {
        "pullback_significant": -4.0,
        "pullback_deep": -12.0,
        "trend_z_neutral_low": -0.5,
        "trend_z_neutral_high": 0.8,
        "vol_expected": 0.10,
    },
    FundType.OTROS: {
        "pullback_significant": -4.0,
        "pullback_deep": -12.0,
        "trend_z_neutral_low": -0.5,
        "trend_z_neutral_high": 0.8,
        "vol_expected": 0.10,
        "rsi_oversold": 35,
        "rsi_overbought": 70,
    },
}

# Añadir umbrales RSI a todos los tipos de fondo
_FUND_TYPE_THRESHOLDS[FundType.RV]["rsi_oversold"] = 30
_FUND_TYPE_THRESHOLDS[FundType.RV]["rsi_overbought"] = 70
_FUND_TYPE_THRESHOLDS[FundType.RF]["rsi_oversold"] = 35
_FUND_TYPE_THRESHOLDS[FundType.RF]["rsi_overbought"] = 65
_FUND_TYPE_THRESHOLDS[FundType.CASH]["rsi_oversold"] = 40
_FUND_TYPE_THRESHOLDS[FundType.CASH]["rsi_overbought"] = 60
_FUND_TYPE_THRESHOLDS[FundType.ALTERNATIVO]["rsi_oversold"] = 35
_FUND_TYPE_THRESHOLDS[FundType.ALTERNATIVO]["rsi_overbought"] = 70


# ---------------------------------------------------------------------------
# Core: compute timing signals
# ---------------------------------------------------------------------------


def _normalize_weights(
    weights: Dict[str, float] | None,
) -> Dict[str, float]:
    """Normaliza pesos para que sumen 1.0.

    Si no se pasan pesos, devuelve los defaults.
    """
    if not weights:
        return dict(DEFAULT_TIMING_WEIGHTS)
    w = {
        k: max(0.0, float(v))
        for k, v in weights.items()
        if k in DEFAULT_TIMING_WEIGHTS
    }
    # Rellenar dimensiones faltantes con 0
    for k in DEFAULT_TIMING_WEIGHTS:
        w.setdefault(k, 0.0)
    total = sum(w.values())
    if total <= 0:
        return dict(DEFAULT_TIMING_WEIGHTS)
    return {k: v / total for k, v in w.items()}


def compute_timing_signals(
    prices: pd.Series,
    fund_type: FundType = FundType.RV,
    provider_info: Dict[str, Any] | None = None,
    weights: Dict[str, float] | None = None,
) -> Dict[str, Any]:
    """Calcula señales de timing adaptadas al tipo de fondo.

    El score es exclusivamente de **momento de entrada**: ¿hay descuento
    respecto a la tendencia propia del fondo?

    Dimensiones del score (6):
    1. Posición en tendencia — z-score vs regresión log-lineal.
    2. Pullback reciente — caída desde máx. 3M.
    3. Divergencia momentum — 1M vs 6M.
    4. RSI — sobrevendido/sobrecomprado (mean reversion).
    5. Régimen de volatilidad — vol actual vs histórica.
    6. Corto plazo — dips 3d/1w/2w.

    Args:
        prices: Serie temporal de precios (índice=fecha, más antiguo primero).
        fund_type: Tipo de fondo (RV, RF, CASH, ALTERNATIVO).
        provider_info: Info del proveedor (retornos, Sharpe, TER…) — solo
            para métricas informativas, no afecta al score.
        weights: Pesos personalizados para cada dimensión. Si None,
            usa DEFAULT_TIMING_WEIGHTS.

    Returns:
        Dict con timing_score, 6 sub-scores, indicadores y métricas.
    """
    if prices.empty or len(prices) < 30:
        return {}

    info = provider_info or {}
    thresholds = _FUND_TYPE_THRESHOLDS.get(
        fund_type, _FUND_TYPE_THRESHOLDS[FundType.RV],
    )
    w = _normalize_weights(weights)

    current = float(prices.iloc[-1])
    ath = float(prices.max())

    # ── 6 DIMENSIONES DEL TIMING SCORE ──

    # 1. Posición en tendencia
    z_trend, trend_pct = _trend_deviation(prices)
    trend_score = _score_trend_position(z_trend, thresholds)

    # 2. Pullback reciente (3M)
    recent_window = min(63, len(prices) - 1)
    recent_max = float(prices.iloc[-recent_window:].max())
    pullback_3m = (
        round(((current - recent_max) / recent_max) * 100, 2)
        if recent_max > 0 else 0.0
    )
    pullback_score = _score_pullback(pullback_3m, thresholds)

    # 3. Divergencia momentum (1M vs 6M)
    mom_1m = _momentum(prices, 21)
    mom_3m = _momentum(prices, 63)
    mom_6m = _momentum(prices, 126)
    divergence_score = _score_momentum_divergence(
        mom_1m, mom_6m, fund_type,
    )

    # 4. RSI
    rsi = _compute_rsi(prices, 14)
    rsi_score = _score_rsi(rsi, thresholds)

    # 5. Régimen de volatilidad
    vol_regime_ratio = _vol_regime_ratio(prices)
    vol_regime_score = _score_volatility_regime(vol_regime_ratio)

    # 6. Corto plazo (3d / 1w / 2w)
    mom_3d = _momentum(prices, 3)
    mom_1w = _momentum(prices, 5)
    mom_2w = _momentum(prices, 10)
    pullback_1w = _pullback_from_window(prices, 5)
    pullback_2w = _pullback_from_window(prices, 10)
    short_term_score = _score_short_term(
        mom_3d, mom_1w, mom_2w, pullback_1w, pullback_2w,
        mom_6m, fund_type,
    )

    # ── COMPOSITE TIMING SCORE ──
    timing_score = round(
        trend_score * w["trend"]
        + pullback_score * w["pullback"]
        + divergence_score * w["divergence"]
        + rsi_score * w["rsi"]
        + vol_regime_score * w["vol_regime"]
        + short_term_score * w["short_term"],
    )
    timing_score = max(0, min(100, timing_score))

    # ── MÉTRICAS INFORMATIVAS (no afectan al score) ──
    drawdown_ath_pct = (
        round(((current - ath) / ath) * 100, 2) if ath > 0 else 0.0
    )
    sma200 = _compute_sma(prices, 200)
    sma200_dist = (
        round(((current - sma200) / sma200) * 100, 2)
        if sma200 and sma200 > 0 else None
    )
    calc_sharpe = _compute_sharpe(prices)
    prov_sharpe = (
        safe_float(info.get("sharpe_ratio"))
        if info.get("sharpe_ratio") is not None else None
    )
    sharpe = prov_sharpe if prov_sharpe is not None else calc_sharpe
    sortino = _compute_sortino(prices)
    cagr = _compute_cagr(prices)
    vol = _compute_volatility(prices)
    max_dd = _compute_max_drawdown(prices)
    consistency = _consistency_ratio(prices, 63)
    calmar = (
        round(cagr / abs(max_dd), 3)
        if cagr and max_dd and abs(max_dd) > 0.001 else None
    )

    # Retornos del proveedor
    ret_1y = (
        safe_float(info["annualized_return_1y"])
        if info.get("annualized_return_1y") is not None else None
    )
    ret_3y = (
        safe_float(info["annualized_return_3y"])
        if info.get("annualized_return_3y") is not None else None
    )
    ret_5y = (
        safe_float(info["annualized_return_5y"])
        if info.get("annualized_return_5y") is not None else None
    )

    rating = info.get("rating_morningstar")
    ter_raw = info.get("total_expense_ratio") or info.get("ongoing_charge")
    ter_pct = (
        round(safe_float(ter_raw) * 100, 2)
        if ter_raw is not None and safe_float(ter_raw) else None
    )

    return {
        # Score
        "timing_score": timing_score,
        "trend_score": trend_score,
        "pullback_score": pullback_score,
        "divergence_score": divergence_score,
        "rsi_score": rsi_score,
        "vol_regime_score": vol_regime_score,
        "short_term_score": short_term_score,
        "weights_used": w,
        # Señales de timing
        "z_trend": z_trend,
        "trend_deviation_pct": trend_pct,
        "pullback_3m_pct": pullback_3m,
        "momentum_1m": mom_1m,
        "momentum_3m": mom_3m,
        "momentum_6m": mom_6m,
        # Nuevas señales corto plazo
        "momentum_3d": mom_3d,
        "momentum_1w": mom_1w,
        "momentum_2w": mom_2w,
        "pullback_1w_pct": pullback_1w,
        "pullback_2w_pct": pullback_2w,
        # RSI + Vol regime
        "rsi_14": rsi,
        "vol_regime_ratio": round(vol_regime_ratio, 3),
        # Contexto
        "fund_type": fund_type.value,
        "current_price": round(current, 4),
        "ath": round(ath, 4),
        "drawdown_ath_pct": drawdown_ath_pct,
        "sma200": round(sma200, 4) if sma200 is not None else None,
        "sma200_dist_pct": sma200_dist,
        # Informativas (no forman parte del score)
        "sharpe": sharpe,
        "sortino": sortino,
        "cagr_pct": round(cagr * 100, 2) if cagr is not None else None,
        "ret_1y": round(ret_1y, 2) if ret_1y is not None else None,
        "ret_3y": round(ret_3y, 2) if ret_3y is not None else None,
        "ret_5y": round(ret_5y, 2) if ret_5y is not None else None,
        "rating": rating,
        "ter_pct": ter_pct,
        "volatility_pct": round(vol * 100, 2),
        "max_drawdown_pct": round(max_dd * 100, 2),
        "consistency": consistency,
        "calmar": calmar,
    }


# ---------------------------------------------------------------------------
# Sub-scores de timing
# ---------------------------------------------------------------------------


def _score_trend_position(z_trend: float, thresholds: dict) -> int:
    """Score 0-100 de posición respecto a tendencia log-lineal.

    z_trend < 0 → por debajo de tendencia → oportunidad (score alto).
    z_trend ≈ 0 → en tendencia → neutro (~50).
    z_trend > 0 → por encima → sobreextendido (score bajo).
    """
    low = thresholds["trend_z_neutral_low"]
    high = thresholds["trend_z_neutral_high"]

    if z_trend <= low:
        # Por debajo de tendencia → score 55-95
        return round(_clamp(
            _linear_map(z_trend, low, low - 2.0, 55, 95), 55, 100,
        ))
    if z_trend >= high:
        # Por encima de tendencia → score 10-45
        return round(_clamp(
            _linear_map(z_trend, high, high + 2.0, 45, 10), 10, 45,
        ))
    # Zona neutral → 50
    return 50


def _score_pullback(pullback_3m: float, thresholds: dict) -> int:
    """Score 0-100 basado en pullback desde máximo de 3 meses."""
    sig = thresholds["pullback_significant"]
    deep = thresholds["pullback_deep"]

    if pullback_3m <= deep:
        return 95
    if pullback_3m <= sig:
        return round(_clamp(
            _linear_map(pullback_3m, sig, deep, 60, 90), 55, 95,
        ))
    if pullback_3m >= 0:
        return 45
    return round(_clamp(
        _linear_map(pullback_3m, 0, sig, 45, 60), 45, 60,
    ))


def _score_momentum_divergence(
    mom_1m: float | None,
    mom_6m: float | None,
    fund_type: FundType,
) -> int:
    """Score 0-100 basado en divergencia de momentum corto vs largo.

    Lógica principal:
      mom_6m > 0 y mom_1m < 0  → "dip en tendencia alcista" → 70-90
      mom_6m > 0 y mom_1m > 0  → "sin descuento" → 40-50
      mom_6m < 0 y mom_1m < 0  → "tendencia bajista" → 55-70 (barato)
      mom_6m < 0 y mom_1m > 0  → "rebote en bajista" → 30-45

    Ajustado por tipo de fondo: RF tiene umbrales más estrechos.
    """
    if mom_1m is None or mom_6m is None:
        return 50

    # Umbrales de "significancia" según tipo
    if fund_type in (FundType.RF, FundType.CASH):
        threshold_up = 1.0   # 1% ya es significativo para RF
        threshold_down = -1.0
    else:
        threshold_up = 3.0   # 3% para RV
        threshold_down = -3.0

    if mom_6m > threshold_up and mom_1m < threshold_down:
        # Dip en tendencia alcista → OPORTUNIDAD
        intensity = min(abs(mom_1m) / abs(threshold_down), 3.0) / 3.0
        return round(70 + intensity * 20)
    if mom_6m > threshold_up and mom_1m >= threshold_down:
        # Sin descuento claro, tendencia alcista intacta
        return round(_clamp(
            _linear_map(mom_1m, threshold_up * 2, threshold_down, 35, 55),
            35, 55,
        ))
    if mom_6m <= threshold_up and mom_6m >= threshold_down:
        # Momentum largo plano → neutro
        return 50
    if mom_6m < threshold_down and mom_1m < threshold_down:
        # Tendencia bajista → precio bajo, puede ser oportunidad
        return round(_clamp(
            _linear_map(mom_6m, threshold_down, threshold_down * 3, 55, 75),
            55, 75,
        ))
    if mom_6m < threshold_down and mom_1m > threshold_up:
        # Rebote en tendencia bajista → cautela
        return round(_clamp(
            _linear_map(mom_1m, threshold_up, threshold_up * 3, 45, 25),
            25, 45,
        ))
    return 50


def _score_rsi(rsi: float | None, thresholds: dict) -> int:
    """Score 0-100 basado en RSI-14, adaptado por tipo de fondo.

    RSI bajo (sobrevendido) → score alto (oportunidad de compra).
    RSI alto (sobrecomprado) → score bajo (esperar).
    Umbrales ajustados: RV usa 30/70, RF usa 35/65.
    """
    if rsi is None:
        return 50
    oversold = thresholds.get("rsi_oversold", 30)
    overbought = thresholds.get("rsi_overbought", 70)
    mid = (oversold + overbought) / 2

    if rsi <= oversold:
        # Muy sobrevendido → 80-95
        return round(_clamp(
            _linear_map(rsi, oversold, max(oversold - 15, 5), 80, 95),
            80, 95,
        ))
    if rsi <= mid:
        # Zona media-baja → 55-80
        return round(_clamp(
            _linear_map(rsi, mid, oversold, 55, 80), 55, 80,
        ))
    if rsi < overbought:
        # Zona media-alta → 30-55
        return round(_clamp(
            _linear_map(rsi, mid, overbought, 55, 30), 30, 55,
        ))
    # Sobrecomprado → 10-30
    return round(_clamp(
        _linear_map(rsi, overbought, min(overbought + 15, 95), 30, 10),
        10, 30,
    ))


def _vol_regime_ratio(prices: pd.Series) -> float:
    """Ratio de volatilidad reciente (21d) vs histórica (252d).

    Ratio < 1 → período tranquilo (pullbacks son significativos).
    Ratio > 1 → período volátil (pullbacks pueden ser ruido).
    """
    rets = prices.pct_change().dropna()
    if len(rets) < 252:
        if len(rets) < 30:
            return 1.0
        # Usar toda la historia disponible como referencia
        vol_long = float(rets.std())
        vol_short = float(rets.iloc[-21:].std()) if len(rets) >= 21 else vol_long
    else:
        vol_long = float(rets.iloc[-252:].std())
        vol_short = float(rets.iloc[-21:].std())

    if vol_long <= 0:
        return 1.0
    return vol_short / vol_long


def _score_volatility_regime(vol_ratio: float) -> int:
    """Score 0-100 basado en régimen de volatilidad.

    Período tranquilo (ratio < 0.8) → score 65-80
        (los pullbacks actuales son significativos, no ruido).
    Normal (0.8-1.2) → 45-55.
    Alta volatilidad (ratio > 1.5) → 25-35
        (las caídas son ruido amplificado, no oportunidades reales).
    """
    if vol_ratio <= 0.5:
        return 80
    if vol_ratio <= 0.8:
        return round(_clamp(
            _linear_map(vol_ratio, 0.5, 0.8, 80, 65), 65, 80,
        ))
    if vol_ratio <= 1.2:
        return round(_clamp(
            _linear_map(vol_ratio, 0.8, 1.2, 60, 45), 45, 60,
        ))
    if vol_ratio <= 1.5:
        return round(_clamp(
            _linear_map(vol_ratio, 1.2, 1.5, 45, 35), 35, 45,
        ))
    # Muy alta volatilidad
    return round(_clamp(
        _linear_map(vol_ratio, 1.5, 2.5, 35, 15), 15, 35,
    ))


def _score_short_term(
    mom_3d: float | None,
    mom_1w: float | None,
    mom_2w: float | None,
    pullback_1w: float,
    pullback_2w: float,
    mom_6m: float | None,
    fund_type: FundType,
) -> int:
    """Score 0-100 de corto plazo para timing semanal.

    Detecta micro-dips recientes (3d/1w/2w) que pueden ser ventana
    de compra, especialmente si la tendencia medio-plazo es positiva.

    Lógica:
    - Dip reciente (1w/2w) en tendencia positiva (6M) → oportunidad.
    - Dip reciente en tendencia negativa → moderado (puede seguir).
    - Sin dip → neutral (no es el mejor timing dentro del mes).
    """
    # Usar 0 si None para simplificar
    m3d = mom_3d if mom_3d is not None else 0.0
    m1w = mom_1w if mom_1w is not None else 0.0
    m2w = mom_2w if mom_2w is not None else 0.0
    m6m = mom_6m if mom_6m is not None else 0.0
    p1w = pullback_1w
    p2w = pullback_2w

    # Umbrales adaptados por tipo de fondo
    if fund_type in (FundType.RF, FundType.CASH):
        dip_threshold = -0.3   # 0.3% ya es dip para RF
        strong_dip = -1.0
    else:
        dip_threshold = -1.0   # 1% para RV
        strong_dip = -3.0

    # Magnitud del dip: usar el peor de 1w y 2w
    worst_pullback = min(p1w, p2w)
    worst_momentum = min(m3d, m1w)

    # Hay dip reciente?
    has_dip = worst_pullback <= dip_threshold or worst_momentum <= dip_threshold
    has_strong_dip = worst_pullback <= strong_dip or worst_momentum <= strong_dip

    if has_strong_dip and m6m > 0:
        # Dip fuerte en tendencia alcista → 80-95
        intensity = min(abs(worst_pullback) / abs(strong_dip), 2.0) / 2.0
        return round(80 + intensity * 15)
    if has_dip and m6m > 0:
        # Dip suave en tendencia alcista → 65-80
        return round(_clamp(
            _linear_map(
                worst_pullback, dip_threshold, strong_dip, 65, 80,
            ), 65, 80,
        ))
    if has_strong_dip and m6m <= 0:
        # Dip fuerte en tendencia bajista → 55-70
        return round(_clamp(
            _linear_map(
                worst_pullback, dip_threshold, strong_dip, 55, 70,
            ), 55, 70,
        ))
    if has_dip and m6m <= 0:
        # Dip suave en tendencia bajista → 50-60
        return round(_clamp(
            _linear_map(
                worst_pullback, 0, dip_threshold, 50, 60,
            ), 50, 60,
        ))
    if worst_momentum > 0 and m6m > 0:
        # Sin dip, subiendo → 35-45 (no es buena ventana)
        return 40
    # Sin señal clara → neutral
    return 50


# ---------------------------------------------------------------------------
# Interpretación
# ---------------------------------------------------------------------------


def _interpret_timing(score: int) -> Dict[str, str]:
    """Interpretación legible del timing score."""
    if score >= 75:
        return {
            "level": "🟢 Descuento significativo",
            "description": (
                "El fondo cotiza claramente por debajo de su tendencia "
                "histórica. Momento favorable para aportaciones adicionales."
            ),
        }
    if score >= 60:
        return {
            "level": "🔵 Ligeramente por debajo",
            "description": (
                "El fondo está ligeramente por debajo de su tendencia. "
                "Buen momento para continuar con DCA o aportar algo más."
            ),
        }
    if score >= 40:
        return {
            "level": "⚪ En tendencia",
            "description": (
                "El fondo sigue su tendencia habitual sin señales claras "
                "de descuento ni de sobreextensión. Mantener estrategia DCA."
            ),
        }
    if score >= 25:
        return {
            "level": "🟡 Por encima de tendencia",
            "description": (
                "El fondo ha subido más de lo habitual respecto a su "
                "tendencia. Considerar aportaciones parciales o esperar."
            ),
        }
    return {
        "level": "🟠 Rally extendido",
        "description": (
            "Rally por encima de la tendencia histórica. "
            "Puede ser prudente esperar un recorte antes de aportar más. "
            "Esto NO es una señal de venta."
        ),
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _clamp(v: float, lo: float, hi: float) -> float:
    """Acota un valor entre lo y hi."""
    return max(lo, min(hi, v))


def _linear_map(
    value: float, in_low: float, in_high: float,
    out_low: float, out_high: float,
) -> float:
    """Mapa lineal de [in_low, in_high] → [out_low, out_high]."""
    if in_high == in_low:
        return (out_low + out_high) / 2
    t = (value - in_low) / (in_high - in_low)
    return out_low + t * (out_high - out_low)


# ---------------------------------------------------------------------------
# Escáner de portfolio
# ---------------------------------------------------------------------------


async def scan_portfolio_opportunities(
    client: Any,
    weights: Dict[str, float] | None = None,
) -> List[Dict[str, Any]]:
    """Escanea todos los fondos del portfolio con scoring de timing.

    Internamente pide 10 años de histórico para estabilizar la
    tendencia log-lineal.

    Args:
        client: Instancia de PortfolioClient.
        weights: Pesos personalizados para las dimensiones del score.
    """
    # Check in-memory cache first (5 min TTL)
    cache_key = _weights_cache_key(weights)
    cached = _cache_get(_opp_scan_cache, cache_key)
    if cached is not None:
        logger.debug("scan_portfolio_opportunities: cache hit for %s", cache_key)
        return cached

    pos = client.positions(live=True)
    if pos.empty:
        return []

    isins = pos["ISIN"].tolist()
    names = {
        row["ISIN"]: row.get("Fondo", row["ISIN"])
        for _, row in pos.iterrows()
    }

    nav_tasks = [
        client.core.provider.get_nav_history(isin, years=_INTERNAL_YEARS)
        for isin in isins
    ]
    info_tasks = [
        client.core.provider.get_fund_info(isin) for isin in isins
    ]
    all_results = await asyncio.gather(
        *nav_tasks, *info_tasks, return_exceptions=True,
    )

    n = len(isins)
    nav_results = all_results[:n]
    info_results = all_results[n:]

    opportunities: list[Dict[str, Any]] = []

    for i, isin in enumerate(isins):
        nav_result = nav_results[i]
        info_result = info_results[i]

        if (
            isinstance(nav_result, BaseException)
            or not isinstance(nav_result, pd.DataFrame)
            or nav_result.empty
        ):
            logger.warning("No NAV history for %s", isin)
            continue

        info = (
            info_result
            if not isinstance(info_result, BaseException) else {}
        )
        info = info or {}

        try:
            prices = nav_result.set_index("date")["price"].sort_index()
            prices.index = pd.to_datetime(prices.index)
            fund_type = classify_fund(info=info)

            signals = compute_timing_signals(
                prices, fund_type=fund_type, provider_info=info,
                weights=weights,
            )
            if not signals:
                continue

            interpretation = _interpret_timing(signals["timing_score"])
            row_data = pos[pos["ISIN"] == isin].iloc[0]

            opportunities.append({
                "isin": isin,
                "name": names.get(isin, isin),
                "valor_actual": round(
                    safe_float(row_data.get("Valor_Actual", 0)), 2,
                ),
                "ganancia_pct": (
                    round(safe_float(row_data.get("Ganancia_Pct", 0)), 2)
                    if pd.notna(row_data.get("Ganancia_Pct")) else None
                ),
                **signals,
                **interpretation,
            })
        except Exception as exc:
            logger.warning(
                "Error computing timing for %s: %s", isin, exc,
            )

    opportunities.sort(
        key=lambda x: x.get("timing_score", 0), reverse=True,
    )
    _cache_set(_opp_scan_cache, cache_key, opportunities)
    return opportunities


async def scan_fund_opportunity(
    client: Any,
    isin: str,
    weights: Dict[str, float] | None = None,
) -> Dict[str, Any]:
    """Calcula las señales de timing para un fondo individual."""
    # Check in-memory cache first (5 min TTL)
    cache_key = f"{isin}:{_weights_cache_key(weights)}"
    cached = _cache_get(_opp_fund_cache, cache_key)
    if cached is not None:
        logger.debug("scan_fund_opportunity: cache hit for %s", cache_key)
        return cached

    nav_df, info = await asyncio.gather(
        client.core.provider.get_nav_history(
            isin, years=_INTERNAL_YEARS,
        ),
        client.core.provider.get_fund_info(isin),
        return_exceptions=True,
    )

    if (
        isinstance(nav_df, BaseException)
        or nav_df is None
        or (isinstance(nav_df, pd.DataFrame) and nav_df.empty)
    ):
        return {"isin": isin, "error": "No NAV history available"}

    info = info if not isinstance(info, BaseException) else {}
    info = info or {}

    prices = nav_df.set_index("date")["price"].sort_index()
    prices.index = pd.to_datetime(prices.index)
    fund_type = classify_fund(info=info)

    signals = compute_timing_signals(
        prices, fund_type=fund_type, provider_info=info,
        weights=weights,
    )
    if not signals:
        return {"isin": isin, "error": "Insufficient data for analysis"}

    interpretation = _interpret_timing(signals["timing_score"])

    result = {
        "isin": isin,
        "name": info.get("name", isin),
        "category": info.get("category"),
        "expense_ratio": (
            info.get("total_expense_ratio") or info.get("ongoing_charge")
        ),
        "rating": info.get("rating_morningstar"),
        **signals,
        **interpretation,
    }
    _cache_set(_opp_fund_cache, cache_key, result)
    return result


# ---------------------------------------------------------------------------
# Comparador de fondos
# ---------------------------------------------------------------------------


async def compare_funds(
    client: Any,
    isins: List[str],
    years: int = 5,
) -> Dict[str, Any]:
    """Compara múltiples fondos lado a lado con timing scoring."""
    isins = isins[:6]

    info_tasks = [
        client.core.provider.get_fund_info(isin) for isin in isins
    ]
    nav_tasks = [
        client.core.provider.get_nav_history(isin, years=years)
        for isin in isins
    ]
    all_results = await asyncio.gather(
        *info_tasks, *nav_tasks, return_exceptions=True,
    )

    n = len(isins)
    infos = all_results[:n]
    navs = all_results[n:]

    funds: list[Dict[str, Any]] = []
    chart_data: Dict[str, list] = {}

    for i, isin in enumerate(isins):
        info = infos[i] if not isinstance(infos[i], BaseException) else {}
        info = info or {}
        nav_df = (
            navs[i]
            if not isinstance(navs[i], BaseException) else pd.DataFrame()
        )

        signals: Dict[str, Any] = {}
        fund_type = classify_fund(info=info)

        if isinstance(nav_df, pd.DataFrame) and not nav_df.empty:
            prices = nav_df.set_index("date")["price"].sort_index()
            prices.index = pd.to_datetime(prices.index)
            signals = compute_timing_signals(
                prices, fund_type=fund_type, provider_info=info,
            )

            base_price = float(prices.iloc[0])
            if base_price > 0:
                normalized = (prices / base_price * 100).round(2)
                chart_data[info.get("name", isin)] = [
                    {"date": d.strftime("%Y-%m-%d"), "price": float(v)}
                    for d, v in normalized.items()
                    if pd.notna(v)
                ]

        returns = {}
        for suffix in ("1y", "3y", "5y", "10y"):
            key = f"annualized_return_{suffix}"
            val = info.get(key)
            if val is not None:
                returns[suffix] = round(safe_float(val), 2)

        metrics = {}
        for mk in (
            "sharpe_ratio", "alpha", "beta", "standard_deviation",
            "max_drawdown", "tracking_error", "information_ratio",
        ):
            val = info.get(mk)
            if val is not None:
                metrics[mk] = round(safe_float(val), 4)

        interpretation = _interpret_timing(
            signals.get("timing_score", 50),
        )

        funds.append({
            "isin": isin,
            "name": info.get("name", isin),
            "category": info.get("category"),
            "expense_ratio": (
                info.get("total_expense_ratio")
                or info.get("ongoing_charge")
            ),
            "aum": info.get("total_net_asset"),
            "rating": info.get("rating_morningstar"),
            "srri": info.get("srri"),
            "management_company": info.get("management_company"),
            "returns": returns,
            "metrics": metrics,
            "signals": signals,
            **interpretation,
        })

    return {"funds": funds, "chart_data": chart_data}


# ---------------------------------------------------------------------------
# Enrichment para explorador/screener
# ---------------------------------------------------------------------------


async def enrich_funds_batch(
    client: Any,
    isins: List[str],
) -> List[Dict[str, Any]]:
    """Enriquece una lista de ISINs con info, métricas y señales de timing.

    Diseñado para el screener/explorador de fondos.
    Procesa en lotes de 5 para no sobrecargar los proveedores.

    Args:
        client: Instancia de ``PortfolioClient``.
        isins: Lista de ISINs a enriquecer (máximo 20 por llamada).

    Returns:
        Lista de dicts con métricas completas para filtrado en frontend.
    """
    isins = isins[:20]
    results: list[Dict[str, Any]] = []

    batch_size = 5
    for batch_start in range(0, len(isins), batch_size):
        batch_isins = isins[batch_start:batch_start + batch_size]

        info_tasks = [
            client.core.provider.get_fund_info(isin)
            for isin in batch_isins
        ]
        nav_tasks = [
            client.core.provider.get_nav_history(
                isin, years=_INTERNAL_YEARS,
            )
            for isin in batch_isins
        ]
        batch_results = await asyncio.gather(
            *info_tasks, *nav_tasks, return_exceptions=True,
        )

        bn = len(batch_isins)
        b_infos = batch_results[:bn]
        b_navs = batch_results[bn:]

        for j, isin in enumerate(batch_isins):
            info = (
                b_infos[j]
                if not isinstance(b_infos[j], BaseException) else {}
            )
            info = info or {}
            nav_df = (
                b_navs[j]
                if not isinstance(b_navs[j], BaseException) else
                pd.DataFrame()
            )

            fund_type = classify_fund(info=info)
            signals: Dict[str, Any] = {}

            if isinstance(nav_df, pd.DataFrame) and not nav_df.empty:
                try:
                    prices = (
                        nav_df.set_index("date")["price"].sort_index()
                    )
                    prices.index = pd.to_datetime(prices.index)
                    signals = compute_timing_signals(
                        prices, fund_type=fund_type, provider_info=info,
                    )
                except Exception as exc:
                    logger.warning(
                        "Error computing signals for %s: %s", isin, exc,
                    )

            returns = {}
            for suffix in ("1y", "3y", "5y", "10y"):
                key = f"annualized_return_{suffix}"
                val = info.get(key)
                if val is not None:
                    returns[suffix] = round(safe_float(val), 2)

            metrics = {}
            for mk in (
                "sharpe_ratio", "alpha", "beta", "standard_deviation",
                "max_drawdown", "tracking_error", "information_ratio",
            ):
                val = info.get(mk)
                if val is not None:
                    metrics[mk] = round(safe_float(val), 4)

            interpretation = _interpret_timing(
                signals.get("timing_score", 50),
            )

            results.append({
                "isin": isin,
                "name": info.get("name", isin),
                "category": info.get("category"),
                "expense_ratio": (
                    info.get("total_expense_ratio")
                    or info.get("ongoing_charge")
                ),
                "aum": info.get("total_net_asset"),
                "rating": info.get("rating_morningstar"),
                "srri": info.get("srri"),
                "management_company": info.get("management_company"),
                "fund_type": fund_type.value,
                "returns": returns,
                "metrics": metrics,
                "signals": signals,
                **interpretation,
            })

    return results


# ---------------------------------------------------------------------------
# Chart data para visualización de timing
# ---------------------------------------------------------------------------


def compute_timing_chart_data(
    prices: pd.Series,
    chart_months: int = 12,
) -> Dict[str, Any]:
    """Genera datos de gráfica para visualizar las señales de timing.

    Devuelve la serie de precios reciente junto con overlays que muestran
    visualmente cada componente del timing score: regresión log-lineal,
    bandas de desviación, SMA-200, máximos de referencia para pullback,
    y serie RSI.

    Args:
        prices: Serie temporal completa de precios (índice=fecha).
        chart_months: Meses recientes a incluir en la gráfica.

    Returns:
        Dict con series formateadas para renderizar en el frontend/plotly.
    """
    if prices.empty or len(prices) < 30:
        return {}

    # Período de la gráfica: últimos chart_months meses
    chart_start = prices.index[-1] - pd.DateOffset(months=chart_months)
    chart_prices = prices[prices.index >= chart_start]
    if len(chart_prices) < 10:
        chart_prices = prices.iloc[-60:]  # fallback: últimos 60 puntos

    # ── Serie de precios ──
    price_series = [
        {"date": d.strftime("%Y-%m-%d"), "price": round(float(v), 4)}
        for d, v in chart_prices.items()
        if pd.notna(v)
    ]

    # ── Regresión log-lineal (sobre TODO el histórico) ──
    log_p = np.log(prices.values.astype(float))
    x_all = np.arange(len(log_p))
    coeffs = np.polyfit(x_all, log_p, 1)
    trend_all = np.polyval(coeffs, x_all)
    residuals = log_p - trend_all
    std_res = float(np.std(residuals))

    # Extraer regresión solo para el período de la gráfica
    chart_mask = prices.index >= chart_prices.index[0]
    x_chart = x_all[chart_mask]
    trend_chart = np.polyval(coeffs, x_chart)
    dates_chart = prices.index[chart_mask]

    regression_series = [
        {"date": d.strftime("%Y-%m-%d"), "value": round(float(np.exp(v)), 4)}
        for d, v in zip(dates_chart, trend_chart)
    ]

    # ── Bandas ±1σ y ±2σ ──
    band_1_upper = [
        {"date": d.strftime("%Y-%m-%d"),
         "value": round(float(np.exp(v + std_res)), 4)}
        for d, v in zip(dates_chart, trend_chart)
    ]
    band_1_lower = [
        {"date": d.strftime("%Y-%m-%d"),
         "value": round(float(np.exp(v - std_res)), 4)}
        for d, v in zip(dates_chart, trend_chart)
    ]
    band_2_upper = [
        {"date": d.strftime("%Y-%m-%d"),
         "value": round(float(np.exp(v + 2 * std_res)), 4)}
        for d, v in zip(dates_chart, trend_chart)
    ]
    band_2_lower = [
        {"date": d.strftime("%Y-%m-%d"),
         "value": round(float(np.exp(v - 2 * std_res)), 4)}
        for d, v in zip(dates_chart, trend_chart)
    ]

    # ── SMA-200 ──
    sma200_full = prices.rolling(window=200).mean()
    sma200_chart = sma200_full[chart_mask].dropna()
    sma200_series = [
        {"date": d.strftime("%Y-%m-%d"), "value": round(float(v), 4)}
        for d, v in sma200_chart.items()
        if pd.notna(v)
    ]

    # ── Máximos de referencia para pullback ──
    max_3m = float(prices.iloc[-min(63, len(prices)):].max())
    max_1w = float(prices.iloc[-min(5, len(prices)):].max())
    max_2w = float(prices.iloc[-min(10, len(prices)):].max())

    # ── RSI-14 serie ──
    rsi_full = _compute_rsi_series(prices, 14)
    rsi_chart = rsi_full[chart_mask].dropna()
    rsi_series = [
        {"date": d.strftime("%Y-%m-%d"), "value": round(float(v), 2)}
        for d, v in rsi_chart.items()
        if pd.notna(v)
    ]

    # ── Momentum crossovers (1M cruza de + a - y viceversa) ──
    # Calcular momentum 1M rodante y encontrar cruces
    if len(prices) > 30:
        mom_rolling = prices.pct_change(21).dropna()
        mom_chart = mom_rolling[mom_rolling.index >= chart_prices.index[0]]
        crossovers = []
        prev_sign = None
        for d, v in mom_chart.items():
            current_sign = "pos" if float(v) > 0 else "neg"
            if prev_sign is not None and current_sign != prev_sign:
                crossovers.append({
                    "date": d.strftime("%Y-%m-%d"),
                    "price": round(float(prices.loc[d]), 4)
                    if d in prices.index else None,
                    "type": "bullish" if current_sign == "pos" else "bearish",
                })
            prev_sign = current_sign
    else:
        crossovers = []

    return {
        "price_series": price_series,
        "regression": regression_series,
        "band_1_upper": band_1_upper,
        "band_1_lower": band_1_lower,
        "band_2_upper": band_2_upper,
        "band_2_lower": band_2_lower,
        "sma200": sma200_series,
        "pullback_levels": {
            "max_3m": round(max_3m, 4),
            "max_1w": round(max_1w, 4),
            "max_2w": round(max_2w, 4),
        },
        "rsi_series": rsi_series,
        "crossovers": crossovers,
        "chart_start": chart_prices.index[0].strftime("%Y-%m-%d"),
        "chart_end": chart_prices.index[-1].strftime("%Y-%m-%d"),
        "std_residual": round(std_res, 6),
    }


async def get_opportunity_chart_data(
    client: Any,
    isin: str,
    months: int = 12,
) -> Dict[str, Any]:
    """Endpoint-ready: obtiene datos de gráfico de timing para un fondo.

    Args:
        client: Instancia de PortfolioClient.
        isin: ISIN del fondo.
        months: Meses de histórico para la gráfica.

    Returns:
        Dict con series de precios, regresión, bandas, RSI,
        crossovers y signals completos.
    """
    nav_df, info = await asyncio.gather(
        client.core.provider.get_nav_history(
            isin, years=_INTERNAL_YEARS,
        ),
        client.core.provider.get_fund_info(isin),
        return_exceptions=True,
    )

    if (
        isinstance(nav_df, BaseException)
        or nav_df is None
        or (isinstance(nav_df, pd.DataFrame) and nav_df.empty)
    ):
        return {"isin": isin, "error": "No NAV history available"}

    info = info if not isinstance(info, BaseException) else {}
    info = info or {}

    prices = nav_df.set_index("date")["price"].sort_index()
    prices.index = pd.to_datetime(prices.index)

    chart_data = compute_timing_chart_data(prices, chart_months=months)
    fund_type = classify_fund(info=info)
    signals = compute_timing_signals(
        prices, fund_type=fund_type, provider_info=info,
    )
    interpretation = _interpret_timing(
        signals.get("timing_score", 50),
    )

    return {
        "isin": isin,
        "name": info.get("name", isin),
        "fund_type": fund_type.value,
        "chart": chart_data,
        "signals": signals,
        **interpretation,
    }

"""
tax_calculator.py — Optimizador fiscal para retiradas de fondos.

Implementa tres algoritmos:

1. ``optimize_withdrawal`` — plan greedy FIFO (vende primero el lote FIFO
   con menor plusvalía relativa, eligiendo el fondo óptimo en cada paso).

2. ``optimize_withdrawal_via_traspaso`` — optimizador global con traspasos
   previos (Art. 94 Ley 35/2006 IRPF):

   Best-practice para minimizar impuestos al retirar efectivo:
   - Los traspasos entre IICs no tributan → pivote legal.
   - Algoritmo greedy global (óptimo para funciones de impuesto convexas):
       a. Puntuar TODOS los lotes de TODOS los fondos por ganancia%
          ascendente (más barata primero).
       b. Seleccionar de forma codiciosa qué lotes reembolsar.
       c. Por cada lote seleccionado, los lotes ANTERIORES en el mismo
          fondo (que FIFO obligaría a vender antes) quedan asignados a
          traspaso → coste fiscal = 0.
   - Destinatario del traspaso: se prioriza un fondo indexado global ya
     existente en cartera (sin abrir cuentas nuevas). Si no hay ninguno,
     se recomiendan fondos de inversión indexados de bajo coste registrados
     en CNMV/ESMA adecuados para inversores españoles.
   
   El escenario "directo" (baseline de comparación) usa FIFO cronológico
   puro: vende todos los lotes en orden de fecha de compra, sin optimización.
   Esto representa la realidad fiscal de una venta sin planificación.

3. ``_direct_fifo_plan`` (interno) — FIFO cronológico puro: vende lotes en
   orden estricto de fecha de compra, sin selección inteligente de fondos.
   Usado como baseline para medir el ahorro fiscal del optimizador.

Tramos IRPF base del ahorro (Art. 66 Ley 35/2006, actualizados 2024):
  19 % hasta 6.000 €
  21 % de 6.000 a 50.000 €
  23 % de 50.000 a 200.000 €
  27 % de 200.000 a 300.000 €
  28 % más de 300.000 €
"""

import logging
from collections import defaultdict
from typing import Any, Dict, List, Optional

import pandas as pd

from .core_portfolio import Portfolio
from .fund_classifier import is_index_fund, is_etf_or_etp

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Fondos indexados de referencia (IICs registrados, no ETFs) para España
# Usados cuando no hay ningún fondo indexado ya en cartera.
# ---------------------------------------------------------------------------
_FALLBACK_INDEX_FUNDS: List[Dict[str, str]] = [
    {
        "isin": "IE000ZYRH0Q7",
        "nombre": "iShares Developed World Index Fund (IE) S Acc EUR",
        "motivo": "Fondo de gestión pasiva (no ETF) de bajo coste. Replica el MSCI World. Registrado en CNMV, disponible en MyInvestor, Indexa y otras plataformas españolas. Acumulación.",
    },
    {
        "isin": "IE00B03HCZ61",
        "nombre": "Vanguard Global Stock Index Fund EUR Acc",
        "motivo": "Fondo índice (no ETF) de referencia mundial en gestión pasiva. Registrado en CNMV, ampliamente disponible en España. Acumulación.",
    },
    {
        "isin": "LU0996182563",
        "nombre": "Vanguard Global Stock Index EUR Hedged Acc",
        "motivo": "Versión con cobertura de divisa EUR del Vanguard Global Stock Index Fund.",
    },
]


class TaxOptimizer:
    def __init__(
        self,
        portfolio: Portfolio,
        prices: Optional[Dict[str, float]] = None,
        fund_meta: Optional[Dict[str, Dict[str, Any]]] = None,
    ):
        """
        Args:
            portfolio: Portfolio con posiciones y lotes abiertos.
            prices: dict {ISIN: precio_actual} pre-obtenidos.
            fund_meta: dict {ISIN: {"name": str, "is_index": bool}}
                       para selección inteligente del fondo destino.
        """
        self.portfolio = portfolio
        self.current_prices: Dict[str, float] = dict(prices) if prices else {}
        self.fund_meta: Dict[str, Dict[str, Any]] = fund_meta or {}
        # Build ETF/ETP ISIN set from fund_meta (used to enforce non-traspasable rule)
        self._etf_isins: set[str] = {
            isin
            for isin, meta in self.fund_meta.items()
            if is_etf_or_etp(isin=isin, name=meta.get("name", ""))
        }

    # ------------------------------------------------------------------
    # Utilidades privadas
    # ------------------------------------------------------------------

    def _fetch_current_prices(self) -> None:
        """Obtiene precios actuales para ISINs que no los tienen."""
        missing = [
            isin for isin in self.portfolio.positions
            if isin not in self.current_prices or self.current_prices[isin] == 0
        ]
        if not missing:
            return
        try:
            import asyncio
            import threading
            from .data_providers import CompositeAsyncProvider
            from .cache_store import CacheStore

            async def _fetch_navs(result: dict) -> None:
                provider = CompositeAsyncProvider(cache=CacheStore())
                for isin in missing:
                    try:
                        price = await provider.get_nav(isin)
                        if price and price > 0:
                            result[isin] = price
                        else:
                            result.setdefault(isin, 0.0)
                    except Exception as exc:
                        logger.warning("Provider NAV(%s) failed: %s", isin, exc)
                        result.setdefault(isin, 0.0)

            fetched: dict = {}

            def _run_in_thread() -> None:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    loop.run_until_complete(_fetch_navs(fetched))
                finally:
                    loop.close()

            t = threading.Thread(target=_run_in_thread, daemon=True)
            t.start()
            t.join(timeout=30)  # max 30 s; if still running, proceed with what we have

            for isin, price in fetched.items():
                self.current_prices[isin] = price
            # Ensure all missing ISINs are at least 0
            for isin in missing:
                self.current_prices.setdefault(isin, 0.0)
        except Exception as e:
            logger.warning("_fetch_current_prices failed: %s", e)
            for isin in missing:
                self.current_prices.setdefault(isin, 0.0)

    def calculate_taxes(self, capital_gain: float) -> float:
        """
        Calcula los impuestos sobre la ganancia patrimonial
        según tramos del ahorro España 2024.
        """
        if capital_gain <= 0:
            return 0.0
        tax = 0.0
        remaining = capital_gain
        tramos = [
            (6_000,     0.19),
            (44_000,    0.21),
            (150_000,   0.23),
            (100_000,   0.27),
            (float("inf"), 0.28),
        ]
        for limite, tipo in tramos:
            if remaining <= 0:
                break
            aplicable = min(remaining, limite)
            tax += aplicable * tipo
            remaining -= aplicable
        return round(tax, 2)

    def _gain_pct(self, lot: Dict, current_price: float) -> float:
        """Plusvalía relativa de un lote respecto al precio actual."""
        cost = lot.get("Precio_Compra_Unitario", 0.0)
        if cost <= 0:
            return float("inf")
        return (current_price - cost) / cost

    def _is_etf(self, isin: str, lot: Optional[Dict] = None) -> bool:
        """Devuelve True si el ISIN es un ETF/ETP (no traspasable en España).

        Combina la lista pre-computada de la inicialización con detección
        por nombre del lote, de modo que los ISINs desconocidos también
        se clasifican correctamente en tiempo de ejecución.
        """
        if isin in self._etf_isins:
            return True
        fund_name = ""
        if lot:
            fund_name = lot.get("Fondo", "")
        if not fund_name:
            meta = self.fund_meta.get(isin, {})
            fund_name = meta.get("name", "")
        result = is_etf_or_etp(isin=isin, name=fund_name)
        if result:
            self._etf_isins.add(isin)  # cache for next call
        return result

    def _choose_destination_fund(
        self,
        reembolso_isins: List[str],
    ) -> Dict[str, Any]:
        """
        Elige el fondo destino para los traspasos.

        Solo se excluyen los fondos que van a ser REEMBOLSADOS en efectivo
        (paso 2). Un fondo que solo aparece en el plan de traspasos (paso 1,
        moviendo sus lotes antiguos a destino) puede seguir siendo receptor
        de otros traspasos, ya que los nuevos lotes llegan con base propia.

        Prioridad:
          1) Fondos indexados ya en cartera (evitar abrir nuevas cuentas).
          2) Si hay varios, el de mayor valor actual.
          3) Si no hay ninguno indexado en cartera, recomendar
             LU1681041458 (Amundi Index MSCI World) u otro de la lista.

        Args:
            reembolso_isins: ISINs de los fondos que se van a REEMBOLSAR en
                efectivo (no pueden ser destino del traspaso).

        Returns:
            Dict con keys: isin, nombre, tipo ("portfolio_index" | "new_suggestion"),
            motivo, is_index.
        """
        source_set = set(reembolso_isins)

        # ── Buscar fondos indexados existentes en cartera ──
        portfolio_index_candidates: List[Dict[str, Any]] = []
        for isin, meta in self.fund_meta.items():
            if isin in source_set:
                continue
            if meta.get("is_index"):
                value = sum(
                    l["Participaciones_Restantes"] * self.current_prices.get(isin, 0)
                    for l in self.portfolio.open_lots
                    if l["ISIN"] == isin
                )
                portfolio_index_candidates.append({
                    "isin": isin,
                    "nombre": meta.get("name", isin),
                    "tipo": "portfolio_index",
                    "is_index": True,
                    "valor_actual": value,
                    "motivo": (
                        "Fondo indexado ya en cartera → ningún trámite de apertura "
                        "de cuenta adicional. El traspaso mantiene la plusvalía "
                        "diferida dentro del mismo índice."
                    ),
                })

        if portfolio_index_candidates:
            portfolio_index_candidates.sort(key=lambda x: -x["valor_actual"])
            best = portfolio_index_candidates[0]
            best.pop("valor_actual", None)
            return best

        # ── Sin indexado en cartera → sugerir Amundi o Vanguard ──
        suggestion = _FALLBACK_INDEX_FUNDS[0]
        return {
            "isin": suggestion["isin"],
            "nombre": suggestion["nombre"],
            "tipo": "new_suggestion",
            "is_index": True,
            "motivo": suggestion["motivo"],
        }

    # ------------------------------------------------------------------
    # Algoritmo principal: greedy global con traspasos
    # ------------------------------------------------------------------

    def optimize_withdrawal_via_traspaso(
        self,
        target_amount: float,
    ) -> Dict[str, Any]:
        """
        Planifica la retirada de ``target_amount`` euros en efectivo
        minimizando el IRPF mediante traspasos previos (Art. 94 LIRPF).

        Algoritmo (greedy global, óptimo para impuesto convexo):
          1. Calcule la plusvalía% de cada lote abierto en toda la cartera.
          2. Ordene todos los lotes por plusvalía% ascendente (el más barato
             primero).
          3. Iteración codiciosa:
               - Tome el lote de menor plusvalía disponible para reembolso.
               - Los lotes ANTERIORES en el mismo fondo (que FIFO exigiría
                 liquidar primero) se marcan para TRASPASO (coste = 0€).
               - Acumule importe reembolsado hasta alcanzar target_amount.
          4. Compare con el escenario FIFO directo (sin traspasos).
          5. Seleccione el fondo destino de los traspasos.

        Returns:
            Dict con planos detallados de traspaso y reembolso, comparativa
            fiscal y metadata del fondo destino.
        """
        self._fetch_current_prices()

        all_lots: List[Dict] = [lot.copy() for lot in self.portfolio.get_open_lots()]
        if not all_lots:
            return self._empty_result(target_amount, "No hay lotes abiertos en cartera.")

        # ── Agrupar lotes por ISIN, en orden cronológico (FIFO) ──
        lots_by_isin: Dict[str, List[Dict]] = defaultdict(list)
        for lot in all_lots:
            lots_by_isin[lot["ISIN"]].append(lot)
        for isin in lots_by_isin:
            lots_by_isin[isin].sort(key=lambda x: x["Fecha"])

        # ── Valor total disponible ──
        total_portfolio_value = sum(
            l["Participaciones_Restantes"] * self.current_prices.get(l["ISIN"], 0.0)
            for l in all_lots
            if self.current_prices.get(l["ISIN"], 0.0) > 0
        )
        if total_portfolio_value < target_amount:
            return self._empty_result(
                target_amount,
                f"El valor total con precio conocido "
                f"({total_portfolio_value:.2f}€) es inferior al objetivo "
                f"({target_amount:.2f}€).",
            )

        # ── Escenario DIRECTO (FIFO puro, sin traspasos) ──
        direct_result = self._direct_fifo_plan(lots_by_isin, target_amount)

        # ── Escenario OPTIMIZADO (greedy global + traspasos) ──
        optimized_result = self._greedy_traspaso_plan(lots_by_isin, target_amount)
        handled = optimized_result.get("handled", defaultdict(set))

        # ── Tax-loss harvesting ──
        harvesting = self._loss_harvesting_suggestions(
            lots_by_isin, handled, optimized_result["total_gain"],
        )

        # ── Selección del fondo destino ──
        # Solo se excluyen los fondos que se van a REEMBOLSAR (no los que solo
        # aparecen en el plan de traspasos — pueden seguir siendo receptor).
        reembolso_isins = list({s["ISIN"] for s in optimized_result["reembolsos"]})
        destination = self._choose_destination_fund(reembolso_isins)

        # ETF/ETP ISINs en cartera (no traspasables)
        non_traspasable_isins = [
            isin for isin in lots_by_isin
            if self._is_etf(isin, lots_by_isin[isin][0] if lots_by_isin[isin] else None)
        ]

        # ── Enriquecer plan de traspasos con destino ──
        for step in optimized_result["traspasos"]:
            step["Destination_ISIN"] = destination["isin"]
            step["Destination_Fondo"] = destination["nombre"]

        # ── Calcular impuestos ──
        direct_tax = self.calculate_taxes(direct_result["total_gain"])
        opt_tax = self.calculate_taxes(optimized_result["total_gain"])

        # Safety net: the greedy traspaso plan should never be worse than direct FIFO.
        # However, when the chronological FIFO naturally picks loss lots or very low-gain
        # lots (due to fortuitous timing), the optimized plan may end up with higher tax
        # because it moves loss-generating lots to traspaso and sells profitable ones.
        # In those rare cases, the unoptimized FIFO is already optimal — no action needed.
        direct_is_optimal = direct_tax <= opt_tax
        if direct_is_optimal:
            logger.info(
                "Scenario collapse: chronological FIFO (tax=%.2f€) is more efficient "
                "than the traspaso+reembolso plan (tax=%.2f€). Using direct FIFO as both "
                "scenarios. This happens when the oldest lots have losses or minimal gains.",
                direct_tax, opt_tax,
            )
            # Override optimized plan with direct FIFO — traspasos not needed
            optimized_result["total_gain"] = direct_result["total_gain"]
            optimized_result["traspasos"] = []
            optimized_result["reembolsos"] = direct_result["steps"]
            opt_tax = direct_tax
            plusvalia_diferida = 0.0
        else:
            plusvalia_diferida = sum(
                s.get("Plusvalia_Diferida", 0.0) for s in optimized_result["traspasos"]
            )

        ahorro = direct_tax - opt_tax
        ahorro_pct = (ahorro / direct_tax * 100) if direct_tax > 0 else 0.0

        # Actual amounts withdrawn (may be < target_amount if portfolio was insufficient)
        direct_withdrawn = round(sum(s.get("Importe", 0.0) for s in direct_result["steps"]), 2)
        opt_withdrawn = round(sum(s.get("Importe", 0.0) for s in optimized_result["reembolsos"]), 2)

        notas_base = (
            "La venta directa FIFO cronológica es ya la mejor opción: los lotes más "
            "antiguos tienen pérdidas o ganancias mínimas, por lo que el traspaso previo "
            "no mejora el resultado fiscal. Simplemente vender en orden cronológico (sin "
            "planificación adicional) ya es óptimo en tu caso. No se requiere ninguna acción adicional."
            if direct_is_optimal else
            "Estrategia en 2 pasos (Art. 94 Ley 35/2006 IRPF): "
            "① Traspasar los lotes indicados al fondo destino (operación EXENTA). "
            "② Una vez confirmado el traspaso (~3-5 días hábiles), solicitar el "
            "reembolso en efectivo del importe deseado. FIFO opera ahora sobre "
            "los lotes más recientes → menor plusvalía → menor IRPF. "
            "La plusvalía diferida queda en el fondo destino hasta un futuro reembolso. "
        )

        # ── Desglose ganancias/pérdidas (Art. 49.1.b Ley 35/2006) ──
        # Las ganancias y pérdidas patrimoniales de la base del ahorro se
        # compensan automáticamente en la misma declaración de IRPF.
        # Solo el saldo neto positivo tributa.
        def _gain_loss_breakdown(steps: List[Dict]) -> Dict[str, float]:
            gains = sum(s["Ganancia_Patrimonial"] for s in steps if s["Ganancia_Patrimonial"] > 0)
            losses = sum(s["Ganancia_Patrimonial"] for s in steps if s["Ganancia_Patrimonial"] < 0)
            return {
                "ganancias_brutas": round(gains, 2),
                "perdidas_brutas": round(losses, 2),
                "saldo_neto": round(gains + losses, 2),
                "compensacion_aplicada": round(min(gains, abs(losses)), 2) if losses < 0 else 0.0,
            }

        direct_breakdown = _gain_loss_breakdown(direct_result["steps"])
        opt_breakdown = _gain_loss_breakdown(optimized_result["reembolsos"])

        return {
            "target_amount": target_amount,
            "total_portfolio_value": round(total_portfolio_value, 2),

            # ── Comparativa de escenarios ──
            "escenario_directo": {
                "ganancia_patrimonial": round(direct_result["total_gain"], 2),
                "impuesto": round(direct_tax, 2),
                "withdrawn_amount": direct_withdrawn,
                "neto_recibido": round(direct_withdrawn - direct_tax, 2),
                "detalle": direct_result["steps"],
                **direct_breakdown,
            },
            "escenario_optimizado": {
                "ganancia_patrimonial": round(optimized_result["total_gain"], 2),
                "impuesto": round(opt_tax, 2),
                "withdrawn_amount": opt_withdrawn,
                "neto_recibido": round(opt_withdrawn - opt_tax, 2),
                "detalle": optimized_result["reembolsos"],
                **opt_breakdown,
            },

            # ── Ahorros ──
            "ahorro_fiscal": round(ahorro, 2),
            "ahorro_fiscal_pct": round(ahorro_pct, 2),

            # ── Planes de acción ──
            "plan_traspasos": optimized_result["traspasos"],
            "plan_reembolso": optimized_result["reembolsos"],

            # ── Totales ──
            "importe_traspasado": round(
                sum(s["Importe_Traspasado"] for s in optimized_result["traspasos"]), 2
            ),
            "plusvalia_diferida": round(plusvalia_diferida, 2),
            "fondos_afectados": list({s["ISIN"] for s in optimized_result["reembolsos"]}),

            # ── Destino ──
            "destination_fund": destination,
            "destination_alternatives": [
                f for f in _FALLBACK_INDEX_FUNDS if f["isin"] != destination.get("isin")
            ],

            # ── ETFs/ETPs no traspasables ──
            "non_traspasable_isins": non_traspasable_isins,

            # ── Cartera post-operaciones ──
            "portfolio_after": self._portfolio_after(
                lots_by_isin,
                optimized_result["traspasos"],
                optimized_result["reembolsos"],
                destination,
            ),

            # ── Tax-loss harvesting ──
            "loss_harvesting": harvesting,

            "notas": notas_base + (
                    f"⚠️ ATENCIÓN: los siguientes productos son ETFs/ETPs y NO son traspasables "
                    f"según la legislación española — deben reembolsarse directamente: "
                    f"{', '.join(non_traspasable_isins)}. "
                    if non_traspasable_isins else ""
            ),
        }

    # ------------------------------------------------------------------
    # FIFO directo (sin traspasos) — línea base de comparación
    # ------------------------------------------------------------------

    def _direct_fifo_plan(
        self,
        lots_by_isin: Dict[str, List[Dict]],
        target_amount: float,
    ) -> Dict[str, Any]:
        """
        Calcula el coste fiscal de un reembolso FIFO puro cronológico.

        Este es el baseline real: vende todos los lotes en orden cronológico
        estricto (por fecha de compra global), sin optimización alguna.
        
        Este escenario representa lo que ocurriría si el inversor simplemente
        vendiera participaciones sin planificación fiscal, respetando FIFO
        de forma cronológica pura.
        """
        # Aplanar todos los lotes y ordenar cronológicamente
        all_lots: List[Dict] = []
        for isin, isin_lots in lots_by_isin.items():
            price = self.current_prices.get(isin, 0.0)
            if price <= 0:
                continue
            for lot in isin_lots:
                all_lots.append({
                    **lot,
                    "_price": price,
                    "_isin": isin,
                })

        # Ordenar por fecha de compra (FIFO cronológico puro)
        all_lots.sort(key=lambda x: x["Fecha"])

        steps: List[Dict] = []
        total_gain = 0.0
        remaining = target_amount

        for lot in all_lots:
            if remaining <= 0.01:
                break

            isin = lot["_isin"]
            price = lot["_price"]
            lot_value = lot["Participaciones_Restantes"] * price

            if lot_value <= remaining:
                units = lot["Participaciones_Restantes"]
                amount = lot_value
            else:
                units = remaining / price
                amount = remaining

            gain = (price - lot["Precio_Compra_Unitario"]) * units
            total_gain += gain
            remaining -= amount

            steps.append({
                "ISIN": isin,
                "Fondo": lot.get("Fondo", isin),
                "Fecha_Compra": lot["Fecha"],
                "Participaciones": round(units, 6),
                "Importe": round(amount, 2),
                "Ganancia_Patrimonial": round(gain, 2),
                "Precio_Compra_Unitario": lot["Precio_Compra_Unitario"],
                "es_etf": self._is_etf(isin, lot),
            })

        return {"total_gain": total_gain, "steps": steps}

    # ------------------------------------------------------------------
    # Greedy global con traspasos
    # ------------------------------------------------------------------

    def _greedy_traspaso_plan(
        self,
        lots_by_isin: Dict[str, List[Dict]],
        target_amount: float,
    ) -> Dict[str, Any]:
        """
        Greedy global: ordena TODOS los lotes por plusvalía% ascendente.

        Por cada lote elegido para reembolso:
          - Fondos de inversión (traspasables):
              Los lotes más antiguos del mismo fondo van a TRASPASO (coste 0€).
              El lote seleccionado se reembolsa en efectivo.
          - ETFs / ETPs (NO traspasables, Art. 94 LIRPF no aplica):
              Los lotes más antiguos TAMBIÉN van a REEMBOLSO (FIFO obligatorio).
              Solo se ofrece como candidato el primer lote FIFO aún no procesado.
              En caso de empate de plusvalía%, los ETFs tienen prioridad sobre
              los fondos (ya que no es posible diferir su ganancia fiscal).

        Esta solución es óptima para funciones de impuesto convexas
        (marginalmente crecientes) porque:
          - Siempre procesamos el lote de menor coste fiscal primero.
          - Los FIFO-obligatorios traspasables quedan diferidos (gratis).
          - Los ETFs/ETPs se venden en orden FIFO sin posibilidad de diferimiento.
        """
        # Construir lista plana de candidatos para el greedy
        # Para ETFs: solo el primer lote no procesado (FIFO obligatorio en bolsa)
        # Para fondos: cualquier lote (los anteriores irán a traspaso)
        flat: List[Dict] = []
        etf_front_offered: Dict[str, bool] = {}  # track if ETF's FIFO front is already in flat

        for isin, isin_lots in lots_by_isin.items():
            price = self.current_prices.get(isin, 0.0)
            if price <= 0:
                continue
            etf = self._is_etf(isin, isin_lots[0] if isin_lots else None)
            for fifo_idx, lot in enumerate(isin_lots):
                if etf:
                    # For ETFs: only ever offer the next FIFO lot (idx 0, or the first unhandled)
                    # We'll always start with index 0 in the greedy; the loop below handles
                    # forcing older lots into reembolso first.
                    flat.append({
                        "lot": lot,
                        "isin": isin,
                        "price": price,
                        "gain_pct": self._gain_pct(lot, price),
                        "fifo_idx": fifo_idx,
                        "value": lot["Participaciones_Restantes"] * price,
                        "is_etf": True,
                    })
                else:
                    gp = self._gain_pct(lot, price)
                    flat.append({
                        "lot": lot,
                        "isin": isin,
                        "price": price,
                        "gain_pct": gp,
                        "fifo_idx": fifo_idx,
                        "value": lot["Participaciones_Restantes"] * price,
                        "is_etf": False,
                    })

        # Orden ascendente por plus%
        # Tiebreaker: ETFs primero (is_etf=True → sortkey 0, False → sortkey 1)
        # Esto prioriza vender ETFs cuando la plusvalía% es igual a la de un fondo,
        # ya que los fondos pueden diferirse via traspaso pero los ETFs no.
        flat.sort(key=lambda x: (x["gain_pct"], 0 if x["is_etf"] else 1))

        # Estado: lotes ya marcados como traspaso o reembolso
        handled: Dict[str, set] = defaultdict(set)  # isin → {fifo_idx}

        reembolsos: List[Dict] = []
        traspasos: List[Dict] = []
        total_gain = 0.0
        remaining = target_amount

        for item in flat:
            if remaining <= 0.01:
                break

            isin = item["isin"]
            price = item["price"]
            lot = item["lot"]
            fifo_idx = item["fifo_idx"]
            is_etf = item["is_etf"]

            # ── Tratar lotes más antiguos del mismo fondo ──
            isin_lots = lots_by_isin[isin]
            for k in range(fifo_idx):
                if k in handled[isin]:
                    continue
                older = isin_lots[k]
                older_price = self.current_prices.get(isin, 0.0)
                units = older["Participaciones_Restantes"]
                amount = units * older_price
                gain_k = (older_price - older["Precio_Compra_Unitario"]) * units

                if is_etf:
                    # ETF: los lotes anteriores NO se pueden traspasar.
                    # Deben reembolsarse primero (FIFO bursátil obligatorio).
                    if remaining <= 0.01:
                        handled[isin].add(k)
                        continue
                    # Vender el lote anterior completo si hay margen, parcial si no
                    if amount <= remaining:
                        sold_units = units
                        sold_amount = amount
                    else:
                        sold_units = remaining / older_price
                        sold_amount = remaining
                    sold_gain = (older_price - older["Precio_Compra_Unitario"]) * sold_units
                    total_gain += sold_gain
                    remaining -= sold_amount
                    reembolsos.append({
                        "ISIN": isin,
                        "Fondo": older.get("Fondo", isin),
                        "Fecha_Compra": older["Fecha"],
                        "Participaciones": round(sold_units, 6),
                        "Importe": round(sold_amount, 2),
                        "Ganancia_Patrimonial": round(sold_gain, 2),
                        "Precio_Compra_Unitario": older["Precio_Compra_Unitario"],
                        "es_etf": True,
                        "nota": "ETF/ETP — no traspasable (obligatorio FIFO bursátil)",
                    })
                elif gain_k < 0:
                    # ── OPTIMIZACIÓN CLAVE (Art. 49.1.b Ley 35/2006 IRPF) ──
                    # Lote con PÉRDIDA latente: NO se traspasa, se REEMBOLSA.
                    # Las pérdidas realizadas compensan ganancias del mismo
                    # ejercicio fiscal, reduciendo la base imponible del ahorro.
                    # Traspasar un lote con pérdida desperdiciaría ese beneficio
                    # fiscal (la pérdida quedaría "congelada" en el fondo destino).
                    if remaining <= 0.01:
                        # No hay más importe que retirar, pero aún así conviene
                        # vender este lote para realizar la pérdida si es posible.
                        # Lo marcamos como handled; una sugerencia de tax-loss
                        # harvesting lo señalará por separado.
                        handled[isin].add(k)
                        continue
                    if amount <= remaining:
                        sold_units = units
                        sold_amount = amount
                    else:
                        sold_units = remaining / older_price
                        sold_amount = remaining
                    sold_gain = (older_price - older["Precio_Compra_Unitario"]) * sold_units
                    total_gain += sold_gain  # negativo → reduce base imponible
                    remaining -= sold_amount
                    reembolsos.append({
                        "ISIN": isin,
                        "Fondo": older.get("Fondo", isin),
                        "Fecha_Compra": older["Fecha"],
                        "Participaciones": round(sold_units, 6),
                        "Importe": round(sold_amount, 2),
                        "Ganancia_Patrimonial": round(sold_gain, 2),
                        "Precio_Compra_Unitario": older["Precio_Compra_Unitario"],
                        "es_etf": False,
                        "nota": "Lote con pérdida — se reembolsa para compensar ganancias (Art. 49.1.b LIRPF)",
                    })
                else:
                    # Fondo de inversión con ganancia: lotes anteriores → traspaso (exento)
                    traspasos.append({
                        "ISIN": isin,
                        "Fondo": older.get("Fondo", isin),
                        "Fecha_Compra": older["Fecha"],
                        "Participaciones": round(units, 6),
                        "Importe_Traspasado": round(amount, 2),
                        "Plusvalia_Diferida": round(gain_k, 2),
                        "Precio_Compra_Unitario": older["Precio_Compra_Unitario"],
                        "es_etf": False,
                        "Nota": "Traspaso exento — Art. 94 Ley 35/2006 IRPF",
                    })
                handled[isin].add(k)

            # ── Reembolsar este lote (parcial o total) ──
            if fifo_idx in handled[isin]:
                continue  # ya procesado

            if remaining <= 0.01:
                continue

            lot_value = lot["Participaciones_Restantes"] * price
            if lot_value <= remaining:
                units = lot["Participaciones_Restantes"]
                amount = lot_value
            else:
                units = remaining / price
                amount = remaining

            gain = (price - lot["Precio_Compra_Unitario"]) * units
            total_gain += gain
            remaining -= amount

            reembolsos.append({
                "ISIN": isin,
                "Fondo": lot.get("Fondo", isin),
                "Fecha_Compra": lot["Fecha"],
                "Participaciones": round(units, 6),
                "Importe": round(amount, 2),
                "Ganancia_Patrimonial": round(gain, 2),
                "Precio_Compra_Unitario": lot["Precio_Compra_Unitario"],
                "es_etf": is_etf,
                "nota": (
                    "ETF/ETP — no traspasable (Art. 94 LIRPF no aplica)"
                    if is_etf else ""
                ),
            })
            handled[isin].add(fifo_idx)

        return {
            "total_gain": total_gain,
            "reembolsos": reembolsos,
            "traspasos": traspasos,
            "handled": handled,
        }

    # ------------------------------------------------------------------
    # Tax-Loss/Gain Harvesting – bidireccional
    # ------------------------------------------------------------------

    def _loss_harvesting_suggestions(
        self,
        lots_by_isin: Dict[str, List[Dict]],
        handled: Dict[str, set],
        base_net_gain: float,
    ) -> Dict[str, Any]:
        """Sugiere ventas adicionales para optimizar el balance fiscal.

        Funciona en **dos direcciones** según el resultado neto del plan base:

        A) ``base_net_gain > 0`` — **harvest losses** (clásico TLH):
           Vender lotes con pérdidas latentes para compensar las ganancias
           del plan base → menor ganancia neta → menor IRPF.

        B) ``base_net_gain < 0`` — **harvest gains** (novedad):
           El plan base genera pérdidas netas que se *desperdiciarían* si no
           se emparejan con ganancias en el mismo ejercicio fiscal.
           Vender lotes con **ganancias** latentes → las pérdidas las anulan
           → dinero extra **sin coste fiscal** (Art. 49.1.b Ley 35/2006).

        Para ambos sentidos:
          - Fondo de inversión: los lotes FIFO anteriores se traspasan (coste=0).
          - ETF/ETP: FIFO bursátil obliga a vender los lotes previos.

        NORMA ANTIAPLICACIÓN (Art. 33.5.f Ley 35/2006):
          Las pérdidas NO son deducibles si se recompran valores homogéneos
          en un plazo de 2 meses (cotizados/ETFs) ó 1 año (IICs/fondos).

        Returns:
            Dict con ``direction``, candidatos, impacto fiscal y totales.
        """
        if base_net_gain > 0:
            return self._harvest_losses(lots_by_isin, handled, base_net_gain)
        if base_net_gain < 0:
            return self._harvest_gains(lots_by_isin, handled, base_net_gain)
        # base_net_gain == 0 → nada que optimizar
        return self._empty_harvesting(base_net_gain, "none")

    # -- A) Plan tiene ganancias netas → buscar lotes con pérdidas ----------

    def _harvest_losses(
        self,
        lots_by_isin: Dict[str, List[Dict]],
        handled: Dict[str, set],
        base_net_gain: float,
    ) -> Dict[str, Any]:
        """Candidatos con pérdidas latentes para compensar ganancias."""
        base_tax = self.calculate_taxes(base_net_gain)
        candidates: List[Dict[str, Any]] = []

        for isin, isin_lots in lots_by_isin.items():
            price = self.current_prices.get(isin, 0.0)
            if price <= 0:
                continue
            is_etf = self._is_etf(isin, isin_lots[0] if isin_lots else None)

            for fifo_idx, lot in enumerate(isin_lots):
                if fifo_idx in handled.get(isin, set()):
                    continue

                units = lot["Participaciones_Restantes"]
                lot_pnl = (price - lot["Precio_Compra_Unitario"]) * units
                lot_value = units * price

                if lot_pnl >= 0:
                    continue  # solo nos interesan lotes en pérdida

                preceding_forced_gain, preceding_forced_value = 0.0, 0.0
                preceding_transfer_value = 0.0

                for k in range(fifo_idx):
                    if k in handled.get(isin, set()):
                        continue
                    older = isin_lots[k]
                    older_units = older["Participaciones_Restantes"]
                    older_gain = (price - older["Precio_Compra_Unitario"]) * older_units
                    older_value = older_units * price
                    if is_etf:
                        preceding_forced_gain += older_gain
                        preceding_forced_value += older_value
                    else:
                        preceding_transfer_value += older_value

                net_harvest_gain = lot_pnl + preceding_forced_gain
                additional_cash = lot_value + preceding_forced_value

                if net_harvest_gain >= 0:
                    continue  # FIFO previo de ETF anula el beneficio

                candidates.append({
                    "ISIN": isin,
                    "Fondo": lot.get("Fondo", isin),
                    "es_etf": is_etf,
                    "Fecha_Compra": lot["Fecha"],
                    "lot_loss": round(lot_pnl, 2),
                    "lot_value": round(lot_value, 2),
                    "preceding_forced_gain": round(preceding_forced_gain, 2),
                    "preceding_forced_value": round(preceding_forced_value, 2),
                    "preceding_transfer_value": round(preceding_transfer_value, 2),
                    "net_harvest_gain": round(net_harvest_gain, 2),
                    "additional_cash": round(additional_cash, 2),
                    "antiaplicacion_plazo": "2 meses" if is_etf else "1 año",
                })

        candidates.sort(key=lambda x: x["net_harvest_gain"])

        total_harvestable = sum(c["net_harvest_gain"] for c in candidates)
        total_additional_cash = sum(c["additional_cash"] for c in candidates)
        net_gain_after = base_net_gain + total_harvestable
        tax_after = self.calculate_taxes(max(0.0, net_gain_after))
        tax_savings = base_tax - tax_after

        return {
            "direction": "harvest_losses",
            "candidates": candidates,
            "base_net_gain": round(base_net_gain, 2),
            "base_tax": round(base_tax, 2),
            "total_harvestable_loss": round(total_harvestable, 2),
            "net_gain_after_harvest": round(net_gain_after, 2),
            "tax_after_harvest": round(tax_after, 2),
            "tax_savings": round(tax_savings, 2),
            "additional_cash": round(total_additional_cash, 2),
        }

    # -- B) Plan tiene pérdidas netas → buscar lotes con ganancias ----------

    def _harvest_gains(
        self,
        lots_by_isin: Dict[str, List[Dict]],
        handled: Dict[str, set],
        base_net_gain: float,
    ) -> Dict[str, Any]:
        """Candidatos con ganancias latentes para aprovechar pérdidas del plan.

        El plan base genera pérdidas netas → esas pérdidas compensan
        ganancias del mismo ejercicio fiscal de forma automática.  Vender
        lotes con plusvalía hasta |base_net_gain| = dinero extra sin impuesto.

        Lógica:
          - Limita la suma de ganancias cosechadas a |base_net_gain| para
            que el resultado neto no pase a positivo (lo que generaría
            impuesto nuevo).
          - Prioriza lotes con menor ganancia% para agotar la cuota fiscal
            libre de forma más eficiente (más participaciones por € de
            ganancia).
          - Fondos: traspasar lotes FIFO anteriores (gratis).
          - ETFs: FIFO bursátil obligatorio.
        """
        loss_budget = abs(base_net_gain)  # capacidad de absorber ganancias
        candidates: List[Dict[str, Any]] = []

        for isin, isin_lots in lots_by_isin.items():
            price = self.current_prices.get(isin, 0.0)
            if price <= 0:
                continue
            is_etf = self._is_etf(isin, isin_lots[0] if isin_lots else None)

            for fifo_idx, lot in enumerate(isin_lots):
                if fifo_idx in handled.get(isin, set()):
                    continue

                units = lot["Participaciones_Restantes"]
                lot_pnl = (price - lot["Precio_Compra_Unitario"]) * units
                lot_value = units * price

                if lot_pnl <= 0:
                    continue  # solo nos interesan lotes con ganancia

                # Coste FIFO de acceder a este lote
                preceding_forced_loss = 0.0   # pérdida FIFO ETF (amplía budget)
                preceding_forced_gain = 0.0   # ganancia FIFO ETF (consume budget)
                preceding_forced_value = 0.0
                preceding_transfer_value = 0.0

                for k in range(fifo_idx):
                    if k in handled.get(isin, set()):
                        continue
                    older = isin_lots[k]
                    older_units = older["Participaciones_Restantes"]
                    older_pnl = (price - older["Precio_Compra_Unitario"]) * older_units
                    older_value = older_units * price
                    if is_etf:
                        if older_pnl >= 0:
                            preceding_forced_gain += older_pnl
                        else:
                            preceding_forced_loss += older_pnl  # negativo
                        preceding_forced_value += older_value
                    else:
                        preceding_transfer_value += older_value

                # Ganancia total que se realizaría
                net_harvest_gain = lot_pnl + preceding_forced_gain + preceding_forced_loss

                if net_harvest_gain <= 0:
                    continue  # no aporta ganancia neta → no tiene sentido

                additional_cash = lot_value + preceding_forced_value

                candidates.append({
                    "ISIN": isin,
                    "Fondo": lot.get("Fondo", isin),
                    "es_etf": is_etf,
                    "Fecha_Compra": lot["Fecha"],
                    "lot_loss": round(lot_pnl, 2),  # positivo en este caso
                    "lot_value": round(lot_value, 2),
                    "preceding_forced_gain": round(
                        preceding_forced_gain + preceding_forced_loss, 2,
                    ),
                    "preceding_forced_value": round(preceding_forced_value, 2),
                    "preceding_transfer_value": round(preceding_transfer_value, 2),
                    "net_harvest_gain": round(net_harvest_gain, 2),
                    "additional_cash": round(additional_cash, 2),
                    "antiaplicacion_plazo": "2 meses" if is_etf else "1 año",
                })

        # Ordenar: menor ganancia% primero (más eficiente en uso del budget)
        candidates.sort(key=lambda x: x["net_harvest_gain"])

        # Seleccionar solo los que caben dentro del budget de pérdidas
        selected: List[Dict[str, Any]] = []
        used_budget = 0.0
        for c in candidates:
            gain = c["net_harvest_gain"]
            if used_budget + gain <= loss_budget + 0.01:
                selected.append(c)
                used_budget += gain
            else:
                # Incluir parcialmente si queda hueco
                remaining_budget = loss_budget - used_budget
                if remaining_budget > 1.0:
                    # El lote se vendería parcialmente; simplificamos
                    # señalando cuánto se puede vender sin impuesto
                    c_partial = dict(c)
                    ratio = remaining_budget / gain if gain > 0 else 0.0
                    c_partial["lot_value"] = round(c["lot_value"] * ratio, 2)
                    c_partial["additional_cash"] = round(
                        c["additional_cash"] * ratio, 2,
                    )
                    c_partial["net_harvest_gain"] = round(remaining_budget, 2)
                    c_partial["lot_loss"] = round(c["lot_loss"] * ratio, 2)
                    selected.append(c_partial)
                    used_budget += remaining_budget
                break

        total_harvestable_gain = sum(c["net_harvest_gain"] for c in selected)
        total_additional_cash = sum(c["additional_cash"] for c in selected)

        # Después de cosechar ganancias: las pérdidas del plan se reducen
        net_gain_after = base_net_gain + total_harvestable_gain
        # Impuesto = 0 porque sigue siendo ≤ 0 (o ligeramente > 0 por redondeo)
        tax_after = self.calculate_taxes(max(0.0, net_gain_after))
        # "Ahorro" = impuesto evitado sobre las ganancias cosechadas
        tax_that_gains_would_cost = self.calculate_taxes(total_harvestable_gain)

        return {
            "direction": "harvest_gains",
            "candidates": selected,
            "base_net_gain": round(base_net_gain, 2),
            "base_tax": 0.0,  # plan base ya tiene ganancia ≤ 0 → impuesto = 0
            "total_harvestable_loss": round(total_harvestable_gain, 2),
            "net_gain_after_harvest": round(net_gain_after, 2),
            "tax_after_harvest": round(tax_after, 2),
            "tax_savings": round(tax_that_gains_would_cost, 2),
            "additional_cash": round(total_additional_cash, 2),
        }

    @staticmethod
    def _empty_harvesting(
        base_net_gain: float, direction: str = "none",
    ) -> Dict[str, Any]:
        return {
            "direction": direction,
            "candidates": [],
            "base_net_gain": round(base_net_gain, 2),
            "base_tax": 0.0,
            "total_harvestable_loss": 0.0,
            "net_gain_after_harvest": round(base_net_gain, 2),
            "tax_after_harvest": 0.0,
            "tax_savings": 0.0,
            "additional_cash": 0.0,
        }

    # ------------------------------------------------------------------
    # Cartera resultante tras las operaciones
    # ------------------------------------------------------------------

    def _portfolio_after(
        self,
        lots_by_isin: Dict[str, List[Dict]],
        traspasos: List[Dict],
        reembolsos: List[Dict],
        destination: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """
        Calcula la composición de cartera estimada tras ejecutar el plan
        (traspasos + reembolso en efectivo).

        Returns:
            Lista de dicts por fondo: isin, nombre, valor_antes, valor_despues,
            cambio_valor, participaciones_antes, participaciones_despues,
            es_destino, operacion ("traspaso_out" | "reembolso" | "sin_cambio" | "destino").
        """
        # Valor actual por fondo
        valor_por_isin: Dict[str, float] = {}
        partic_por_isin: Dict[str, float] = {}
        nombre_por_isin: Dict[str, str] = {}

        for isin, lotes in lots_by_isin.items():
            price = self.current_prices.get(isin, 0.0)
            total_partic = sum(l["Participaciones_Restantes"] for l in lotes)
            valor_por_isin[isin] = round(total_partic * price, 2)
            partic_por_isin[isin] = total_partic
            nombre_por_isin[isin] = lotes[0].get("Fondo", isin) if lotes else isin

        # Importes a restar por fondo
        restar_traspaso: Dict[str, float] = defaultdict(float)
        for t in traspasos:
            restar_traspaso[t["ISIN"]] += t["Importe_Traspasado"]

        restar_reembolso: Dict[str, float] = defaultdict(float)
        for r in reembolsos:
            restar_reembolso[r["ISIN"]] += r["Importe"]

        # Importe total que llega al destino
        importe_destino = sum(t["Importe_Traspasado"] for t in traspasos)
        dest_isin = destination.get("isin", "")
        dest_nombre = destination.get("nombre", dest_isin)

        # Construir resultado
        all_isins = set(valor_por_isin) | {dest_isin}
        result = []
        for isin in all_isins:
            antes = valor_por_isin.get(isin, 0.0)
            partic_antes = partic_por_isin.get(isin, 0.0)
            nombre = nombre_por_isin.get(isin, dest_nombre if isin == dest_isin else isin)

            # Calcular cambios
            delta = 0.0
            operacion: str = "sin_cambio"

            if isin == dest_isin:
                delta += importe_destino
                # Si ya estaba en cartera y recibe traspasos
                operacion = "destino"

            if isin in restar_traspaso:
                delta -= restar_traspaso[isin]
                operacion = "traspaso_out" if isin not in restar_reembolso else "traspaso_out+reembolso"

            if isin in restar_reembolso:
                delta -= restar_reembolso[isin]
                operacion = "reembolso" if isin not in restar_traspaso else operacion

            despues = max(0.0, round(antes + delta, 2))

            # Participaciones estimadas despues (precio actual)
            price = self.current_prices.get(isin, 0.0)
            partic_despues: Optional[float] = None
            if price > 0:
                partic_despues = round(despues / price, 6)

            result.append({
                "isin": isin,
                "nombre": nombre,
                "valor_antes": antes,
                "valor_despues": despues,
                "cambio_valor": round(delta, 2),
                "participaciones_antes": round(partic_antes, 6),
                "participaciones_despues": partic_despues,
                "es_destino": isin == dest_isin,
                "operacion": operacion,
            })

        # Ordenar: destino primero, luego por valor descendente
        result.sort(key=lambda x: (-x["es_destino"], -x["valor_despues"]))
        return result

    # ------------------------------------------------------------------
    # optimize_withdrawal — FIFO multi-fondo (sin traspasos)
    # ------------------------------------------------------------------

    def optimize_withdrawal(self, target_amount: float) -> Dict[str, Any]:
        """
        Plan de retirada óptimo sin traspasos: elige el fondo con el
        lote FIFO de menor plusvalía relativa en cada paso.
        """
        self._fetch_current_prices()

        lots_by_isin: Dict[str, List[Dict]] = defaultdict(list)
        for lot in self.portfolio.get_open_lots():
            lots_by_isin[lot["ISIN"]].append(lot.copy())
        for isin in lots_by_isin:
            lots_by_isin[isin].sort(key=lambda x: x["Fecha"])

        result = self._direct_fifo_plan(lots_by_isin, target_amount)
        # Rename key for backwards compat with existing endpoint
        withdrawal_plan = []
        for s in result["steps"]:
            withdrawal_plan.append({
                "ISIN": s["ISIN"],
                "Fondo": s["Fondo"],
                "Fecha_Compra": s["Fecha_Compra"],
                "Participaciones_Vendidas": s["Participaciones"],
                "Importe_Retirado": s["Importe"],
                "Ganancia_Patrimonial": s["Ganancia_Patrimonial"],
                "es_etf": s.get("es_etf", False),
            })

        total_capital_gain = result["total_gain"]
        estimated_tax = self.calculate_taxes(total_capital_gain)
        remaining = max(0.0, target_amount - sum(s["Importe_Retirado"] for s in withdrawal_plan))

        return {
            "target_amount": target_amount,
            "withdrawn_amount": round(target_amount - remaining, 2),
            "total_capital_gain": round(total_capital_gain, 2),
            "estimated_tax": round(estimated_tax, 2),
            "net_amount": round((target_amount - remaining) - estimated_tax, 2),
            "plan": withdrawal_plan,
        }

    # ------------------------------------------------------------------
    # Helper
    # ------------------------------------------------------------------

    @staticmethod
    def _empty_result(target_amount: float, nota: str) -> Dict[str, Any]:
        empty_esc = {"ganancia_patrimonial": 0.0, "impuesto": 0.0,
                     "neto_recibido": 0.0, "detalle": []}
        return {
            "target_amount": target_amount,
            "total_portfolio_value": 0.0,
            "escenario_directo": empty_esc,
            "escenario_optimizado": empty_esc,
            "ahorro_fiscal": 0.0,
            "ahorro_fiscal_pct": 0.0,
            "plan_traspasos": [],
            "plan_reembolso": [],
            "importe_traspasado": 0.0,
            "plusvalia_diferida": 0.0,
            "fondos_afectados": [],
            "destination_fund": {
                "isin": _FALLBACK_INDEX_FUNDS[0]["isin"],
                "nombre": _FALLBACK_INDEX_FUNDS[0]["nombre"],
                "tipo": "new_suggestion",
                "is_index": True,
                "motivo": _FALLBACK_INDEX_FUNDS[0]["motivo"],
            },
            "destination_alternatives": [
                f for f in _FALLBACK_INDEX_FUNDS if f["isin"] != _FALLBACK_INDEX_FUNDS[0]["isin"]
            ],
            "non_traspasable_isins": [],
            "portfolio_after": [],
            "loss_harvesting": {
                "candidates": [],
                "base_net_gain": 0.0,
                "base_tax": 0.0,
                "total_harvestable_loss": 0.0,
                "net_gain_after_harvest": 0.0,
                "tax_after_harvest": 0.0,
                "tax_savings": 0.0,
                "additional_cash": 0.0,
            },
            "notas": nota,
        }




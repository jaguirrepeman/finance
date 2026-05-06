"""
tax_calculator.py — Optimizador fiscal para retiradas de fondos.

Implementa el algoritmo de retirada óptima:
  1. Ordena lotes abiertos por ganancia patrimonial (menor primero).
  2. Vende del lote con menor plusvalía para minimizar impuestos.
  3. Calcula impuestos según tramos del ahorro España 2024:
     - 19% hasta 6.000€
     - 21% de 6.000 a 50.000€
     - 23% de 50.000 a 200.000€
     - 27% de 200.000 a 300.000€
     - 28% más de 300.000€
"""

import logging
from typing import Any, Dict, Optional

import pandas as pd

from .core_portfolio import Portfolio

logger = logging.getLogger(__name__)


class TaxOptimizer:
    def __init__(self, portfolio: Portfolio, prices: Optional[Dict[str, float]] = None):
        """
        Args:
            portfolio: Portfolio con posiciones y lotes abiertos.
            prices: dict {ISIN: precio_actual} pre-obtenidos.
                    Si no se pasan, se obtienen via Fund (lento).
        """
        self.portfolio = portfolio
        self.current_prices: Dict[str, float] = dict(prices) if prices else {}
        
    def _fetch_current_prices(self):
        """Obtiene precios actuales para ISINs que no los tienen.

        Usa CompositeAsyncProvider (via sync wrapper) para obtener NAVs.
        """
        missing = [
            isin for isin in self.portfolio.positions
            if isin not in self.current_prices or self.current_prices[isin] == 0
        ]
        if not missing:
            return

        try:
            import asyncio
            import nest_asyncio
            nest_asyncio.apply()

            from .data_providers import CompositeAsyncProvider
            from .cache_store import CacheStore

            async def _fetch_navs():
                provider = CompositeAsyncProvider(cache=CacheStore())
                for isin in missing:
                    try:
                        price = await provider.get_nav(isin)
                        if price and price > 0:
                            self.current_prices[isin] = price
                        else:
                            self.current_prices.setdefault(isin, 0.0)
                    except Exception as exc:
                        logger.warning("Provider NAV(%s) failed: %s", isin, exc)
                        self.current_prices.setdefault(isin, 0.0)

            loop = asyncio.get_event_loop()
            loop.run_until_complete(_fetch_navs())
        except Exception as e:
            logger.warning("_fetch_current_prices failed: %s", e)
            for isin in missing:
                self.current_prices.setdefault(isin, 0.0)
            
    def calculate_taxes(self, capital_gain: float) -> float:
        """
        Calcula los impuestos sobre la ganancia patrimonial según tramos del ahorro España 2024.
        """
        if capital_gain <= 0:
            return 0.0
            
        tax = 0.0
        remaining = capital_gain
        
        # Tramos: 19% hasta 6k, 21% hasta 50k, 23% hasta 200k, 27% hasta 300k, 28% más de 300k
        tramos = [
            (6000, 0.19),
            (44000, 0.21),
            (150000, 0.23),
            (100000, 0.27),
            (float('inf'), 0.28)
        ]
        
        for limite, tipo in tramos:
            if remaining <= 0:
                break
            aplicable = min(remaining, limite)
            tax += aplicable * tipo
            remaining -= aplicable
            
        return tax

    def optimize_withdrawal(self, target_amount: float) -> Dict[str, Any]:
        """
        Calcula el plan de retirada óptimo para minimizar impuestos.
        """
        self._fetch_current_prices()
        
        open_lots = [lot.copy() for lot in self.portfolio.get_open_lots()]
        
        # Agrupar lotes por ISIN
        lots_by_isin = {}
        for lot in open_lots:
            isin = lot['ISIN']
            if isin not in lots_by_isin:
                lots_by_isin[isin] = []
            lots_by_isin[isin].append(lot)
            
        # Asegurar orden cronológico
        for isin in lots_by_isin:
            lots_by_isin[isin] = sorted(lots_by_isin[isin], key=lambda x: x['Fecha'])

        remaining_to_withdraw = target_amount
        withdrawal_plan = []
        total_capital_gain = 0.0
        
        while remaining_to_withdraw > 0.01:
            best_isin = None
            best_gain_pct = float('inf')
            
            # Buscar el ISIN con el lote más antiguo menos rentable
            for isin, lots in lots_by_isin.items():
                if not lots:
                    continue
                
                oldest_lot = lots[0]
                current_price = self.current_prices.get(isin, 0)
                if current_price == 0:
                    continue # Skip if we don't have a price
                    
                buy_price = oldest_lot['Precio_Compra_Unitario']
                # Rentabilidad = (Precio Actual - Precio Compra) / Precio Compra
                gain_pct = (current_price - buy_price) / buy_price if buy_price > 0 else float('inf')
                
                if gain_pct < best_gain_pct:
                    best_gain_pct = gain_pct
                    best_isin = isin
                    
            if not best_isin:
                logger.warning("No hay suficientes fondos con precio conocido para alcanzar el objetivo.")
                break
                
            # Vender del best_isin
            lot_to_sell = lots_by_isin[best_isin][0]
            current_price = self.current_prices[best_isin]
            buy_price = lot_to_sell['Precio_Compra_Unitario']
            
            # ¿Cuánto vale este lote actualmente?
            lot_current_value = lot_to_sell['Participaciones_Restantes'] * current_price
            
            if lot_current_value <= remaining_to_withdraw:
                # Vender el lote completo
                amount_sold = lot_current_value
                units_sold = lot_to_sell['Participaciones_Restantes']
                gain = (current_price - buy_price) * units_sold
                
                withdrawal_plan.append({
                    'ISIN': best_isin,
                    'Fondo': lot_to_sell['Fondo'],
                    'Fecha_Compra': lot_to_sell['Fecha'],
                    'Participaciones_Vendidas': units_sold,
                    'Importe_Retirado': amount_sold,
                    'Ganancia_Patrimonial': gain
                })
                
                remaining_to_withdraw -= amount_sold
                total_capital_gain += gain
                lots_by_isin[best_isin].pop(0) # Remover el lote ya que se vendió completo
            else:
                # Vender parte del lote
                amount_sold = remaining_to_withdraw
                units_sold = amount_sold / current_price
                gain = (current_price - buy_price) * units_sold
                
                withdrawal_plan.append({
                    'ISIN': best_isin,
                    'Fondo': lot_to_sell['Fondo'],
                    'Fecha_Compra': lot_to_sell['Fecha'],
                    'Participaciones_Vendidas': units_sold,
                    'Importe_Retirado': amount_sold,
                    'Ganancia_Patrimonial': gain
                })
                
                lot_to_sell['Participaciones_Restantes'] -= units_sold
                remaining_to_withdraw = 0
                total_capital_gain += gain
                
        estimated_tax = self.calculate_taxes(total_capital_gain)
        
        return {
            'target_amount': target_amount,
            'withdrawn_amount': target_amount - remaining_to_withdraw,
            'total_capital_gain': total_capital_gain,
            'estimated_tax': estimated_tax,
            'net_amount': (target_amount - remaining_to_withdraw) - estimated_tax,
            'plan': withdrawal_plan
        }

import pandas as pd
from typing import Dict, List, Any
from .core_portfolio import Portfolio
from .functions_fund import Fund

class TaxOptimizer:
    def __init__(self, portfolio: Portfolio):
        self.portfolio = portfolio
        self.current_prices = {}
        
    def _fetch_current_prices(self):
        """Fetches current prices for all ISINs with open positions using Light Mode."""
        positions = self.portfolio.positions
        for isin in positions.keys():
            fund = Fund(isin=isin, mode="light", use_cache=True)
            df = fund.fund_data
            precio = 0.0
            if df is not None and not df.empty:
                # get price
                if 'data' in df.columns:
                    data_col = df['data'].iloc[0]
                    if isinstance(data_col, pd.DataFrame) and 'precio_actual' in data_col.columns:
                        precio = float(data_col['precio_actual'].iloc[0])
            self.current_prices[isin] = precio
            
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
                print("No hay suficientes fondos con precio conocido para alcanzar el objetivo.")
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

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import matplotlib.pyplot as plt
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import seaborn as sns
from typing import Dict, List, Tuple, Optional
import re
import time
import warnings
warnings.filterwarnings('ignore')
from functions_fund import Fund

def compare_portfolios(portfolio1, portfolio2, names=("Cartera 1", "Cartera 2"), years=3):
    """
    Compara dos carteras y devuelve un DataFrame con tres filas:
    - Agregado del primero
    - Agregado del segundo
    - Diferencia (segundo - primero) en columnas numéricas
    """
    import pandas as pd
    def get_summary(port):
        # Si es Portfolio, asegurarse de que las rentabilidades están calculadas
        if hasattr(port, "summarize_portfolio"):
            if hasattr(port, "portfolio_df") and (
                "rentabilidad_total" not in port.portfolio_df.columns or port.portfolio_df["rentabilidad_total"].isnull().all()
            ):
                port._initialize_portfolio()
            return port.summarize_portfolio(show_all=False)
        elif isinstance(port, pd.DataFrame):
            return port.copy()
        elif isinstance(port, dict):
            return pd.DataFrame(port)
        else:
            raise ValueError("Formato de portfolio no soportado")
    # Obtener agregados
    agg1 = get_summary(portfolio1)
    agg2 = get_summary(portfolio2)
    # Mantener solo la primera fila si hay varias
    if len(agg1) > 1:
        agg1 = agg1.iloc[[0]]
    if len(agg2) > 1:
        agg2 = agg2.iloc[[0]]
    # Asegurar que las columnas son iguales y únicas
    common_cols = list(dict.fromkeys(list(agg1.columns) + list(agg2.columns)))
    agg1 = agg1.reindex(columns=common_cols)
    agg2 = agg2.reindex(columns=common_cols)
    # Detectar columnas donde ambos portfolios son NA o están en blanco
    def is_na_or_blank(s):
        return s.isna() | (s.astype(str).str.strip() == "")
    mask1 = is_na_or_blank(agg1.iloc[0])
    mask2 = is_na_or_blank(agg2.iloc[0])
    drop_cols = [col for col in common_cols if mask1[col] and mask2[col]]
    # Calcular diferencia solo en columnas numéricas
    numeric_cols = [c for c in common_cols if pd.api.types.is_numeric_dtype(agg1[c]) and c in agg2.columns]
    diff_row = agg2[numeric_cols].values[0] - agg1[numeric_cols].values[0]
    diff_df = pd.DataFrame([diff_row], columns=numeric_cols)
    # Para columnas no numéricas, dejar en blanco
    for col in common_cols:
        if col not in numeric_cols:
            diff_df[col] = ""
    # Reordenar columnas igual que los agregados
    diff_df = diff_df[common_cols]
    # Asignar nombres de fila
    agg1.index = [names[0]]
    agg2.index = [names[1]]
    diff_df.index = ["Diferencia"]
    # Concatenar y eliminar columnas NA/blanco en ambos
    result = pd.concat([agg1, agg2, diff_df], axis=0)
    result = result.drop(columns=drop_cols)
    result = result.reset_index().rename(columns={"index": "Portfolio"})
    return result

# Método de conveniencia en Portfolio
class Portfolio:
    def __init__(self, portfolio_df, default_years=3, use_cache=True):
        """
        Inicializa el analizador de rendimiento de fondos.
        Args:
            portfolio_df: DataFrame con columnas 'Nombre', 'ISIN', 'Inversion' y opcionalmente 'Fecha'
            default_years: Número de años por defecto para análisis sin fechas específicas
            use_cache: Si se debe usar caché al consultar datos de fondos
        """
        self.portfolio_df = portfolio_df.copy() if portfolio_df is not None else None
        self.default_years = default_years
        self.use_cache = use_cache
        self.processed_funds_cache = {}
        self.funds_data = {}
        self.funds = {}
        if portfolio_df is not None:
            self._initialize_portfolio()

    def _initialize_portfolio(self):
        required_columns = ['Nombre', 'ISIN', 'Inversion']
        for col in required_columns:
            if col not in self.portfolio_df.columns:
                raise ValueError(f"La columna '{col}' es requerida en el DataFrame del portfolio")
        if 'Fecha' not in self.portfolio_df.columns:
            self.portfolio_df = self.portfolio_df.copy()
            default_date = (datetime.now() - timedelta(days=self.default_years*365)).strftime('%Y-%m-%d')
            self.portfolio_df['Fecha'] = default_date
        # funds_df: agregación por fondo para pesos
        self.funds_df = self.portfolio_df.groupby(['Nombre', 'ISIN'], as_index=False)['Inversion'].sum()
        self.total_amount = self.funds_df['Inversion'].sum()
        self.funds_df['Peso'] = self.funds_df['Inversion'] / self.total_amount
        # Mapear pesos a cada movimiento
        self.portfolio_df = pd.merge(
            self.portfolio_df,
            self.funds_df[['ISIN', 'Peso']],
            on='ISIN',
            how='left'
        )
        # Recopilar datos completos
        self.portfolio_df = self._get_portfolio_data()
        # Eliminar columna duplicada 'isin' si existe junto con 'ISIN'
        if 'ISIN' in self.portfolio_df.columns and 'isin' in self.portfolio_df.columns:
            self.portfolio_df = self.portfolio_df.drop(columns=['isin'])
        return self.portfolio_df

    def _get_portfolio_data(self) -> pd.DataFrame:
        """
        Recopila todos los datos necesarios para cada movimiento en el portfolio.
        Devuelve un DataFrame con las columnas originales + resultados calculados.
        """
        if self.portfolio_df is None or self.portfolio_df.empty:
            raise ValueError("No hay datos de fondos para analizar")
        result_rows = []
        for idx, row in self.portfolio_df.iterrows():
            fund_name = row['Nombre']
            isin = row['ISIN']
            investment = row['Inversion']
            weight = row['Peso']
            fecha = row['Fecha']
            # Procesar fondo (solo una vez por ISIN)
            if isin not in self.funds:
                # Solo inicializar el objeto Fund, no llamar a _process_fund explícitamente
                self.funds[isin] = Fund(isin=isin, name=fund_name, use_cache=self.use_cache)
            fund_obj = self.funds[isin]
            # Usar el atributo fund_data si ya está inicializado, si no llamar a _process_fund
            fund_data = fund_obj.fund_data if fund_obj.fund_data is not None else fund_obj._process_fund()
            historical_data = fund_data.get('historical_data', None)[0]
            fund_data_df = fund_data.get('data', pd.DataFrame())[0]
            # Convertir todos los valores Series de fund_data_df a escalares
            fund_data_dict = {}
            for k, v in fund_data_df.items():
                if isinstance(v, pd.Series):
                    if len(v) == 1:
                        fund_data_dict[k] = v.iloc[0]
                    else:
                        fund_data_dict[k] = v.tolist()
                else:
                    fund_data_dict[k] = v
            # Calcular rentabilidad para este movimiento
            movimientos = self.portfolio_df[(self.portfolio_df['ISIN'] == isin)].copy()
            if historical_data is not None and not historical_data.empty:
                perf = self.calculate_performance_by_movements(historical_data, movimientos)
                movimiento_actual = movimientos[(movimientos['Fecha'] == fecha) & (movimientos['Inversion'] == investment)]
                if not movimiento_actual.empty:
                    mov_perf = [m for m in perf['movements'] if m['date'] == pd.to_datetime(fecha).strftime('%Y-%m-%d') and m['investment'] == investment]
                    perf_actual = mov_perf[0] if mov_perf else None
                else:
                    perf_actual = None
                # Construir la fila resultado como dict
                result_row = {col: row[col] for col in self.portfolio_df.columns}
                result_row.update(fund_data_dict)
                result_row['valor_actual'] = perf_actual['current_value'] if perf_actual else investment
                result_row['rentabilidad_total'] = perf_actual['total_return_pct'] if perf_actual else 0
                result_row['rentabilidad_anualizada'] = perf_actual['annual_return_pct'] if perf_actual else 0
                result_row['volatilidad_anual'] = self.calculate_volatility(historical_data)
                result_row['max_drawdown'] = self.calculate_max_drawdown(historical_data)
                result_row['precio_actual'] = historical_data['Close'].iloc[-1]
                result_row['fuente_datos'] = historical_data.attrs.get('Source', 'Yahoo Finance') if hasattr(historical_data, 'attrs') else 'Yahoo Finance'
            else:
                result_row = {col: row[col] for col in self.portfolio_df.columns}
                result_row.update(fund_data_dict)
                result_row['valor_actual'] = investment
                result_row['rentabilidad_total'] = 0
                result_row['rentabilidad_anualizada'] = 0
                result_row['volatilidad_anual'] = None
                result_row['max_drawdown'] = None
                result_row['precio_actual'] = None
                result_row['fuente_datos'] = 'Ninguna (sin datos históricos)'
            result_rows.append(result_row)
        # Convertir lista de dicts a DataFrame
        portfolio_df = pd.DataFrame(result_rows)
        # Mantener las columnas originales primero
        orig_cols = ['Nombre', 'ISIN', 'Inversion', 'Fecha', 'Peso']
        extra_cols = [c for c in portfolio_df.columns if c not in orig_cols]
        cols = orig_cols + extra_cols
        portfolio_df = portfolio_df[cols]
        return portfolio_df

    def calculate_volatility(self, data: pd.DataFrame) -> float:
        """Calcula la volatilidad anualizada"""
        daily_returns = data['Close'].pct_change().dropna()
        return round(daily_returns.std() * np.sqrt(252) * 100, 2)
    
    def calculate_max_drawdown(self, data: pd.DataFrame) -> float:
        """Calcula el máximo drawdown"""
        prices = data['Close']
        peak = prices.cummax()
        drawdown = (prices / peak - 1) * 100
        return round(drawdown.min(), 2)


    #### ANALIZAR FONDOS ####

    def calculate_performance_by_movements(self, data: pd.DataFrame, movements: pd.DataFrame) -> dict:
        """
        Calcula las rentabilidades para cada movimiento según su fecha de compra
        
        Args:
            data: DataFrame con los datos históricos del fondo
            movements: DataFrame con los movimientos (fecha y cantidad)
                
        Returns:
            dict: Diccionario con las rentabilidades calculadas
        """
        if data is None or data.empty or movements is None or movements.empty:
            return {
                'total_investment': 0,
                'current_value': 0,
                'total_return_pct': 0,
                'annual_return_pct': 0,
                'movements': []
            }
        
        # Crear una copia y convertir todas las fechas a tz-naive
        data_copy = data.copy()
        if not pd.api.types.is_datetime64_any_dtype(data_copy.index):
            data_copy.index = pd.to_datetime(data_copy.index)
            
        data_copy.index = pd.DatetimeIndex([pd.Timestamp(dt).tz_localize(None) for dt in data_copy.index])
        
        # Asegurar que las fechas de movimientos están en formato datetime
        movements = movements.copy()
        if 'Fecha' in movements.columns and not pd.api.types.is_datetime64_any_dtype(movements['Fecha']):
            movements['Fecha'] = pd.to_datetime(movements['Fecha'])
        
        # Precio actual del fondo
        current_price = data_copy['Close'].iloc[-1]
        current_date = data_copy.index[-1]
        
        # Resultados para almacenar los cálculos
        total_investment = movements['Inversion'].sum()
        current_value = 0
        movement_results = []
        
        # Calcular rentabilidades para cada movimiento
        for _, movement in movements.iterrows():
            investment = movement['Inversion']
            purchase_date_str = movement['Fecha']
            
            # Convertir la fecha a Timestamp sin timezone
            if isinstance(purchase_date_str, str):
                purchase_date = pd.Timestamp(purchase_date_str).tz_localize(None)
            else:
                purchase_date = pd.Timestamp(purchase_date_str).tz_localize(None)
            
            # Buscar el precio más cercano a la fecha de compra
            if purchase_date in data_copy.index:
                purchase_price = data_copy.loc[purchase_date, 'Close']
                if isinstance(purchase_price, pd.Series):
                    purchase_price = purchase_price.iloc[0]
            else:
                # Buscar la fecha más cercana antes de la fecha de compra
                available_dates = data_copy.index[data_copy.index <= purchase_date]
                if len(available_dates) > 0:
                    closest_date = available_dates[-1]
                    purchase_price = data_copy.loc[closest_date, 'Close']
                else:
                    # Si no hay fechas anteriores, usar la primera disponible
                    closest_date = data_copy.index[0]
                    purchase_price = data_copy.loc[closest_date, 'Close']
                    print(f"  ⚠️ Fecha de compra {purchase_date} es anterior a los datos disponibles. Usando {closest_date.strftime('%Y-%m-%d')}")
                
            # Calcular tiempo transcurrido en años
            years_held = (current_date - purchase_date).days / 365.25
            
            # Calcular rentabilidad de este movimiento
            movement_value = investment * (current_price / purchase_price)
            total_return_pct = (movement_value / investment - 1) * 100
            
            # Calcular rentabilidad anualizada
            if years_held > 0:
                annual_return_pct = (((current_price / purchase_price) ** (1 / years_held)) - 1) * 100
            else:
                annual_return_pct = 0
            
            # Guardar resultados de este movimiento
            movement_result = {
                'date': purchase_date.strftime('%Y-%m-%d') if hasattr(purchase_date, 'strftime') else str(purchase_date),
                'investment': investment,
                'purchase_price': purchase_price,
                'current_price': current_price,
                'current_value': movement_value,
                'total_return_pct': total_return_pct,
                'annual_return_pct': annual_return_pct,
                'years_held': years_held
            }
            
            movement_results.append(movement_result)
            current_value += movement_value
        
        # Calcular rentabilidad total y anualizada
        total_return_pct = (current_value / total_investment - 1) * 100
        
        # Calcular rentabilidad anualizada ponderada
        weighted_annual_return = 0
        for movement in movement_results:
            weight = movement['investment'] / total_investment
            weighted_annual_return += movement['annual_return_pct'] * weight
        
        return {
            'total_investment': total_investment,
            'current_value': current_value,            'total_return_pct': total_return_pct,
            'annual_return_pct': weighted_annual_return,
            'movements': movement_results
        }
        
    def compare_to(self, other, names=("Cartera 1", "Cartera 2"), years=None):
        """
        Compara este portfolio con otro (Portfolio, DataFrame, o dict).
        Args:
            other: Portfolio, DataFrame, o dict
            names: Nombres para identificar cada cartera
            years: Número de años para el análisis histórico
        Returns:
            dict: Resultados de la comparación
        """
        return compare_portfolios(self, other, names=names, years=years or self.default_years)
        
    def analyze_portfolio(self, years=None):
        """
        Realiza un análisis completo de la cartera (rentabilidades y composición).
        
        Args:
            years: Número de años para el análisis histórico (si no hay fechas específicas)
                    
        Returns:
            dict: Diccionario con todos los resultados del análisis
        """
        if years is not None:
            self.default_years = years
            
        if self.portfolio_df is None:
            self._initialize_portfolio()
        
        # Análisis de rentabilidad histórica
        performance_results = self.analyze_portfolio_returns()
        
        # Análisis de composición
        composition_results = self.analyze_portfolio_composition()
          # Combinar resultados
        combined_results = {
            'performance': performance_results,
            'composition': composition_results
        }
        
        return combined_results
        
    def analyze_portfolio_returns(self, portfolio_df=None, years=None):
        """
        Analiza las rentabilidades de una cartera de fondos.
        
        Args:
            portfolio_df: DataFrame o diccionario con información de fondos (opcional)
                          Incluye columnas 'Nombre', 'ISIN', 'Inversion' y opcionalmente 'Fecha'
            years: Número de años para el análisis cuando no hay fechas específicas
                    
        Returns:
            DataFrame: Fondos individuales + fila TOTAL agregada
        """
        if years is not None:
            self.default_years = years
        if portfolio_df is None:
            if self.portfolio_df is None:
                self._initialize_portfolio()
            portfolio_df = self.portfolio_df.copy()
        if isinstance(portfolio_df, dict):
            portfolio_df = pd.DataFrame(portfolio_df)
        if portfolio_df is not None and not portfolio_df.empty and 'Fecha' not in portfolio_df.columns:
            portfolio_df = portfolio_df.copy()
            default_date = (datetime.now() - timedelta(days=self.default_years*365)).strftime('%Y-%m-%d')
            portfolio_df['Fecha'] = default_date
        if portfolio_df is None or portfolio_df.empty:
            print("❌ No hay datos de fondos para analizar")
            return pd.DataFrame()
        # Definir las columnas que queremos agregar
        agg_dict = {
            'Inversion': 'sum',
            'valor_actual': 'sum',
            'Peso': 'first',
            'rentabilidad_total': 'mean',
            'rentabilidad_anualizada': 'mean',
            'volatilidad_anual': 'mean',
            'max_drawdown': 'mean',
            'precio_actual': 'first',
        }
        # Filtrar solo las columnas que existen en el DataFrame
        agg_dict = {k: v for k, v in agg_dict.items() if k in portfolio_df.columns}
        agg_df = portfolio_df.groupby(['ISIN', 'Nombre'], as_index=False).agg(agg_dict)
        # Calcular fila TOTAL
        total_row = {
            'ISIN': 'TOTAL',
            'Nombre': 'TOTAL',
            'Inversion': agg_df['Inversion'].sum() if 'Inversion' in agg_df.columns else None,
            'valor_actual': agg_df['valor_actual'].sum() if 'valor_actual' in agg_df.columns else None,
            'Peso': 1.0,
            'rentabilidad_total': ((agg_df['valor_actual'].sum() / agg_df['Inversion'].sum()) - 1) * 100 if 'valor_actual' in agg_df.columns and 'Inversion' in agg_df.columns and agg_df['Inversion'].sum() > 0 else None,
            'rentabilidad_anualizada': (agg_df['rentabilidad_anualizada'] * agg_df['Peso']).sum() if 'rentabilidad_anualizada' in agg_df.columns and 'Peso' in agg_df.columns else None,
            'volatilidad_anual': (agg_df['volatilidad_anual'] * agg_df['Peso']).sum() if 'volatilidad_anual' in agg_df.columns and 'Peso' in agg_df.columns else None,
            'max_drawdown': (agg_df['max_drawdown'] * agg_df['Peso']).sum() if 'max_drawdown' in agg_df.columns and 'Peso' in agg_df.columns else None,
            'precio_actual': None
        }
        # Concatenar fondos + fila TOTAL
        result_df = pd.concat([agg_df, pd.DataFrame([total_row])], ignore_index=True)
        return result_df

    def analyze_portfolio_composition(self, portfolio_df=None):
        """
        Analiza la composición y características de una cartera de fondos.
        
        Args:
            portfolio_df (pd.DataFrame, optional): DataFrame con la información completa de los fondos.
                Si es None, utiliza self.portfolio_df
                
        Returns:
            dict: Resultados del análisis con la siguiente estructura:
                - summary: Resumen general de la cartera
                - asset_allocation: Distribución por tipo de activo (RF/RV/Otros)
                - performance: Métricas de rendimiento por periodo
                - risk: Métricas de riesgo (volatilidad, drawdown)
                - fees: Análisis de comisiones y gastos
                - geographic: Distribución geográfica
                - quality: Análisis de calidad (ratings Morningstar)
                - inefficient_funds: Fondos con baja eficiencia (alto coste/bajo rendimiento)
                - figures: Gráficas generadas durante el análisis
        """
        import matplotlib.pyplot as plt
        import seaborn as sns
        import numpy as np

        # Asegurar que tenemos datos de portfolio
        if portfolio_df is None:
            if self.portfolio_df is None:
                self._initialize_portfolio()
            portfolio_df = self.portfolio_df.copy()

        # Validación de entrada
        if portfolio_df.empty:
            print("❌ El DataFrame está vacío. No se puede realizar el análisis.")
            return {}
        
        print(f"\n--- Analizando composición de cartera con {len(portfolio_df)} fondos ---")
        
        # Crear diccionario para almacenar resultados
        analysis = {
            'summary': {},
            'asset_allocation': {},
            'performance': {'by_period': {}, 'top_funds': {}, 'bottom_funds': {}},
            'risk': {'volatility': {}, 'drawdown': {'worst_funds': {}}},
            'fees': {'highest_funds': {}},
            'geographic': {},
            'quality': {},
            'inefficient_funds': [],
            'figures': {}
        }
        
        # 1. RESUMEN GENERAL DE LA CARTERA
        print("\n📊 RESUMEN GENERAL DE LA CARTERA")
        print("=" * 50)
        
        total_invertido = portfolio_df['Inversion'].sum()
        valor_actual = portfolio_df['valor_actual'].sum() if 'valor_actual' in portfolio_df.columns else total_invertido
        rentabilidad_total = ((valor_actual / total_invertido) - 1) * 100 if total_invertido > 0 else 0
        
        analysis['summary'] = {
            'total_invertido': total_invertido,
            'valor_actual': valor_actual,
            'rentabilidad_total': rentabilidad_total
        }
        
        print(f"Inversión total: {total_invertido:,.2f}€")
        print(f"Valor actual: {valor_actual:,.2f}€")
        print(f"Rentabilidad total: {rentabilidad_total:.2f}%")
        
        # 2. ANÁLISIS DE COMPOSICIÓN POR TIPO DE ACTIVO (RF/RV)
        print("\n📈 DISTRIBUCIÓN POR TIPO DE ACTIVO")
        print("=" * 50)
        
        # Verificar si tenemos columnas de distribución de activos
        asset_columns = {
            'Renta Variable': ['equity', 'renta_variable', 'RV', 'perc_Equity'],
            'Renta Fija': ['fixed_income', 'bond', 'renta_fija', 'RF', 'perc_Bond'],
            'Liquidez': ['cash', 'liquidez'],
            'Otros': ['other', 'alternative', 'otros', 'perc_Other']
        }
        
        # Intentar determinar el tipo de activo a partir de diferentes columnas
        asset_allocation = {k: 0 for k in asset_columns.keys()}
        total_weight = 0
        
        # Método 1: Usar columnas directas de distribución si existen
        asset_distribution_available = False
        
        for asset_type, columns in asset_columns.items():
            for col in columns:
                if col in portfolio_df.columns:
                    asset_allocation[asset_type] += (portfolio_df[col] * portfolio_df['peso']).sum()
                    asset_distribution_available = True
        
        # Método 2: Si no hay columnas directas, intentar inferir del tipo/categoría
        if not asset_distribution_available:
            for _, fund in portfolio_df.iterrows():
                fund_type = None
                peso = fund['Peso']  # <-- corregido a 'Peso'
                total_weight += peso
                # Intentar determinar tipo de activo por nombre de categoría
                category = fund.get('categoria', '').lower()
                
                if any(kw in category for kw in ['renta variable', 'equity', 'accion']):
                    fund_type = 'Renta Variable'
                elif any(kw in category for kw in ['renta fija', 'bond', 'monetario']):
                    fund_type = 'Renta Fija'
                elif any(kw in category for kw in ['mixto', 'mixed']):
                    # Para fondos mixtos, distribuir según la proporción en el nombre o categoría
                    if '30' in category:
                        asset_allocation['Renta Variable'] += peso * 0.3
                        asset_allocation['Renta Fija'] += peso * 0.7
                        continue
                    elif '50' in category:
                        asset_allocation['Renta Variable'] += peso * 0.5
                        asset_allocation['Renta Fija'] += peso * 0.5
                        continue
                    elif '70' in category:
                        asset_allocation['Renta Variable'] += peso * 0.7
                        asset_allocation['Renta Fija'] += peso * 0.3
                        continue
                    else:
                        asset_allocation['Renta Variable'] += peso * 0.5
                        asset_allocation['Renta Fija'] += peso * 0.5
                        continue
                
                if fund_type:
                    asset_allocation[fund_type] += peso
                else:
                    asset_allocation['Otros'] += peso
        
        # Normalizar para que sume 1
        if total_weight > 0:
            for key in asset_allocation:
                asset_allocation[key] /= total_weight
        
        # Guardar la asignación en el análisis
        analysis['asset_allocation'] = asset_allocation
        
        # Mostrar la distribución de activos
        print("Distribución por tipo de activo:")
        for asset_type, allocation in asset_allocation.items():
            if allocation > 0:
                print(f"  • {asset_type}: {allocation*100:.2f}%")
        
        # Visualizar la distribución con un gráfico
        try:
            plt.figure(figsize=(10, 6))
            # Filtrar solo valores positivos
            asset_data = {k: v for k, v in asset_allocation.items() if v > 0}
            if asset_data:
                # Crear gráfico de tarta
                plt.pie(
                    list(asset_data.values()), 
                    labels=list(asset_data.keys()),
                    autopct='%1.1f%%', 
                    startangle=90,
                    colors=sns.color_palette('pastel', len(asset_data))
                )
                plt.axis('equal')
                plt.title('Distribución por Tipo de Activo', fontsize=16)
                analysis['figures']['asset_allocation'] = plt.gcf()
                print("✓ Gráfico de distribución por tipo de activo generado")
        except Exception as e:
            print(f"⚠️ Error generando gráfico: {str(e)}")
        
        # 3. ANÁLISIS DE RENDIMIENTO
        print("\n📊 ANÁLISIS DE RENDIMIENTO")
        print("=" * 50)
        
        # 3.1 Rendimientos por periodo
        periods = [1, 3, 5]
        for period in periods:
            col_name = f'rentabilidad_{period}y_anual'
            if col_name in portfolio_df.columns:
                # Filtrar valores no nulos
                valid_data = portfolio_df[~portfolio_df[col_name].isna()]
                if not valid_data.empty:
                    weighted_return = (valid_data[col_name] * valid_data['peso']).sum() / valid_data['peso'].sum()
                    analysis['performance']['by_period'][f'{period}y'] = weighted_return
                    print(f"Rentabilidad media a {period} años: {weighted_return:.2f}%")
        
        # 3.2 Mejores y peores fondos
        best_period = 3  # Periodo por defecto para la comparación
        for period in [3, 1, 5]:
            col_name = f'rentabilidad_{period}y_anual'
            if col_name in portfolio_df.columns and not portfolio_df[col_name].isna().all():
                best_period = period
                break
        
        col_name = f'rentabilidad_{best_period}y_anual'
        if col_name in portfolio_df.columns:
            # Filtrar fondos con datos válidos
            valid_funds = portfolio_df[~portfolio_df[col_name].isna()]
            
            if not valid_funds.empty:
                top_funds = valid_funds.nlargest(3, col_name)
                bottom_funds = valid_funds.nsmallest(3, col_name)
                
                print(f"\nMejores 3 fondos por rendimiento a {best_period} años:")
                for _, fund in top_funds.iterrows():
                    print(f"{fund['Nombre']}: {fund[f'rentabilidad_{best_period}y_anual']:.2f}% ({fund['Peso']*100:.1f}% de la cartera)")
                    analysis['performance']['top_funds'][fund['Nombre']] = {
                        'return': fund[f'rentabilidad_{best_period}y_anual'],
                        'weight': fund['Peso']
                    }
                
                print(f"\nPeores 3 fondos por rendimiento a {best_period} años:")
                for _, fund in bottom_funds.iterrows():
                    print(f"{fund['Nombre']}: {fund[f'rentabilidad_{best_period}y_anual']:.2f}% ({fund['Peso']*100:.1f}% de la cartera)")
                    analysis['performance']['bottom_funds'][fund['Nombre']] = {
                        'return': fund[f'rentabilidad_{best_period}y_anual'],
                        'weight': fund['Peso']
                    }
        
        # 4. ANÁLISIS DE RIESGO
        print("\n⚠️ ANÁLISIS DE RIESGO")
        print("=" * 50)
        
        # 4.1 Volatilidad
        if 'volatilidad_anual' in portfolio_df.columns:
            valid_vol = portfolio_df[~portfolio_df['volatilidad_anual'].isna()]
            if not valid_vol.empty:
                weighted_vol = (valid_vol['volatilidad_anual'] * valid_vol['Peso']).sum()
                analysis['risk']['volatility']['weighted_avg'] = weighted_vol
                print(f"Volatilidad media ponderada: {weighted_vol:.2f}%")
                
                # Categorizar por nivel de volatilidad
                vol_categories = {
                    'Muy baja (< 5%)': (0, 5),
                    'Baja (5-10%)': (5, 10),
                    'Media (10-15%)': (10, 15),
                    'Alta (15-20%)': (15, 20),
                    'Muy alta (> 20%)': (20, float('inf'))
                }
                
                # Calcular peso por categoría
                vol_distribution = {cat: 0 for cat in vol_categories}
                for _, fund in valid_vol.iterrows():
                    for cat, (min_vol, max_vol) in vol_categories.items():
                        if min_vol <= fund['volatilidad_anual'] < max_vol:
                            vol_distribution[cat] += fund['Peso']
                            break
                
                # Mostrar distribución
                print("\nDistribución por nivel de volatilidad:")
                for cat, weight in vol_distribution.items():
                    if weight > 0:
                        print(f"  • {cat}: {weight*100:.1f}%")
                        analysis['risk']['volatility'][cat] = weight
                
                # Visualizar distribución de volatilidad
                plt.figure(figsize=(10, 6))
                cats = [cat for cat, weight in vol_distribution.items() if weight > 0]
                weights = [vol_distribution[cat]*100 for cat in cats]
                
                bars = plt.bar(cats, weights, color=sns.color_palette("YlOrRd", len(cats)))
                for bar in bars:
                    height = bar.get_height()
                    plt.text(bar.get_x() + bar.get_width()/2., height + 0.3,
                            f'{height:.1f}%', ha='center', va='bottom')
                
                plt.title('Distribución de la Cartera por Nivel de Volatilidad', fontsize=16)
                plt.xlabel('Categoría de Volatilidad')
                plt.ylabel('% de la Cartera')
                plt.grid(axis='y', alpha=0.3)
                plt.tight_layout()
                analysis['figures']['volatility_distribution'] = plt.gcf()
        
        # 4.2 Drawdown
        if 'max_drawdown' in portfolio_df.columns:
            weighted_drawdown = (portfolio_df['max_drawdown'] * portfolio_df['Peso']).sum()
            analysis['risk']['drawdown']['weighted_avg'] = weighted_drawdown
            print(f"\nMáximo drawdown medio ponderado: {weighted_drawdown:.2f}%")
            
            # Fondos con mayor drawdown
            top_drawdown = portfolio_df.sort_values('max_drawdown', ascending=True).head(3)
            print("\nFondos con mayor drawdown:")
            for idx, fund in top_drawdown.iterrows():
                print(f"{fund['Nombre']}: {fund['max_drawdown']:.2f}% ({fund['Peso']*100:.1f}% de la cartera)")
                analysis['risk']['drawdown']['worst_funds'][fund['Nombre']] = {
                    'drawdown': fund['max_drawdown'],
                    'weight': fund['Peso']
                }
        
        # 5. ANÁLISIS DE COSTES
        print("\n💰 ANÁLISIS DE COSTES")
        print("=" * 50)
        
        # Comisiones medias ponderadas
        if 'comision_gestion' in portfolio_df.columns:
            try:
                comision_gestion_numeric = pd.to_numeric(portfolio_df['comision_gestion'].str.replace('%', ''), errors='coerce')
                weighted_mgmt_fee = (comision_gestion_numeric * portfolio_df['Peso']).sum()
                analysis['fees']['management'] = weighted_mgmt_fee
                print(f"Comisión de gestión media ponderada: {weighted_mgmt_fee:.2f}%")
            except Exception:
                print("⚠️ No se pudieron analizar las comisiones de gestión")
        
        if 'gastos_corrientes' in portfolio_df.columns:
            try:
                gastos_corrientes_numeric = pd.to_numeric(portfolio_df['gastos_corrientes'].str.replace('%', ''), errors='coerce')
                weighted_ongoing = (gastos_corrientes_numeric * portfolio_df['Peso']).sum()
                analysis['fees']['ongoing'] = weighted_ongoing
                print(f"Gastos corrientes medios ponderados: {weighted_ongoing:.2f}%")
                
                # Fondos con comisiones más altas
                high_fee_funds = portfolio_df.sort_values('gastos_corrientes', ascending=False).head(3)
                print("\nFondos con mayores gastos corrientes:")
                for idx, fund in high_fee_funds.iterrows():
                    print(f"{fund['Nombre']}: {fund['gastos_corrientes']} ({fund['Peso']*100:.1f}% de la cartera)")
                    analysis['fees']['highest_funds'][fund['Nombre']] = {
                        'fees': fund['gastos_corrientes'],
                        'weight': fund['Peso']
                    }
                
                # Gráfico de gastos por fondo
                plt.figure(figsize=(12, 8))
                sns.barplot(x='gastos_corrientes', y='Nombre', data=portfolio_df.sort_values('gastos_corrientes', ascending=False))
                plt.title('Gastos Corrientes por Fondo', fontsize=16)
                plt.xlabel('Gastos Corrientes (%)')
                plt.ylabel('Fondo')
                plt.tight_layout()
                analysis['figures']['fees'] = plt.gcf()
            except Exception:
                print("⚠️ No se pudieron analizar los gastos corrientes")
        
        # 6. ANÁLISIS DE DIVERSIFICACIÓN GEOGRÁFICA
        print("\n🌎 DIVERSIFICACIÓN GEOGRÁFICA")
        print("=" * 50)
        
        geographic_columns = ['northAmerica', 'unitedKingdom', 'europeDeveloped', 
                            'europeEmerging', 'africaMiddleEast', 'japan', 
                            'australasia', 'asiaDeveloped', 'asiaEmerging', 'latinAmerica']
        
        available_geo_columns = [col for col in geographic_columns if col in portfolio_df.columns]
        
        if available_geo_columns:
            geo_allocation = {}
            for col in available_geo_columns:
                if col in portfolio_df.columns:
                    geo_allocation[col] = (portfolio_df[col] * portfolio_df['Peso']).sum() * 100
            
            # Ordenar y filtrar valores > 0
            geo_allocation = {k: v for k, v in sorted(geo_allocation.items(), 
                                                    key=lambda item: item[1], 
                                                    reverse=True) if v > 0}
            
            analysis['geographic'] = geo_allocation
            
            # Mostrar distribución geográfica
            print("Distribución geográfica de la cartera:")
            for region, pct in geo_allocation.items():
                print(f"  • {region}: {pct:.1f}%")
            
            # Visualizar distribución geográfica
            try:
                plt.figure(figsize=(12, 6))
                bars = plt.bar(geo_allocation.keys(), geo_allocation.values(),
                            color=sns.color_palette('Blues_d', len(geo_allocation)))
                plt.xticks(rotation=45, ha='right')
                plt.title('Distribución Geográfica de la Cartera', fontsize=16)
                plt.ylabel('Porcentaje (%)')
                plt.grid(axis='y', alpha=0.3)
                
                # Añadir valores en las barras
                for bar in bars:
                    height = bar.get_height()
                    plt.text(bar.get_x() + bar.get_width()/2., height + 0.3,
                            f'{height:.1f}%', ha='center', va='bottom')
                
                plt.tight_layout()
                analysis['figures']['geographic'] = plt.gcf()
            except Exception as e:
                print(f"⚠️ Error generando gráfico de distribución geográfica: {str(e)}")
        else:
            print("⚠️ No se encontraron datos de distribución geográfica")
        
        # 7. ANÁLISIS DE CALIDAD (RATINGS)
        print("\n⭐ ANÁLISIS DE CALIDAD (RATINGS)")
        print("=" * 50)
        
        if 'overallMorningstarRating' in portfolio_df.columns:
            # Distribucion de ratings
            ms_rating_counts = portfolio_df['overallMorningstarRating'].value_counts()
            
            # Calcular distribución ponderada por peso
            ms_rating_dist = pd.Series(0, index=range(1, 6))
            
            for i in range(1, 6):
                mask = portfolio_df['overallMorningstarRating'] == i
                if mask.any():
                    ms_rating_dist[i] = portfolio_df.loc[mask, 'Peso'].sum() * 100
            
            # Ordenar y filtrar valores > 0
            ms_rating_dist = ms_rating_dist[ms_rating_dist > 0]
            
            # Calcular rating ponderado
            valid_ratings = portfolio_df[~portfolio_df['overallMorningstarRating'].isna()]
            
            if not valid_ratings.empty:
                weighted_rating = (valid_ratings['overallMorningstarRating'] * valid_ratings['Peso']).sum() / valid_ratings['Peso'].sum()
                analysis['quality']['weighted_rating'] = weighted_rating
                print(f"Rating Morningstar medio ponderado: {weighted_rating:.2f} estrellas")
                
                # Gráfico de distribución de ratings
                plt.figure(figsize=(10, 6))
                ms_rating_dist.plot(kind='bar', color=sns.color_palette("YlOrRd", len(ms_rating_dist)))
                plt.title('Distribución por Rating Morningstar', fontsize=16)
                plt.xlabel('Estrellas')
                plt.ylabel('% de la Cartera')
                plt.grid(axis='y', alpha=0.3)
                plt.tight_layout()
                analysis['figures']['ratings'] = plt.gcf()
        else:
            print("⚠️ No se encontraron datos de rating Morningstar")
        
        # 8. FONDOS INEFICIENTES
        print("\n⚠️ FONDOS POTENCIALMENTE INEFICIENTES")
        print("=" * 50)
        
        if 'rentabilidad_3y_anual' in portfolio_df.columns and 'gastos_corrientes' in portfolio_df.columns:
            try:
                # Convertir gastos corrientes a numérico
                portfolio_df['gastos_corrientes_num'] = pd.to_numeric(
                    portfolio_df['gastos_corrientes'].str.replace('%', ''), 
                    errors='coerce'
                )
                
                # Filtrar fondos con datos válidos
                valid_data = portfolio_df[
                    ~portfolio_df['rentabilidad_3y_anual'].isna() & 
                    ~portfolio_df['gastos_corrientes_num'].isna()
                ]
                
                if not valid_data.empty:
                    # Calcular medias
                    avg_return = valid_data['rentabilidad_3y_anual'].mean()
                    avg_fees = valid_data['gastos_corrientes_num'].mean()
                    
                    # Identificar fondos ineficientes
                    inefficient_funds = valid_data[
                        (valid_data['gastos_corrientes_num'] > avg_fees) & 
                        (valid_data['rentabilidad_3y_anual'] < avg_return)
                    ]
                    
                    if not inefficient_funds.empty:
                        print("Fondos con comisión superior a la media y rendimiento inferior a la media:")
                        for idx, fund in inefficient_funds.iterrows():
                            print(f"{fund['Nombre']} - Comisión: {fund['gastos_corrientes']}, Rentabilidad 3Y: {fund['rentabilidad_3y_anual']:.2f}%")
                            analysis['inefficient_funds'].append({
                                'name': fund['Nombre'],
                                'isin': fund['isin'],
                                'fees': fund['gastos_corrientes'],
                                'return_3y': fund['rentabilidad_3y_anual'],
                                'weight': fund['Peso']
                            })
                    else:
                        print("✓ No se encontraron fondos ineficientes (alta comisión y bajo rendimiento)")
            except Exception as e:
                print(f"⚠️ Error al analizar fondos ineficientes: {str(e)}")
        
        # 9. GRÁFICO RIESGO-RENTABILIDAD
        print("\n📊 RELACIÓN RIESGO-RENTABILIDAD")
        print("=" * 50)
        
        if 'volatilidad_anual' in portfolio_df.columns and 'rentabilidad_3y_anual' in portfolio_df.columns:
            # Filtrar datos válidos
            valid_data = portfolio_df[
                ~portfolio_df['volatilidad_anual'].isna() & 
                ~portfolio_df['rentabilidad_3y_anual'].isna()
            ]
            
            if len(valid_data) >= 3:  # Necesitamos al menos 3 puntos para visualización significativa
                plt.figure(figsize=(12, 8))
                
                # Diferentes colores según tipo de fondo
                colors = {
                    'Renta Variable': '#e74c3c',  # rojo
                    'Renta Fija': '#3498db',      # azul
                    'Mixto': '#f39c12',           # naranja
                    'Otros': '#95a5a6'            # gris
                }
                
                # Determinar el tipo para colores
                fund_types = []
                for _, row in valid_data.iterrows():
                    category = row.get('categoria', '').lower()
                    if 'renta variable' in category or 'equity' in category:
                        fund_types.append('Renta Variable')
                    elif 'renta fija' in category or 'bond' in category or 'monetario' in category:
                        fund_types.append('Renta Fija')
                    elif 'mixto' in category or 'mixed' in category or 'moderado' in category:
                        fund_types.append('Mixto')
                    else:
                        fund_types.append('Otros')
                
                valid_data['tipo_color'] = fund_types
                
                # Calcular tamaños relativos según peso en cartera
                sizes = valid_data['Peso'] * 500
                
                # Crear scatter plot
                for fund_type in colors.keys():
                    mask = valid_data['tipo_color'] == fund_type
                    if mask.any():
                        plt.scatter(
                            valid_data.loc[mask, 'volatilidad_anual'],
                            valid_data.loc[mask, 'rentabilidad_3y_anual'],
                            s=sizes[mask],
                            color=colors[fund_type],
                            alpha=0.6,
                            label=fund_type
                        )
                
                # Añadir etiquetas a los puntos
                for idx, row in valid_data.iterrows():
                    plt.annotate(
                        row['Nombre'][:20],
                        (row['volatilidad_anual'], row['rentabilidad_3y_anual']),
                        xytext=(5, 5),
                        textcoords='offset points',
                        fontsize=8
                    )
                
                # Líneas de referencia
                plt.axhline(y=0, color='r', linestyle='-', alpha=0.3)
                plt.axvline(x=valid_data['volatilidad_anual'].mean(), color='r', linestyle='--', alpha=0.3)
                plt.axhline(y=valid_data['rentabilidad_3y_anual'].mean(), color='r', linestyle='--', alpha=0.3)
                
                # Añadir texto explicativo para los cuadrantes
                avg_vol = valid_data['volatilidad_anual'].mean()
                avg_ret = valid_data['rentabilidad_3y_anual'].mean()
                
                plt.text(avg_vol*1.1, avg_ret*1.1, "ALTO RENDIMIENTO\nALTO RIESGO", 
                        ha='left', va='bottom', fontsize=9, bbox=dict(facecolor='white', alpha=0.5))
                
                plt.text(avg_vol*0.5, avg_ret*1.1, "ALTO RENDIMIENTO\nBAJO RIESGO", 
                        ha='right', va='bottom', fontsize=9, bbox=dict(facecolor='white', alpha=0.5))
                
                plt.text(avg_vol*1.1, avg_ret*0.5, "BAJO RENDIMIENTO\nALTO RIESGO", 
                        ha='left', va='top', fontsize=9, bbox=dict(facecolor='white', alpha=0.5))
                
                plt.text(avg_vol*0.5, avg_ret*0.5, "BAJO RENDIMIENTO\nBAJO RIESGO", 
                        ha='right', va='top', fontsize=9, bbox=dict(facecolor='white', alpha=0.5))
                
                plt.title('Relación Riesgo-Rentabilidad de la Cartera', fontsize=16)
                plt.xlabel('Volatilidad Anual (%)', fontsize=14)
                plt.ylabel('Rentabilidad Anualizada 3Y (%)', fontsize=14)
                plt.grid(True, alpha=0.3)
                plt.tight_layout()
                
                # Añadir leyenda
                plt.legend(title='Tipo de Fondo', loc='upper left', bbox_to_anchor=(1, 1))
                
                # Guardar gráfico en el diccionario de resultados
                analysis['figures']['risk_return'] = plt.gcf()
                
                print("✓ Gráfico de riesgo-rentabilidad generado")
            else:
                print("⚠️ No hay suficientes datos para generar el gráfico de riesgo-rentabilidad")
        else:
            print("⚠️ No se encontraron datos de volatilidad o rentabilidad")
        
        # 10. CONCLUSIONES Y RECOMENDACIONES
        print("\n📝 CONCLUSIONES Y RECOMENDACIONES")
        print("=" * 50)
        
        # Resumen general
        print(f"• La cartera tiene un valor actual de {valor_actual:,.2f}€ con una rentabilidad total de {rentabilidad_total:.2f}%")
        
        # Recomendar diversificación si es necesario
        if 'asset_allocation' in analysis and 'Renta Variable' in analysis['asset_allocation']:
            if analysis['asset_allocation']['Renta Variable'] >  0.75:
                print(f"• ATENCIÓN: La cartera está muy concentrada en Renta Variable ({analysis['asset_allocation']['Renta Variable']*100:.1f}%)")
            elif analysis['asset_allocation']['Renta Fija'] > 0.75:
                print(f"• ATENCIÓN: La cartera está muy concentrada en Renta Fija ({analysis['asset_allocation']['Renta Fija']*100:.1f}%)")
        
        # Alertar sobre fondos ineficientes
        if analysis['inefficient_funds']:
            print(f"• Se identificaron {len(analysis['inefficient_funds'])} fondos con alto coste y bajo rendimiento que podrían ser reemplazados")
        else:
            print("• No se identificaron fondos claramente ineficientes en términos de coste/rendimiento")
        
        # Comentar sobre la calidad general
        if 'quality' in analysis and 'weighted_rating' in analysis['quality']:
            if analysis['quality']['weighted_rating'] >= 4:
                print(f"• La cartera tiene una calidad alta según Morningstar (rating medio: {analysis['quality']['weighted_rating']:.1f} estrellas)")
            elif analysis['quality']['weighted_rating'] < 3:
                print(f"• ATENCIÓN: La cartera tiene una calidad baja según Morningstar (rating medio: {analysis['quality']['weighted_rating']:.1f} estrellas)")
        
        # Añadir recomendaciones personalizadas
        print("\nRecomendaciones principales:")
        recommendations_made = False
        
        # Recomendar reducir gastos si son altos
        if 'fees' in analysis and 'ongoing' in analysis['fees'] and analysis['fees']['ongoing'] > 1.2:
            print(f"• Considerar reducir los gastos medios de la cartera ({analysis['fees']['ongoing']:.2f}%) usando fondos indexados o ETFs")
            recommendations_made = True
        
        # Recomendar fondos específicos a reemplazar
        if analysis['inefficient_funds']:
            print("• Evaluar el reemplazo de los siguientes fondos:")
            for fund in analysis['inefficient_funds']:
                print(f"  - {fund['name']}: Alto coste ({fund['fees']}) y bajo rendimiento ({fund['return_3y']:.2f}%)")
            recommendations_made = True
        
        # Si no hay recomendaciones específicas
        if not recommendations_made:
            print("• La cartera está bien equilibrada en términos de rendimiento, riesgo y gastos")
        
        return analysis

    #### GRAFICOS Y VISUALIZACIONES ####

    def display_portfolio_analysis(self, analysis_results=None):
        """
        Muestra un resumen del análisis de la cartera.
        Si analysis_results es un DataFrame, lo devuelve directamente.
        Si es un dict, muestra el resumen y devuelve el DataFrame de fondos si existe.
        """
        import pandas as pd
        if analysis_results is None:
            analysis_results = self.analyze_portfolio_returns()
        # Si es un DataFrame, devuélvelo directamente
        if isinstance(analysis_results, pd.DataFrame):
            return analysis_results
        # Si es un dict con 'funds', devuélvelo como DataFrame
        if isinstance(analysis_results, dict) and 'funds' in analysis_results:
            return pd.DataFrame(analysis_results['funds'])
        # Si es un dict de composición, llama a la visualización de composición
        if isinstance(analysis_results, dict):
            self._display_portfolio_composition(analysis_results)
            return pd.DataFrame()
        # Si no es ninguno de los anteriores, devuelve DataFrame vacío
        return pd.DataFrame()

    def _display_portfolio_performance(self, performance_results):
        """
        Muestra los resultados del análisis de rentabilidad.
        """
        total_investment = performance_results['total_investment']
        total_current_value = performance_results['portfolio_summary']['total_current_value']
        total_return = performance_results['portfolio_summary']['total_return']
        
        print("\n📊 RESUMEN DE LA CARTERA")
        print("=" * 50)
        print(f"Inversión total: {total_investment:,.2f}€")
        print(f"Valor actual: {total_current_value:,.2f}€")
        print(f"Rentabilidad total: {total_return:.2f}%")
        print(f"Rentabilidad anualizada:")
        
        for period, return_value in performance_results['portfolio_summary']['weighted_returns'].items():
            print(f"  • {period}: {return_value:.2f}%")
        
        print("\n📈 DESGLOSE POR FONDOS")
        print("=" * 50)
        
        funds_df = pd.DataFrame(performance_results['funds'])
        
        if not funds_df.empty:
            funds_df = funds_df.sort_values('valor_actual', ascending=False)
            
            # Display columns
            display_cols = ['nombre', 'tipo', 'categoria', 'inversion', 'valor_actual', 'rentabilidad_total']
            
            # Add period return columns
            for col in funds_df.columns:
                if 'rentabilidad_' in col and 'anual' in col:
                    display_cols.append(col)
                    
            display_cols.extend(['volatilidad_anual', 'max_drawdown', 'comision_gestion', 'gastos_corrientes'])
            
            # Keep only columns that exist
            display_cols = [col for col in display_cols if col in funds_df.columns]
            
            print(funds_df[display_cols].to_string(index=False))
            
            # Mostrar información adicional de Finect
            print("\n📋 INFORMACIÓN ADICIONAL DE FINECT")
            print("=" * 50)
            
            for _, fund in funds_df.iterrows():
                if fund.get('encontrado_finect', False):
                    print(f"\n{fund['nombre']} ({fund['isin']}):")
                    print(f"  • Gestora: {fund.get('gestora', 'No disponible')}")
                    print(f"  • Patrimonio: {fund.get('patrimonio', 'No disponible')}")
                    print(f"  • Comisión de gestión: {fund.get('comision_gestion', 'No disponible')}")
                    print(f"  • Gastos corrientes: {fund.get('gastos_corrientes', 'No disponible')}")
                else:
                    print(f"\n{fund['nombre']} ({fund['isin']}):")
                    print(f"  • ❌ No se pudo obtener información de Finect")
            
        return funds_df

    def _display_portfolio_composition(self, composition_results):
        """
        Muestra los resultados del análisis de composición.
        """
        # Implementar visualización de la composición basada en el formato de analyze_portfolio_composition
        if not composition_results:
            print("No hay resultados de composición para mostrar")
            return
        
        # Mostrar resumen
        if 'summary' in composition_results:
            summary = composition_results['summary']
            print("\n📊 RESUMEN DE COMPOSICIÓN")
            print("=" * 50)
            print(f"Inversión total: {summary.get('total_invertido', 0):,.2f}€")
            print(f"Valor actual: {summary.get('valor_actual', 0):,.2f}€")
            print(f"Rentabilidad total: {summary.get('rentabilidad_total', 0):.2f}%")
        
        # Mostrar distribución de activos
        if 'asset_allocation' in composition_results:
            print("\n📈 DISTRIBUCIÓN POR TIPO DE ACTIVO")
            print("=" * 50)
            for asset_type, allocation in composition_results['asset_allocation'].items():
                print(f"  • {asset_type}: {allocation*100:.2f}%")
        
        # Mostrar rentabilidades
        if 'performance' in composition_results and 'by_period' in composition_results['performance']:
            print("\n📊 RENTABILIDADES POR PERIODO")
            print("=" * 50)
            for period, return_value in composition_results['performance']['by_period'].items():
                print(f"  • {period}: {return_value:.2f}%")
        
        # Mostrar riesgo
        if 'risk' in composition_results:
            print("\n⚠️ MÉTRICAS DE RIESGO")
            print("=" * 50)
            if 'volatility' in composition_results['risk'] and 'weighted_avg' in composition_results['risk']['volatility']:
                print(f"Volatilidad media: {composition_results['risk']['volatility']['weighted_avg']:.2f}%")
                
            if 'drawdown' in composition_results['risk'] and 'weighted_avg' in composition_results['risk']['drawdown']:
                print(f"Máximo drawdown: {composition_results['risk']['drawdown']['weighted_avg']:.2f}%")
        
        # Mostrar comisiones
        if 'fees' in composition_results:
            print("\n💰 COMISIONES Y GASTOS")
            print("=" * 50)
            if 'management' in composition_results['fees']:
                print(f"Comisión gestión media: {composition_results['fees']['management']:.2f}%")
            if 'ongoing' in composition_results['fees']:
                print(f"Gastos corrientes medios: {composition_results['fees']['ongoing']:.2f}%")
        
        # Mostrar gráficos si están disponibles y estamos en un entorno interactivo
        try:
            import matplotlib.pyplot as plt
            from IPython.display import display
            
            if 'figures' in composition_results:
                for name, fig in composition_results['figures'].items():
                    print(f"\n📊 {name.upper()}")
                    display(fig)
        except ImportError:
            pass
        
    def plot_comparison_plotly(self, funds_df: pd.DataFrame, period: str = "2y"):
        import plotly.graph_objects as go
        # Crear figura base
        fig = go.Figure()
        isins = funds_df['ISIN'].unique() if 'ISIN' in funds_df.columns else funds_df['isin'].unique()
        colores = ['#0096C8', '#FF8728', '#E60000', '#00A037', '#FFC83C', '#BEAA96',
                  '#144696', '#C84196', '#7891A5', '#64283C', '#285A32', '#C896B4', '#8C5A3C']
        funds_df_sorted = funds_df.sort_values('valor_actual', ascending=False)
        dropdown_buttons = []
        all_visible = [True] * len(isins)
        dropdown_buttons.append(
            dict(
                label="Todos los fondos",
                method="update",
                args=[
                    {"visible": all_visible},
                    {"title": "Comparativa de todos los fondos (Base 100)"}
                ]
            )
        )
        for i, isin in enumerate(isins):
            if isin not in self.funds:
                self.funds[isin] = Fund(isin=isin)
            fund_data = self.funds[isin]._process_fund()
            data = fund_data.get('historical_data', None)[0]
            if data is not None and not data.empty and 'Close' in data.columns:
                normalized_prices = (data['Close'] / data['Close'].iloc[0]) * 100
                fund_info = funds_df[funds_df['ISIN'] == isin].iloc[0] if 'ISIN' in funds_df.columns else funds_df[funds_df['isin'] == isin].iloc[0]
                fund_name = fund_info['Nombre'] if 'Nombre' in fund_info else fund_info.get('nombre', str(isin))
                fund_type = fund_info['tipo'] if 'tipo' in fund_info else ''
                fund_value = fund_info['valor_actual'] if 'valor_actual' in fund_info else 0
                color_index = i % len(colores)
                fig.add_trace(
                    go.Scatter(
                        x=normalized_prices.index,
                        y=normalized_prices,
                        mode='lines',
                        name=f"{fund_name} - {fund_type}",
                        line=dict(color=colores[color_index], width=2),
                        visible=True
                    )
                )
                fund_visible = [False] * len(isins)
                fund_visible[i] = True
                dropdown_buttons.append(
                    dict(
                        label=f"{fund_name[:30]}... ({fund_value:,.2f}€)",
                        method="update",
                        args=[
                            {"visible": fund_visible},
                            {"title": f"Evolución de {fund_name} (Base 100)"}
                        ]
                    )
                )
            else:
                print(f"⚠️ El fondo {isin} no tiene datos históricos con columna 'Close'. Se omite en el gráfico.")
        fig.update_layout(
            title={
                'text': 'Comparativa de Fondos (Base 100)',
                'y': 0.98,
                'x': 0.5,
                'xanchor': 'center',
                'yanchor': 'top',
                'font': {'size': 18}
            },
            xaxis=dict(
                title="Fecha",
                gridcolor="rgba(242, 246, 251, 0.4)",
                gridwidth=0.25,
                title_font={'size': 14},
                showgrid=True,
                tickangle=-45
            ),
            yaxis=dict(
                title="Valor (Base 100)",
                gridcolor="rgba(242, 246, 251, 0.4)",
                gridwidth=0.25,
                title_font={'size': 14}
            ),
            legend=dict(
                orientation="h",
                yanchor="top",
                y=-0.10,
                xanchor="center",
                x=0.5,
                font=dict(size=10)
            ),
            height=700,
            plot_bgcolor='white',
            updatemenus=[{
                "buttons": dropdown_buttons,
                "direction": "down",
                "showactive": True,
                "x": 0.15,
                "xanchor": "left",
                "y": 1.10,
                "yanchor": "top",
                "bgcolor": "#F2F2F2",
                "bordercolor": "#CCCCCC",
                "font": {"size": 12}
            }],
            annotations=[
                dict(
                    text="Seleccionar fondo:",
                    x=0.13,
                    y=1.115,
                    xref="paper",
                    yref="paper",
                    showarrow=False,
                    font=dict(size=12, color="#0096C8"),
                    xanchor="right",
                    yanchor="bottom"
                )
            ],
            margin=dict(t=120, l=60, r=40, b=80),
        )
        
        return fig

    def summarize_portfolio(self, show_all=False):
        """
        Aggregates all fund rows into a single total row, weighted by current value (valor_actual).
        If show_all=True, returns all funds plus the total row.
        Output format and column order are preserved.
        """
        df = self.portfolio_df.copy()
        # Standardize column names to title case
        df.columns = [str(c) for c in df.columns]
        # Ensure 'Valor_Actual' exists
        if 'valor_actual' not in df.columns:
            raise KeyError("No se encontró columna 'valor_actual' para calcular pesos actuales.")
        total_valor_actual = df['valor_actual'].sum()
        # Peso_Actual: weight by current value
        df['Peso_Actual'] = df['valor_actual'] / total_valor_actual if total_valor_actual else 0
        # Select numeric columns for aggregation
        numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
        # Always include 'Peso_Actual' in numeric_cols for weighting
        if 'Peso_Actual' not in numeric_cols:
            numeric_cols.append('Peso_Actual')
        # Columns to sum directly (not weighted)
        sum_cols = ['valor_actual', 'Inversion', 'Peso']
        # Aggregate using weighted mean for numeric columns (except sum_cols and Peso_Actual itself)
        total_row = {}
        for col in numeric_cols:
            if col == 'Peso_Actual':
                total_row[col] = 1.0
            elif col in sum_cols:
                total_row[col] = df[col].sum()
            else:
                # Weighted mean
                total_row[col] = (df[col] * df['Peso_Actual']).sum()
        # Add identifiers
        total_row['Isin'] = 'TOTAL'
        total_row['Nombre'] = 'TOTAL'
        # Add any non-numeric columns as blank or default
        for col in df.columns:
            if col not in total_row:
                total_row[col] = ''
        # Preserve column order
        total_df = pd.DataFrame([total_row], columns=df.columns)
        if show_all:
            # Return all funds plus total row
            return pd.concat([df, total_df], ignore_index=True)
        else:
            # Return only the total row
            return total_df
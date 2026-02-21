"""
Portfolio analysis module for financial applications.
This module provides tools for analyzing investment portfolios of funds.
"""

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

class Portfolio:
    """
    A class for analyzing investment portfolios of funds.
    
    This class provides methods for calculating portfolio performance,
    analyzing asset allocation, and comparing different portfolios.
    """
    
    def __init__(self, portfolio_df=None, default_years=3):
        """
        Initialize the portfolio analyzer.
        
        Args:
            portfolio_df: DataFrame with columns 'Nombre', 'ISIN', 'Inversion' and optionally 'Fecha'
                          May contain multiple entries of the same fund with different dates
            default_years: Default number of years for analysis without specific dates
        """
        # Store the original movements DataFrame
        self.portfolio_df = portfolio_df.copy() if portfolio_df is not None else None
        self.default_years = default_years
        self.processed_funds_cache = {}
        self.funds_data = {}
        self.funds = {}  # Dictionary to store Fund objects
        
        # Create aggregated funds_df for composition/weights
        if portfolio_df is not None:
            self.funds_df = self.portfolio_df.groupby(['Nombre', 'ISIN'])['Inversion'].sum().reset_index()
            self.total_amount = self.funds_df['Inversion'].sum()
            self.funds_df['Peso'] = self.funds_df['Inversion'] / self.total_amount
            # Do NOT overwrite self.portfolio_df with aggregated data
            self.portfolio_data = self._get_portfolio_data()  # This is the processed funds info
        else:
            self.funds_df = None
            self.total_amount = None
            self.portfolio_data = None

        # Initialize immediately if we have data
        if portfolio_df is not None:
            self._initialize_portfolio()
    
    def _initialize_portfolio(self):
        """
        Initialize the portfolio based on provided data.
        """
        # Ensure we have the minimum required fields
        required_columns = ['Nombre', 'ISIN', 'Inversion']
        for col in required_columns:
            if col not in self.portfolio_df.columns:
                raise ValueError(f"Column '{col}' is required in the portfolio DataFrame")
        
        # Add default date if it doesn't exist
        if 'Fecha' not in self.portfolio_df.columns:
            self.portfolio_df = self.portfolio_df.copy()
            default_date = (datetime.now() - timedelta(days=self.default_years*365)).strftime('%Y-%m-%d')
            self.portfolio_df['Fecha'] = default_date
        
        # Create an aggregated (summed) view of funds for calculations that need unique values per fund
        self.funds_df = self.portfolio_df.groupby(['Nombre', 'ISIN'])['Inversion'].sum().reset_index()
        
        # Total investment for calculating weights
        self.total_amount = self.funds_df['Inversion'].sum()
        
        # Add weight column to funds_df
        self.funds_df['Peso'] = self.funds_df['Inversion'] / self.total_amount
        
        # Get complete portfolio data
        self.portfolio_df = self._get_portfolio_data()
        
        # Prevent double printing by tracking initialization
        if hasattr(self, '_initialized') and self._initialized:
            return self.portfolio_df
        self._initialized = True
    
    def _process_single_fund(self, fund_name: str, isin: str, investment: float, weight: float, movements: pd.DataFrame) -> dict:
        """
        Process a single fund and collect all its data using the Fund class.
        
        Args:
            fund_name: Fund name
            isin: Fund ISIN code
            investment: Total invested in the fund (aggregated)
            weight: Fund weight in the portfolio
            movements: DataFrame with all movements for this ISIN
            
        Returns:
            dict: Dictionary with all processed fund data
        """
        # Create a cache key that includes the current date
        current_date = datetime.now().strftime('%Y-%m-%d')
        cache_key = f"{isin}_{current_date}"
        
        # Check if we already have the processed data in cache
        if cache_key in self.processed_funds_cache:
            print(f"  ✓ Using cached data for {fund_name} ({isin})")
            return self.processed_funds_cache[cache_key]
        
        print(f"\n--- Processing: {fund_name} ({isin}) - {investment:,.2f}€ ({weight:.2%}) ---")
        
        # Use the Fund class to get all fund data
        if isin not in self.funds:
            self.funds[isin] = Fund(isin=isin, name=fund_name)
        
        # Get fund object and its data
        fund_obj = self.funds[isin]
        fund_data_raw = fund_obj._process_fund()
        
        # Extract historical data and Morningstar data
        historical_data = fund_data_raw.get('historical_data', None)
        ms_data = fund_data_raw.get('data', pd.DataFrame())
        ms_data_dict = ms_data.to_dict('records')[0] if not ms_data.empty else {}
        
        # Prepare basic fund data
        fund_data = {
            'Nombre': fund_name,
            'ISIN': isin,
            'Inversion': investment,
            'Peso': weight,
            'encontrado_morningstar': len(ms_data_dict) > 1  # More than just the ISIN
        }
        
        # If movements are available, use them for performance
        if not movements.empty and historical_data is not None and not historical_data.empty:
            performance_data = self.calculate_performance_by_movements(historical_data, movements)
            fund_data['valor_actual'] = round(performance_data['current_value'], 2)
            fund_data['rentabilidad_total'] = round(performance_data['total_return_pct'], 2)
            fund_data['rentabilidad_anualizada'] = round(performance_data['annual_return_pct'], 2)
            fund_data['movimientos'] = performance_data['movements']
            fund_data['encontrado'] = True
            fund_data['fuente_datos'] = historical_data.attrs.get('Source', 'Yahoo Finance') if hasattr(historical_data, 'attrs') else 'Yahoo Finance'
            fund_data['volatilidad_anual'] = self.calculate_volatility(historical_data)
            fund_data['max_drawdown'] = self.calculate_max_drawdown(historical_data)
            fund_data['precio_actual'] = historical_data['Close'].iloc[-1]
        elif historical_data is not None and not historical_data.empty:
            # If there are no detailed movements or they're not available, calculate with simple values
            current_price = historical_data['Close'].iloc[-1]
            initial_price = historical_data['Close'].iloc[0]
            return_factor = current_price / initial_price
            current_value = investment * return_factor
            
            fund_data['precio_actual'] = current_price
            fund_data['valor_actual'] = round(current_value, 2)
            fund_data['rentabilidad_total'] = round((return_factor - 1) * 100, 2)
            fund_data['volatilidad_anual'] = self.calculate_volatility(historical_data)
            fund_data['max_drawdown'] = self.calculate_max_drawdown(historical_data)
            fund_data['encontrado'] = True
            fund_data['fuente_datos'] = historical_data.attrs.get('Source', 'Yahoo Finance') if hasattr(historical_data, 'attrs') else 'Yahoo Finance'
        else:
            # Without movement information or without historical data, use the traditional method
            fund_data['valor_actual'] = investment
            fund_data['rentabilidad_total'] = 0
            fund_data['encontrado'] = False
            fund_data['fuente_datos'] = 'None (no historical data)'
        
        # Add Morningstar data
        fund_data.update({k: v for k, v in ms_data_dict.items() if k != 'isin'})
        
        # Save in cache
        self.processed_funds_cache[cache_key] = fund_data
        
        return fund_data
    
    def _get_portfolio_data(self) -> pd.DataFrame:
        """
        Collect all necessary data for each fund in the portfolio
        
        Returns:
            DataFrame with all fund data, keeping original columns (Nombre, ISIN, Inversion, Fecha)
        """
        # Validate that we have fund data
        if self.portfolio_df is None or self.portfolio_df.empty:
            raise ValueError("No fund data to analyze")
        
        all_funds_data = []
        
        # For each unique fund, aggregate investment and get all movements
        for _, row in self.funds_df.iterrows():
            fund_name = row['Nombre']
            isin = row['ISIN']
            investment = row['Inversion']
            weight = row['Peso']
            
            # Get all movements for this ISIN
            movements = self.portfolio_df[self.portfolio_df['ISIN'] == isin][['Nombre', 'ISIN', 'Inversion', 'Fecha']].copy()
            
            fund_data = self._process_single_fund(fund_name, isin, investment, weight, movements)
            
            # Add movements info for traceability
            fund_data['movimientos_df'] = movements.reset_index(drop=True)
            
            # Add to the list of funds
            all_funds_data.append(fund_data)
            
            # Small pause to avoid overloading servers
            time.sleep(1)
        
        # Convert to DataFrame
        portfolio_df = pd.DataFrame(all_funds_data)
        
        # Ensure original columns are first
        cols_first = ['Nombre', 'ISIN', 'Inversion', 'Peso', 'valor_actual', 'rentabilidad_total', 'rentabilidad_anualizada', 'volatilidad_anual', 'max_drawdown']
        other_cols = [c for c in portfolio_df.columns if c not in cols_first]
        portfolio_df = portfolio_df[cols_first + other_cols]
        
        return portfolio_df
    
    #### Performance Calculation Auxiliaries ####
    
    def calculate_performance(self, data: pd.DataFrame, periods: List[int] = [1, 3, 5]) -> Dict:
        """
        Calculate returns for different periods (date only, no time)
        """
        results = {}
        current_price = data['Close'].iloc[-1]
        
        # Convert index to date without time
        idx = pd.to_datetime(data.index).normalize()
        idx_dates = idx.date
        
        for years in periods:
            try:
                # Calculate the target date and normalize (without time)
                target_date = (datetime.now() - timedelta(days=years * 365)).date()
                
                # Look for the closest date before or equal to target_date
                available_dates = idx[idx_dates <= target_date]
                if len(available_dates) == 0:
                    available_dates = idx[idx_dates > target_date]
                    if len(available_dates) == 0:
                        start_date = idx[0]
                    else:
                        start_date = available_dates[0]
                    print(f"    ⚠️ Not enough historical data, using closest date {start_date.strftime('%Y-%m-%d')}")
                else:
                    start_date = available_dates[-1]
                    print(f"    ✓ Closest date found: {start_date.strftime('%Y-%m-%d')}")
                
                start_price = data.loc[start_date, 'Close']
                actual_years = (idx[-1] - start_date).days / 365.25
                total_return = (current_price / start_price - 1) * 100
                annual_return = (pow(current_price / start_price, 1/actual_years) - 1) * 100
                
                print(f"    ✓ Initial price: {start_price:.2f}, Current price: {current_price:.2f}")
                print(f"    ✓ Total return: {total_return:.2f}%, Annual return: {annual_return:.2f}%")
                
                results[f'{years}y'] = {
                    'total_return': round(total_return, 2),
                    'annual_return': round(annual_return, 2),
                    'start_date': start_date.strftime('%Y-%m-%d'),
                    'end_date': idx[-1].strftime('%Y-%m-%d'),
                    'actual_years': round(actual_years, 2),
                    'start_price': round(start_price, 2),
                    'current_price': round(current_price, 2)
                }
                
            except Exception as e:
                print(f"    ❌ Error calculating {years}y return: {str(e)}")
                results[f'{years}y'] = None
                
        return results
    
    def calculate_volatility(self, data: pd.DataFrame) -> float:
        """Calculate annualized volatility"""
        daily_returns = data['Close'].pct_change().dropna()
        return round(daily_returns.std() * np.sqrt(252) * 100, 2)
    
    def calculate_max_drawdown(self, data: pd.DataFrame) -> float:
        """Calculate maximum drawdown"""
        prices = data['Close']
        peak = prices.cummax()
        drawdown = (prices / peak - 1) * 100
        return round(drawdown.min(), 2)
    
    def calculate_performance_by_movements(self, data: pd.DataFrame, movements: pd.DataFrame) -> dict:
        """
        Calculate returns for each movement according to its purchase date
        
        Args:
            data: DataFrame with fund historical data
            movements: DataFrame with movements (date and amount)
                
        Returns:
            dict: Dictionary with calculated returns
        """
        if data is None or data.empty or movements is None or movements.empty:
            return {
                'total_investment': 0,
                'current_value': 0,
                'total_return_pct': 0,
                'annual_return_pct': 0,
                'movements': []
            }
        
        # Create a copy and convert all dates to tz-naive
        data_copy = data.copy()
        if not pd.api.types.is_datetime64_any_dtype(data_copy.index):
            data_copy.index = pd.to_datetime(data_copy.index)
            
        data_copy.index = pd.DatetimeIndex([pd.Timestamp(dt).tz_localize(None) for dt in data_copy.index])
        
        # Ensure movement dates are in datetime format
        movements = movements.copy()
        if 'Fecha' in movements.columns and not pd.api.types.is_datetime64_any_dtype(movements['Fecha']):
            movements['Fecha'] = pd.to_datetime(movements['Fecha'])
        
        # Current fund price
        current_price = data_copy['Close'].iloc[-1]
        current_date = data_copy.index[-1]
        
        # Results to store calculations
        total_investment = movements['Inversion'].sum()
        current_value = 0
        movement_results = []
        
        # Calculate returns for each movement
        for _, movement in movements.iterrows():
            investment = movement['Inversion']
            purchase_date_str = movement['Fecha']
            
            # Convert date to Timestamp without timezone
            if isinstance(purchase_date_str, str):
                purchase_date = pd.Timestamp(purchase_date_str).tz_localize(None)
            else:
                purchase_date = pd.Timestamp(purchase_date_str).tz_localize(None)
            
            # Find the price closest to the purchase date
            if purchase_date in data_copy.index:
                purchase_price = data_copy.loc[purchase_date, 'Close']
                if isinstance(purchase_price, pd.Series):
                    purchase_price = purchase_price.iloc[0]
            else:
                # Find the closest date before the purchase date
                available_dates = data_copy.index[data_copy.index <= purchase_date]
                if len(available_dates) > 0:
                    closest_date = available_dates[-1]
                    purchase_price = data_copy.loc[closest_date, 'Close']
                else:
                    # If there are no previous dates, use the first available
                    closest_date = data_copy.index[0]
                    purchase_price = data_copy.loc[closest_date, 'Close']
                    print(f"  ⚠️ Purchase date {purchase_date} is before available data. Using {closest_date.strftime('%Y-%m-%d')}")
                
            # Calculate time elapsed in years
            years_held = (current_date - purchase_date).days / 365.25
            
            # Calculate return for this movement
            movement_value = investment * (current_price / purchase_price)
            total_return_pct = (movement_value / investment - 1) * 100
            
            # Calculate annualized return
            if years_held > 0:
                annual_return_pct = (((current_price / purchase_price) ** (1 / years_held)) - 1) * 100
            else:
                annual_return_pct = 0
            
            # Save results for this movement
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
        
        # Calculate total and annualized return
        total_return_pct = (current_value / total_investment - 1) * 100
        
        # Calculate weighted annualized return
        weighted_annual_return = 0
        for movement in movement_results:
            weight = movement['investment'] / total_investment
            weighted_annual_return += movement['annual_return_pct'] * weight
        
        return {
            'total_investment': total_investment,
            'current_value': current_value,
            'total_return_pct': total_return_pct,
            'annual_return_pct': weighted_annual_return,
            'movements': movement_results
        }
    
    def analyze_portfolio(self, years=None):
        """
        Perform a complete portfolio analysis (returns and composition).
        
        Args:
            years: Number of years for historical analysis (if there are no specific dates)
                    
        Returns:
            dict: Dictionary with all analysis results
        """
        if years is not None:
            self.default_years = years
            
        if self.portfolio_df is None:
            self._initialize_portfolio()
        
        # Historical return analysis
        performance_results = self.analyze_portfolio_returns()
        
        # Composition analysis
        composition_results = self.analyze_portfolio_composition()
        
        # Combine results
        combined_results = {
            'performance': performance_results,
            'composition': composition_results
        }
        
        return combined_results
        
    def analyze_portfolio_returns(self, portfolio_df=None, years=None):
        """
        Analyze returns of a fund portfolio.
        
        Args:
            portfolio_df: DataFrame or dictionary with fund information (optional)
                          Includes columns 'Nombre', 'ISIN', 'Inversion' and optionally 'Fecha'
            years: Number of years for analysis when there are no specific dates
                    
        Returns:
            dict: Analysis results
        """
        # If years is provided, update the default_years
        if years is not None:
            self.default_years = years
            
        # If input is None, use instance data
        if portfolio_df is None:
            if self.portfolio_df is None:
                self._initialize_portfolio()
            portfolio_df = self.portfolio_df.copy()
        
        # Convert dictionary input to DataFrame if needed
        if isinstance(portfolio_df, dict):
            portfolio_df = pd.DataFrame(portfolio_df)
        
        # Add default date if missing
        if portfolio_df is not None and not portfolio_df.empty and 'Fecha' not in portfolio_df.columns:
            portfolio_df = portfolio_df.copy()
            default_date = (datetime.now() - timedelta(days=self.default_years*365)).strftime('%Y-%m-%d')
            portfolio_df['Fecha'] = default_date
        
        # Ensure we have the required data
        if portfolio_df is None or portfolio_df.empty:
            print("❌ No fund data to analyze")
            return {}
            
        # If we need to recalculate fund data
        if 'movimientos' not in portfolio_df.columns:
            print("Recalculating portfolio with fund data...")
            # Set up instance variables for _get_portfolio_data
            self.portfolio_df = portfolio_df.copy()
            
            # Initialize funds using the Fund class for each unique ISIN
            for isin in portfolio_df['ISIN'].unique():
                if isin not in self.funds:
                    fund_name = portfolio_df[portfolio_df['ISIN'] == isin]['Nombre'].iloc[0]
                    self.funds[isin] = Fund(isin=isin, name=fund_name)
            
            # Get portfolio data using Fund class
            portfolio_df = self._get_portfolio_data()
        
        print(f"\n--- Analyzing returns of portfolio with {len(portfolio_df)} funds ---")
        
        # Initialize results
        total_investment = portfolio_df['inversion'].sum()
        total_current_value = portfolio_df['valor_actual'].sum() if 'valor_actual' in portfolio_df.columns else total_investment
        
        portfolio_results = {
            'total_investment': total_investment,
            'funds': [],
            'portfolio_summary': {
                'weighted_returns': {'total': 0},
                'total_current_value': total_current_value,
                'total_return': ((total_current_value / total_investment) - 1) * 100 if total_investment > 0 else 0
            }
        }
        
        # Process each fund
        for _, fund in portfolio_df.iterrows():
            fund_result = fund.to_dict()
            
            # Remove historical data to avoid bloating the result
            if 'data_historica' in fund_result:
                del fund_result['data_historica']
            
            # Add to weighted returns
            if 'rentabilidad_anualizada' in fund and not pd.isna(fund['rentabilidad_anualizada']):
                portfolio_results['portfolio_summary']['weighted_returns']['annual'] = \
                    portfolio_results['portfolio_summary']['weighted_returns'].get('annual', 0) + \
                    (fund['rentabilidad_anualizada'] * fund['peso'])
                    
            # Add returns for different periods if available
            for period in [1, 3, 5, 10]:
                col_name = f'rentabilidad_{period}y_anual'
                if col_name in fund and not pd.isna(fund[col_name]):
                    period_key = f'{period}y'
                    if period_key not in portfolio_results['portfolio_summary']['weighted_returns']:
                        portfolio_results['portfolio_summary']['weighted_returns'][period_key] = 0
                        
                    portfolio_results['portfolio_summary']['weighted_returns'][period_key] += \
                        fund[col_name] * fund['peso']
            
            portfolio_results['funds'].append(fund_result)
        
        return portfolio_results
    
    def analyze_portfolio_composition(self, portfolio_df=None):
        """
        Analyze the composition and characteristics of a fund portfolio.
        
        Args:
            portfolio_df (pd.DataFrame, optional): DataFrame with complete fund information.
                If None, uses self.portfolio_df
                
        Returns:
            dict: Analysis results with the following structure:
                - summary: General portfolio summary
                - asset_allocation: Distribution by asset type (Fixed Income/Equity/Others)
                - performance: Performance metrics by period
                - risk: Risk metrics (volatility, drawdown)
                - fees: Commission and expense analysis
                - geographic: Geographic distribution
                - quality: Quality analysis (Morningstar ratings)
                - inefficient_funds: Funds with low efficiency (high cost/low return)
                - figures: Charts generated during analysis
        """
        import matplotlib.pyplot as plt
        import seaborn as sns
        import numpy as np
        
        # Ensure we have portfolio data
        if portfolio_df is None:
            if self.portfolio_df is None:
                self._initialize_portfolio()
            portfolio_df = self.portfolio_df.copy()
        
        # Input validation
        if portfolio_df.empty:
            print("❌ DataFrame is empty. Analysis cannot be performed.")
            return {}
        
        print(f"\n--- Analyzing portfolio composition with {len(portfolio_df)} funds ---")
        
        # Create dictionary to store results
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
        
        # 1. PORTFOLIO GENERAL SUMMARY
        print("\n📊 PORTFOLIO GENERAL SUMMARY")
        print("=" * 50)
        
        # Use consistent lowercase column name
        total_invertido = portfolio_df['inversion'].sum()
        valor_actual = portfolio_df['valor_actual'].sum() if 'valor_actual' in portfolio_df.columns else total_invertido
        rentabilidad_total = ((valor_actual / total_invertido) - 1) * 100 if total_invertido > 0 else 0
        
        analysis['summary'] = {
            'total_invertido': total_invertido,
            'valor_actual': valor_actual,
            'rentabilidad_total': rentabilidad_total
        }
        
        print(f"Total investment: {total_invertido:,.2f}€")
        print(f"Current value: {valor_actual:,.2f}€")
        print(f"Total return: {rentabilidad_total:.2f}%")
        
        # 2. ASSET TYPE COMPOSITION ANALYSIS (Equity/Fixed Income)
        print("\n📈 DISTRIBUTION BY ASSET TYPE")
        print("=" * 50)
        
        # Check if we have asset distribution columns
        asset_columns = {
            'Renta Variable': ['equity', 'renta_variable', 'RV', 'perc_Equity'],
            'Renta Fija': ['fixed_income', 'bond', 'renta_fija', 'RF', 'perc_Bond'],
            'Liquidez': ['cash', 'liquidez'],
            'Otros': ['other', 'alternative', 'otros', 'perc_Other']
        }
        
        # Try to determine asset type from different columns
        asset_allocation = {k: 0 for k in asset_columns.keys()}
        total_weight = 0
        
        # Method 1: Use direct distribution columns if they exist
        asset_distribution_available = False
        
        for asset_type, columns in asset_columns.items():
            for col in columns:
                if col in portfolio_df.columns:
                    asset_allocation[asset_type] += (portfolio_df[col] * portfolio_df['peso']).sum()
                    asset_distribution_available = True
        
        # Method 2: If there are no direct columns, try to infer from type/category
        if not asset_distribution_available:
            for _, fund in portfolio_df.iterrows():
                fund_type = None
                peso = fund['peso']
                total_weight += peso
                
                # Try to determine asset type from category name
                category = fund.get('categoria', '').lower()
                
                if any(kw in category for kw in ['renta variable', 'equity', 'accion']):
                    fund_type = 'Renta Variable'
                elif any(kw in category for kw in ['renta fija', 'bond', 'monetario']):
                    fund_type = 'Renta Fija'
                elif any(kw in category for kw in ['mixto', 'mixed']):
                    # For mixed funds, distribute according to the proportion in the name or category
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
        
        # Normalize to sum to 1
        if total_weight > 0:
            for key in asset_allocation:
                asset_allocation[key] /= total_weight
        
        # Save allocation in the analysis
        analysis['asset_allocation'] = asset_allocation
        
        # Show asset distribution
        print("Distribution by asset type:")
        for asset_type, allocation in asset_allocation.items():
            if allocation > 0:
                print(f"  • {asset_type}: {allocation*100:.2f}%")
        
        # Return the analysis results
        return analysis

    # You can add other visualization methods here as needed

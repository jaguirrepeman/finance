import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import matplotlib.pyplot as plt
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import seaborn as sns
from typing import Dict, List, Tuple, Optional, Any, Union
import requests
import re
import warnings
from bs4 import BeautifulSoup
import pickle
import os
import json
import mstarpy as ms
import hashlib
from finect_scraper import scrape_finect_fund_data
warnings.filterwarnings('ignore')


class CacheManager:
    """
    Clase para gestionar el sistema de caché de fondos
    
    Esta clase permite almacenar y recuperar datos de fondos desde archivos locales,
    organizando el caché por fecha y por ISIN para una mejor gestión de los datos.
    """
    
    def __init__(self, base_path: str = None):
        """
        Inicializa el gestor de caché
        
        Args:
            base_path: Ruta base para los archivos de caché. Si es None, se usa el directorio data/cache
                       relativo a la ubicación del archivo.
        """
        if base_path is None:
            # Establecer la ruta por defecto (carpeta data/cache en el mismo nivel que src)
            self.base_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                "data", "cache"
            )
        else:
            self.base_path = base_path
            
        # Crear la estructura de directorios si no existe
        os.makedirs(self.base_path, exist_ok=True)
        
        # Diccionario para mantener el caché en memoria
        self.memory_cache = {}
        
        print(f"Cache manager initialized with base path: {self.base_path}")
    
    def _get_cache_filename(self, key: str) -> str:
        """
        Genera el nombre de archivo para una clave de caché
        
        Args:
            key: Clave de caché (generalmente en formato {isin}_{fecha})
            
        Returns:
            str: Ruta completa al archivo de caché
        """
        # Extraemos el ISIN de la clave (asumiendo formato isin_fecha)
        parts = key.split('_')
        if len(parts) >= 1:
            isin = parts[0]
            # Crear un subdirectorio para cada ISIN
            isin_dir = os.path.join(self.base_path, isin)
            os.makedirs(isin_dir, exist_ok=True)
            
            # Usar un hash para el nombre de archivo para evitar caracteres inválidos
            filename = hashlib.md5(key.encode()).hexdigest() + ".pkl"
            return os.path.join(isin_dir, filename)
        else:
            # Si la clave no tiene el formato esperado, usar un directorio genérico
            os.makedirs(os.path.join(self.base_path, "misc"), exist_ok=True)
            filename = hashlib.md5(key.encode()).hexdigest() + ".pkl"
            return os.path.join(self.base_path, "misc", filename)
    
    def get(self, key: str, default: Any = None) -> Any:
        """
        Obtiene un valor del caché
        
        Args:
            key: Clave de caché (formato {isin}_{fecha})
            default: Valor por defecto si la clave no existe
            
        Returns:
            El valor almacenado o el valor por defecto
        """
        # Primero buscar en la memoria
        if key in self.memory_cache:
            return self.memory_cache[key]
        
        # Si no está en memoria, buscar en el archivo
        filename = self._get_cache_filename(key)
        if os.path.exists(filename):
            try:
                with open(filename, 'rb') as f:
                    value = pickle.load(f)
                    # Guardar en memoria para acceso más rápido
                    self.memory_cache[key] = value
                    return value
            except Exception as e:
                print(f"Error loading cache for {key}: {e}")
        
        return default
    
    def set(self, key: str, value: Any) -> None:
        """
        Establece un valor en el caché
        
        Args:
            key: Clave de caché (formato {isin}_{fecha})
            value: Valor a almacenar
        """
        # Guardar en memoria
        self.memory_cache[key] = value
        
        # Guardar en archivo
        filename = self._get_cache_filename(key)
        try:
            with open(filename, 'wb') as f:
                pickle.dump(value, f)
        except Exception as e:
            print(f"Error saving cache for {key}: {e}")
    
    def has_key(self, key: str) -> bool:
        """
        Verifica si una clave existe en el caché
        
        Args:
            key: Clave a verificar
            
        Returns:
            bool: True si la clave existe, False en caso contrario
        """
        # Primero verificar en memoria
        if key in self.memory_cache:
            return True
        
        # Si no está en memoria, verificar en archivo
        filename = self._get_cache_filename(key)
        return os.path.exists(filename)
    
    def delete(self, key: str) -> bool:
        """
        Elimina una entrada del caché
        
        Args:
            key: Clave a eliminar
            
        Returns:
            bool: True si se eliminó la entrada, False en caso contrario
        """
        # Eliminar de memoria
        if key in self.memory_cache:
            del self.memory_cache[key]
        
        # Eliminar de archivo
        filename = self._get_cache_filename(key)
        if os.path.exists(filename):
            try:
                os.remove(filename)
                return True
            except Exception as e:
                print(f"Error deleting cache for {key}: {e}")
                return False
        
        return False
    
    def clear(self) -> None:
        """
        Elimina todo el caché
        """
        # Limpiar memoria
        self.memory_cache = {}
        
        # Limpiar archivos
        try:
            import shutil
            shutil.rmtree(self.base_path)
            os.makedirs(self.base_path, exist_ok=True)
            print(f"Cache cleared: {self.base_path}")
        except Exception as e:
            print(f"Error clearing cache: {e}")
    
    def clear_older_than(self, days: int) -> int:
        """
        Elimina entradas de caché más antiguas que un número de días
        
        Args:
            days: Número de días
            
        Returns:
            int: Número de entradas eliminadas
        """
        count = 0
        now = datetime.now()
        
        for root, dirs, files in os.walk(self.base_path):
            for file in files:
                if file.endswith('.pkl'):
                    file_path = os.path.join(root, file)
                    file_age = now - datetime.fromtimestamp(os.path.getmtime(file_path))
                    
                    if file_age.days > days:
                        try:
                            os.remove(file_path)
                            count += 1
                        except Exception:
                            pass
        
        # También limpiar la memoria caché para entradas antiguas
        keys_to_delete = []
        for key in self.memory_cache:
            parts = key.split('_')
            if len(parts) > 1:
                try:
                    date_str = '_'.join(parts[1:])
                    cache_date = datetime.strptime(date_str, '%Y-%m-%d')
                    if (now - cache_date).days > days:
                        keys_to_delete.append(key)
                except Exception:
                    pass
        
        for key in keys_to_delete:
            if key in self.memory_cache:
                del self.memory_cache[key]
                count += 1
        
        return count

class Fund:
    def __init__(self, isin=None, initialize=True, name=None, cache_path=None, use_cache=True):
        
        self.isin = isin
        self.info = False
        self.name = name
        self.use_cache = use_cache
        
        # Inicializar el gestor de caché
        self.cache_manager = CacheManager(base_path=cache_path)
        self.fund_data = None
        #TODO Dejamos el name por si se pudiera buscar por nombre en el futuro
        if initialize and isin is not None:
            self.fund_data = self._process_fund(use_cache=use_cache)

    #### OBTENER DATOS DE FONDOS ####
    
    def get_yahoo_fund_data(self, use_cache=None) -> Optional[pd.DataFrame]:
        """
        Yahoo Finance: Obtiene datos históricos del fondo usando el ISIN
        
        Args:
            use_cache: Si es True, intenta recuperar datos de la caché. Si es None, usa el valor de self.use_cache
        """
        isin = self.isin
        # Determinar si usar caché
        if use_cache is None:
            use_cache = self.use_cache
            
        try:
            # Check cache first
            if self.isin is not None:
                # Create a cache key using isin and current date
                current_date = datetime.now().strftime('%Y-%m-%d')
                cache_key = f"{isin}_yahoo_{current_date}"
                
                # Try to get data from cache if allowed
                if use_cache:
                    cached_data = self.cache_manager.get(cache_key)
                    if cached_data is not None:
                        print(f"✓ Datos obtenidos desde caché para {isin}")
                        return cached_data
            
                # Try direct ISIN with longer period to ensure we get enough history
                stock = yf.Ticker(isin)
                hist = stock.history(period="10y")
                
                if hist.empty: 
                    print(f"✗ No hay datos históricos para {isin}")
                    return None
                
                # Add fund info
                info = stock.info
                hist.attrs = {
                    'ticker': isin,
                    'name': info.get('longName', isin),
                    'isin': isin,
                    'currency': info.get('currency', 'EUR'),
                }
                
                # Cache the data before returning
                self.cache_manager.set(cache_key, hist)
                
                print(f"✓ Datos obtenidos para {isin}: {len(hist)} días")
                return hist
            
        except Exception as e:
            print(f"✗ Error obteniendo datos para {isin}: {str(e)}")
            return None
        
    def get_morningstar_fund_data(self, use_cache=None) -> pd.DataFrame:
        """
        Morningstar: Obtiene datos completos de un fondo y los combina en un único DataFrame
        
        Args:
            use_cache: Si es True, intenta recuperar datos de la caché. Si es None, usa el valor de self.use_cache
        """
        isin = self.isin
        
        # Determinar si usar caché
        if use_cache is None:
            use_cache = self.use_cache
        
        # Create a cache key using isin and current date
        current_date = datetime.now().strftime('%Y-%m-%d')
        cache_key = f"{isin}_morningstar_{current_date}"
        
        # Try to get data from cache if allowed
        if use_cache:
            cached_data = self.cache_manager.get(cache_key)
            if cached_data is not None:
                print(f"✓ Usando datos de Morningstar desde caché para {isin}")
                return cached_data

        print(f"Recopilando datos completos para {isin}...")
        
        
        # Lista para almacenar todos los DataFrames
        dataframes = []
        
        try:
            # Iniciar objeto de Funds
            funds = ms.Funds(isin)
            
            # Datos básicos
            basic_data = {'isin': isin, 'name': getattr(funds, 'name', None)}
            dataframes.append(pd.DataFrame([basic_data]))
            
            # Datos históricos NAV (para usarlos como respaldo si Yahoo falla)
            try:
                # Determinar fechas para el NAV
                end_date = datetime.now()
                start_date = end_date - timedelta(days=365*10)
                
                print(f"  ℹ️ Consultando NAV desde {start_date.strftime('%Y-%m-%d')} hasta {end_date.strftime('%Y-%m-%d')}")
                
                # Obtener el NAV histórico (valores liquidativos)
                nav_data = funds.nav(start_date, end_date)
                nav_data = pd.DataFrame(nav_data)\
                    .assign(nav = lambda x: x.nav.fillna(x.totalReturn))
                
                if isinstance(nav_data, pd.DataFrame) and not nav_data.empty:
                    # Transformar al formato similar a Yahoo para facilitar su uso
                    nav_df = pd.DataFrame({
                        'Date': nav_data['date'],
                        'Close': nav_data['nav'],
                        'Open': nav_data['nav'],  # Usamos el mismo valor para Open
                        'High': nav_data['nav'],  # Usamos el mismo valor para High
                        'Low': nav_data['nav'],   # Usamos el mismo valor para Low
                        'Volume': 0,              # No hay datos de volumen
                        'Source': 'Morningstar'   # Para identificar la fuente
                    }).set_index('Date')
                    
                    # Añadir como atributo independiente para acceder fácilmente
                    ms_data = {'nav_history': nav_df}
                    dataframes.append(pd.DataFrame([ms_data]))
                    print(f"  ✓ Datos históricos NAV obtenidos: {len(nav_df)} registros")
            except Exception as e:
                print(f"  ❌ Error obteniendo datos históricos NAV: {str(e)}")
        
            # Asset allocation map
            try:
                allocation_df = pd.DataFrame(funds.allocationMap()).head(1)[['fundName', 'categoryName', 'assetType', 'countryCode']]
                dataframes.append(allocation_df)
            except Exception as e:
                print(f"  ❌ Error obteniendo allocationMap: {str(e)}")
            
            # Allocation weighting
            try:
                alloc_weights_df = pd.DataFrame(funds.allocationWeighting(), index=[0])\
                    .add_prefix("perc_alloc_")
                if 'portfolioDate' in alloc_weights_df.columns:
                    alloc_weights_df = alloc_weights_df.drop(["portfolioDate"], axis=1)
                if 'masterPortfolioId' in alloc_weights_df.columns:
                    alloc_weights_df = alloc_weights_df.drop(["masterPortfolioId"], axis=1)
                dataframes.append(alloc_weights_df)
            except Exception as e:
                print(f"  ❌ Error obteniendo allocationWeighting: {str(e)}")
            
            # Medalist rating
            try:
                snapshot = funds.snapshot()
                if 'Research' in snapshot and 'MedalistRating' in snapshot['Research'] and 'OverallRating' in snapshot['Research']['MedalistRating']:
                    medalist_df = pd.DataFrame(snapshot['Research']['MedalistRating']['OverallRating'], index=[0])
                    if 'Date' in medalist_df.columns:
                        medalist_df = medalist_df.drop("Date", axis=1)
                    medalist_df = medalist_df.add_prefix('medalist_')
                    dataframes.append(medalist_df)
            except Exception as e:
                print(f"  ❌ Error obteniendo medalist rating: {str(e)}")
            
            # Analyst rating
            try:
                analyst_ratings = funds.analystRating()
                ratings_df = pd.DataFrame(analyst_ratings)[['rating', 'percent']].set_index('rating').T.add_prefix('analystRating_')
                dataframes.append(ratings_df)
            except Exception as e:
                print(f"  ❌ Error obteniendo analystRating: {str(e)}")
            
            # Fee level
            try:
                costs_df = pd.DataFrame(funds.feeLevel(), index=[0])[['ongoingCostsOtherCosts']]
                dataframes.append(costs_df)
            except Exception as e:
                print(f"  ❌ Error obteniendo feeLevel: {str(e)}")
            
            # Investment fee
            try:
                fees_df = pd.DataFrame(ms.Funds(isin).investmentFee()['actualInvestmentFees'], index=[0]).drop("kiidOngoingChargeDate", axis=1)
                dataframes.append(fees_df)
            except Exception as e:
                print(f"  ❌ Error obteniendo investmentFee: {str(e)}")
            
            # Morningstar analyst
            try:
                analyst_df = pd.DataFrame(funds.morningstarAnalyst()['primaryMedalist'], index=[0])[
                    ['analystDriven', 'dataCoverage', 'analystRating', 'overallMorningstarRating', 
                     'morningstarRatingFor3Year', 'morningstarRatingFor5Year', 'morningstarRatingFor10Year']]
                dataframes.append(analyst_df)
            except Exception as e:
                print(f"  ❌ Error obteniendo morningstarAnalyst: {str(e)}")
            
            # Other fees
            try:
                otherfee_df = pd.DataFrame(funds.otherFee(), index=[0])
                dataframes.append(otherfee_df)
            except Exception as e:
                print(f"  ❌ Error obteniendo otherFee: {str(e)}")
            
            # Holdings breakdown
            try:
                rf_rv = (
                    pd.DataFrame(funds.holdings())
                        .groupby("holdingType")
                        .weighting.sum()
                        .reset_index()
                        .assign(holdingType=lambda x:
                            x['holdingType'].map({
                                'Bond': 'Fija',
                                'Equity': 'Variable',
                                'Other': 'Otros'}))
                        .pivot_table(
                            index=None, 
                            columns='holdingType', 
                            values='weighting')
                        .add_prefix('perc_')
                )
                dataframes.append(rf_rv)
            except Exception as e:
                print(f"  ❌ Error obteniendo holdings: {str(e)}")
            
            # Regional sector
            try:
                region_df = pd.DataFrame(funds.regionalSector()['fundPortfolio'], index=[0]).drop(
                    ["portfolioDate", "masterPortfolioId"], axis=1)\
                    .add_prefix("perc_region_")
                dataframes.append(region_df)
            except Exception as e:
                print(f"  ❌ Error obteniendo regionalSector: {str(e)}")
            
            # Risk score
            try:
                risk_df = pd.DataFrame(funds.riskScore())[['riskScore', 'riskLevel']].head(1)
                dataframes.append(risk_df)
            except Exception as e:
                print(f"  ❌ Error obteniendo riskScore: {str(e)}")
            
            # Sector
            try:
                sector_df = pd.DataFrame(funds.sector()['FIXEDINCOME']['fundPortfolio'], index=[0]).drop(
                    ["portfolioDate"], axis=1).add_prefix('perc_sector_')
                dataframes.append(sector_df)
            except Exception as e:
                print(f"  ❌ Error obteniendo sector: {str(e)}")
            
            # Concatenar todos los DataFrames en uno solo
            if dataframes:
                for d in dataframes:
                    d.index = [0]
                result_df = pd.concat(dataframes, axis=1)
                result_df.fillna({"perc_Bond": 0, 
                                "perc_Equity": 0,
                                "perc_Other": 0}, inplace=True)
                print(f"✓ Datos completos recopilados para {isin}")
                
                # Cache the data before returning
                self.cache_manager.set(cache_key, result_df)
                
                return result_df
            else:
                print(f"❌ No se pudieron recopilar datos para {isin}")
                return pd.DataFrame([{'isin': isin, 'error': 'No data available'}])
        
        except Exception as e:
            print(f"❌ Error general obteniendo datos para {isin}: {str(e)}")
            return pd.DataFrame([{'isin': isin, 'error': str(e)}])
            
    def _process_fund(self, use_cache=None) -> pd.DataFrame:
        """
        Procesa un único fondo y recopila todos sus datos.
        
        Args:
            use_cache: Si es True, intenta recuperar datos de la caché. Si es None, usa el valor de self.use_cache
            
        Returns:
            pd.DataFrame: DataFrame con todos los datos procesados del fondo
        """
        # Determinar si usar caché
        if use_cache is None:
            use_cache = self.use_cache
            
        # Crear una clave de caché que incluya la fecha actual
        isin = self.isin
        current_date = datetime.now().strftime('%Y-%m-%d')
        cache_key = f"{self.isin}_{current_date}"
        
        # Verificar si ya tenemos los datos procesados en caché si está permitido
        if use_cache:
            cached_data = self.cache_manager.get(cache_key)
            if cached_data is not None:
                print(f"  ✓ Usando datos en caché para {isin}")
                return cached_data
        
        print(f"\n--- Procesando: {isin}---")
          # Obtener datos históricos para el rendimiento (primero intentar con Yahoo)
        yahoo_data = self.get_yahoo_fund_data(use_cache=use_cache)
        
        # Obtener datos completos de Morningstar
        print(f"Obteniendo datos completos de Morningstar para {isin}...")
        ms_data = self.get_morningstar_fund_data(use_cache=use_cache)
        
        # Obtener datos de Finect y concatenarlos
        print(f"Obteniendo datos de Finect para {isin}...")
        finect_data = scrape_finect_fund_data(isin)
        if finect_data is not None and not finect_data.empty:
            # Asegurarse de que los índices estén alineados para la concatenación
            ms_data.reset_index(drop=True, inplace=True)
            finect_data.reset_index(drop=True, inplace=True)
            ms_data = pd.concat([ms_data, finect_data], axis=1)
            print(f"  ✓ Datos de Finect integrados para {isin}")
        else:
            print(f"  - No se encontraron datos en Finect para {isin}")

        ms_data_dict = ms_data.to_dict('records')[0] if not ms_data.empty else {}
        
        
        # Extraer datos de NAV de Morningstar si existen
        ms_nav_data = None
        if 'nav_history' in ms_data_dict and ms_data_dict['nav_history'] is not None:
            ms_nav_data = ms_data_dict['nav_history']
        else:
            ms_nav_data = pd.DataFrame()

        # Determinar qué fuente de datos usar
        if len(yahoo_data.index) >= 0.9*ms_nav_data.shape[0]:
            historical_data = yahoo_data
            print(f"  ℹ️ Usando datos históricos de Yahoo para {isin}")
        else:
            historical_data = ms_nav_data
            print(f"  ℹ️ Usando datos históricos de Morningstar para {isin}")
        

        # Preparar datos básicos del fondo como un DataFrame
        fund_data = pd.DataFrame([{
            'isin': isin,
            'nombre': ms_data_dict.get('name', isin),
            'historical_data': historical_data,
            'data': ms_data
        }])
        
        # Guardar en el cache manager
        self.cache_manager.set(cache_key, fund_data)
        
        return fund_data

import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import matplotlib.pyplot as plt
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import seaborn as sns
from typing import Dict, List, Tuple, Optional
import requests
import re
import time
import warnings
from bs4 import BeautifulSoup
warnings.filterwarnings('ignore')

class FundPerformanceCalculator:
    def __init__(self):
        self.funds_data = {}
        self.search_cache = {}
        self.finect_cache = {}
        # Headers para las peticiones web
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    
    def get_fund_data(self, isin: str, period: str = "10y") -> Optional[pd.DataFrame]:
        """
        Obtiene datos históricos del fondo usando el ISIN
        """
        try:
            # Check cache first
            if isin in self.funds_data:
                return self.funds_data[isin]
            
            # Try direct ISIN with longer period to ensure we get enough history
            stock = yf.Ticker(isin)
            hist = stock.history(period=period)
            
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
            
            self.funds_data[isin] = hist
            print(f"✓ Datos obtenidos para {isin}: {len(hist)} días")
            return hist
            
        except Exception as e:
            print(f"✗ Error obteniendo datos para {isin}: {str(e)}")
            return None
    
    def get_finect_fund_info(self, isin: str) -> Dict:
        """
        Obtiene información detallada del fondo desde Finect usando ISIN y nombre (slug automático)
        """
        # Obtener nombre del fondo desde Yahoo Finance
        try:
            stock = yf.Ticker(isin)
            info = stock.info
            nombre = info.get('longName', '')
        except Exception:
            nombre = ''

        # Función para crear el slug
        def slugify(text):
            text = text.lower()
            text = re.sub(r'[^\w\s-]', '', text)
            text = re.sub(r'[\s,]+', '_', text)
            return text

        slug = slugify(nombre) if nombre else ""
        url = f"https://www.finect.com/fondos-inversion/{isin}"
        if slug:
            url = f"{url}-{slug}"

        print(f"  • Consultando Finect para {isin}: {url}")

        # Check cache first
        if isin in self.finect_cache:
            return self.finect_cache[isin]
        
        try:
            # Hacer petición
            response = requests.get(url, headers=self.headers, timeout=10)
            
            if response.status_code == 200:
                soup = BeautifulSoup(response.content, 'html.parser')
                
                fund_info = {
                    'categoria': 'No disponible',
                    'subcategoria': 'No disponible',
                    'comision_gestion': 'No disponible',
                    'comision_depositario': 'No disponible',
                    'gastos_corrientes': 'No disponible',
                    'patrimonio': 'No disponible',
                    'gestora': 'No disponible',
                    'moneda': 'No disponible',
                    'encontrado_finect': True
                }
                
                # Extraer categoría (buscar en diferentes posibles ubicaciones)
                category_selectors = [
                    'span[data-testid="category"]',
                    '.category-text',
                    'div:contains("Categoría")',
                    'td:contains("Categoría")'
                ]
                
                for selector in category_selectors:
                    try:
                        category_elem = soup.select_one(selector)
                        if category_elem:
                            fund_info['categoria'] = category_elem.get_text(strip=True)
                            break
                    except:
                        continue
                
                # Extraer comisiones y gastos
                commission_patterns = [
                    ('comision_gestion', ['Comisión de gestión', 'Gestión']),
                    ('comision_depositario', ['Comisión de depositario', 'Depositario']),
                    ('gastos_corrientes', ['Gastos corrientes', 'TER', 'Ratio de gastos'])
                ]
                
                for field, patterns in commission_patterns:
                    for pattern in patterns:
                        try:
                            # Buscar en tablas
                            rows = soup.find_all('tr')
                            for row in rows:
                                if pattern.lower() in row.get_text().lower():
                                    cells = row.find_all(['td', 'th'])
                                    if len(cells) >= 2:
                                        value = cells[-1].get_text(strip=True)
                                        if '%' in value or '€' in value:
                                            fund_info[field] = value
                                            break
                            
                            # Buscar en divs con texto
                            for div in soup.find_all('div'):
                                text = div.get_text()
                                if pattern.lower() in text.lower():
                                    # Buscar porcentajes en el texto
                                    percent_match = re.search(r'(\d+[.,]\d+)%', text)
                                    if percent_match:
                                        fund_info[field] = percent_match.group(1).replace(',', '.') + '%'
                                        break
                        except:
                            continue
                
                # Extraer patrimonio
                try:
                    # Buscar patrimonio en millones
                    for elem in soup.find_all(text=re.compile(r'(\d+[.,]\d*)\s*(millones|M€|mill)')):
                        match = re.search(r'(\d+[.,]\d*)\s*(millones|M€|mill)', elem)
                        if match:
                            value = match.group(1).replace(',', '.')
                            fund_info['patrimonio'] = f"{value} M€"
                            break
                except:
                    pass
                
                # Extraer gestora
                try:
                    gestora_selectors = [
                        'span[data-testid="management-company"]',
                        '.management-company',
                        'div:contains("Gestora")'
                    ]
                    
                    for selector in gestora_selectors:
                        gestora_elem = soup.select_one(selector)
                        if gestora_elem:
                            fund_info['gestora'] = gestora_elem.get_text(strip=True)
                            break
                except:
                    pass
                
                # Clasificar tipo de fondo basado en categoría
                fund_info['tipo'] = self.classify_fund_from_category(fund_info['categoria'])
                
                print(f"    ✓ Información obtenida de Finect: {fund_info['categoria']}")
                
                # Cache result
                self.finect_cache[isin] = fund_info
                return fund_info
                
            else:
                print(f"    ❌ Error al acceder a Finect: {response.status_code}")
                
        except Exception as e:
            print(f"    ❌ Error consultando Finect: {str(e)}")
        
        # Return default info if failed
        default_info = {
            'categoria': 'No disponible',
            'subcategoria': 'No disponible',
            'comision_gestion': 'No disponible',
            'comision_depositario': 'No disponible',
            'gastos_corrientes': 'No disponible',
            'patrimonio': 'No disponible',
            'gestora': 'No disponible',
            'moneda': 'No disponible',
            'tipo': 'No disponible',
            'encontrado_finect': False
        }
        
        self.finect_cache[isin] = default_info
        return default_info
    
    def classify_fund_from_category(self, category: str) -> str:
        """
        Clasifica el fondo basado en la categoría Morningstar/Finect
        """
        if category == 'No disponible':
            return 'No disponible'
        category_lower = category.lower()

        # Renta fija: categorías que empiezan por RF
        if category_lower.startswith('rf') or 'renta fija' in category_lower or 'fixed income' in category_lower:
            return 'Renta Fija'
        # Renta variable: categorías que empiezan por RV
        if category_lower.startswith('rv') or 'renta variable' in category_lower or 'equity' in category_lower:
            return 'Renta Variable'
        # Mixto: categorías que empiezan por MIX o contienen 'mixto'
        if category_lower.startswith('mix') or 'mixto' in category_lower or 'balanced' in category_lower:
            return 'Mixto'
        # Monetario
        if 'monetario' in category_lower or 'money market' in category_lower:
            return 'Monetario'
        # Garantizado
        if 'garantizado' in category_lower or 'guaranteed' in category_lower:
            return 'Garantizado'
        # Temático/Sectorial
        if 'sector' in category_lower or 'temático' in category_lower or 'thematic' in category_lower:
            return 'Temático'
        return 'Otros'
    
    def calculate_performance(self, data: pd.DataFrame, periods: List[int] = [1, 3, 5]) -> Dict:
        """
        Calcula rentabilidades para diferentes períodos (solo fecha, sin hora)
        """
        results = {}
        current_price = data['Close'].iloc[-1]

        # Convertir el índice a fecha sin hora
        idx = pd.to_datetime(data.index).normalize()
        idx_dates = idx.date

        for years in periods:
            try:
                # Calcular la fecha objetivo y normalizar (sin hora)
                target_date = (datetime.now() - timedelta(days=years * 365)).date()

                # Buscar la fecha más cercana anterior o igual a target_date
                available_dates = idx[idx_dates <= target_date]
                if len(available_dates) == 0:
                    available_dates = idx[idx_dates > target_date]
                    if len(available_dates) == 0:
                        start_date = idx[0]
                    else:
                        start_date = available_dates[0]
                    print(f"    ⚠️ No hay suficientes datos históricos, usando fecha más próxima {start_date.strftime('%Y-%m-%d')}")
                else:
                    start_date = available_dates[-1]
                    print(f"    ✓ Fecha más cercana encontrada: {start_date.strftime('%Y-%m-%d')}")

                start_price = data.loc[start_date, 'Close']
                actual_years = (idx[-1] - start_date).days / 365.25
                total_return = (current_price / start_price - 1) * 100
                annual_return = (pow(current_price / start_price, 1/actual_years) - 1) * 100

                print(f"    ✓ Precio inicial: {start_price:.2f}, Precio actual: {current_price:.2f}")
                print(f"    ✓ Rentabilidad total: {total_return:.2f}%, Rentabilidad anual: {annual_return:.2f}%")

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
                print(f"    ❌ Error calculando rendimiento {years}y: {str(e)}")
                results[f'{years}y'] = None

        return results
    
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
    
    def analyze_portfolio(self, funds_df: pd.DataFrame, periods: List[int] = [1, 3, 5]) -> dict:
        """
        Analiza una cartera de fondos desde un DataFrame con columnas 'Nombre', 'ISIN', e 'Inversion'
        """
        # Agrupar por ISIN y sumar inversiones
        portfolio = funds_df.groupby(['Nombre', 'ISIN']).agg({'Inversion': 'sum'}).reset_index()
        total_investment = portfolio['Inversion'].sum()
        
        portfolio_results = {
            'total_investment': total_investment,
            'funds': [],
            'portfolio_summary': {
                'weighted_returns': {f'{p}y': 0 for p in periods},
                'total_current_value': 0
            }
        }
        
        print(f"\n--- Analizando cartera con {len(portfolio)} fondos y {total_investment:,.2f}€ de inversión ---")
        
        for _, row in portfolio.iterrows():
            fund_name = row['Nombre']
            isin = row['ISIN']
            investment = row['Inversion']
            weight = investment / total_investment
            
            print(f"\n--- Analizando: {fund_name} ({isin}) - {investment:,.2f}€ ({weight:.2%}) ---")
            
            # Get fund info from Finect
            finect_info = self.get_finect_fund_info(isin)
            
            # Get fund data
            data = self.get_fund_data(isin)
            if data is None or data.empty:
                fund_result = {
                    'nombre': fund_name,
                    'isin': isin,
                    'ticker': isin,
                    'inversion': investment,
                    'peso': weight,
                    'valor_actual': investment,
                    'tipo': finect_info['tipo'],
                    'categoria': finect_info['categoria'],
                    'comision_gestion': finect_info['comision_gestion'],
                    'gastos_corrientes': finect_info['gastos_corrientes'],
                    'patrimonio': finect_info['patrimonio'],
                    'gestora': finect_info['gestora'],
                    'encontrado': False,
                    'encontrado_finect': finect_info['encontrado_finect']
                }
                portfolio_results['funds'].append(fund_result)
                portfolio_results['portfolio_summary']['total_current_value'] += investment
                continue
            
            # Calculate metrics
            performance = self.calculate_performance(data, periods)
            volatility = self.calculate_volatility(data)
            max_drawdown = self.calculate_max_drawdown(data)
            
            # Calculate current value
            current_price = data['Close'].iloc[-1]
            initial_price = data['Close'].iloc[0]
            return_factor = current_price / initial_price
            current_value = investment * return_factor
            
            # Prepare result
            fund_result = {
                'nombre': fund_name,
                'isin': isin,
                'ticker': isin,
                'inversion': investment,
                'peso': weight,
                'precio_actual': round(current_price, 2),
                'valor_actual': round(current_value, 2),
                'tipo': finect_info['tipo'],
                'categoria': finect_info['categoria'],
                'comision_gestion': finect_info['comision_gestion'],
                'gastos_corrientes': finect_info['gastos_corrientes'],
                'patrimonio': finect_info['patrimonio'],
                'gestora': finect_info['gestora'],
                'rentabilidad_total': round((return_factor - 1) * 100, 2),
                'volatilidad_anual': volatility,
                'max_drawdown': max_drawdown,
                'encontrado': True,
                'encontrado_finect': finect_info['encontrado_finect']
            }
            
            # Add returns by period
            for period in periods:
                period_key = f'{period}y'
                if performance.get(period_key):
                    fund_result[f'rentabilidad_{period}y_total'] = performance[period_key]['total_return']
                    fund_result[f'rentabilidad_{period}y_anual'] = performance[period_key]['annual_return']
                    
                    # Add to weighted return
                    portfolio_results['portfolio_summary']['weighted_returns'][period_key] += \
                        (performance[period_key]['annual_return'] * weight)
                else:
                    fund_result[f'rentabilidad_{period}y_total'] = None
                    fund_result[f'rentabilidad_{period}y_anual'] = None
            
            portfolio_results['funds'].append(fund_result)
            portfolio_results['portfolio_summary']['total_current_value'] += current_value
            
            # Small pause to avoid overwhelming the servers
            time.sleep(1)
        
        # Calculate portfolio performance
        portfolio_results['portfolio_summary']['total_return'] = \
            (portfolio_results['portfolio_summary']['total_current_value'] / total_investment - 1) * 100
        
        # Round weighted returns
        for period in periods:
            portfolio_results['portfolio_summary']['weighted_returns'][f'{period}y'] = \
                round(portfolio_results['portfolio_summary']['weighted_returns'][f'{period}y'], 2)
        
        return portfolio_results
    
    def display_portfolio_analysis(self, portfolio_results: dict):
        """Muestra los resultados del análisis de cartera de forma formateada"""
        total_investment = portfolio_results['total_investment']
        total_current_value = portfolio_results['portfolio_summary']['total_current_value']
        total_return = portfolio_results['portfolio_summary']['total_return']
        
        print("\n📊 RESUMEN DE LA CARTERA")
        print("=" * 50)
        print(f"Inversión total: {total_investment:,.2f}€")
        print(f"Valor actual: {total_current_value:,.2f}€")
        print(f"Rentabilidad total: {total_return:.2f}%")
        print(f"Rentabilidad anualizada:")
        
        for period, return_value in portfolio_results['portfolio_summary']['weighted_returns'].items():
            print(f"  • {period}: {return_value:.2f}%")
        
        print("\n📈 DESGLOSE POR FONDOS")
        print("=" * 50)
        
        funds_df = pd.DataFrame(portfolio_results['funds'])
        
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
    
    def plot_comparison_plotly(self, funds_df: pd.DataFrame, period: str = "2y"):
        """
        Grafica interactiva de comparación de fondos usando Plotly
        """
        # Crear figura base
        fig = go.Figure()
        
        # Obtener datos para cada fondo y normalizar
        isins = funds_df['isin'].unique()
        
        # Crear un diccionario de colores
        colores = ['#0096C8', '#FF8728', '#E60000', '#00A037', '#FFC83C', '#BEAA96',
                  '#144696', '#C84196', '#7891A5', '#64283C', '#285A32', '#C896B4', '#8C5A3C']
        
        # Ordenar fondos por valor actual (mayor a menor)
        funds_df_sorted = funds_df.sort_values('valor_actual', ascending=False)
        
        # Dropdown buttons para seleccionar fondos
        dropdown_buttons = []
        
        # Primero añadir opción "Todos los fondos"
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
        
        # Añadir cada fondo al gráfico
        for i, isin in enumerate(isins):
            # Obtener datos del fondo
            data = self.get_fund_data(isin, period)
            if data is not None and not data.empty:
                # Normalizar precios (base 100)
                normalized_prices = (data['Close'] / data['Close'].iloc[0]) * 100
                
                # Obtener nombre y tipo del fondo
                fund_info = funds_df[funds_df['isin'] == isin].iloc[0]
                fund_name = fund_info['nombre']
                fund_type = fund_info['tipo'] if 'tipo' in fund_info else ''
                fund_value = fund_info['valor_actual']
                
                # Añadir traza para este fondo
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
                
                # Botón para mostrar solo este fondo
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
        
        # Configurar layout
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
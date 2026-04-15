import pandas as pd
import mstarpy
import datetime

# ISINs de la cartera actual para la API
portfolio_data = [
    {"Fondo": "SP500 IE00BYX5MX67", "ISIN": "IE00BYX5MX67", "TIPO": "INDEX", "Porcentaje": 15.93},
    {"Fondo": "MSCI1 IE00BD0NCM55", "ISIN": "IE00BD0NCM55", "TIPO": "INDEX", "Porcentaje": 9.44},
    {"Fondo": "MSCI2 IE00BYX5NX33", "ISIN": "IE00BYX5NX33", "TIPO": "INDEX", "Porcentaje": 9.12},
    {"Fondo": "Horos Value Intl", "ISIN": "ES0146309002", "TIPO": "VALUE", "Porcentaje": 6.11},
    {"Fondo": "Robeco BP Global", "ISIN": "LU0329355670", "TIPO": "VALUE", "Porcentaje": 2.74},
    {"Fondo": "Cobas Int", "ISIN": "LU1598719752", "TIPO": "VALUE", "Porcentaje": 2.74},
    {"Fondo": "DNB Tech", "ISIN": "LU0302296495", "TIPO": "SPECIALIZED", "Porcentaje": 5.90},
]

def analyze_morningstar(isin):
    print(f"📡 Consultando API Morningstar directa para {isin}...")
    try:
        # Petición a APIs internas de MS (sin Chromium)
        fund = mstarpy.Funds(term=isin)
        
        info = fund.fund_information() if hasattr(fund, "fund_information") else {}
        
        # Extraer estrellas Morningstar
        stars = info.get("starRating") if isinstance(info, dict) else None
        stars_str = f"{stars} ⭐" if stars else "N/A"
            
        # Extraer NAV actual a través de datos históricos (los últimos 3 días para garantizar que haya dato)
        end_d = datetime.date.today()
        start_d = end_d - datetime.timedelta(days=7)
        try:
            nav_data = fund.nav(start_date=start_d, end_date=end_d)
            if nav_data and len(nav_data) > 0:
                current_nav = nav_data[-1].get("nav", "N/A")
            else:
                current_nav = "N/A"
        except Exception:
            current_nav = "N/A"
            
        # Intentar extraer la categoría y YTD
        category = info.get("categoryName") if isinstance(info, dict) else "N/A"
        ytd = "N/A"
        try:
            perf = fund.performance()
            if isinstance(perf, list) and len(perf)>0:
                # buscar YTD en performance
                for item in perf:
                    if item.get("timePeriod") == "YTD":
                        ytd = item.get("return", "N/A")
        except:
            pass
            
        return {
            "Morningstar Name": fund.name[:30] + '...',
            "Estrellas MS": stars_str,
            "Valor Liq (NAV)": current_nav,
            "YTD (%)": f"{ytd}%" if ytd != "N/A" else "N/A",
            "Categoría": category[:25]
        }
    except Exception as e:
        print(f"⚠️ Error al consultar {isin}: el ISIN no fue encontrado en la API.")
        return {"Morningstar Name": "Error", "Estrellas MS": "Error", "Valor Liq (NAV)": "Error", "YTD (%)": "Error", "Categoría": "Error"}

def main():
    print("="*80)
    print("🌟 INVESTIGADOR MORNINGSTAR (Vía API HTTP Directa) 🌟")
    print("="*80)
    
    results = []
    
    for item in portfolio_data:
        data = analyze_morningstar(item["ISIN"])
        item.update(data)
        results.append(item)
        
    df = pd.DataFrame(results)
    
    print("\n--- MÉTRICAS ACTUALES DE TU CARTERA ---")
    columns_to_show = ['Fondo', 'Morningstar Name', 'Estrellas MS', 'Valor Liq (NAV)', 'YTD (%)', 'Categoría']
    print(df[columns_to_show].to_string(index=False))
    
    print("\n💡 ESTRATEGIA ACTUALIZADA PARA TU 1-2% EXTRA:")
    print("El rating de Morningstar evalúa la calidad y retorno histórico ajustado al riesgo.")
    print("Fondos con 4 o 5 ⭐ en tu categoría VALUE (Horos, Cobas..) son oportunidades ")
    print("ideales para invertir tus excesos de liquidez dado que la macro actual castiga al")
    print("Growth y premia sectores tradicionales infravalorados. ¡Pruébate a ti mismo y compra en las caídas del NAV!")

if __name__ == "__main__":
    main()

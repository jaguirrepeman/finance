from bs4 import BeautifulSoup
import re

def redesign_pdf():
    with open('puglia-guide-ruta-e.html', 'r', encoding='utf-8') as f:
        html = f.read()
        
    # 0. Translations (Italian to Spanish)
    translations = {
        r'\bArrivo\b': 'Llegada',
        r'\bCentro storico\b': 'Centro histórico',
        r'\bCittà Vecchia\b': 'Ciudad Vieja',
        r'\bCittà Bianca\b': 'Ciudad Blanca',
        r'\bLungomare\b': 'Paseo marítimo',
        r'\bCattedrale\b': 'Catedral',
        r'\bChiesa\b': 'Iglesia',
        r'\bDuomo\b': 'Catedral',
        r'\bCastello\b': 'Castillo',
        r'\bPorto storico\b': 'Puerto histórico',
        r'\bPiazza\b': 'Plaza',
        r'\bPalazzo\b': 'Palacio',
        r'\bpasseggiata\b': 'paseo',
        r'\bPasseggiata\b': 'Paseo',
        r'\bBasilica\b': 'Basílica',
        r'\bMercato Coperto\b': 'Mercado Cubierto'
    }
    
    for it, es in translations.items():
        html = re.sub(it, es, html)
    
    soup = BeautifulSoup(html, 'html.parser')
    
    # 1. Cleanup "Ruta E" texts
    for element in soup.find_all(string=re.compile("Ruta E")):
        element.replace_with(element.replace("Ruta E", "Edición Premium"))
        
    # 2. Extract components
    hero = soup.find('section', class_='hero')
    overview = soup.find('section', id='overview')
    day_cards = soup.find_all('article', class_='day-card')
    
    # Extract scripts
    scripts_content = ""
    scripts = soup.find_all('script')
    for script in scripts:
        scripts_content += str(script) + "\n"
        
    # Reliable Wikimedia images for Puglia locations
    day_images = [
        "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Brindisi_port.jpg/1200px-Brindisi_port.jpg", # D1: Brindisi
        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Lecce_Piazza_del_Duomo_2.jpg/1200px-Lecce_Piazza_del_Duomo_2.jpg", # D2: Lecce
        "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Ostuni_01.jpg/1200px-Ostuni_01.jpg", # D3: Ostuni
        "https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Castello_aragonese_Taranto.jpg/1200px-Castello_aragonese_Taranto.jpg", # D4: Taranto
        "https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Polignano_a_Mare_-_Lama_Monachile.jpg/1200px-Polignano_a_Mare_-_Lama_Monachile.jpg", # D5: Polignano
        "https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Alberobello_002.jpg/1200px-Alberobello_002.jpg", # D6: Alberobello
        "https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Matera_Sassi_panorama.jpg/1200px-Matera_Sassi_panorama.jpg", # D7: Matera
        "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Trani-Cattedrale04.jpg/1200px-Trani-Cattedrale04.jpg", # D8: Trani
        "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Castel_del_Monte_2.jpg/1200px-Castel_del_Monte_2.jpg", # D9: Castel del Monte
        "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Bari_Basilica_di_San_Nicola.jpg/1200px-Bari_Basilica_di_San_Nicola.jpg", # D10: Bari
    ]
    
    historical_contexts = [
        "Brindisi fue uno de los puertos más importantes del Imperio Romano y punto final de la Vía Apia.",
        "Lecce representa el apogeo del barroco en el sur de Italia (el Barocco Leccese).",
        "Ostuni, la 'Ciudad Blanca', encalaba sus casas desde la Edad Media para evitar la propagación de epidemias.",
        "Taranto y Bari conservan un patrimonio invaluable bizantino y de la Magna Grecia.",
        "Polignano a Mare desafía la gravedad con sus casas colgadas sobre espectaculares acantilados.",
        "Los trulli de Alberobello se construían sin argamasa para ser desmontados rápidamente y evadir impuestos.",
        "Matera es uno de los asentamientos habitados más antiguos del mundo, Patrimonio de la Humanidad.",
        "Trani y Barletta brillan con sus espectaculares catedrales de piedra blanca asomadas al mar Adriático.",
        "Castel del Monte es la obra maestra octogonal del emperador Federico II, llena de simbolismo astronómico.",
        "Bari fue la capital del Imperio Bizantino en la península italiana antes de la conquista normanda."
    ]

    # Generate new HTML structure
    out_html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Puglia 2026 — Guía Premium</title>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Source+Sans+3:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin/>

<style>
/* CSS Base de Variables Originales de la Guía */
:root {{
  --ink: #1a2530; --ink-2: #334155; --ink-3: #6b6b75; --ink-4: #9b9ba6;
  --bg: #ece9df; /* Fondo general del visor PDF */
  --bg-2: #f2ede2; --surface: #ffffff; --border: #e4ddd1;
  --gold: #c5a059; --gold-lt: #fdf5e0; --blue: #0f2540; --blue-lt: #e8eef5;
  --terra: #a0410d; --teal: #2a7a6f; --violet: #5c3d8f; --green: #2d6a4f; --olive: #6b7c45;
  --zone-salento: #a0410d; --zone-taranto: #1d3557; --zone-costa: #2a7a6f;
  --zone-valle: #6b7c45; --zone-matera: #5c3d8f; --zone-nord: #c9961a; --zone-murgia: #457b9d;
  --ff-serif: 'Playfair Display', serif; --ff-sans: 'Source Sans 3', sans-serif;
  --sp-1: 0.25rem; --sp-2: 0.5rem; --sp-3: 0.75rem; --sp-4: 1rem; --sp-5: 1.5rem; --sp-6: 2rem; --sp-7: 3rem; --sp-8: 4rem;
  --r-sm: 4px; --r-md: 6px; --r-lg: 8px; --r-xl: 12px;
}}
*, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
body {{ background: var(--bg); font-family: var(--ff-sans); color: var(--ink); line-height: 1.7; font-size: 16px; overflow-x: hidden; }}
h1, h2, h3, h4, h5 {{ font-family: var(--ff-serif); color: var(--blue); }}
a {{ color: var(--blue); text-decoration: none; }}
p {{ margin-bottom: 1rem; }}
img {{ max-width: 100%; display: block; }}

/* Visor PDF (Páginas interactivas) */
.pdf-viewer {{
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3rem;
  padding: 3rem 1rem;
}}
.pdf-page {{
  background: var(--surface);
  width: 100%;
  max-width: 900px;
  min-height: 1100px; /* Aspecto físico aproximado */
  padding: 4rem;
  box-shadow: 0 20px 50px rgba(0,0,0,0.1), 0 5px 15px rgba(0,0,0,0.05);
  border-radius: 4px;
  position: relative;
}}
@media(max-width: 800px) {{ .pdf-page {{ padding: 2rem; min-height: auto; }} }}

/* Estilos extraídos originales para que el contenido no se rompa */
.day-header {{ display: flex; align-items: center; gap: 1.5rem; border-left: 6px solid var(--zone-color, var(--blue)); padding-left: 1.5rem; margin-bottom: 2rem; }}
.day-num-wrap {{ width: 60px; height: 60px; background: var(--zone-color, var(--blue)); color: white; display: flex; align-items: center; justify-content: center; border-radius: 50%; flex-direction: column; flex-shrink: 0; }}
.day-num-wrap .num {{ font-size: 1.6rem; font-weight: bold; font-family: var(--ff-serif); line-height: 1; }}
.day-title-wrap h2 {{ font-size: 1.8rem; line-height: 1.1; margin-bottom: 0.2rem; }}
.day-date-tag {{ border: 2px solid var(--zone-color, var(--blue)); padding: 0.5rem 1rem; border-radius: 6px; text-align: center; margin-left: auto; flex-shrink: 0; }}
.day-date-tag .dday {{ font-size: 1.5rem; font-weight: bold; color: var(--zone-color); line-height: 1; }}

/* Monumentos y Destinos */
.dest-heading h3 {{ font-size: 2rem; margin-bottom: 1.5rem; border-bottom: 2px solid var(--border); padding-bottom: 0.5rem; }}
.dest-intro::first-letter {{ font-family: var(--ff-serif); font-size: 3.5rem; font-weight: 700; float: left; line-height: 0.8; margin-right: 0.15em; color: var(--gold); }}
.monument {{ background: #fdfdfc; border: 1px solid var(--border); border-left: 3px solid var(--zone-color, var(--blue)); padding: 1.5rem; margin-bottom: 1.5rem; transition: transform 0.2s, box-shadow 0.2s; }}
.monument:hover {{ transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,0.06); }}
.monument-title {{ font-size: 1.2rem; margin-bottom: 0.8rem; font-weight: bold; display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }}

/* Componentes especiales */
.history-block {{ background: #fcfbfa; border-left: 4px solid var(--gold); padding: 1.5rem; margin-bottom: 2rem; font-family: var(--ff-serif); font-style: italic; font-size: 1.2rem; color: var(--blue); box-shadow: 0 2px 8px rgba(0,0,0,0.03); }}
.history-block strong {{ display: block; font-family: var(--ff-sans); font-style: normal; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em; color: var(--gold); margin-bottom: 0.5rem; }}
.pull-quote {{ border-left: 3px solid var(--gold); padding: 1rem 1.5rem; background: var(--gold-lt); font-style: italic; font-size: 1.1rem; font-family: var(--ff-serif); margin: 1.5rem 0; }}
.factbox {{ float: right; width: 250px; border-top: 3px solid var(--zone-color); background: var(--surface); box-shadow: 0 4px 12px rgba(0,0,0,0.05); padding: 1rem; margin: 0 0 1rem 1.5rem; font-size: 0.85rem; }}
.factbox h5 {{ text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.7rem; margin-bottom: 0.5rem; }}
.gastro-strip {{ display: flex; gap: 1rem; background: #eaf4ef; padding: 1rem; border-radius: 6px; margin: 1.5rem 0; font-size: 0.85rem; border: 1px solid #c5e0d4; flex-wrap: wrap; }}
.gastro-item strong {{ color: #1a4530; display: block; }}
.chip, .badge, .pri {{ display: inline-block; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.75rem; font-weight: bold; font-family: var(--ff-sans); }}
.b-train {{ background: #dceefb; color: #144d7d; }} .b-bus {{ background: #d5f5e3; color: #1a6b40; }} .b-alert {{ background: #fff0d0; color: #8a5a00; }}
.chip.hours {{ background: #e6f4f2; color: #2a7a6f; border: 1px solid #b2d8d2; }}
.chip.price {{ background: #faeee8; color: #a0410d; border: 1px solid #f0c4ae; }}
.chip.loc {{ background: #e8eef5; color: #0f2540; border: 1px solid #c0d0e8; }}
.pri-1 {{ background: #fde8e8; color: #b02020; }} .pri-2 {{ background: #fef3cd; color: #8a5a00; }} .pri-3 {{ background: var(--blue-lt); color: var(--blue); }}


/* Logística y Mapas */
.sblock {{ margin-bottom: 1.5rem; font-size: 0.9rem; }}
.sblock h4 {{ border-bottom: 1px solid var(--gold); padding-bottom: 0.5rem; margin-bottom: 1rem; font-family: var(--ff-sans); text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.8rem; color: var(--gold); }}
.srow {{ display: flex; justify-content: space-between; border-bottom: 1px dotted var(--border); padding: 0.4rem 0; }}
.srow .sv {{ font-weight: bold; text-align: right; max-width: 60%; }}
.day-map {{ height: 350px; width: 100%; border: 1px solid var(--border); border-radius: 6px; margin-top: 2rem; box-shadow: 0 5px 15px rgba(0,0,0,0.05); z-index: 10; }}
#general-map {{ height: 500px; width: 100%; border: 1px solid var(--border); border-radius: 6px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); margin-top: 2rem; z-index: 10; }}

/* Imagen de Cover por Día */
.day-cover-img {{ width: calc(100% + 8rem); margin: -4rem -4rem 2rem -4rem; height: 400px; object-fit: cover; border-bottom: 4px solid var(--gold); }}
@media(max-width: 800px) {{ .day-cover-img {{ width: calc(100% + 4rem); margin: -2rem -2rem 1rem -2rem; height: 250px; }} }}

/* Interfaz Interactiva de "Día" (Tabs) */
.page-tabs {{ display: flex; gap: 0.5rem; margin-bottom: 2rem; border-bottom: 2px solid var(--border); padding-bottom: 0.5rem; overflow-x: auto; }}
.tab-btn {{ padding: 0.5rem 1rem; border: none; background: none; font-family: var(--ff-sans); font-weight: bold; font-size: 0.9rem; color: var(--ink-3); cursor: pointer; border-radius: 4px 4px 0 0; transition: all 0.2s; white-space: nowrap; }}
.tab-btn.active {{ color: var(--blue); border-bottom: 3px solid var(--blue); }}
.tab-btn:hover:not(.active) {{ background: var(--bg-2); }}

/* IMPORTANT FIX FOR MAPS: DO NOT use display:none! It causes Leaflet to compute 0x0 size. */
.tab-content {{ 
  position: absolute; 
  visibility: hidden; 
  opacity: 0; 
  pointer-events: none;
  width: 100%;
  left: 0;
  transition: opacity 0.3s;
}}
.tab-content-container {{ position: relative; }}
.tab-content.active {{ 
  position: relative; 
  visibility: visible; 
  opacity: 1; 
  pointer-events: auto;
}}

/* Overview Grid */
.overview-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1.5rem; margin-top: 2rem; }}
.overview-card {{ padding: 1.5rem; border: 1px solid var(--border); border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); display: flex; gap: 1rem; }}
.oc-num {{ font-size: 2rem; font-family: var(--ff-serif); font-weight: bold; color: var(--gold); line-height: 1; }}

/* Portada Original Estilizada */
.hero {{ min-height: 90vh; background: linear-gradient(rgba(15,37,64,0.4), rgba(15,37,64,0.9)), url('https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Brindisi_port.jpg/1200px-Brindisi_port.jpg') center/cover; display: flex; flex-direction: column; justify-content: flex-end; padding: 4rem; color: white; margin-bottom: -3rem; }}
.hero-title {{ font-size: clamp(3rem, 7vw, 6rem); margin-bottom: 1rem; color: white; line-height: 1; text-shadow: 0 10px 30px rgba(0,0,0,0.3); }}
.hero-subtitle {{ font-size: 1.5rem; font-style: italic; color: #e2dcd0; max-width: 600px; }}

</style>
</head>
<body>

{str(hero) if hero else ''}

<div class="pdf-viewer">
"""
    
    # Overview page
    if overview:
        out_html += f"""
<div class="pdf-page">
  {str(overview)}
</div>
"""

    # Generate multi-page layout for each day
    for i, card in enumerate(day_cards):
        header = card.find('div', class_='day-header')
        zone_color = card.get('style', '--zone-color: var(--blue);')
        
        main = card.find('div', class_='day-main')
        dests = main.find_all('div', class_='dest') if main else []
        
        sidebar = card.find('div', class_='day-sidebar') or card.find('aside', class_='day-sidebar')
        
        img = day_images[i] if i < len(day_images) else day_images[0]
        hist = historical_contexts[i] if i < len(historical_contexts) else historical_contexts[0]
        
        # We make each day a PDF page with TABS inside for interactivity (easier and better than giant vertical stacks)
        out_html += f"""
<div class="pdf-page" style="{zone_color}" id="day-{i+1}">
  <img src="{img}" class="day-cover-img" alt="Fotografía representativa de Puglia">
  {str(header)}
  
  <div class="history-block">
    <strong>Contexto Histórico</strong>
    {hist}
  </div>
  
  <div class="page-tabs">
"""
        # Generate tabs
        for j, dest in enumerate(dests):
            active = 'active' if j == 0 else ''
            dest_h3 = dest.find('h3')
            tab_name = dest_h3.text.strip() if dest_h3 else f"Destino {j+1}"
            out_html += f'<button class="tab-btn {active}" onclick="openTab(event, \'day{i}-tab{j}\')">{tab_name}</button>'
            
        out_html += f'<button class="tab-btn" onclick="openTab(event, \'day{i}-logistica\')">Logística & Mapa</button>'
        out_html += "</div>\n"
        
        # Generate tab contents (dests)
        out_html += '<div class="tab-content-container">\n'
        for j, dest in enumerate(dests):
            active = 'active' if j == 0 else ''
            
            # Add drop-cap class to first p if exists
            first_p = dest.find('p', recursive=False)
            if first_p:
                first_p['class'] = first_p.get('class', []) + ['dest-intro']
                
            out_html += f'<div id="day{i}-tab{j}" class="tab-content {active}">{str(dest)}</div>'
            
        # Generate logistics tab
        out_html += f'<div id="day{i}-logistica" class="tab-content">{str(sidebar)}</div>'
        
        out_html += "</div>\n" # end tab-content-container
        out_html += "</div>\n" # end pdf-page

    # Add the JS for tabs and the original scripts
    out_html += """
</div> <!-- end pdf-viewer -->

<script>
function openTab(evt, tabId) {
  var page = evt.currentTarget.closest('.pdf-page');
  
  var tabContents = page.getElementsByClassName('tab-content');
  for (var i = 0; i < tabContents.length; i++) {
    tabContents[i].className = tabContents[i].className.replace(" active", "");
  }
  
  var tabBtns = page.getElementsByClassName('tab-btn');
  for (var i = 0; i < tabBtns.length; i++) {
    tabBtns[i].className = tabBtns[i].className.replace(" active", "");
  }
  
  var activeTab = document.getElementById(tabId);
  activeTab.className += " active";
  evt.currentTarget.className += " active";
  
  // FIX PARA LEAFLET MAPS: forzar redimensionamiento al hacerse visible la pestaña.
  var mapContainer = activeTab.querySelector('.day-map');
  if (mapContainer && window.dispatchEvent) {
     setTimeout(function(){ window.dispatchEvent(new Event('resize')); }, 100);
  }
}

// Trigger initial resize just in case to fix maps that might be in first tabs
setTimeout(function(){ window.dispatchEvent(new Event('resize')); }, 500);

</script>
"""
    # Finally, append all the original scripts so Leaflet works!
    # Also apply translations to the scripts to make sure popup texts are in Spanish
    for it, es in translations.items():
         scripts_content = re.sub(it, es, scripts_content)
         
    out_html += scripts_content
    
    out_html += "</body></html>"
    
    with open('Puglia_Premium_Guide.html', 'w', encoding='utf-8') as f:
        f.write(out_html)

if __name__ == '__main__':
    redesign_pdf()

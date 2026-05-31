import re

def fix_guide():
    with open('puglia-guide-ruta-e.html', 'r', encoding='utf-8') as f:
        html = f.read()
        
    # 1. Update CSS variables to Premium Palette
    html = re.sub(r'--bg:\s*#[0-9a-fA-F]+;', '--bg: #f5f2eb;', html) # Sand
    html = re.sub(r'--surface:\s*#[0-9a-fA-F]+;', '--surface: #ffffff;', html) # White
    html = re.sub(r'--ink:\s*#[0-9a-fA-F]+;', '--ink: #1a2530;', html) # Navy dark
    html = re.sub(r'--ink-2:\s*#[0-9a-fA-F]+;', '--ink-2: #334155;', html) 
    html = re.sub(r'--blue:\s*#[0-9a-fA-F]+;', '--blue: #0f2540;', html) # Deep Navy
    html = re.sub(r'--gold:\s*#[0-9a-fA-F]+;', '--gold: #c5a059;', html) # Premium Gold
    
    # 2. Inject Luxury CSS extensions
    luxury_css = """
/* Luxury Extensions */
.day-card {
  box-shadow: 0 15px 40px rgba(15, 37, 64, 0.08) !important;
  border: 1px solid #e2dcd0 !important;
  border-radius: 4px !important; /* Less rounded for print look */
  margin: 4rem 0 !important;
  background: #ffffff;
}
.pdf-page-image {
  width: 100%;
  height: 350px;
  object-fit: cover;
  border-bottom: 3px solid var(--gold);
}
.dest-heading h3 { font-size: 1.8rem !important; color: var(--blue) !important; }
.dest-intro::first-letter {
  font-family: var(--ff-serif);
  font-size: 3.5rem;
  font-weight: 700;
  float: left;
  line-height: 0.8;
  margin-right: 0.1em;
  margin-top: 0.05em;
  color: var(--gold);
}
.monument {
  transition: transform 0.2s, box-shadow 0.2s;
  background: #fdfdfc !important;
  border-color: #eae5d9 !important;
}
.monument:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.05);
}
.history-block {
  background: #fcfbfa;
  border-left: 4px solid var(--gold);
  padding: 1.5rem;
  margin-bottom: 2rem;
  font-family: var(--ff-serif);
  font-style: italic;
  font-size: 1.1rem;
  color: var(--blue);
  box-shadow: 0 2px 8px rgba(0,0,0,0.03);
}
.history-block strong {
  display: block;
  font-family: var(--ff-sans);
  font-style: normal;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--gold);
  margin-bottom: 0.5rem;
}
</style>
"""
    html = html.replace('</style>', luxury_css)
    
    # 3. Add Cover Page right after <body>
    cover_html = """
<div style="height: 100vh; min-height: 800px; background: linear-gradient(rgba(15,37,64,0.4), rgba(15,37,64,0.9)), url('https://images.unsplash.com/photo-1522204523234-8729aa6e3d5f?q=80&w=2000&auto=format&fit=crop') center/cover; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; color: white; margin-bottom: 40px;">
  <div style="font-family: 'Source Sans 3', sans-serif; font-size: 14px; letter-spacing: 5px; text-transform: uppercase; color: #c5a059; margin-bottom: 30px; font-weight: 700;">Exclusive Travel Collection</div>
  <h1 style="font-family: 'Playfair Display', serif; font-size: clamp(3rem, 8vw, 6rem); font-weight: 700; line-height: 1; margin-bottom: 20px; text-shadow: 0 4px 20px rgba(0,0,0,0.3);">PUGLIA 2026</h1>
  <p style="font-family: 'Playfair Display', serif; font-size: clamp(1.2rem, 2vw, 1.8rem); font-style: italic; color: #e2dcd0; max-width: 700px; padding: 0 20px;">Un viaje a través de la historia, la cultura y la luz del sur de Italia.</p>
</div>
<div class="page-wrap">
"""
    # Replace <div class="page-wrap"> with our cover + page-wrap
    # We need to make sure we only replace the first occurrence
    html = html.replace('<div class="page-wrap">', cover_html, 1)

    # 4. Inject Images and History Blocks into each day
    images = [
        "https://images.unsplash.com/photo-1596404748130-97eb3d05ea52?q=80&w=1200&auto=format&fit=crop", # D1
        "https://images.unsplash.com/photo-1616788506456-e970b555026a?q=80&w=1200&auto=format&fit=crop", # D2
        "https://images.unsplash.com/photo-1579692451000-09792e3db700?q=80&w=1200&auto=format&fit=crop", # D3
        "https://images.unsplash.com/photo-1627581223945-36da32470659?q=80&w=1200&auto=format&fit=crop", # D4
        "https://images.unsplash.com/photo-1522204523234-8729aa6e3d5f?q=80&w=1200&auto=format&fit=crop", # D5
        "https://images.unsplash.com/photo-1587825027984-c4476461c8f9?q=80&w=1200&auto=format&fit=crop", # D6
        "https://images.unsplash.com/photo-1625834317364-b32c140fd360?q=80&w=1200&auto=format&fit=crop", # D7
        "https://images.unsplash.com/photo-1600810486822-0d6118d092d6?q=80&w=1200&auto=format&fit=crop", # D8
        "https://images.unsplash.com/photo-1616788506456-e970b555026a?q=80&w=1200&auto=format&fit=crop", # D9
        "https://images.unsplash.com/photo-1584485579998-3f8206d7bbbe?q=80&w=1200&auto=format&fit=crop", # D10
    ]
    
    historical = [
        "Conocida como la 'Puerta de Oriente', Brindisi fue uno de los puertos más importantes del Imperio Romano.",
        "Lecce es el apogeo del barroco en el sur de Italia, caracterizado por el uso de la pietra leccese.",
        "Otranto fue un importante puerto bizantino y normando, tristemente famoso por el asedio otomano de 1480.",
        "Bari fue la capital del Imperio Bizantino en la península. La conquista normanda en 1071 marcó el inicio de una nueva era.",
        "Ostuni es conocida como la 'Ciudad Blanca' debido a la costumbre de encalar las casas desde la Edad Media para dar luminosidad.",
        "Los famosos trulli de Alberobello comenzaron a construirse en el siglo XIV sin argamasa para evadir altos impuestos.",
        "Matera es uno de los asentamientos humanos continuamente habitados más antiguos del mundo (Paleolítico).",
        "Castel del Monte fue construido en el siglo XIII por el emperador Federico II con un diseño octogonal perfecto.",
        "Altamura fue repoblada por Federico II, quien ordenó la construcción de su imponente catedral.",
        "Monopoli se desarrolló como un próspero puerto comercial bajo el dominio veneciano y español."
    ]

    parts = html.split('<div class="day-main">')
    new_html = parts[0]
    
    for i in range(1, len(parts)):
        # Calculate day index based on the number of days we've seen
        # (parts[0] has no day, parts[1] is D1, etc.)
        day_idx = i - 1
        img = images[day_idx] if day_idx < len(images) else images[0]
        hist = historical[day_idx] if day_idx < len(historical) else historical[0]
        
        injection = f'''<div class="day-main">
      <img src="{img}" alt="Puglia Landscape" class="pdf-page-image">
      <div style="padding: 2rem;">
        <div class="history-block">
          <strong>Contexto Histórico</strong>
          {hist}
        </div>
'''
        # We need to remove the padding from day-main in CSS because we are adding it inside, 
        # or we just put the image inside day-main but stretch it.
        # It's cleaner to stretch the image using negative margins.
        injection = f'''<div class="day-main">
      <img src="{img}" alt="Puglia Landscape" class="pdf-page-image" style="margin: -2rem -2rem 2rem -2rem; width: calc(100% + 4rem); max-width: none;">
      <div class="history-block">
        <strong>Contexto Histórico</strong>
        {hist}
      </div>
'''
        # Actually, day-main has padding var(--sp-6) which is 2rem.
        
        new_html += injection + parts[i]
        
    # We must also make sure to use "class='dest-intro'" for the first paragraph of each dest to get the drop-cap
    # We can do a regex replace: <div class="dest"> \n <h3 ...>...</h3> \n <p> -> <p class="dest-intro">
    new_html = re.sub(r'(<div class="dest">\s*(?:<div class="dest-heading">)?\s*<h3[^>]*>.*?</h3>\s*(?:<div[^>]*>.*?</div>\s*)?(?:</div>\s*)?)<p>', r'\1<p class="dest-intro">', new_html, flags=re.DOTALL)
    
    with open('Puglia_Premium_Guide.html', 'w', encoding='utf-8') as f:
        f.write(new_html)
        
    print("Fixed guide successfully.")

if __name__ == '__main__':
    fix_guide()

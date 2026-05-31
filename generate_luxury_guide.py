import json

def generate_guide():
    with open('parsed_guide.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    days = data['days']
    
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

    html = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Puglia 2026 — Exclusive Travel Guide</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Lato:wght@300;400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
:root {
  --navy: #0B1D3A;
  --gold: #C5A059;
  --gold-light: #f7eed7;
  --sand: #F7F3EC;
  --sand-dark: #e8e2d5;
  --text-main: #333333;
  --text-light: #777777;
  --white: #FFFFFF;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Lato', sans-serif; background: var(--sand); color: var(--text-main); line-height: 1.6; }
h1, h2, h3, h4, h5, .serif { font-family: 'Cormorant Garamond', serif; }

/* A4 Page Layout for PDF Look */
.page {
  max-width: 1000px;
  margin: 40px auto;
  background: var(--white);
  box-shadow: 0 10px 40px rgba(0,0,0,0.08);
  overflow: hidden;
  position: relative;
}

/* Cover */
.cover {
  height: 100vh;
  min-height: 800px;
  background: linear-gradient(rgba(11, 29, 58, 0.4), rgba(11, 29, 58, 0.9)), url('https://images.unsplash.com/photo-1522204523234-8729aa6e3d5f?q=80&w=2000&auto=format&fit=crop') center/cover;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  color: var(--white);
  padding: 40px;
  margin-bottom: 40px;
}
.cover-agency { font-size: 14px; letter-spacing: 4px; text-transform: uppercase; color: var(--gold); margin-bottom: 20px; font-weight: 700; }
.cover-title { font-size: 80px; font-weight: 700; line-height: 1; margin-bottom: 20px; }
.cover-subtitle { font-size: 24px; font-style: italic; color: #eee; max-width: 600px; }

/* General Map Page */
.map-page { padding: 60px; }
.section-title { font-size: 42px; color: var(--navy); margin-bottom: 10px; text-align: center; }
.section-subtitle { font-size: 16px; color: var(--gold); text-transform: uppercase; letter-spacing: 2px; text-align: center; margin-bottom: 40px; font-weight: 700;}
#general-map { height: 500px; width: 100%; border: 1px solid var(--gold); }

/* Day Page */
.day-page {
  display: flex;
  flex-direction: column;
}
.day-hero {
  height: 400px;
  background-size: cover;
  background-position: center;
  position: relative;
}
.day-hero-overlay {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  padding: 40px;
  background: linear-gradient(transparent, var(--navy));
  color: var(--white);
}
.day-hero-kicker { font-size: 14px; text-transform: uppercase; letter-spacing: 3px; color: var(--gold); font-weight: 700; }
.day-hero-title { font-size: 48px; line-height: 1.1; margin: 5px 0; }
.day-hero-date { font-size: 16px; color: #ccc; }

.day-content {
  display: flex;
  padding: 40px;
  gap: 40px;
}
.day-main { flex: 2; }
.day-sidebar { flex: 1; background: var(--sand); padding: 30px; border-left: 2px solid var(--gold); height: fit-content;}

/* Historical Block */
.history-block {
  background: var(--gold-light);
  border-left: 4px solid var(--gold);
  padding: 20px 25px;
  margin-bottom: 30px;
  font-style: italic;
  font-size: 18px;
  color: var(--navy);
}
.history-block strong { font-family: 'Lato', sans-serif; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; display: block; margin-bottom: 10px; font-style: normal; color: var(--gold); }

/* Destinations */
.destination { margin-bottom: 40px; }
.dest-title { font-size: 32px; color: var(--navy); border-bottom: 1px solid var(--sand-dark); padding-bottom: 10px; margin-bottom: 20px; }
.dest-intro { font-size: 16px; margin-bottom: 20px; }
.dest-intro:first-letter { float: left; font-size: 60px; line-height: 0.8; padding-right: 10px; color: var(--gold); font-family: 'Cormorant Garamond', serif;}

.monument { margin-bottom: 20px; }
.monument h4 { font-size: 22px; color: var(--navy); margin-bottom: 5px; }
.monument p { font-size: 15px; color: var(--text-light); }

/* Sidebar */
.sblock { margin-bottom: 30px; }
.sblock h4 { font-family: 'Lato', sans-serif; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: var(--gold); margin-bottom: 15px; border-bottom: 1px solid var(--gold); padding-bottom: 5px;}
.srow { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; border-bottom: 1px dotted #ccc; padding-bottom: 5px;}
.srow .sk { color: var(--text-light); }
.srow .sv { color: var(--navy); font-weight: 700; text-align: right; max-width: 60%; }

.day-map { height: 200px; width: 100%; border: 1px solid #ccc; margin-top: 20px; }

@media print {
  body { background: white; }
  .page { box-shadow: none; margin: 0; max-width: 100%; page-break-after: always;}
  .cover { page-break-after: always; }
}
</style>
</head>
<body>

<div class="cover">
  <div class="cover-agency">Exclusive Travel Collection</div>
  <h1 class="cover-title">PUGLIA 2026</h1>
  <p class="cover-subtitle">Un viaje a través de la historia, la cultura y la luz del sur de Italia.</p>
</div>

<div class="page map-page">
  <h2 class="section-title">El Itinerario</h2>
  <div class="section-subtitle">Vista General de la Ruta E</div>
  <div id="general-map"></div>
</div>
"""

    for i, day in enumerate(days):
        img = images[i] if i < len(images) else images[0]
        hist = historical[i] if i < len(historical) else historical[0]
        
        d_num = day.get('day_num', f"{i+1}")
        d_title = day.get('title', 'Día')
        d_date = day.get('date', '') + " " + day.get('month', '')
        
        html += f'''
<div class="page day-page">
  <div class="day-hero" style="background-image: url('{img}');">
    <div class="day-hero-overlay">
      <div class="day-hero-kicker">DÍA {d_num}</div>
      <h2 class="day-hero-title">{d_title}</h2>
      <div class="day-hero-date">{d_date}</div>
    </div>
  </div>
  
  <div class="day-content">
    <div class="day-main">
      <div class="history-block">
        <strong>Contexto Histórico</strong>
        {hist}
      </div>
'''
        for dest in day.get('destinations', []):
            dest_name = dest.get('name', '')
            html += f'''
      <div class="destination">
        <h3 class="dest-title">{dest_name}</h3>
'''
            for p in dest.get('intro', []):
                if p: html += f'<p class="dest-intro">{p}</p>\n'
            
            for mon in dest.get('monuments', []):
                html += f'<div class="monument">\n<h4>{mon["title"]}</h4>\n'
                for mp in mon.get('description', []):
                    html += f'<p>{mp}</p>\n'
                html += '</div>\n'
            
            html += '      </div>\n'
            
        html += '''
    </div>
    <div class="day-sidebar">
'''
        for sblock in day.get('logistics', []):
            html += f'''
      <div class="sblock">
        <h4>{sblock['category']}</h4>
'''
            for row in sblock.get('details', []):
                html += f'''
        <div class="srow">
          <span class="sk">{row['label']}</span>
          <span class="sv">{row['value']}</span>
        </div>
'''
            html += '      </div>\n'
            
        html += f'''
      <div id="map-day-{i+1}" class="day-map"></div>
    </div>
  </div>
</div>
'''

    # Add scripts from original HTML
    with open('puglia-guide-ruta-e.html', 'r', encoding='utf-8') as f:
        orig = f.read()
    
    script_start = orig.find('<script>')
    scripts = orig[script_start:] if script_start != -1 else ""

    html += f'''
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
{scripts}
</body>
</html>
'''

    with open('Puglia_Premium_Guide.html', 'w', encoding='utf-8') as f:
        f.write(html)
        
    print("Luxury guide generated.")

if __name__ == '__main__':
    generate_guide()

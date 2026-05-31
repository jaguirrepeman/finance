import re

def update_guide():
    with open("Puglia_Guide.html", "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Update CSS to Premium Navy/Gold/Sand Palette
    content = re.sub(r'--ink:\s*#[0-9a-fA-F]+;', '--ink: #1a2530;', content) # Dark navy-ink
    content = re.sub(r'--bg:\s*#[0-9a-fA-F]+;', '--bg: #f9f6f0;', content) # Sand
    content = re.sub(r'--bg-2:\s*#[0-9a-fA-F]+;', '--bg-2: #e8e1d5;', content) # Darker sand
    content = re.sub(r'--gold:\s*#[0-9a-fA-F]+;', '--gold: #d4af37;', content) # Premium Gold
    content = re.sub(r'--blue:\s*#[0-9a-fA-F]+;', '--blue: #0f2540;', content) # Deep Navy

    # 2. Add Cover Image to Hero
    # Find the hero div and insert a background image
    hero_pattern = r'(\.hero\s*\{[^\}]+background:\s*)(linear-gradient\([^;]+;)'
    # We will just replace the hero CSS
    hero_css_replacement = r'''\1
    linear-gradient(to bottom, rgba(15, 37, 64, 0.4), rgba(15, 37, 64, 0.9)),
    url('https://images.unsplash.com/photo-1522204523234-8729aa6e3d5f?q=80&w=2000&auto=format&fit=crop') center/cover no-repeat;
    '''
    content = re.sub(hero_pattern, hero_css_replacement, content)

    # 3. Add images to the day cards
    # We'll look for <div class="day-main"> and insert an image at the top of each day
    images = [
        "https://images.unsplash.com/photo-1596404748130-97eb3d05ea52?q=80&w=800&auto=format&fit=crop", # Brindisi
        "https://images.unsplash.com/photo-1616788506456-e970b555026a?q=80&w=800&auto=format&fit=crop", # Lecce
        "https://images.unsplash.com/photo-1579692451000-09792e3db700?q=80&w=800&auto=format&fit=crop", # Taranto
        "https://images.unsplash.com/photo-1627581223945-36da32470659?q=80&w=800&auto=format&fit=crop", # Taranto -> Bari
        "https://images.unsplash.com/photo-1522204523234-8729aa6e3d5f?q=80&w=800&auto=format&fit=crop", # Ostuni/Polignano
        "https://images.unsplash.com/photo-1587825027984-c4476461c8f9?q=80&w=800&auto=format&fit=crop", # Alberobello
        "https://images.unsplash.com/photo-1625834317364-b32c140fd360?q=80&w=800&auto=format&fit=crop", # Matera
        "https://images.unsplash.com/photo-1600810486822-0d6118d092d6?q=80&w=800&auto=format&fit=crop", # Trani/Castel del Monte
        "https://images.unsplash.com/photo-1616788506456-e970b555026a?q=80&w=800&auto=format&fit=crop", # Gravina
        "https://images.unsplash.com/photo-1584485579998-3f8206d7bbbe?q=80&w=800&auto=format&fit=crop", # Monopoli/Bari
    ]
    
    historical_contexts = [
        # Dia 1
        "<div class='callout c-gold'><div class='callout-icon'>🏛️</div><div class='callout-body'><strong>Contexto Histórico: Brindisi</strong><p>Conocida como la 'Puerta de Oriente', Brindisi fue uno de los puertos más importantes del Imperio Romano. Aquí terminaba la Vía Apia, marcada por sus famosas columnas romanas. Fue el principal punto de embarque hacia Grecia y el Medio Oriente.</p></div></div>",
        # Dia 2
        "<div class='callout c-gold'><div class='callout-icon'>🏛️</div><div class='callout-body'><strong>Contexto Histórico: Lecce y Galatina</strong><p>Lecce es el apogeo del barroco en el sur de Italia (el <em>Barocco Leccese</em>), caracterizado por el uso de la <em>pietra leccese</em>, una piedra caliza muy maleable. Galatina, por su parte, es famosa por la Basílica de Santa Catalina de Alejandría, que alberga uno de los ciclos de frescos góticos más impresionantes de Italia, solo comparable a la Basílica de San Francisco de Asís.</p></div></div>",
        # Dia 3
        "<div class='callout c-gold'><div class='callout-icon'>🏛️</div><div class='callout-body'><strong>Contexto Histórico: Otranto y Taranto</strong><p>Otranto fue un importante puerto bizantino y normando, tristemente famoso por el asedio otomano de 1480. Su catedral conserva un increíble mosaico del árbol de la vida (1163). Taranto, fundada por espartanos en el siglo VIII a.C., fue una de las polis más ricas y poderosas de la Magna Grecia.</p></div></div>",
        # Dia 4
        "<div class='callout c-gold'><div class='callout-icon'>🏛️</div><div class='callout-body'><strong>Contexto Histórico: Bari</strong><p>Bari fue la capital del Catapanato de Italia (el Imperio Bizantino en la península). La conquista normanda en 1071 marcó el inicio de una nueva era. La Basílica de San Nicolás fue construida específicamente para albergar los restos del santo, robados de Myra en 1087, convirtiendo a la ciudad en uno de los centros de peregrinación más importantes de Europa.</p></div></div>",
        # Dia 5
        "<div class='callout c-gold'><div class='callout-icon'>🏛️</div><div class='callout-body'><strong>Contexto Histórico: Ostuni y Polignano</strong><p>Ostuni es conocida como la 'Ciudad Blanca' debido a la costumbre de encalar las casas desde la Edad Media para dar luminosidad y, posteriormente en el siglo XVII, para evitar la propagación de la peste. Polignano a Mare tiene orígenes prehistóricos y fue un importante asentamiento durante el Imperio Romano, atravesado por la Vía Trajana.</p></div></div>",
        # Dia 6
        "<div class='callout c-gold'><div class='callout-icon'>🏛️</div><div class='callout-body'><strong>Contexto Histórico: Valle d'Itria (Alberobello)</strong><p>Los famosos trulli de Alberobello comenzaron a construirse en el siglo XIV. Fueron construidos sin argamasa (piedra seca) como una forma de evadir los altos impuestos sobre nuevas edificaciones que imponía el Reino de Nápoles; al carecer de mortero, podían ser desmontados rápidamente antes de las inspecciones reales.</p></div></div>",
        # Dia 7
        "<div class='callout c-gold'><div class='callout-icon'>🏛️</div><div class='callout-body'><strong>Contexto Histórico: Matera</strong><p>Matera es uno de los asentamientos humanos continuamente habitados más antiguos del mundo, con evidencia de presencia humana desde el Paleolítico. Los 'Sassi' (casas cueva) fueron habitados hasta los años 50, cuando la pobreza extrema obligó al gobierno italiano a evacuar a la población. Hoy es Patrimonio de la Humanidad y un ejemplo increíble de recuperación.</p></div></div>",
        # Dia 8
        "<div class='callout c-gold'><div class='callout-icon'>🏛️</div><div class='callout-body'><strong>Contexto Histórico: Castel del Monte y Trani</strong><p>Castel del Monte fue construido en el siglo XIII por el emperador Federico II. Su diseño octogonal perfecto está lleno de simbolismo matemático y astronómico, y sigue siendo un misterio su función original (no era un castillo defensivo clásico). Trani floreció durante la Edad Media gracias al comercio marítimo y promulgó los 'Ordinamenta et consuetudo maris', uno de los códigos marítimos más antiguos del mundo.</p></div></div>",
        # Dia 9
        "<div class='callout c-gold'><div class='callout-icon'>🏛️</div><div class='callout-body'><strong>Contexto Histórico: Altamura y Gravina</strong><p>Altamura fue repoblada por el emperador Federico II, quien ordenó la construcción de su imponente catedral, la única que él patrocinó directamente. Gravina in Puglia es conocida por su hábitat rupestre y su espectacular puente viaducto-acueducto que cruza el profundo cañón, vital para conectar la ciudad antigua con el santuario de la Madonna della Stella.</p></div></div>",
        # Dia 10
        "<div class='callout c-gold'><div class='callout-icon'>🏛️</div><div class='callout-body'><strong>Contexto Histórico: Monopoli</strong><p>Monopoli se desarrolló como un próspero puerto comercial bajo el dominio veneciano y español. Su sistema defensivo, incluyendo el Castillo de Carlos V construido sobre una pequeña península, fue crucial para proteger la ciudad de las incursiones piratas otomanas durante los siglos XVI y XVII.</p></div></div>",
    ]

    parts = content.split('<div class="day-main">')
    new_content = parts[0]
    
    for i in range(1, len(parts)):
        img_tag = f'<img src="{images[i-1]}" alt="Imagen del día" style="width:100%; height:300px; object-fit:cover; border-radius:12px; margin-bottom:20px; box-shadow:0 4px 12px rgba(0,0,0,0.1);">'
        context_tag = historical_contexts[i-1]
        
        # Insert image and context at the beginning of day-main
        new_content += '<div class="day-main">\n' + img_tag + '\n' + context_tag + '\n' + parts[i]
        
    # Also add a new style for the day-card to make it have a nice hover effect
    css_addition = '''
    <style>
    .day-card { transition: transform 0.3s ease, box-shadow 0.3s ease; }
    .day-card:hover { transform: translateY(-5px); box-shadow: 0 12px 40px rgba(15,37,64,0.15); }
    img { max-width: 100%; height: auto; }
    </style>
    '''
    new_content = new_content.replace('</head>', css_addition + '</head>')
    
    with open("Puglia_Guide.html", "w", encoding="utf-8") as f:
        f.write(new_content)
    
    print("Guide updated successfully.")

if __name__ == "__main__":
    update_guide()

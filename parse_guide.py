from bs4 import BeautifulSoup
import json

def parse_guide():
    with open('puglia-guide-ruta-e.html', 'r', encoding='utf-8') as f:
        html = f.read()
    
    soup = BeautifulSoup(html, 'html.parser')
    
    data = {'days': []}
    
    day_cards = soup.find_all('article', class_='day-card')
    for card in day_cards:
        day_info = {}
        
        # Header info
        header = card.find('div', class_='day-header')
        if header:
            num_elem = header.find('span', class_='num')
            day_info['day_num'] = num_elem.text.strip() if num_elem else ''
            
            title_elem = header.find('h2')
            day_info['title'] = title_elem.text.strip() if title_elem else ''
            
            sub_elem = header.find('div', class_='day-sub')
            day_info['subtitle'] = sub_elem.text.strip() if sub_elem else ''
            
            date_elem = header.find('div', class_='dday')
            day_info['date'] = date_elem.text.strip() if date_elem else ''
            
            month_elem = header.find('div', class_='ddate')
            day_info['month'] = month_elem.text.strip() if month_elem else ''
            
        # Logistics
        logistics = []
        sidebar = card.find('aside', class_='day-sidebar') or card.find('div', class_='day-sidebar')
        if sidebar:
            sblocks = sidebar.find_all('div', class_='sblock')
            for sblock in sblocks:
                title = sblock.find('h4').text.strip() if sblock.find('h4') else ''
                rows = []
                for srow in sblock.find_all('div', class_='srow'):
                    sk = srow.find('span', class_='sk')
                    sv = srow.find('span', class_='sv')
                    if sk and sv:
                        rows.append({'label': sk.text.strip(), 'value': sv.text.strip()})
                logistics.append({'category': title, 'details': rows})
        day_info['logistics'] = logistics
        
        # Destinations
        destinations = []
        main = card.find('div', class_='day-main')
        if main:
            dests = main.find_all('div', class_='dest')
            for dest in dests:
                dest_data = {}
                dest_h3 = dest.find('h3')
                dest_data['name'] = dest_h3.text.strip() if dest_h3 else ''
                
                tagline = dest.find('div', class_='dest-tagline')
                dest_data['tagline'] = tagline.text.strip() if tagline else ''
                
                # Intro paragraphs (not in monuments)
                intro_p = dest.find_all('p', recursive=False)
                dest_data['intro'] = [p.text.strip() for p in intro_p]
                
                monuments = []
                mons = dest.find_all('div', class_='monument')
                for mon in mons:
                    mon_title = mon.find('h4', class_='monument-title')
                    if not mon_title:
                        mon_title = mon.find('h4')
                    title_text = mon_title.text.strip() if mon_title else ''
                    
                    mon_p = mon.find_all('p')
                    desc = [p.text.strip() for p in mon_p]
                    monuments.append({'title': title_text, 'description': desc})
                
                dest_data['monuments'] = monuments
                destinations.append(dest_data)
                
        day_info['destinations'] = destinations
        data['days'].append(day_info)

    with open('parsed_guide.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        
    print(f"Extracted {len(day_cards)} days.")

if __name__ == '__main__':
    parse_guide()

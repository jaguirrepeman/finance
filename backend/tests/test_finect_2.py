import requests
import re

r = requests.get('https://www.finect.com/search?q=ES0146309002', headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'})
print(r.status_code)
# Search for something like href="/fondos-inversion/ES0146309002-Baelo_patrimonio_fi"
links = re.findall(r'href="(/fondos-inversion/[^"]+)"', r.text)
print("Fondos:", list(set(links)))

links_etf = re.findall(r'href="(/etfs/[^"]+)"', r.text)
print("ETFs:", list(set(links_etf)))

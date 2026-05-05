from curl_cffi import requests
from bs4 import BeautifulSoup

r = requests.get('https://www.morningstar.es/es/funds/snapshot/snapshot.aspx?id=F000010KY6&tab=3', impersonate="chrome124")
soup = BeautifulSoup(r.content, 'html.parser')

print("Sectors:")
# There is usually a table with sectors
tables = soup.find_all('table')
for idx, t in enumerate(tables):
    if "Sector" in t.text or "Acciones" in t.text:
        print(f"Table {idx}:", t.text[:100].replace('\n', ' '))


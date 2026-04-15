import requests
from bs4 import BeautifulSoup

def search_finect(isin):
    url = f"https://www.finect.com/buscar?q={isin}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
    r = requests.get(url, headers=headers)
    print(f"[{isin}] Search Status: {r.status_code}")
    print("HTML excerpt:", r.text[:1000])

if __name__ == "__main__":
    search_finect("ES0146309002")

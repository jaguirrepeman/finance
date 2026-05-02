"""Quick script to discover how Finect URL resolution works."""
import requests
import re
import json

headers = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
}

isins = ["ES0146309002", "IE00BYX5NX33", "LU0840158819"]

print("=== Test 1: Search listing HTML for ISIN links ===")
for isin in isins:
    url = f"https://www.finect.com/fondos-inversion/listado?search={isin}"
    resp = requests.get(url, headers=headers, timeout=15)
    pattern = rf'href="(/fondos-inversion/{isin}[^"]*)"'
    links = re.findall(pattern, resp.text)
    print(f"  {isin}: found {len(links)} links in HTML source")
    for link in links[:3]:
        print(f"    -> {link}")

print("\n=== Test 2: Next.js page data on known working URL ===")
resp = requests.get(
    "https://www.finect.com/fondos-inversion/ES0146309002-Horos_value_internacional_fi",
    headers=headers, timeout=10
)
match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', resp.text)
if match:
    data = json.loads(match.group(1))
    page = data.get("page", "?")
    query = data.get("query", {})
    build_id = data.get("buildId", "?")
    print(f"  page={page}")
    print(f"  query={query}")
    print(f"  buildId={build_id[:30]}...")
    
    # Try to use buildId to access Next.js data API for another ISIN
    print(f"\n=== Test 3: Next.js data API with buildId ===")
    for isin in ["ES0146309002-Horos_value_internacional_fi", "IE00BYX5NX33"]:
        data_url = f"https://www.finect.com/_next/data/{build_id}/fondos-inversion/{isin}.json"
        r = requests.get(data_url, headers=headers, timeout=10)
        print(f"  {isin[:20]}...: status={r.status_code}")
        if r.status_code == 200 and r.headers.get("Content-Type", "").startswith("application/json"):
            jdata = r.json()
            props = jdata.get("pageProps", {})
            fund_data = props.get("fund", props.get("data", {}))
            if fund_data:
                print(f"    Keys: {list(fund_data.keys())[:10]}")
else:
    print("  No __NEXT_DATA__ found in HTML")

print("\n=== Test 4: Check 404 page HTML for suggestions/canonical ===")
resp = requests.get(
    "https://www.finect.com/fondos-inversion/ES0146309002",
    headers=headers, timeout=10
)
# Look for canonical link or any link with the ISIN
canonical = re.findall(r'<link[^>]*rel="canonical"[^>]*href="([^"]*)"', resp.text)
isin_links = re.findall(r'href="([^"]*ES0146309002[^"]*)"', resp.text)
print(f"  status={resp.status_code}")
print(f"  canonical links: {canonical}")
print(f"  links with ISIN: {isin_links[:5]}")

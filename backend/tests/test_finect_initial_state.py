"""Test script to parse window.INITIAL_STATE from Finect fund pages."""
import json
import re
import requests
from urllib.parse import unquote

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}
URL = "https://www.finect.com/fondos-inversion/IE00BH6XSF26-Heptagon_kopernik_glb_allcp_eq_ae__acc"

print(f"Fetching {URL}...")
resp = requests.get(URL, headers=HEADERS, timeout=15)
print(f"Status: {resp.status_code}, Length: {len(resp.text)}")

# Try to find window.INITIAL_STATE
match = re.search(r'window\.INITIAL_STATE\s*=\s*"([^"]+)"', resp.text)
if not match:
    match = re.search(r'window\.INITIAL_STATE\s*=\s*([^\n<]+)', resp.text)

if match:
    raw = match.group(1)
    print(f"\nFound INITIAL_STATE, raw length: {len(raw)}")
    
    # URL decode
    decoded = unquote(raw)
    # Remove trailing semicolons or quotes
    decoded = decoded.strip().rstrip(';').strip('"')
    
    try:
        data = json.loads(decoded)
        print(f"Parsed JSON, top-level keys: {list(data.keys())}")
        
        # Navigate to fund data
        fund = data.get("fund", {})
        print(f"\nfund keys: {list(fund.keys())}")
        
        fund_inner = fund.get("fund", {})
        print(f"fund.fund keys: {list(fund_inner.keys())}")
        
        # Model
        model = fund_inner.get("model", {})
        if model:
            print(f"\nmodel keys: {list(model.keys())}")
            ratings = model.get("ratings", [])
            print(f"ratings: {ratings}")
            fees = model.get("fees", {})
            print(f"fees: {fees}")
        
        # Breakdown (sectors, regions, asset allocation)
        breakdown = fund_inner.get("breakdown", [])
        print(f"\nbreakdown count: {len(breakdown)}")
        for b in breakdown:
            btype = b.get("type", "?")
            items = b.get("items", [])
            print(f"  type='{btype}', items={len(items)}")
            for item in items[:3]:
                print(f"    {item}")
        
        # Portfolio / Holdings
        portfolio = fund_inner.get("portfolio", {})
        print(f"\nportfolio keys: {list(portfolio.keys())}")
        holdings = portfolio.get("holdings", [])
        print(f"holdings count: {len(holdings)}")
        for h in holdings[:3]:
            print(f"  {h}")
            
    except json.JSONDecodeError as e:
        print(f"JSON parse error: {e}")
        print(f"First 500 chars: {decoded[:500]}")
else:
    # Try __NEXT_DATA__
    match2 = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', resp.text, re.DOTALL)
    if match2:
        print("\nFound __NEXT_DATA__")
        data = json.loads(match2.group(1))
        props = data.get("props", {}).get("pageProps", {})
        print(f"pageProps keys: {list(props.keys())}")
        
        fund = props.get("fund", {})
        print(f"fund keys: {list(fund.keys())}")
        
        model = fund.get("model", {})
        if model:
            print(f"model keys: {list(model.keys())}")
            print(f"ratings: {model.get('ratings')}")
            print(f"fees: {model.get('fees')}")
        
        breakdown = fund.get("breakdown", [])
        print(f"breakdown count: {len(breakdown)}")
        for b in breakdown:
            btype = b.get("type", "?")
            items = b.get("items", [])
            print(f"  type='{btype}', items={len(items)}")
            for item in items[:3]:
                print(f"    {item}")
        
        portfolio = fund.get("portfolio", {})
        print(f"portfolio keys: {list(portfolio.keys())}")
        holdings = portfolio.get("holdings", [])
        print(f"holdings count: {len(holdings)}")
        for h in holdings[:3]:
            print(f"  {h}")
    else:
        print("\nNo INITIAL_STATE or __NEXT_DATA__ found!")
        # Show script tags for debugging
        import re as re2
        scripts = re2.findall(r'<script[^>]*>(.*?)</script>', resp.text[:50000], re.DOTALL)
        for i, s in enumerate(scripts[:10]):
            preview = s[:200].replace('\n', ' ')
            print(f"  script[{i}]: {preview}")

from curl_cffi import requests

r = requests.get('https://www.morningstar.es/es/util/SecuritySearch.ashx?q=ES0146309002', impersonate="chrome124")
print(r.status_code)
print("BODY:")
print(r.text)

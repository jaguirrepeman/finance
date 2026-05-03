import curl_cffi.requests
import requests
# Monkey patch
requests.get = curl_cffi.requests.get
requests.post = curl_cffi.requests.post
requests.Session = curl_cffi.requests.Session

from mstarpy import Fund
f = Fund("ES0146309002", term="ES0146309002", country="es")
print("NAME:", f.name)
print("SECTORS:", f.sector())

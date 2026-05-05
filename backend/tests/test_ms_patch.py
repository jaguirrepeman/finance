import curl_cffi.requests
import requests
import functools

# Custom Session that always impersonates
class ImpersonateSession(curl_cffi.requests.Session):
    def request(self, method, url, **kwargs):
        kwargs["impersonate"] = "chrome124"
        return super().request(method, url, **kwargs)

# Monkey patch requests module
requests.Session = ImpersonateSession
requests.get = functools.partial(curl_cffi.requests.get, impersonate="chrome124")
requests.post = functools.partial(curl_cffi.requests.post, impersonate="chrome124")

from mstarpy import Funds
try:
    f = Funds("ES0146309002", "es")
    print("NAME:", f.name)
    print("SECTORS:", f.sector())
except Exception as e:
    import traceback
    traceback.print_exc()


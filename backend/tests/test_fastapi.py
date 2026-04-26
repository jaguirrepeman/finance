import sys
import os
import json
sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)
response = client.get("/api/portfolio/summary")
print("STATUS CODE:", response.status_code)
try:
    print("RESPONSE JSON:", response.json())
except Exception as e:
    print("RESPONSE TEXT:", response.text)
    
response2 = client.get("/api/portfolio/history_batch")
print("STATUS BATCH:", response2.status_code)

response3 = client.get("/api/portfolio/enrich")
print("STATUS ENRICH:", response3.status_code)

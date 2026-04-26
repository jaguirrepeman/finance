import traceback
import sys
import os

try:
    from backend.app.main import app
    from fastapi.testclient import TestClient

    client = TestClient(app)
    print("Testing /summary...")
    response = client.get("/api/portfolio/summary")
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
    print("\nTesting /correlation...")
    response_c = client.get("/api/portfolio/correlation")
    print(f"Status Code correlation: {response_c.status_code}")
except Exception as e:
    print(f"Exception caught during test:")
    traceback.print_exc()

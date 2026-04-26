import sys
import os
import traceback

sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

try:
    from backend.app.main import app
    from fastapi.testclient import TestClient

    client = TestClient(app)
    print("\nTesting /details...")
    response_details = client.get("/api/portfolio/details")
    print(f"Status Code: {response_details.status_code}")
    print(f"Response: {response_details.text[:500]}")
    
    print("\nTesting /history_batch...")
    response_history = client.get("/api/portfolio/history_batch")
    print(f"Status Code: {response_history.status_code}")
    print(f"Response (truncated): {response_history.text[:500]}")

    print("\nTesting /correlation...")
    response_correlation = client.get("/api/portfolio/correlation")
    print(f"Status Code: {response_correlation.status_code}")
    print(f"Response (truncated): {response_correlation.text[:500]}")

except Exception as e:
    print(f"Exception caught during test:")
    traceback.print_exc()

"""Quick smoke test for the new architecture."""
import sys
import os
import traceback

# Ensure backend/ is on path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

def main():
    print("=" * 60)
    print("SMOKE TEST: Portfolio Tracker Backend")
    print("=" * 60)

    # 1. Import PortfolioClient
    try:
        from app.client import PortfolioClient
        print("[OK] Import PortfolioClient")
    except Exception as e:
        print(f"[FAIL] Import PortfolioClient: {e}")
        traceback.print_exc()
        return

    # 2. Initialize from Excel
    try:
        c = PortfolioClient(source="data/Ordenes.xlsx", cache_path="data/cache")
        print(f"[OK] PortfolioClient loaded — {len(c.portfolio.positions)} positions, {len(c.portfolio.open_lots)} lots")
    except Exception as e:
        print(f"[FAIL] PortfolioClient init: {e}")
        traceback.print_exc()
        return

    # 3. Positions (offline)
    try:
        df = c.positions(live=False)
        print(f"[OK] positions(live=False) — {len(df)} rows, cols={list(df.columns)}")
    except Exception as e:
        print(f"[FAIL] positions: {e}")
        traceback.print_exc()

    # 4. Open lots
    try:
        lots = c.open_lots()
        print(f"[OK] open_lots() — {len(lots)} rows")
    except Exception as e:
        print(f"[FAIL] open_lots: {e}")
        traceback.print_exc()

    # 5. Tax optimizer (offline — with fake prices)
    try:
        from app.services.tax_calculator import TaxOptimizer
        fake_prices = {isin: 100.0 for isin in c.portfolio.positions}
        optimizer = TaxOptimizer(c.portfolio, prices=fake_prices)
        plan = optimizer.optimize_withdrawal(10000)
        print(f"[OK] TaxOptimizer — {len(plan['plan'])} steps, tax={plan['estimated_tax']:.2f}")
    except Exception as e:
        print(f"[FAIL] tax_optimize: {e}")
        traceback.print_exc()

    # 6. Import FastAPI app
    try:
        from app.main import app
        routes = [r.path for r in app.routes if hasattr(r, "path")]
        print(f"[OK] FastAPI app loaded — {len(routes)} routes")
    except Exception as e:
        print(f"[FAIL] FastAPI app: {e}")
        traceback.print_exc()

    # 7. portfolio_service (import only)
    try:
        from app.services.portfolio_service import build_summary, get_portfolio_client
        client_svc = get_portfolio_client()
        print(f"[OK] portfolio_service — client has {len(client_svc.portfolio.positions)} positions")
    except Exception as e:
        print(f"[FAIL] portfolio_service: {e}")
        traceback.print_exc()

    print("=" * 60)
    print("SMOKE TEST COMPLETE")

if __name__ == "__main__":
    main()

"""
test_transfer_detection.py — Test transfer detection and capital tracking.

Run:
    pytest tests/test_transfer_detection.py -v
"""
import pandas as pd
import pytest
from app.services.portfolio_service import build_real_portfolio_history, get_portfolio_client


def test_transfer_detection_loads():
    """Test that transfer detection logic loads without errors."""
    try:
        result = build_real_portfolio_history(years=2)
        assert isinstance(result, dict)
        assert "series" in result
        assert "monthly" in result
    except Exception as e:
        pytest.fail(f"Transfer detection failed to load: {e}")


def test_capital_aportado_consistency():
    """Test that capital aportado is consistent with movements INCLUDING manual positions."""
    result = build_real_portfolio_history(years=5)
    
    if not result.get("series"):
        pytest.skip("No data in portfolio history")
    
    # Get final invested amount from evolution
    final_invested = result["series"][-1]["invested"]
    
    # Get expected from positions (FIFO only — does NOT include manual)
    client = get_portfolio_client()
    positions = client.positions(live=True)
    fifo_invested = float(positions["Capital_Invertido"].sum())
    
    # Manual positions are on top of FIFO
    from app.services.persistence_service import get_persistence_service
    ps = get_persistence_service()
    manual_list = ps.list_manual_positions()
    manual_total = sum(float(m.get("capital_invertido") or 0) for m in manual_list)
    
    # The unified total = FIFO + manual
    expected_invested = fifo_invested + manual_total
    
    # Log for debugging
    print(f"\nEvolution final invested: {final_invested:.2f}")
    print(f"FIFO positions invested: {fifo_invested:.2f}")
    print(f"Manual positions total: {manual_total:.2f}")
    print(f"Expected (FIFO + manual): {expected_invested:.2f}")
    print(f"Difference: {abs(final_invested - expected_invested):.2f}")
    
    # Allow 1% tolerance for rounding and timing differences
    tolerance = max(expected_invested * 0.01, 100)  # At least 100€ tolerance
    diff = abs(final_invested - expected_invested)
    
    assert diff <= tolerance, (
        f"Capital aportado mismatch: evolution={final_invested:.2f}, "
        f"expected={expected_invested:.2f} (FIFO={fifo_invested:.2f} + manual={manual_total:.2f}), "
        f"diff={diff:.2f}"
    )


def test_per_fund_aggregation():
    """Test that per-fund evolution sums to total evolution."""
    result = build_real_portfolio_history(years=5)
    
    if not result.get("series") or not result.get("funds"):
        pytest.skip("No data in portfolio history")
    
    # Check last date
    last_date = result["series"][-1]["date"]
    total_value = result["series"][-1]["value"]
    
    # Sum per-fund values at last date
    per_fund_sum = 0.0
    for fund_name, fund_series in result["funds"].items():
        # Find value at last date
        for point in fund_series:
            if point["date"] == last_date:
                per_fund_sum += point["value"]
                break
    
    # Allow 0.5% tolerance
    tolerance = total_value * 0.005
    diff = abs(total_value - per_fund_sum)
    
    assert diff <= tolerance, (
        f"Per-fund aggregation mismatch: total={total_value:.2f}, "
        f"sum_of_funds={per_fund_sum:.2f}, diff={diff:.2f}"
    )


def test_no_sudden_spikes():
    """Test that there are no sudden unexplained spikes in evolution."""
    result = build_real_portfolio_history(years=1)
    
    if not result.get("series") or len(result["series"]) < 30:
        pytest.skip("Insufficient data for spike detection")
    
    # Check last 30 days for spikes > 20% in a single day
    recent = result["series"][-30:]
    for i in range(1, len(recent)):
        prev_val = recent[i-1]["value"]
        curr_val = recent[i]["value"]
        if prev_val > 0:
            pct_change = abs((curr_val / prev_val - 1) * 100)
            assert pct_change < 20, (
                f"Sudden spike detected on {recent[i]['date']}: "
                f"{prev_val:.2f} → {curr_val:.2f} ({pct_change:.1f}%)"
            )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

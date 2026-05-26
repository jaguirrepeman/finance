"""
test_monthly_contributions.py — Test monthly capital contributions calculation.

Validates that:
  invested[month_i] + monthly_contribution[month_i+1] = invested[month_i+1]
"""
import pytest
from app.services.portfolio_service import build_real_portfolio_history


def test_monthly_contributions_sum_correctly():
    """Test that monthly contributions add up to the accumulated invested capital."""
    result = build_real_portfolio_history(years=5)
    
    if not result.get("monthly") or len(result["monthly"]) < 2:
        pytest.skip("Not enough monthly data")
    
    monthly_data = result["monthly"]
    
    # Check the accounting formula for each consecutive pair of months
    for i in range(1, len(monthly_data)):
        prev_month = monthly_data[i-1]
        curr_month = monthly_data[i]
        
        prev_invested = prev_month["invested"]
        curr_invested = curr_month["invested"]
        monthly_contribution = curr_month["monthly_contribution"]
        
        # Formula: invested[i-1] + monthly_contribution[i] = invested[i]
        expected = prev_invested + monthly_contribution
        actual = curr_invested
        
        # Allow 0.01€ tolerance for rounding
        diff = abs(expected - actual)
        
        assert diff < 0.02, (
            f"Month {curr_month['label']}: "
            f"prev_invested ({prev_invested:.2f}) + "
            f"monthly_contribution ({monthly_contribution:.2f}) = "
            f"{expected:.2f}, but actual invested = {actual:.2f} "
            f"(diff: {diff:.2f})"
        )
    
    print(f"\n✓ Monthly contributions validated across {len(monthly_data)} months")
    
    # Print last 3 months for debugging
    print("\nLast 3 months:")
    for month in monthly_data[-3:]:
        print(f"  {month['label']}: invested={month['invested']:.2f}, "
              f"contribution={month['monthly_contribution']:.2f}")


def test_first_month_contribution_equals_invested():
    """Test that the first month's contribution equals the total invested (no prior base)."""
    result = build_real_portfolio_history(years=10)
    
    if not result.get("monthly"):
        pytest.skip("No monthly data")
    
    first_month = result["monthly"][0]
    
    # First month: contribution should equal total invested (no prior base)
    assert abs(first_month["monthly_contribution"] - first_month["invested"]) < 0.01, (
        f"First month {first_month['label']}: "
        f"monthly_contribution ({first_month['monthly_contribution']:.2f}) "
        f"should equal invested ({first_month['invested']:.2f})"
    )


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])

import pandas as pd
import pytest
from unittest.mock import patch
from scripts.analyze_surplus_value import calculate_surplus

def test_empty_input():
    """Returns empty DataFrame if VORP calculation returns empty."""
    with patch("scripts.analyze_surplus_value.calculate_vorp") as mock_vorp:
        mock_vorp.return_value = (pd.DataFrame(), None, None)
        result = calculate_surplus(pd.DataFrame())
        assert result.empty

def test_no_positive_vorp():
    """Returns empty DataFrame if no positive VORP is found."""
    with patch("scripts.analyze_surplus_value.calculate_vorp") as mock_vorp:
        df = pd.DataFrame({"full_season_vorp": [-10, -5, 0], "price": [10, 5, 1]})
        mock_vorp.return_value = (df, None, None)
        result = calculate_surplus(pd.DataFrame())
        assert result.empty

def test_surplus_calculation():
    """Tests correct calculation of dollar_value and surplus with mocked constraints."""
    with patch("scripts.analyze_surplus_value.calculate_vorp") as mock_vorp, \
         patch("scripts.analyze_surplus_value.NUM_TEAMS", 10), \
         patch("scripts.analyze_surplus_value.CAP_PER_TEAM", 400):

        # total_cap = 10 * 400 * 0.875 = 3500
        # total_positive_vorp = 10 + 20 + 5 = 35
        # dollar_per_vorp = 3500 / 35 = 100

        df = pd.DataFrame({
            "name": ["A", "B", "C", "D"],
            "full_season_vorp": [10, 20, 5, -5],
            "price": [900, 2100, 400, 5]
        })
        mock_vorp.return_value = (df, None, None)

        result = calculate_surplus(pd.DataFrame())

        # Expected dollar_values (vorp * 100, clipped at 1, rounded):
        # A: 10 * 100 = 1000
        # B: 20 * 100 = 2000
        # C: 5 * 100 = 500
        # D: -5 * 100 = -500 -> clip to 1 -> 1
        expected_dollar_value = [1000.0, 2000.0, 500.0, 1.0]

        # Expected surplus (dollar_value - price):
        # A: 1000 - 900 = 100
        # B: 2000 - 2100 = -100
        # C: 500 - 400 = 100
        # D: 1 - 5 = -4
        expected_surplus = [100.0, -100.0, 100.0, -4.0]

        assert "dollar_value" in result.columns
        assert "surplus" in result.columns

        pd.testing.assert_series_equal(
            result["dollar_value"],
            pd.Series(expected_dollar_value, name="dollar_value")
        )

        pd.testing.assert_series_equal(
            result["surplus"],
            pd.Series(expected_surplus, name="surplus")
        )

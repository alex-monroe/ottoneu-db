import sys
from unittest.mock import MagicMock

# --- Mock dependencies before importing the module under test ---
# This allows testing the pure function calc_half_ppr_points even if
# heavy dependencies like pandas or database config are missing/broken.

# Mock pandas
sys.modules["pandas"] = MagicMock()

# Mock scripts.config (to avoid DB connection attempts)
mock_config = MagicMock()
sys.modules["scripts.config"] = mock_config

# Now we can safely import the function
from scripts.backfill_nfl_stats import calc_half_ppr_points

class TestCalcHalfPPRPoints:
    def test_basic_scoring(self):
        """Test basic scoring for a standard player row."""
        row = {
            "passing_yards": 250,  # 10 pts
            "passing_tds": 2,      # 8 pts
            "interceptions": 1,    # -2 pts
            "rushing_yards": 50,   # 5 pts
            "rushing_tds": 1,      # 6 pts
            "receptions": 5,       # 2.5 pts
            "receiving_yards": 60, # 6 pts
            "receiving_tds": 1,    # 6 pts
            # total: 10+8-2+5+6+2.5+6+6 = 41.5
        }
        assert calc_half_ppr_points(row) == 41.5

    def test_missing_keys_default_to_zero(self):
        """Test that missing keys are treated as zero."""
        row = {"passing_yards": 100} # 4 pts
        assert calc_half_ppr_points(row) == 4.0

    def test_none_values_default_to_zero(self):
        """Test that None values are treated as zero."""
        row = {
            "passing_yards": 100,
            "passing_tds": None,
            "interceptions": None
        }
        assert calc_half_ppr_points(row) == 4.0

    def test_kicking_stats(self):
        """Test kicking stats scoring."""
        row = {
            "fg_made_0_39": 2,     # 6 pts
            "fg_made_40_49": 1,    # 4 pts
            "fg_made_50_plus": 1,  # 5 pts
            "pat_made": 3          # 3 pts
            # total: 18
        }
        assert calc_half_ppr_points(row) == 18.0

    def test_negative_points(self):
        """Test that negative points are handled correctly."""
        row = {
            "interceptions": 2,    # -4 pts
            "passing_yards": 50    # 2 pts
            # total: -2
        }
        assert calc_half_ppr_points(row) == -2.0

    def test_empty_row(self):
        """Test empty dictionary returns 0."""
        assert calc_half_ppr_points({}) == 0.0

    def test_float_inputs(self):
        """Test handling of float inputs (though expected ints)."""
        # If upstream gives float, it should still work
        row = {
            "passing_yards": 250.5, # 10.02
        }
        # 250.5 * 0.04 = 10.02
        assert abs(calc_half_ppr_points(row) - 10.02) < 0.0001

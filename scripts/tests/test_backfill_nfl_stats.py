import sys
import pytest
from unittest.mock import MagicMock, patch

# --- Fixture to mock dependencies safely ---
@pytest.fixture(scope="module", autouse=True)
def mock_dependencies():
    """
    Mock pandas and scripts.config for the duration of this test module.
    Uses patch.dict to ensure sys.modules is restored after tests complete.
    """
    mocks = {
        "pandas": MagicMock(),
        "scripts.config": MagicMock(),
    }

    # Apply patch to sys.modules
    with patch.dict(sys.modules, mocks):
        yield

# We import the function inside the tests or after the patch is active.
# However, since pytest collects tests by importing the module, top-level imports
# run before fixtures. To handle this without global pollution, we can use
# import_module inside the tests, or rely on the fact that if we use patch.dict
# in a fixture that wraps the whole session/module, it might be safer.
# BUT, simplest way for a unit test of a pure function:
# Just import inside the test function? No, that's annoying.
# Best approach: Use a setup that imports the module *after* patching.

# Actually, the previous implementation did:
# sys.modules["pandas"] = MagicMock()
# from scripts.backfill_nfl_stats import calc_half_ppr_points
# This leaves sys.modules modified.

# New approach:
# 1. Use a fixture to patch sys.modules.
# 2. Import the function-under-test INSIDE the fixture or test functions.
# 3. Clean up is handled by the patch context manager.

class TestCalcHalfPPRPoints:

    @pytest.fixture
    def calc_func(self):
        """Import the function while dependencies are mocked."""
        with patch.dict(sys.modules, {
            "pandas": MagicMock(),
            "scripts.config": MagicMock()
        }):
            # We must reload or import here. Since it might be already imported
            # by other tests (unlikely in this isolated run, but possible),
            # we force a fresh import if needed, or just import it now.
            # Warning: if scripts.backfill_nfl_stats was already imported by another test
            # with REAL pandas, this import might just grab that cached module.
            # But here we want to support the case where pandas is MISSING.

            if "scripts.backfill_nfl_stats" in sys.modules:
                del sys.modules["scripts.backfill_nfl_stats"]

            from scripts.backfill_nfl_stats import calc_half_ppr_points
            yield calc_half_ppr_points

            # Cleanup: remove the module so it doesn't pollute subsequent tests
            # with the mocked dependencies baked in.
            if "scripts.backfill_nfl_stats" in sys.modules:
                del sys.modules["scripts.backfill_nfl_stats"]

    def test_basic_scoring(self, calc_func):
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
        assert calc_func(row) == 41.5

    def test_missing_keys_default_to_zero(self, calc_func):
        """Test that missing keys are treated as zero."""
        row = {"passing_yards": 100} # 4 pts
        assert calc_func(row) == 4.0

    def test_none_values_default_to_zero(self, calc_func):
        """Test that None values are treated as zero."""
        row = {
            "passing_yards": 100,
            "passing_tds": None,
            "interceptions": None
        }
        assert calc_func(row) == 4.0

    def test_kicking_stats(self, calc_func):
        """Test kicking stats scoring."""
        row = {
            "fg_made_0_39": 2,     # 6 pts
            "fg_made_40_49": 1,    # 4 pts
            "fg_made_50_plus": 1,  # 5 pts
            "pat_made": 3          # 3 pts
            # total: 18
        }
        assert calc_func(row) == 18.0

    def test_negative_points(self, calc_func):
        """Test that negative points are handled correctly."""
        row = {
            "interceptions": 2,    # -4 pts
            "passing_yards": 50    # 2 pts
            # total: -2
        }
        assert calc_func(row) == -2.0

    def test_empty_row(self, calc_func):
        """Test empty dictionary returns 0."""
        assert calc_func({}) == 0.0

    def test_float_inputs(self, calc_func):
        """Test handling of float inputs (though expected ints)."""
        # If upstream gives float, it should still work
        row = {
            "passing_yards": 250.5, # 10.02
        }
        # 250.5 * 0.04 = 10.02
        assert abs(calc_func(row) - 10.02) < 0.0001

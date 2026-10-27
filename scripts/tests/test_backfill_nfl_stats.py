"""Tests for the nfl_stats backfill's points calculation and stat processing."""

import pandas as pd
import pytest

from scripts.backfill_nfl_stats import calc_half_ppr_points, process_stats


class TestCalcHalfPPRPoints:

    @pytest.fixture
    def calc_func(self):
        return calc_half_ppr_points

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

    def test_scoring_extras(self, calc_func):
        """Fumbles lost, two-point conversions and missed kicks score too."""
        row = {
            "fumbles_lost": 1,        # -2 pts
            "two_point_pass": 1,      # 1 pt
            "two_point_rush_rec": 1,  # 2 pts
            "fg_missed": 1,           # -1 pt
            "pat_missed": 2,          # -2 pts
        }
        assert calc_func(row) == -2.0


class TestProcessStatsExtras:

    def test_derives_extras_from_nflverse_columns(self):
        """The extras are derived per row, then summed across a traded player's teams."""
        raw = pd.DataFrame([
            {"player_display_name": "A", "season": 2024, "games": 8, "fumbles_lost_total": 1,
             "passing_2pt_conversions": 1, "rushing_2pt_conversions": 0, "receiving_2pt_conversions": 1,
             "fg_att": 0, "fg_made": 0, "pat_att": 0, "pat_made": 0},
            {"player_display_name": "A", "season": 2024, "games": 9, "fumbles_lost_total": 2,
             "passing_2pt_conversions": 0, "rushing_2pt_conversions": 1, "receiving_2pt_conversions": 0,
             "fg_att": 0, "fg_made": 0, "pat_att": 0, "pat_made": 0},
            {"player_display_name": "K", "season": 2024, "games": 17, "fumbles_lost_total": 0,
             "passing_2pt_conversions": 0, "rushing_2pt_conversions": 0, "receiving_2pt_conversions": 0,
             # nflverse's own fg_missed / pat_missed leave out blocked kicks; Ottoneu docks them.
             "fg_att": 30, "fg_made": 26, "fg_missed": 3, "pat_att": 40, "pat_made": 38, "pat_missed": 1},
        ])
        out = process_stats(raw).set_index("player_display_name")
        assert out.loc["A", "fumbles_lost"] == 3
        assert out.loc["A", "two_point_pass"] == 1
        assert out.loc["A", "two_point_rush_rec"] == 2
        assert out.loc["K", "fg_missed"] == 4
        assert out.loc["K", "pat_missed"] == 2

"""Tests for the nfl_stats backfill's points calculation and stat processing."""

import pandas as pd
import pytest

from scripts.backfill_nfl_stats import (
    calc_half_ppr_points,
    dedup_stat_rows,
    plan_team_fills,
    process_stats,
)


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


    def test_stat_model_inputs_sum_across_teams(self):
        """Sacks, YAC, first downs and EPA are season totals: a traded player's stints add up."""
        raw = pd.DataFrame([
            {"player_display_name": "Q", "season": 2024, "games": 8, "sacks_suffered": 10,
             "passing_yards_after_catch": 500, "passing_first_downs": 40, "passing_epa": 12.5},
            {"player_display_name": "Q", "season": 2024, "games": 9, "sacks_suffered": 15,
             "passing_yards_after_catch": 700, "passing_first_downs": 55, "passing_epa": -3.25},
        ])
        out = process_stats(raw).set_index("player_display_name")
        assert out.loc["Q", "sacks_suffered"] == 25
        assert out.loc["Q", "passing_yards_after_catch"] == 1200
        assert out.loc["Q", "passing_first_downs"] == 95
        assert out.loc["Q", "passing_epa"] == pytest.approx(9.25)


class TestDedupStatRowsStoresStatColumns:
    """Since migration 060 the extras and stat-model inputs are stored, not dropped."""

    def test_extras_are_kept_and_rescore_to_total_points(self):
        rows = [
            {"player_id": "p1", "season": 2024, "games_played": 10, "rushing_yards": 500,
             "fumbles_lost": 2, "two_point_rush_rec": 1},
            {"player_id": "p1", "season": 2024, "games_played": 5, "rushing_yards": 100,
             "fumbles_lost": 1, "two_point_rush_rec": 0},
        ]
        out = dedup_stat_rows(rows)[0]
        assert out["fumbles_lost"] == 3
        assert out["two_point_rush_rec"] == 1
        # Stored row re-scores to its own total_points.
        assert calc_half_ppr_points(out) == pytest.approx(out["total_points"])

    def test_epa_stays_fractional_and_counts_stay_int(self):
        rows = [
            {"player_id": "p1", "season": 2024, "games_played": 10, "receiving_epa": 4.75,
             "receiving_first_downs": 20},
            {"player_id": "p1", "season": 2024, "games_played": 5, "receiving_epa": 1.5,
             "receiving_first_downs": 6},
        ]
        out = dedup_stat_rows(rows)[0]
        assert out["receiving_epa"] == pytest.approx(6.25)
        assert out["receiving_first_downs"] == 26
        assert isinstance(out["receiving_first_downs"], int)


class TestDedupStatRowsKeepsTeam:
    """recent_team must survive the (player_id, season) dedup (it used to be dropped)."""

    def test_single_row_keeps_team(self):
        rows = [{"player_id": "p1", "season": 2021, "games_played": 16,
                 "rushing_attempts": 200, "recent_team": "TB"}]
        out = dedup_stat_rows(rows)
        assert out[0]["recent_team"] == "TB"

    def test_merged_variants_keep_team_with_most_games(self):
        rows = [
            {"player_id": "p1", "season": 2021, "games_played": 3,
             "rushing_attempts": 10, "recent_team": "NYJ"},
            {"player_id": "p1", "season": 2021, "games_played": 12,
             "rushing_attempts": 150, "recent_team": "NE"},
        ]
        out = dedup_stat_rows(rows)
        assert len(out) == 1
        assert out[0]["recent_team"] == "NE"
        assert out[0]["rushing_attempts"] == 160

    def test_missing_team_on_one_variant_does_not_erase_the_other(self):
        rows = [
            {"player_id": "p1", "season": 2021, "games_played": 14,
             "targets": 90, "recent_team": None},
            {"player_id": "p1", "season": 2021, "games_played": 2,
             "targets": 5, "recent_team": "KC"},
        ]
        assert dedup_stat_rows(rows)[0]["recent_team"] == "KC"


class TestPlanTeamFills:
    """--fill-missing-teams only fills NULL teams, matched through each row's own player."""

    processed = pd.DataFrame([
        {"player_display_name": "Ronald Jones", "season": 2020, "games_played": 14, "recent_team": "TB"},
        {"player_display_name": "Josh Allen", "season": 2020, "games_played": 16, "recent_team": "BUF"},
    ])

    def test_fills_only_null_rows(self):
        names = {"u1": "Ronald Jones", "u2": "Josh Allen"}
        existing = [
            {"id": "r1", "player_id": "u1", "season": 2020, "recent_team": None},
            {"id": "r2", "player_id": "u2", "season": 2020, "recent_team": "BUF"},
        ]
        assert plan_team_fills(self.processed, names, existing) == {(2020, "TB"): ["r1"]}

    def test_duplicate_player_rows_sharing_a_name_both_fill(self):
        names = {"u1": "Ronald Jones", "u1b": "Ronald Jones II"}
        existing = [
            {"id": "r1", "player_id": "u1", "season": 2020, "recent_team": None},
            {"id": "r3", "player_id": "u1b", "season": 2020, "recent_team": None},
        ]
        plan = plan_team_fills(self.processed, names, existing)
        assert sorted(plan[(2020, "TB")]) == ["r1", "r3"]

    def test_season_mismatch_is_not_filled(self):
        names = {"u1": "Ronald Jones"}
        existing = [{"id": "r1", "player_id": "u1", "season": 2019, "recent_team": None}]
        assert plan_team_fills(self.processed, names, existing) == {}

"""
Unit tests for projection methods — WeightedAveragePPG, RookieTrajectoryPPG,
and CollegeProspectPPG.

These are pure functions with no DB or network dependencies.
"""
import pytest
from scripts.projection_methods import (
    CollegeProspectPPG,
    WeightedAveragePPG,
    RookieTrajectoryPPG,
)


# ---------------------------------------------------------------------------
# WeightedAveragePPG
# ---------------------------------------------------------------------------

class TestWeightedAveragePPG:
    """Tests for the weighted-average projection method."""

    def setup_method(self):
        self.method = WeightedAveragePPG()

    def test_empty_history_returns_none(self):
        assert self.method.project_ppg([]) is None

    def test_single_season(self):
        history = [{"season": 2024, "ppg": 15.0, "games_played": 17}]
        result = self.method.project_ppg(history)
        assert result is not None
        # Full 17 games means games_scale = 1.0, so result should be 15.0
        assert result == pytest.approx(15.0)

    def test_single_season_injury_shortened(self):
        """Injury-shortened season — result should still equal ppg since there's only one."""
        history = [{"season": 2024, "ppg": 15.0, "games_played": 8}]
        result = self.method.project_ppg(history)
        assert result is not None
        # With 1 season: numerator = 15 * 0.50 * (8/17), denominator = 0.50 * (8/17)
        # Result = 15.0 (weight cancels)
        assert result == pytest.approx(15.0)

    def test_two_seasons_recency_weight(self):
        """Most recent season should have more weight."""
        history = [
            {"season": 2023, "ppg": 10.0, "games_played": 17},
            {"season": 2024, "ppg": 20.0, "games_played": 17},
        ]
        result = self.method.project_ppg(history)
        assert result is not None
        # With full games: w_recent=0.50, w_older=0.30
        # result = (20*0.50 + 10*0.30) / (0.50 + 0.30) = 13 / 0.80 = 16.25
        assert result == pytest.approx(16.25)

    def test_three_seasons(self):
        """Three seasons with full games — verifies all three recency weights."""
        history = [
            {"season": 2022, "ppg": 10.0, "games_played": 17},
            {"season": 2023, "ppg": 15.0, "games_played": 17},
            {"season": 2024, "ppg": 20.0, "games_played": 17},
        ]
        result = self.method.project_ppg(history)
        assert result is not None
        # weights: 0.50 * (17/17), 0.30 * (17/17), 0.20 * (17/17)
        # numerator = 20*0.50 + 15*0.30 + 10*0.20 = 10 + 4.5 + 2 = 16.5
        # denominator = 0.50 + 0.30 + 0.20 = 1.0
        assert result == pytest.approx(16.5)

    def test_four_seasons_uses_only_three_most_recent(self):
        """When 4+ seasons provided, only the 3 most recent should be used."""
        history = [
            {"season": 2021, "ppg": 5.0, "games_played": 17},
            {"season": 2022, "ppg": 10.0, "games_played": 17},
            {"season": 2023, "ppg": 15.0, "games_played": 17},
            {"season": 2024, "ppg": 20.0, "games_played": 17},
        ]
        result = self.method.project_ppg(history)
        # Should be same as three_seasons test (2022-2024 only)
        assert result == pytest.approx(16.5)

    def test_games_scaling(self):
        """Injury-shortened season should be discounted."""
        history = [
            {"season": 2023, "ppg": 10.0, "games_played": 17},  # full
            {"season": 2024, "ppg": 20.0, "games_played": 4},   # injured
        ]
        result = self.method.project_ppg(history)
        assert result is not None
        # w_recent = 0.50 * (4/17) ≈ 0.1176, w_older = 0.30 * (17/17) = 0.30
        # numerator = 20 * 0.1176 + 10 * 0.30 = 2.353 + 3.0 = 5.353
        # denominator = 0.1176 + 0.30 = 0.4176
        # result ≈ 12.82
        assert result == pytest.approx(5.353 / 0.4176, rel=0.01)

    def test_unsorted_input_is_handled(self):
        """History doesn't have to be pre-sorted."""
        history = [
            {"season": 2024, "ppg": 20.0, "games_played": 17},
            {"season": 2022, "ppg": 10.0, "games_played": 17},
            {"season": 2023, "ppg": 15.0, "games_played": 17},
        ]
        result = self.method.project_ppg(history)
        assert result == pytest.approx(16.5)

    def test_zero_games_all_seasons_returns_none(self):
        """If all seasons have 0 games, denominator is 0 → None."""
        history = [
            {"season": 2024, "ppg": 10.0, "games_played": 0},
        ]
        result = self.method.project_ppg(history)
        assert result is None

    def test_method_name(self):
        assert self.method.name == "weighted_average_ppg"


# ---------------------------------------------------------------------------
# RookieTrajectoryPPG
# ---------------------------------------------------------------------------

class TestRookieTrajectoryPPG:
    """Tests for the rookie/first-year trajectory projection method."""

    def setup_method(self):
        self.method = RookieTrajectoryPPG()

    def test_empty_history_returns_none(self):
        assert self.method.project_ppg([]) is None

    def test_two_seasons_returns_none(self):
        """Only works with exactly 1 season."""
        history = [
            {"season": 2023, "ppg": 10.0, "games_played": 17},
            {"season": 2024, "ppg": 15.0, "games_played": 17},
        ]
        assert self.method.project_ppg(history) is None

    def test_zero_ppg_returns_none(self):
        history = [{"season": 2024, "ppg": 0.0, "games_played": 17}]
        assert self.method.project_ppg(history) is None

    def test_no_snap_data_returns_ppg(self):
        """When H1 snap data is missing, falls back to raw PPG."""
        history = [{"season": 2024, "ppg": 12.0, "games_played": 17}]
        result = self.method.project_ppg(history)
        assert result == pytest.approx(12.0)

    def test_h1_snaps_zero_returns_ppg(self):
        """When H1 snaps is 0, falls back to raw PPG."""
        history = [{
            "season": 2024, "ppg": 12.0, "games_played": 17,
            "h1_snaps": 0, "h1_games": 8,
            "h2_snaps": 300, "h2_games": 9,
        }]
        result = self.method.project_ppg(history)
        assert result == pytest.approx(12.0)

    def test_increasing_usage_trajectory(self):
        """H2 usage > H1 usage → factor > 1 → projected PPG > raw."""
        history = [{
            "season": 2024, "ppg": 10.0, "games_played": 17,
            "h1_snaps": 200, "h1_games": 8,   # 25 SPG
            "h2_snaps": 360, "h2_games": 9,   # 40 SPG → factor = 40/25 = 1.6 → clamped to 1.5
        }]
        result = self.method.project_ppg(history)
        assert result is not None
        # factor = min(max(40/25, 0.75), 1.50) = min(1.6, 1.5) = 1.5
        assert result == pytest.approx(10.0 * 1.5)

    def test_decreasing_usage_trajectory(self):
        """H2 usage < H1 usage → factor < 1."""
        history = [{
            "season": 2024, "ppg": 10.0, "games_played": 17,
            "h1_snaps": 400, "h1_games": 8,   # 50 SPG
            "h2_snaps": 270, "h2_games": 9,   # 30 SPG → factor = 0.6 → clamped to 0.75
        }]
        result = self.method.project_ppg(history)
        assert result is not None
        # factor = min(max(30/50, 0.75), 1.50) = min(max(0.6, 0.75), 1.5) = 0.75
        assert result == pytest.approx(10.0 * 0.75)

    def test_stable_trajectory(self):
        """Equal H1 and H2 usage → factor = 1.0."""
        history = [{
            "season": 2024, "ppg": 10.0, "games_played": 17,
            "h1_snaps": 400, "h1_games": 8,   # 50 SPG
            "h2_snaps": 450, "h2_games": 9,   # 50 SPG → factor = 1.0
        }]
        result = self.method.project_ppg(history)
        assert result == pytest.approx(10.0)

    def test_factor_within_bounds(self):
        """Factor should always be between 0.75 and 1.50."""
        # Extreme increasing
        history = [{
            "season": 2024, "ppg": 10.0, "games_played": 17,
            "h1_snaps": 10, "h1_games": 8,     # 1.25 SPG
            "h2_snaps": 450, "h2_games": 9,    # 50 SPG → factor clamped to 1.5
        }]
        result = self.method.project_ppg(history)
        assert result == pytest.approx(15.0)

    def test_method_name(self):
        assert self.method.name == "rookie_trajectory"


# ---------------------------------------------------------------------------
# CollegeProspectPPG
# ---------------------------------------------------------------------------

class TestCollegeProspectPPG:
    """Tests for the college prospect projection method."""

    def setup_method(self):
        self.avg_ppg = {"QB": 14.5, "RB": 8.2, "WR": 7.0, "TE": 5.5}
        self.method = CollegeProspectPPG(self.avg_ppg)

    def test_returns_avg_ppg_for_known_position(self):
        result = self.method.project_ppg([], position="QB")
        assert result == pytest.approx(14.5)

    def test_returns_avg_ppg_for_each_position(self):
        for pos, expected in self.avg_ppg.items():
            result = self.method.project_ppg([], position=pos)
            assert result == pytest.approx(expected)

    def test_returns_none_for_unknown_position(self):
        result = self.method.project_ppg([], position="K")
        assert result is None

    def test_returns_none_when_no_position(self):
        result = self.method.project_ppg([])
        assert result is None

    def test_ignores_history(self):
        """History is ignored for college players — only position matters."""
        history = [{"season": 2024, "ppg": 20.0, "games_played": 17}]
        result = self.method.project_ppg(history, position="RB")
        assert result == pytest.approx(8.2)

    def test_empty_avg_map(self):
        """With no avg data available, returns None for all positions."""
        empty_method = CollegeProspectPPG({})
        assert empty_method.project_ppg([], position="QB") is None

    def test_method_name(self):
        assert self.method.name == "college_prospect"

"""
Unit tests for the feature-based projection system.

Tests feature computation, combiner logic, and model config.
Pure functions with no DB or network dependencies.
"""

import pytest
import pandas as pd

from scripts.feature_projections.features.weighted_ppg import WeightedPPGFeature
from scripts.feature_projections.features.age_curve import AgeCurveFeature
from scripts.feature_projections.features.stat_efficiency import StatEfficiencyFeature
from scripts.feature_projections.features.games_played import GamesPlayedFeature
from scripts.feature_projections.features.team_context import TeamContextFeature
from scripts.feature_projections.features.usage_share import UsageShareFeature
from scripts.feature_projections.features.regression_to_mean import RegressionToMeanFeature
from scripts.feature_projections.combiner import combine_features
from scripts.feature_projections.model_config import get_model, MODELS


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_history_df(rows: list[dict]) -> pd.DataFrame:
    """Create a player_stats-like DataFrame."""
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    for col in ["ppg", "games_played"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    return df


def make_nfl_stats_df(rows: list[dict]) -> pd.DataFrame:
    """Create an nfl_stats-like DataFrame."""
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    for col in ["games_played", "total_points", "targets", "rushing_attempts",
                 "passing_yards", "passing_tds", "interceptions", "rushing_yards",
                 "rushing_tds", "receptions", "receiving_yards", "receiving_tds",
                 "offense_snaps", "passing_attempts", "completions"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    return df


# ---------------------------------------------------------------------------
# WeightedPPGFeature
# ---------------------------------------------------------------------------

class TestWeightedPPGFeature:
    """Tests for the weighted_ppg feature (port of existing logic)."""

    def setup_method(self):
        self.feature = WeightedPPGFeature()

    def test_name(self):
        assert self.feature.name == "weighted_ppg"
        assert self.feature.is_base is True

    def test_empty_history(self):
        result = self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), {})
        assert result is None

    def test_single_full_season_veteran(self):
        """Single season with full games — should return raw PPG."""
        df = make_history_df([{"season": 2024, "ppg": 15.0, "games_played": 17}])
        # Single season goes through rookie trajectory path
        result = self.feature.compute("p1", "QB", df, pd.DataFrame(), {})
        assert result is not None
        assert result == pytest.approx(15.0)

    def test_two_seasons_recency_weight(self):
        """Most recent season should have more weight."""
        df = make_history_df([
            {"season": 2023, "ppg": 10.0, "games_played": 17},
            {"season": 2024, "ppg": 20.0, "games_played": 17},
        ])
        result = self.feature.compute("p1", "QB", df, pd.DataFrame(), {})
        assert result is not None
        # w_recent=0.55, w_older=0.25 → (20*0.55 + 10*0.25) / 0.80 = 16.875
        assert result == pytest.approx(16.875)

    def test_three_seasons(self):
        df = make_history_df([
            {"season": 2022, "ppg": 10.0, "games_played": 17},
            {"season": 2023, "ppg": 15.0, "games_played": 17},
            {"season": 2024, "ppg": 20.0, "games_played": 17},
        ])
        result = self.feature.compute("p1", "QB", df, pd.DataFrame(), {})
        # w=[0.55, 0.25, 0.20] → (20*0.55 + 15*0.25 + 10*0.20) / 1.0 = 16.75
        assert result == pytest.approx(16.75)

    def test_rookie_trajectory_increasing(self):
        """Single season with increasing snap trajectory."""
        df = make_history_df([{
            "season": 2024, "ppg": 10.0, "games_played": 17,
            "h1_snaps": 200, "h1_games": 8,   # 25 SPG
            "h2_snaps": 360, "h2_games": 9,   # 40 SPG → factor = 1.5 (clamped)
        }])
        result = self.feature.compute("p1", "WR", df, pd.DataFrame(), {})
        assert result == pytest.approx(15.0)


# ---------------------------------------------------------------------------
# AgeCurveFeature
# ---------------------------------------------------------------------------

class TestAgeCurveFeature:
    def setup_method(self):
        self.feature = AgeCurveFeature()

    def test_name(self):
        assert self.feature.name == "age_curve"
        assert self.feature.is_base is False

    def test_no_birth_date(self):
        result = self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), {"target_season": 2025})
        assert result is None

    def test_qb_at_peak(self):
        """QB at age 28 (peak) — should get zero adjustment."""
        ctx = {"birth_date": "1997-09-01", "target_season": 2025}  # age 28
        result = self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), ctx)
        assert result is not None
        # At peak (0 years from peak), goes to growth path with years_to_peak = 0 → 0.0
        assert result == pytest.approx(0.0, abs=0.1)

    def test_qb_past_peak(self):
        """QB at age 35 (7 years past peak) — should get negative adjustment."""
        ctx = {"birth_date": "1990-09-01", "target_season": 2025}  # age 35
        result = self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), ctx)
        assert result is not None
        # 7 years past peak × 1.0 decline × 0.2 scale = -1.4
        assert result == pytest.approx(-1.4, abs=0.1)

    def test_rb_young(self):
        """Young RB (age 22) — should get growth boost."""
        ctx = {"birth_date": "2003-09-01", "target_season": 2025}  # age 22
        result = self.feature.compute("p1", "RB", pd.DataFrame(), pd.DataFrame(), ctx)
        assert result is not None
        # 5 years to peak (27), growth = 0.1 * min(5, 3) * 1.0 scale = 0.3
        assert result == pytest.approx(0.3, abs=0.05)


# ---------------------------------------------------------------------------
# StatEfficiencyFeature
# ---------------------------------------------------------------------------

class TestStatEfficiencyFeature:
    def setup_method(self):
        self.feature = StatEfficiencyFeature()

    def test_name(self):
        assert self.feature.name == "stat_efficiency"

    def test_empty_nfl_stats(self):
        result = self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), {})
        assert result is None

    def test_returns_delta_from_base(self):
        """Should return difference between stat-based and base PPG."""
        nfl_df = make_nfl_stats_df([{
            "season": 2024, "games_played": 17,
            "passing_yards": 4000, "passing_tds": 30, "interceptions": 10,
            "rushing_yards": 200, "rushing_tds": 2,
            "receptions": 0, "receiving_yards": 0, "receiving_tds": 0,
        }])
        # Stat PPG: (4000*0.04 + 30*4 + (-10*2) + 200*0.1 + 2*6) / 17
        # = (160 + 120 - 20 + 20 + 12) / 17 = 292 / 17 ≈ 17.18
        ctx = {"base_ppg": 15.0}
        result = self.feature.compute("p1", "QB", pd.DataFrame(), nfl_df, ctx)
        assert result is not None
        assert result == pytest.approx(17.176 - 15.0, abs=0.1)

    def test_no_base_ppg_returns_none(self):
        nfl_df = make_nfl_stats_df([{
            "season": 2024, "games_played": 17,
            "passing_yards": 4000, "passing_tds": 30, "interceptions": 10,
        }])
        result = self.feature.compute("p1", "QB", pd.DataFrame(), nfl_df, {})
        assert result is None

    def test_kicker_returns_none(self):
        """K position has no passing/rushing/receiving stats — always return None."""
        nfl_df = make_nfl_stats_df([{
            "season": 2024, "games_played": 17,
        }])
        ctx = {"base_ppg": 7.0}
        result = self.feature.compute("p1", "K", pd.DataFrame(), nfl_df, ctx)
        assert result is None


# ---------------------------------------------------------------------------
# GamesPlayedFeature
# ---------------------------------------------------------------------------

class TestGamesPlayedFeature:
    def setup_method(self):
        self.feature = GamesPlayedFeature()

    def test_healthy_player_no_adjustment(self):
        """Full season player gets 0.0 delta."""
        df = make_history_df([{"season": 2024, "ppg": 15.0, "games_played": 17}])
        result = self.feature.compute("p1", "QB", df, pd.DataFrame(), {"base_ppg": 15.0})
        assert result == pytest.approx(0.0)

    def test_injury_prone_gets_negative(self):
        """Player averaging ~10 GP gets a negative delta."""
        df = make_history_df([
            {"season": 2023, "ppg": 15.0, "games_played": 10},
            {"season": 2024, "ppg": 15.0, "games_played": 10},
        ])
        result = self.feature.compute("p1", "QB", df, pd.DataFrame(), {"base_ppg": 15.0})
        assert result is not None
        assert result < 0


# ---------------------------------------------------------------------------
# TeamContextFeature
# ---------------------------------------------------------------------------

class TestTeamContextFeature:
    def setup_method(self):
        self.feature = TeamContextFeature()

    def test_positive_rating_gives_boost(self):
        ctx = {"team_offense_rating": 5.0, "base_ppg": 15.0}
        result = self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), ctx)
        assert result is not None
        assert result > 0

    def test_negative_rating_gives_penalty(self):
        ctx = {"team_offense_rating": -3.0, "base_ppg": 15.0}
        result = self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), ctx)
        assert result is not None
        assert result < 0

    def test_no_rating_returns_none(self):
        result = self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), {})
        assert result is None


# ---------------------------------------------------------------------------
# UsageShareFeature
# ---------------------------------------------------------------------------

class TestUsageShareFeature:
    def setup_method(self):
        self.feature = UsageShareFeature()

    def test_qb_excluded(self):
        """QB should return None — passing_attempts share tested but worsened MAE (GH #250)."""
        nfl_df = make_nfl_stats_df([
            {"season": 2023, "games_played": 17, "passing_attempts": 450},
            {"season": 2024, "games_played": 17, "passing_attempts": 550},
        ])
        ctx = {
            "base_ppg": 20.0,
            "team_usage": {
                2023: {"passing_attempts": 500},
                2024: {"passing_attempts": 580},
            },
        }
        result = self.feature.compute("p1", "QB", pd.DataFrame(), nfl_df, ctx)
        assert result is None

    def test_wr_increasing_share_positive_delta(self):
        """WR with increasing target share should get a positive PPG delta."""
        nfl_df = make_nfl_stats_df([
            {"season": 2023, "games_played": 17, "targets": 80},
            {"season": 2024, "games_played": 17, "targets": 120},
        ])
        ctx = {
            "base_ppg": 12.0,
            "team_usage": {
                2023: {"targets": 500},
                2024: {"targets": 500},
            },
        }
        result = self.feature.compute("p1", "WR", pd.DataFrame(), nfl_df, ctx)
        assert result is not None
        assert result > 0  # increasing share → positive delta

    def test_insufficient_data_returns_none(self):
        """With only 1 season, should return None (need >= 2 for trend)."""
        nfl_df = make_nfl_stats_df([
            {"season": 2024, "games_played": 17, "targets": 100},
        ])
        ctx = {
            "base_ppg": 10.0,
            "team_usage": {2024: {"targets": 500}},
        }
        result = self.feature.compute("p1", "WR", pd.DataFrame(), nfl_df, ctx)
        assert result is None


# ---------------------------------------------------------------------------
# RegressionToMeanFeature
# ---------------------------------------------------------------------------

class TestRegressionToMeanFeature:
    def setup_method(self):
        self.feature = RegressionToMeanFeature()

    def test_name(self):
        assert self.feature.name == "regression_to_mean"
        assert self.feature.is_base is False

    def test_missing_context_returns_none(self):
        """Missing base_ppg or positional_mean_ppg → None."""
        result = self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), {})
        assert result is None

        result = self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), {"base_ppg": 15.0})
        assert result is None

        result = self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), {"positional_mean_ppg": 12.0})
        assert result is None

    def test_above_mean_gets_negative_delta(self):
        """Player PPG above positional mean should get pulled down."""
        ctx = {"base_ppg": 20.0, "positional_mean_ppg": 12.0}
        result = self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), ctx)
        assert result is not None
        # delta = (12 - 20) * 0.12 = -0.96
        assert result == pytest.approx(-0.96)
        assert result < 0

    def test_below_mean_gets_positive_delta(self):
        """Player PPG below positional mean should get boosted."""
        ctx = {"base_ppg": 8.0, "positional_mean_ppg": 12.0}
        result = self.feature.compute("p1", "WR", pd.DataFrame(), pd.DataFrame(), ctx)
        assert result is not None
        # delta = (12 - 8) * 0.12 = 0.48
        assert result == pytest.approx(0.48)
        assert result > 0

    def test_at_mean_returns_zero(self):
        """Player at positional mean → zero delta."""
        ctx = {"base_ppg": 12.0, "positional_mean_ppg": 12.0}
        result = self.feature.compute("p1", "RB", pd.DataFrame(), pd.DataFrame(), ctx)
        assert result == pytest.approx(0.0)


# ---------------------------------------------------------------------------
# Combiner
# ---------------------------------------------------------------------------

class TestCombiner:
    def test_base_feature_only(self):
        """Single base feature → result equals feature value."""
        feature = WeightedPPGFeature()
        df = make_history_df([
            {"season": 2023, "ppg": 10.0, "games_played": 17},
            {"season": 2024, "ppg": 20.0, "games_played": 17},
        ])
        result, values = combine_features(
            [feature], "p1", "QB", df, pd.DataFrame(), {}
        )
        assert result is not None
        assert result == pytest.approx(16.875)
        assert "weighted_ppg" in values

    def test_base_plus_adjustment(self):
        """Base feature + team context adjustment."""
        base = WeightedPPGFeature()
        team = TeamContextFeature()
        df = make_history_df([
            {"season": 2023, "ppg": 10.0, "games_played": 17},
            {"season": 2024, "ppg": 20.0, "games_played": 17},
        ])
        ctx = {"team_offense_rating": 5.0}
        result, values = combine_features(
            [base, team], "p1", "QB", df, pd.DataFrame(), ctx
        )
        assert result is not None
        assert result > 16.875  # Base was 16.875, team boost should add
        assert "weighted_ppg" in values
        assert "team_context" in values

    def test_no_base_returns_none(self):
        """If base feature returns None, final result is None."""
        base = WeightedPPGFeature()
        result, values = combine_features(
            [base], "p1", "QB", pd.DataFrame(), pd.DataFrame(), {}
        )
        assert result is None

    def test_floor_at_zero(self):
        """Result should never be negative."""
        base = WeightedPPGFeature()
        games = GamesPlayedFeature()
        df = make_history_df([{"season": 2024, "ppg": 0.5, "games_played": 2}])
        ctx = {"team_offense_rating": -100.0}
        result, _ = combine_features(
            [base, games], "p1", "QB", df, pd.DataFrame(), ctx
        )
        if result is not None:
            assert result >= 0.0


# ---------------------------------------------------------------------------
# Model Config
# ---------------------------------------------------------------------------

class TestModelConfig:
    def test_all_models_exist(self):
        expected = [
            "v1_baseline_weighted_ppg",
            "v2_age_adjusted",
            "v3_stat_weighted",
            "v4_availability_adjusted",
            "v5_team_context",
            "v6_usage_share",
            "v7_regression_to_mean",
        ]
        for name in expected:
            model = get_model(name)
            assert model.name == name

    def test_baseline_model_has_flag(self):
        model = get_model("v1_baseline_weighted_ppg")
        assert model.is_baseline is True

    def test_features_are_cumulative(self):
        """Each model should include all features from previous models."""
        prev_features: list[str] = []
        for name in ["v1_baseline_weighted_ppg", "v2_age_adjusted", "v3_stat_weighted",
                      "v4_availability_adjusted", "v5_team_context", "v6_usage_share",
                      "v7_regression_to_mean"]:
            model = get_model(name)
            for f in prev_features:
                assert f in model.features, f"{name} missing feature {f}"
            prev_features = list(model.features)

    def test_unknown_model_raises(self):
        with pytest.raises(ValueError):
            get_model("nonexistent_model")


# ---------------------------------------------------------------------------
# V1 Baseline Parity (GH #237)
# ---------------------------------------------------------------------------

class TestWeightedPPGVeteranCases:
    """Verify WeightedPPGFeature correctness for veteran cases with tuned weights [0.55, 0.25, 0.20].

    Note: These were parity tests vs the old WeightedAveragePPG system (GH #237).
    After tuning recency weights (GH #271), the feature intentionally diverges from
    the old system. Rookie/single-season paths remain identical.
    """

    def setup_method(self):
        self.feature = WeightedPPGFeature()

    def _project(self, history_rows):
        """Run WeightedPPGFeature on history data."""
        df = make_history_df(history_rows)
        return self.feature.compute("test", "QB", df, pd.DataFrame(), {})

    # --- veteran paths ---

    def test_two_full_seasons(self):
        history = [
            {"season": 2023, "ppg": 14.0, "games_played": 17},
            {"season": 2024, "ppg": 18.0, "games_played": 17},
        ]
        # w=[0.55, 0.25] → (18*0.55 + 14*0.25) / 0.80 = 16.75
        assert self._project(history) == pytest.approx(16.75)

    def test_three_full_seasons(self):
        history = [
            {"season": 2022, "ppg": 10.0, "games_played": 17},
            {"season": 2023, "ppg": 14.0, "games_played": 17},
            {"season": 2024, "ppg": 20.0, "games_played": 17},
        ]
        # w=[0.55, 0.25, 0.20] → (20*0.55 + 14*0.25 + 10*0.20) / 1.0 = 16.5
        assert self._project(history) == pytest.approx(16.5)

    def test_three_seasons_injury_year(self):
        """Games-scaling should down-weight injured seasons."""
        history = [
            {"season": 2022, "ppg": 16.0, "games_played": 17},
            {"season": 2023, "ppg": 18.0, "games_played": 6},   # injured
            {"season": 2024, "ppg": 20.0, "games_played": 17},
        ]
        result = self._project(history)
        assert result is not None
        # Injured season (6/17 games) gets scaled down
        # w0=0.55*1.0=0.55, w1=0.25*(6/17)≈0.0882, w2=0.20*1.0=0.20
        # num = 20*0.55 + 18*0.0882 + 16*0.20 = 11 + 1.588 + 3.2 = 15.788
        # den = 0.55 + 0.0882 + 0.20 = 0.8382
        assert result == pytest.approx(15.788 / 0.8382, rel=1e-3)

    def test_two_seasons_one_partial(self):
        history = [
            {"season": 2023, "ppg": 12.0, "games_played": 10},
            {"season": 2024, "ppg": 15.0, "games_played": 17},
        ]
        result = self._project(history)
        assert result is not None
        # w0=0.55*1.0=0.55, w1=0.25*(10/17)≈0.1471
        # num = 15*0.55 + 12*0.1471 = 8.25 + 1.7647 = 10.0147
        # den = 0.55 + 0.1471 = 0.6971
        assert result == pytest.approx(10.0147 / 0.6971, rel=1e-3)

    def test_more_than_three_seasons_uses_latest_three(self):
        """Only the 3 most recent seasons should be used."""
        history = [
            {"season": 2021, "ppg": 5.0,  "games_played": 17},  # should be ignored
            {"season": 2022, "ppg": 10.0, "games_played": 17},
            {"season": 2023, "ppg": 14.0, "games_played": 17},
            {"season": 2024, "ppg": 20.0, "games_played": 17},
        ]
        # Same as three_full_seasons — 2021 is dropped
        assert self._project(history) == pytest.approx(16.5)

    # --- rookie / single-season path (unchanged by weight tuning) ---

    def test_rookie_no_snap_data(self):
        """Single season, no snap data → factor defaults to 1.0, returns raw PPG."""
        history = [{"season": 2024, "ppg": 9.0, "games_played": 14}]
        assert self._project(history) == pytest.approx(9.0)

    def test_rookie_increasing_snaps(self):
        history = [{
            "season": 2024, "ppg": 10.0, "games_played": 17,
            "h1_snaps": 200, "h1_games": 8,
            "h2_snaps": 360, "h2_games": 9,
        }]
        # H2/H1 = 40/25 = 1.6, clamped to 1.5 → 10 * 1.5 = 15.0
        assert self._project(history) == pytest.approx(15.0)

    def test_rookie_decreasing_snaps(self):
        history = [{
            "season": 2024, "ppg": 10.0, "games_played": 17,
            "h1_snaps": 360, "h1_games": 9,
            "h2_snaps": 200, "h2_games": 8,
        }]
        # H2/H1 = 25/40 = 0.625, clamped to 0.75 → 10 * 0.75 = 7.5
        assert self._project(history) == pytest.approx(7.5)

    def test_rookie_snaps_clamped_at_max(self):
        """Snap ratio > 1.5 → clamped to 1.5."""
        history = [{
            "season": 2024, "ppg": 10.0, "games_played": 17,
            "h1_snaps": 100, "h1_games": 8,
            "h2_snaps": 800, "h2_games": 9,
        }]
        # H2/H1 = 88.89/12.5 = 7.11, clamped to 1.5 → 10 * 1.5 = 15.0
        assert self._project(history) == pytest.approx(15.0)

    def test_rookie_snaps_clamped_at_min(self):
        """Snap ratio < 0.75 → clamped to 0.75."""
        history = [{
            "season": 2024, "ppg": 10.0, "games_played": 17,
            "h1_snaps": 800, "h1_games": 9,
            "h2_snaps": 100, "h2_games": 8,
        }]
        # H2/H1 = 12.5/88.89 = 0.14, clamped to 0.75 → 10 * 0.75 = 7.5
        assert self._project(history) == pytest.approx(7.5)

    def test_all_zeros_returns_none(self):
        """Zero PPG → returns None."""
        history = [{"season": 2024, "ppg": 0.0, "games_played": 0}]
        assert self._project(history) is None

    def test_empty_history_returns_none(self):
        result = self.feature.compute("test", "QB", pd.DataFrame(), pd.DataFrame(), {})
        assert result is None

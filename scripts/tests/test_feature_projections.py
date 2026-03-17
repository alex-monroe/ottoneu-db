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
                 "offense_snaps"]:
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
        # w_recent=0.50, w_older=0.30 → (20*0.50 + 10*0.30) / 0.80 = 16.25
        assert result == pytest.approx(16.25)

    def test_three_seasons(self):
        df = make_history_df([
            {"season": 2022, "ppg": 10.0, "games_played": 17},
            {"season": 2023, "ppg": 15.0, "games_played": 17},
            {"season": 2024, "ppg": 20.0, "games_played": 17},
        ])
        result = self.feature.compute("p1", "QB", df, pd.DataFrame(), {})
        assert result == pytest.approx(16.5)

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
        """QB at age 30 (peak) — should get growth adjustment."""
        ctx = {"birth_date": "1995-09-01", "target_season": 2025}  # age 30
        result = self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), ctx)
        assert result is not None
        # At peak (0 years from peak), years_from_peak = 0, which is not > 0
        # So goes to growth path with years_to_peak = 0 → 0.0
        assert result == pytest.approx(0.0, abs=0.1)

    def test_qb_past_peak(self):
        """QB at age 35 (5 years past peak) — should get negative adjustment."""
        ctx = {"birth_date": "1990-09-01", "target_season": 2025}  # age 35
        result = self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), ctx)
        assert result is not None
        # 5 years past peak × 0.3 decline × 0.3 scale = -0.45
        assert result == pytest.approx(-0.45, abs=0.05)

    def test_rb_young(self):
        """Young RB (age 22) — should get growth boost."""
        ctx = {"birth_date": "2003-09-01", "target_season": 2025}  # age 22
        result = self.feature.compute("p1", "RB", pd.DataFrame(), pd.DataFrame(), ctx)
        assert result is not None
        # 3 years to peak (25), growth = 0.5 * min(3, 3) * 0.3 scale = 0.45
        assert result == pytest.approx(0.45, abs=0.05)


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
        """QB should return None — usage share is not meaningful for QBs (GH #232)."""
        nfl_df = make_nfl_stats_df([
            {"season": 2023, "games_played": 17, "passing_yards": 4000},
            {"season": 2024, "games_played": 17, "passing_yards": 4500},
        ])
        ctx = {
            "base_ppg": 20.0,
            "team_usage": {
                2023: {"passing_yards": 4200},
                2024: {"passing_yards": 4600},
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
        assert result == pytest.approx(16.25)
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
        assert result > 16.25  # Base was 16.25, team boost should add
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
                      "v4_availability_adjusted", "v5_team_context", "v6_usage_share"]:
            model = get_model(name)
            for f in prev_features:
                assert f in model.features, f"{name} missing feature {f}"
            prev_features = list(model.features)

    def test_unknown_model_raises(self):
        with pytest.raises(ValueError):
            get_model("nonexistent_model")

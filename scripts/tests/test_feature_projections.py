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
from scripts.feature_projections.features.qb_starter_usage import QBStarterUsageFeature, QBStarterBackupPenaltyFeature
from scripts.feature_projections.combiner import combine_features
from scripts.feature_projections.model_config import get_model, MODELS, ModelDefinition, PositionOverride
from scripts.feature_projections.runner import _resolve_features_for_position


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

    def test_kicker_returns_none(self):
        """K position has no passing/rushing/receiving stats — always return None."""
        nfl_df = make_nfl_stats_df([{
            "season": 2024, "games_played": 17,
            "passing_yards": 4000, "passing_tds": 30, "passing_attempts": 500,
        }])
        ctx = {"base_ppg": 7.0}
        result = self.feature.compute("p1", "K", pd.DataFrame(), nfl_df, ctx)
        assert result is None

    def test_no_base_ppg_returns_none(self):
        nfl_df = make_nfl_stats_df([{
            "season": 2024, "games_played": 17,
            "passing_yards": 4000, "passing_tds": 30, "passing_attempts": 500,
        }])
        result = self.feature.compute("p1", "QB", pd.DataFrame(), nfl_df, {})
        assert result is None

    def test_qb_high_ypa_positive_delta(self):
        """QB with above-baseline YPA in recent season → positive adjustment."""
        nfl_df = make_nfl_stats_df([
            {"season": 2023, "games_played": 17, "passing_yards": 3500, "passing_tds": 22, "interceptions": 12, "passing_attempts": 500},
            {"season": 2024, "games_played": 17, "passing_yards": 4500, "passing_tds": 23, "interceptions": 13, "passing_attempts": 500},
        ])
        # 2023 YPA=7.0, 2024 YPA=9.0 → deviation = (9-7)/7 = 0.286 → positive delta
        ctx = {"base_ppg": 20.0}
        result = self.feature.compute("p1", "QB", pd.DataFrame(), nfl_df, ctx)
        assert result is not None
        assert result > 0

    def test_qb_high_td_rate_regression(self):
        """QB with elevated TD rate → negative adjustment (regression signal)."""
        nfl_df = make_nfl_stats_df([
            {"season": 2023, "games_played": 17, "passing_yards": 3500, "passing_tds": 20, "interceptions": 12, "passing_attempts": 500},
            {"season": 2024, "games_played": 17, "passing_yards": 3500, "passing_tds": 40, "interceptions": 12, "passing_attempts": 500},
        ])
        # 2023 TD rate=0.04, 2024 TD rate=0.08 → big deviation, negative direction
        ctx = {"base_ppg": 20.0}
        result = self.feature.compute("p1", "QB", pd.DataFrame(), nfl_df, ctx)
        assert result is not None
        # The TD rate regression signal should dominate (direction=-0.5)
        # but YPA is flat (deviation≈0) and INT rate is flat, so net depends on TD rate
        # TD deviation = (0.08-0.04)/0.04 = 1.0, delta = 1.0 * -0.5 * 0.07 * 20 = -0.7

    def test_rb_efficiency_up(self):
        """RB with improving YPC → positive adjustment."""
        nfl_df = make_nfl_stats_df([
            {"season": 2023, "games_played": 17, "rushing_yards": 200, "rushing_tds": 3, "rushing_attempts": 50},
            {"season": 2024, "games_played": 17, "rushing_yards": 350, "rushing_tds": 4, "rushing_attempts": 50},
        ])
        # 2023 YPC=4.0, 2024 YPC=7.0 → positive deviation
        ctx = {"base_ppg": 12.0}
        result = self.feature.compute("p1", "RB", pd.DataFrame(), nfl_df, ctx)
        assert result is not None
        assert result > 0

    def test_wr_catch_rate_down(self):
        """WR with declining catch rate → negative adjustment."""
        nfl_df = make_nfl_stats_df([
            {"season": 2023, "games_played": 17, "receptions": 80, "receiving_yards": 1000, "receiving_tds": 6, "targets": 100},
            {"season": 2024, "games_played": 17, "receptions": 40, "receiving_yards": 600, "receiving_tds": 3, "targets": 100},
        ])
        # Catch rate: 0.80 → 0.40, yards/target: 10→6, TD rate: 0.06→0.03
        # All declining → negative delta (catch rate and yards/target have positive direction)
        ctx = {"base_ppg": 10.0}
        result = self.feature.compute("p1", "WR", pd.DataFrame(), nfl_df, ctx)
        assert result is not None
        assert result < 0

    def test_single_season_uses_league_avg(self):
        """1-season player compared to league averages."""
        nfl_df = make_nfl_stats_df([{
            "season": 2024, "games_played": 17,
            "passing_yards": 4200, "passing_tds": 30, "interceptions": 10, "passing_attempts": 500,
        }])
        # YPA = 8.4 vs league avg 7.0 → deviation=(8.4-7)/7=0.2 → positive
        # TD rate = 0.06 vs league avg 0.045 → deviation=(0.06-0.045)/0.045=0.33 → negative (direction=-0.5)
        # INT rate = 0.02 vs league avg 0.025 → deviation=(0.02-0.025)/0.025=-0.2 → positive (direction=-1)
        ctx = {"base_ppg": 20.0}
        result = self.feature.compute("p1", "QB", pd.DataFrame(), nfl_df, ctx)
        assert result is not None

    def test_clamped_to_10_pct(self):
        """Extreme deviations should be clamped to ±10% of base_ppg."""
        nfl_df = make_nfl_stats_df([
            {"season": 2023, "games_played": 17, "rushing_yards": 50, "rushing_tds": 0, "rushing_attempts": 50},
            {"season": 2024, "games_played": 17, "rushing_yards": 500, "rushing_tds": 20, "rushing_attempts": 50},
        ])
        # Extreme YPC deviation: 1.0 → 10.0 = 900% increase
        ctx = {"base_ppg": 10.0}
        result = self.feature.compute("p1", "RB", pd.DataFrame(), nfl_df, ctx)
        assert result is not None
        assert abs(result) <= 10.0 * 0.10 + 0.001  # clamped to ±1.0

    def test_low_attempts_filtered(self):
        """Seasons below attempt threshold should be skipped."""
        nfl_df = make_nfl_stats_df([{
            "season": 2024, "games_played": 17,
            "passing_yards": 500, "passing_tds": 3, "interceptions": 2, "passing_attempts": 50,
        }])
        # 50 attempts < 100 minimum → all QB metrics filtered out
        ctx = {"base_ppg": 15.0}
        result = self.feature.compute("p1", "QB", pd.DataFrame(), nfl_df, ctx)
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

    def _make_ctx(self, **overrides):
        """Build a context dict with sensible defaults for team_context."""
        ctx = {
            "base_ppg": 15.0,
            "target_season": 2025,
            "nfl_team": "KC",
            "team_offense_rating": 5.0,
            "all_team_ratings": {"KC": 5.0, "NYJ": -2.0},
            "team_history": {2023: "KC", 2024: "KC"},
        }
        ctx.update(overrides)
        return ctx

    def test_positive_rating_gives_boost(self):
        ctx = self._make_ctx(all_team_ratings={"KC": 5.0})
        result = self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), ctx)
        assert result is not None
        assert result > 0

    def test_negative_rating_gives_penalty(self):
        ctx = self._make_ctx(
            nfl_team="NYJ",
            team_offense_rating=-3.0,
            all_team_ratings={"NYJ": -3.0},
            team_history={2023: "NYJ", 2024: "NYJ"},
        )
        result = self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), ctx)
        assert result is not None
        assert result < 0

    def test_no_rating_returns_none(self):
        result = self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), {})
        assert result is None

    def test_kicker_excluded(self):
        ctx = self._make_ctx()
        result = self.feature.compute("p1", "K", pd.DataFrame(), pd.DataFrame(), ctx)
        assert result is None

    def test_position_specific_scaling(self):
        """QB should get a larger adjustment than TE for the same team rating."""
        ctx = self._make_ctx()
        qb_result = self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), ctx)
        te_result = self.feature.compute("p1", "TE", pd.DataFrame(), pd.DataFrame(), ctx)
        assert qb_result is not None and te_result is not None
        assert abs(qb_result) > abs(te_result)

    def test_team_change_dampens_adjustment(self):
        """Player who changed teams should get a smaller adjustment."""
        # Same team throughout
        ctx_same = self._make_ctx(
            nfl_team="KC",
            team_history={2023: "KC", 2024: "KC"},
        )
        result_same = self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), ctx_same)

        # Changed teams (was NYJ, now KC)
        ctx_changed = self._make_ctx(
            nfl_team="KC",
            team_history={2023: "NYJ", 2024: "NYJ"},
            all_team_ratings={"KC": 5.0, "NYJ": -2.0},
        )
        result_changed = self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), ctx_changed)

        assert result_same is not None and result_changed is not None
        # Changed player uses historical team (NYJ: -2.0) with dampen,
        # while same-team player uses KC (5.0) without dampen
        assert abs(result_same) > abs(result_changed)

    def test_reduced_scaling(self):
        """Scaling should be much smaller than old 0.10 factor."""
        ctx = self._make_ctx(all_team_ratings={"KC": 5.0})
        result = self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), ctx)
        assert result is not None
        # Old scaling: 5.0 * 0.10 = 0.50. New QB scaling: 5.0 * 0.05 = 0.25
        assert result == pytest.approx(0.25, abs=0.01)


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
        ctx = {
            "team_offense_rating": 5.0,
            "target_season": 2025,
            "nfl_team": "KC",
            "all_team_ratings": {"KC": 5.0},
            "team_history": {2023: "KC", 2024: "KC"},
        }
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
            "v8_age_regression",
            "v9_pos_specific",
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


# ---------------------------------------------------------------------------
# PositionOverride & v9 Model Config
# ---------------------------------------------------------------------------

class TestPositionOverride:
    def test_dataclass_defaults(self):
        ov = PositionOverride(features=["weighted_ppg"])
        assert ov.features == ["weighted_ppg"]
        assert ov.weights == {}

    def test_with_weights(self):
        ov = PositionOverride(features=["weighted_ppg"], weights={"weighted_ppg": 0.9})
        assert ov.weights["weighted_ppg"] == 0.9

    def test_v9_model_no_overrides(self):
        """v9 data-driven sweep confirmed uniform features are optimal — no overrides."""
        model = get_model("v9_pos_specific")
        assert model.position_overrides == {}

    def test_v9_default_features(self):
        model = get_model("v9_pos_specific")
        assert model.features == ["weighted_ppg", "age_curve", "regression_to_mean"]


# ---------------------------------------------------------------------------
# _resolve_features_for_position
# ---------------------------------------------------------------------------

class TestResolveFeatures:
    def setup_method(self):
        self.model = get_model("v9_pos_specific")

    def test_v9_no_overrides_all_positions_get_defaults(self):
        """v9 has no overrides — all positions return default features."""
        for pos in ["QB", "RB", "WR", "TE", "K"]:
            features, weights = _resolve_features_for_position(self.model, pos)
            assert features == ["weighted_ppg", "age_curve", "regression_to_mean"], (
                f"{pos} should get default features"
            )

    def test_unknown_position_uses_defaults(self):
        features, weights = _resolve_features_for_position(self.model, "DL")
        assert features == ["weighted_ppg", "age_curve", "regression_to_mean"]

    def test_override_mechanism_works(self):
        """Verify _resolve_features_for_position respects overrides when present."""
        model = ModelDefinition(
            name="test_override",
            version=1,
            description="test",
            features=["weighted_ppg", "age_curve"],
            position_overrides={
                "QB": PositionOverride(features=["weighted_ppg"]),
            },
        )
        qb_features, _ = _resolve_features_for_position(model, "QB")
        assert qb_features == ["weighted_ppg"]
        wr_features, _ = _resolve_features_for_position(model, "WR")
        assert wr_features == ["weighted_ppg", "age_curve"]

    def test_model_without_overrides(self):
        """v8 has no overrides — always returns defaults."""
        model = get_model("v8_age_regression")
        features, weights = _resolve_features_for_position(model, "QB")
        assert features == ["weighted_ppg", "age_curve", "regression_to_mean"]


# ---------------------------------------------------------------------------
# v9 Combiner Integration
# ---------------------------------------------------------------------------

class TestV9CombinerIntegration:
    """Verify that v9 uses uniform features (age_curve + regression_to_mean) for all positions."""

    def test_all_positions_get_three_features(self):
        """All positions with v9 should use weighted_ppg + age_curve + regression_to_mean."""
        base = WeightedPPGFeature()
        age = AgeCurveFeature()
        reg = RegressionToMeanFeature()
        df = make_history_df([
            {"season": 2023, "ppg": 12.0, "games_played": 17},
            {"season": 2024, "ppg": 14.0, "games_played": 17},
        ])
        ctx = {"birth_date": "2000-09-01", "target_season": 2025, "positional_mean_ppg": 10.0}
        result, values = combine_features(
            [base, age, reg], "p1", "WR", df, pd.DataFrame(), ctx
        )
        assert result is not None
        assert "weighted_ppg" in values
        assert "age_curve" in values
        assert "regression_to_mean" in values


# ---------------------------------------------------------------------------
# Sweep: --by-position flag parsing
# ---------------------------------------------------------------------------


class TestSweepByPositionFlag:
    """Test that sweep_feature_combos.py accepts --by-position flag."""

    def test_by_position_flag_parsed(self):
        """Argparse should accept --by-position and store it as by_position."""
        import argparse

        # Replicate the parser from sweep_feature_combos.main()
        parser = argparse.ArgumentParser()
        parser.add_argument("--seasons", default="2024,2025")
        parser.add_argument("--top", type=int, default=10)
        parser.add_argument("--by-position", action="store_true")

        args = parser.parse_args(["--by-position", "--seasons", "2023,2024"])
        assert args.by_position is True
        assert args.seasons == "2023,2024"

    def test_by_position_flag_default_false(self):
        """--by-position should default to False."""
        import argparse

        parser = argparse.ArgumentParser()
        parser.add_argument("--seasons", default="2024,2025")
        parser.add_argument("--top", type=int, default=10)
        parser.add_argument("--by-position", action="store_true")

        args = parser.parse_args([])
        assert args.by_position is False


# ---------------------------------------------------------------------------
# QBStarterUsageFeature
# ---------------------------------------------------------------------------

class TestQBStarterUsageFeature:
    """Tests for the qb_starter_usage feature."""

    def setup_method(self):
        self.feature = QBStarterUsageFeature()

    def test_name(self):
        assert self.feature.name == "qb_starter_usage"
        assert self.feature.is_base is False

    def test_returns_none_for_non_qb(self):
        """Should only apply to QBs."""
        nfl = make_nfl_stats_df([
            {"season": 2023, "passing_attempts": 550, "games_played": 17},
            {"season": 2024, "passing_attempts": 580, "games_played": 17},
        ])
        ctx = {"base_ppg": 15.0, "is_qb_starter": True}
        assert self.feature.compute("p1", "RB", pd.DataFrame(), nfl, ctx) is None
        assert self.feature.compute("p1", "WR", pd.DataFrame(), nfl, ctx) is None

    def test_returns_none_when_not_starter(self):
        """Should only apply to designated starters."""
        nfl = make_nfl_stats_df([
            {"season": 2023, "passing_attempts": 550, "games_played": 17},
            {"season": 2024, "passing_attempts": 580, "games_played": 17},
        ])
        ctx = {"base_ppg": 15.0, "is_qb_starter": False}
        assert self.feature.compute("p1", "QB", pd.DataFrame(), nfl, ctx) is None

    def test_returns_none_without_starter_flag(self):
        """Missing is_qb_starter should return None."""
        nfl = make_nfl_stats_df([
            {"season": 2023, "passing_attempts": 550, "games_played": 17},
            {"season": 2024, "passing_attempts": 580, "games_played": 17},
        ])
        ctx = {"base_ppg": 15.0}
        assert self.feature.compute("p1", "QB", pd.DataFrame(), nfl, ctx) is None

    def test_returns_none_insufficient_data(self):
        """Need at least 2 seasons."""
        nfl = make_nfl_stats_df([
            {"season": 2024, "passing_attempts": 580, "games_played": 17},
        ])
        ctx = {"base_ppg": 15.0, "is_qb_starter": True}
        assert self.feature.compute("p1", "QB", pd.DataFrame(), nfl, ctx) is None

    def test_positive_delta_for_increasing_volume(self):
        """More attempts/game → positive PPG adjustment."""
        nfl = make_nfl_stats_df([
            {"season": 2023, "passing_attempts": 510, "games_played": 17},  # 30.0 att/g
            {"season": 2024, "passing_attempts": 578, "games_played": 17},  # 34.0 att/g
        ])
        ctx = {"base_ppg": 20.0, "is_qb_starter": True}
        result = self.feature.compute("p1", "QB", pd.DataFrame(), nfl, ctx)
        assert result is not None
        assert result > 0

    def test_negative_delta_for_decreasing_volume(self):
        """Fewer attempts/game → negative PPG adjustment."""
        nfl = make_nfl_stats_df([
            {"season": 2023, "passing_attempts": 578, "games_played": 17},  # 34.0 att/g
            {"season": 2024, "passing_attempts": 510, "games_played": 17},  # 30.0 att/g
        ])
        ctx = {"base_ppg": 20.0, "is_qb_starter": True}
        result = self.feature.compute("p1", "QB", pd.DataFrame(), nfl, ctx)
        assert result is not None
        assert result < 0

    def test_filters_low_game_seasons(self):
        """Seasons with <4 games should be excluded (backup stints)."""
        nfl = make_nfl_stats_df([
            {"season": 2023, "passing_attempts": 30, "games_played": 2},   # backup stint
            {"season": 2024, "passing_attempts": 578, "games_played": 17},
        ])
        ctx = {"base_ppg": 20.0, "is_qb_starter": True}
        # Only 1 qualifying season after filtering, should return None
        assert self.feature.compute("p1", "QB", pd.DataFrame(), nfl, ctx) is None

    def test_three_seasons_uses_recency_weights(self):
        """With 3 seasons, older seasons get less weight in baseline."""
        nfl = make_nfl_stats_df([
            {"season": 2022, "passing_attempts": 510, "games_played": 17},  # 30.0 att/g
            {"season": 2023, "passing_attempts": 527, "games_played": 17},  # 31.0 att/g
            {"season": 2024, "passing_attempts": 578, "games_played": 17},  # 34.0 att/g
        ])
        ctx = {"base_ppg": 20.0, "is_qb_starter": True}
        result = self.feature.compute("p1", "QB", pd.DataFrame(), nfl, ctx)
        assert result is not None
        assert result > 0

    def test_clamps_extreme_changes(self):
        """Extreme volume changes should be clamped to ±15%."""
        nfl = make_nfl_stats_df([
            {"season": 2023, "passing_attempts": 340, "games_played": 17},  # 20.0 att/g
            {"season": 2024, "passing_attempts": 578, "games_played": 17},  # 34.0 att/g (70% increase)
        ])
        ctx = {"base_ppg": 20.0, "is_qb_starter": True}
        result = self.feature.compute("p1", "QB", pd.DataFrame(), nfl, ctx)
        assert result is not None
        # Max delta = 20.0 * 0.15 * 0.3 = 0.9
        assert result <= 20.0 * 0.15 * 0.3 + 0.001


# ---------------------------------------------------------------------------
# QBStarterBackupPenaltyFeature
# ---------------------------------------------------------------------------

class TestQBStarterBackupPenaltyFeature:
    """Tests for the qb_backup_penalty feature (used in v14_qb_starter)."""

    def setup_method(self):
        self.feature = QBStarterBackupPenaltyFeature()

    def test_name(self):
        assert self.feature.name == "qb_backup_penalty"
        assert self.feature.is_base is False

    def test_returns_none_for_non_qb(self):
        ctx = {"base_ppg": 15.0, "is_qb_starter": False}
        assert self.feature.compute("p1", "RB", pd.DataFrame(), pd.DataFrame(), ctx) is None
        assert self.feature.compute("p1", "WR", pd.DataFrame(), pd.DataFrame(), ctx) is None
        assert self.feature.compute("p1", "TE", pd.DataFrame(), pd.DataFrame(), ctx) is None

    def test_returns_none_for_starter(self):
        """Designated starters should get no adjustment."""
        ctx = {"base_ppg": 20.0, "is_qb_starter": True}
        assert self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), ctx) is None

    def test_penalizes_non_starter(self):
        """Non-starters should get a 15% penalty."""
        ctx = {"base_ppg": 20.0, "is_qb_starter": False}
        result = self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), ctx)
        assert result is not None
        assert result == pytest.approx(-3.0)  # -20.0 * 0.15

    def test_penalizes_missing_starter_flag(self):
        """Missing is_qb_starter (unknown) should get penalty."""
        ctx = {"base_ppg": 20.0}
        result = self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), ctx)
        assert result is not None
        assert result == pytest.approx(-3.0)

    def test_returns_none_without_base_ppg(self):
        """No base_ppg should return None."""
        ctx = {"is_qb_starter": False}
        assert self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), ctx) is None

    def test_returns_none_for_zero_base_ppg(self):
        ctx = {"base_ppg": 0.0, "is_qb_starter": False}
        assert self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), ctx) is None

    def test_penalty_scales_with_base_ppg(self):
        """Higher base PPG should mean a larger absolute penalty."""
        ctx_low = {"base_ppg": 10.0, "is_qb_starter": False}
        ctx_high = {"base_ppg": 25.0, "is_qb_starter": False}
        result_low = self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), ctx_low)
        result_high = self.feature.compute("p1", "QB", pd.DataFrame(), pd.DataFrame(), ctx_high)
        assert result_low == pytest.approx(-1.5)   # -10.0 * 0.15
        assert result_high == pytest.approx(-3.75)  # -25.0 * 0.15
        assert abs(result_high) > abs(result_low)

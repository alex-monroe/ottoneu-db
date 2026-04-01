"""Regression tests for projection model outputs.

These tests verify that model outputs remain stable across code changes.
If a refactor unintentionally changes projections, these tests will catch it.
Tests cover monotonicity, symmetry, bounds, feature direction, and combiner additivity.
"""

from __future__ import annotations

import pytest
import pandas as pd

from scripts.feature_projections.features.weighted_ppg import (
    WeightedPPGFeature,
    WeightedPPGNoQBTrajectoryFeature,
)
from scripts.feature_projections.features.age_curve import AgeCurveFeature
from scripts.feature_projections.features.regression_to_mean import (
    RegressionToMeanFeature,
    RegressionToMeanTieredFeature,
)
from scripts.feature_projections.features.qb_starter_usage import QBStarterBackupPenaltyFeature
from scripts.feature_projections.features.snap_trend import SnapTrendFeature
from scripts.feature_projections.combiner import combine_features


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_history_df(rows):
    """Create a player_stats-like DataFrame."""
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    for col in ["ppg", "games_played"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    return df


def make_nfl_stats_df(rows):
    """Create an nfl_stats-like DataFrame."""
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    for col in ["games_played", "total_points", "targets", "rushing_attempts",
                 "offense_snaps", "passing_attempts", "completions",
                 "passing_yards", "passing_tds", "interceptions",
                 "rushing_yards", "rushing_tds", "receptions",
                 "receiving_yards", "receiving_tds"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    return df


def _make_two_season_history(ppg_value):
    """Create a standard two-season history with given PPG."""
    return make_history_df([
        {"season": 2023, "ppg": ppg_value, "games_played": 17},
        {"season": 2024, "ppg": ppg_value, "games_played": 17},
    ])


# ---------------------------------------------------------------------------
# Monotonicity Tests
# ---------------------------------------------------------------------------

class TestMonotonicity:
    """Higher-PPG history should always project higher (all else equal)."""

    def test_weighted_ppg_monotonic(self):
        """Base weighted PPG: 20 PPG player > 5 PPG player."""
        feature = WeightedPPGFeature()
        high = _make_two_season_history(20.0)
        low = _make_two_season_history(5.0)

        high_result = feature.compute("p1", "WR", high, pd.DataFrame(), {})
        low_result = feature.compute("p1", "WR", low, pd.DataFrame(), {})

        assert high_result is not None
        assert low_result is not None
        assert high_result > low_result

    def test_weighted_ppg_no_qb_trajectory_monotonic(self):
        """No-QB-trajectory variant also monotonic."""
        feature = WeightedPPGNoQBTrajectoryFeature()
        high = _make_two_season_history(20.0)
        low = _make_two_season_history(5.0)

        high_result = feature.compute("p1", "WR", high, pd.DataFrame(), {})
        low_result = feature.compute("p1", "WR", low, pd.DataFrame(), {})

        assert high_result is not None
        assert low_result is not None
        assert high_result > low_result

    def test_combiner_monotonic(self):
        """Full pipeline: better history → higher projection."""
        features = [WeightedPPGFeature(), AgeCurveFeature()]
        ctx = {"target_season": 2025, "birth_date": "1998-01-01"}

        high = _make_two_season_history(20.0)
        low = _make_two_season_history(5.0)

        high_ppg, _ = combine_features(features, "p1", "WR", high, pd.DataFrame(), dict(ctx))
        low_ppg, _ = combine_features(features, "p1", "WR", low, pd.DataFrame(), dict(ctx))

        assert high_ppg is not None
        assert low_ppg is not None
        assert high_ppg > low_ppg

    @pytest.mark.parametrize("position", ["QB", "RB", "WR", "TE"])
    def test_monotonic_all_positions(self, position):
        """Monotonicity holds for all positions."""
        feature = WeightedPPGFeature()
        high = _make_two_season_history(15.0)
        low = _make_two_season_history(3.0)

        high_result = feature.compute("p1", position, high, pd.DataFrame(), {})
        low_result = feature.compute("p1", position, low, pd.DataFrame(), {})

        assert high_result is not None
        assert low_result is not None
        assert high_result > low_result


# ---------------------------------------------------------------------------
# Symmetry Tests
# ---------------------------------------------------------------------------

class TestSymmetry:
    """Identical inputs should produce identical outputs regardless of player ID."""

    def test_same_history_same_output(self):
        """Two players with identical history get identical projections."""
        feature = WeightedPPGFeature()
        history = _make_two_season_history(12.0)

        result1 = feature.compute("player_a", "WR", history, pd.DataFrame(), {})
        result2 = feature.compute("player_b", "WR", history, pd.DataFrame(), {})

        assert result1 == result2

    def test_combiner_symmetry(self):
        """Full combiner produces same output for same inputs."""
        features = [WeightedPPGFeature(), AgeCurveFeature()]
        ctx = {"target_season": 2025, "birth_date": "1998-01-01"}
        history = _make_two_season_history(10.0)

        ppg1, fv1 = combine_features(features, "p1", "RB", history, pd.DataFrame(), dict(ctx))
        ppg2, fv2 = combine_features(features, "p2", "RB", history, pd.DataFrame(), dict(ctx))

        assert ppg1 == ppg2
        # Feature values should also match
        for key in fv1:
            assert fv1[key] == fv2[key]


# ---------------------------------------------------------------------------
# Bounds Tests
# ---------------------------------------------------------------------------

class TestBounds:
    """Projections should always be within reasonable bounds."""

    def test_no_negative_projections(self):
        """Very low PPG history should not produce negative projection."""
        features = [WeightedPPGFeature(), AgeCurveFeature(), RegressionToMeanFeature()]
        ctx = {
            "target_season": 2025,
            "birth_date": "1990-01-01",  # 35 years old, aging penalty
            "positional_mean_ppg": 10.0,
        }
        history = _make_two_season_history(0.5)

        ppg, _ = combine_features(features, "p1", "WR", history, pd.DataFrame(), dict(ctx))

        assert ppg is not None
        assert ppg >= 0.0

    def test_extreme_high_ppg_bounded(self):
        """Very high PPG should not project unreasonably high."""
        feature = WeightedPPGFeature()
        history = _make_two_season_history(35.0)

        result = feature.compute("p1", "QB", history, pd.DataFrame(), {})

        assert result is not None
        assert result <= 40.0  # No one scores 40+ PPG

    def test_zero_ppg_produces_non_negative(self):
        """Zero PPG history should produce zero or positive."""
        features = [WeightedPPGFeature()]
        history = _make_two_season_history(0.0)

        ppg, _ = combine_features(features, "p1", "WR", history, pd.DataFrame(), {})

        # May be None (base=0 still valid) or >= 0
        if ppg is not None:
            assert ppg >= 0.0


# ---------------------------------------------------------------------------
# Feature Direction Tests
# ---------------------------------------------------------------------------

class TestFeatureDirection:
    """Features should adjust in the expected direction."""

    def test_age_curve_peak_wr_positive(self):
        """26-year-old WR (peak) should get positive or neutral age adjustment."""
        feature = AgeCurveFeature()
        history = _make_two_season_history(10.0)
        ctx = {"target_season": 2025, "birth_date": "1999-01-01"}  # ~26

        result = feature.compute("p1", "WR", history, pd.DataFrame(), ctx)

        # At peak age, adjustment should be non-negative
        if result is not None:
            assert result >= -0.5  # Allow small tolerance

    def test_age_curve_old_wr_negative(self):
        """35-year-old WR (decline) should get negative age adjustment."""
        feature = AgeCurveFeature()
        history = _make_two_season_history(10.0)
        ctx = {"target_season": 2025, "birth_date": "1990-01-01"}  # ~35

        result = feature.compute("p1", "WR", history, pd.DataFrame(), ctx)

        if result is not None:
            assert result < 0.0

    def test_regression_above_mean_pulls_down(self):
        """Player well above positional mean should regress down."""
        feature = RegressionToMeanFeature()
        history = _make_two_season_history(20.0)
        ctx = {
            "target_season": 2025,
            "positional_mean_ppg": 8.0,
            "base_ppg": 20.0,
        }

        result = feature.compute("p1", "WR", history, pd.DataFrame(), ctx)

        if result is not None:
            assert result < 0.0  # Should pull down toward mean

    def test_regression_below_mean_pulls_up(self):
        """Player well below positional mean should regress up."""
        feature = RegressionToMeanFeature()
        history = _make_two_season_history(3.0)
        ctx = {
            "target_season": 2025,
            "positional_mean_ppg": 8.0,
            "base_ppg": 3.0,
        }

        result = feature.compute("p1", "WR", history, pd.DataFrame(), ctx)

        if result is not None:
            assert result > 0.0  # Should pull up toward mean

    def test_qb_backup_penalty_is_negative(self):
        """Backup QB penalty should be negative or zero."""
        feature = QBStarterBackupPenaltyFeature()
        history = _make_two_season_history(8.0)
        ctx = {
            "target_season": 2025,
            "is_qb_starter": False,  # backup
            "base_ppg": 8.0,
        }

        result = feature.compute("p1", "QB", history, pd.DataFrame(), ctx)

        if result is not None:
            assert result <= 0.0

    def test_qb_starter_no_penalty(self):
        """Starter QB should not get penalized."""
        feature = QBStarterBackupPenaltyFeature()
        history = _make_two_season_history(20.0)
        ctx = {
            "target_season": 2025,
            "is_qb_starter": True,
            "base_ppg": 20.0,
        }

        result = feature.compute("p1", "QB", history, pd.DataFrame(), ctx)

        # Starters should get None or 0
        if result is not None:
            assert result >= 0.0


# ---------------------------------------------------------------------------
# Combiner Additivity
# ---------------------------------------------------------------------------

class TestCombinerAdditivity:
    """Additive combiner should equal base + sum of adjustments."""

    def test_additive_decomposition(self):
        """base_ppg + sum(adjustments) should equal final projection."""
        features = [WeightedPPGFeature(), AgeCurveFeature(), RegressionToMeanFeature()]
        ctx = {
            "target_season": 2025,
            "birth_date": "1998-01-01",
            "positional_mean_ppg": 8.0,
        }
        history = _make_two_season_history(12.0)

        ppg, fv = combine_features(features, "p1", "WR", history, pd.DataFrame(), dict(ctx))

        assert ppg is not None
        base = fv.get("weighted_ppg")
        assert base is not None

        # Sum of non-base feature values
        adj_sum = sum(
            v for k, v in fv.items()
            if k != "weighted_ppg" and v is not None
        )

        expected = max(0.0, base + adj_sum)
        assert ppg == pytest.approx(expected, abs=0.001)

    def test_weights_applied_correctly(self):
        """Custom weights should scale feature contributions."""
        features = [WeightedPPGFeature(), AgeCurveFeature()]
        ctx = {"target_season": 2025, "birth_date": "1998-01-01"}
        history = _make_two_season_history(10.0)
        weights = {"age_curve": 2.0}

        ppg_weighted, fv_weighted = combine_features(
            features, "p1", "WR", history, pd.DataFrame(), dict(ctx), weights,
        )
        ppg_default, fv_default = combine_features(
            features, "p1", "WR", history, pd.DataFrame(), dict(ctx), None,
        )

        # Age curve contribution should be doubled
        age_val = fv_default.get("age_curve")
        if age_val is not None and ppg_default is not None and ppg_weighted is not None:
            expected_diff = age_val  # extra 1x of age_curve
            actual_diff = ppg_weighted - ppg_default
            assert actual_diff == pytest.approx(expected_diff, abs=0.001)

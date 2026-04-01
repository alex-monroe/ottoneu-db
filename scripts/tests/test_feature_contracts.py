"""Contract tests for projection features.

Each feature must satisfy implicit contracts about return values,
ranges, and edge case behavior. These tests catch violations before
they propagate to the backtest pipeline.
"""

from __future__ import annotations

import pytest
import pandas as pd

from scripts.feature_projections.features import FEATURE_REGISTRY
from scripts.feature_projections.features.base import ProjectionFeature


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
    numeric_cols = [
        "games_played", "total_points", "targets", "rushing_attempts",
        "offense_snaps", "passing_attempts", "completions",
        "passing_yards", "passing_tds", "interceptions",
        "rushing_yards", "rushing_tds", "receptions",
        "receiving_yards", "receiving_tds",
    ]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    return df


# Standard test data
STANDARD_HISTORY = make_history_df([
    {"season": 2023, "ppg": 10.0, "games_played": 17},
    {"season": 2024, "ppg": 12.0, "games_played": 16},
])

STANDARD_NFL_STATS = make_nfl_stats_df([
    {
        "season": 2023, "player_id": "p1", "games_played": 17,
        "total_points": 170, "targets": 100, "rushing_attempts": 10,
        "offense_snaps": 800, "passing_attempts": 0, "completions": 0,
        "passing_yards": 0, "passing_tds": 0, "interceptions": 0,
        "rushing_yards": 50, "rushing_tds": 1, "receptions": 60,
        "receiving_yards": 700, "receiving_tds": 5, "recent_team": "KC",
    },
    {
        "season": 2024, "player_id": "p1", "games_played": 16,
        "total_points": 192, "targets": 110, "rushing_attempts": 12,
        "offense_snaps": 850, "passing_attempts": 0, "completions": 0,
        "passing_yards": 0, "passing_tds": 0, "interceptions": 0,
        "rushing_yards": 60, "rushing_tds": 2, "receptions": 70,
        "receiving_yards": 800, "receiving_tds": 6, "recent_team": "KC",
    },
])

STANDARD_CONTEXT = {
    "target_season": 2025,
    "birth_date": "1998-01-01",
    "nfl_team": "KC",
    "team_offense_rating": 2.0,
    "positional_mean_ppg": 8.0,
    "positional_starter_floor": 5.0,
    "base_ppg": 11.0,
    "is_qb_starter": True,
    "qb_starters": {},
    "team_history": {2023: "KC", 2024: "KC"},
    "all_team_ratings": {"KC": 2.0, "NYJ": -1.0},
}

# All registered feature instances
ALL_FEATURES = {name: cls() for name, cls in FEATURE_REGISTRY.items()}

# Features that are adjustment (non-base) and their expected ranges
ADJUSTMENT_FEATURE_RANGES = {
    "age_curve": (-5.0, 5.0),
    "regression_to_mean": (-5.0, 5.0),
    "regression_to_mean_tiered": (-5.0, 5.0),
    "snap_trend": (-5.0, 5.0),
    "team_context": (-3.0, 3.0),
    "games_played": (-5.0, 5.0),
    "stat_efficiency": (-5.0, 5.0),
    "usage_share": (-5.0, 5.0),
    "usage_share_raw": (-5.0, 5.0),
    "qb_starter_usage": (-5.0, 5.0),
    "qb_backup_penalty": (-5.0, 0.1),
}


# ---------------------------------------------------------------------------
# Contract: None on empty data
# ---------------------------------------------------------------------------

class TestNoneOnEmptyData:
    """Every feature should return None when given empty DataFrames and minimal context."""

    # Some adjustment features can compute from context alone (e.g., regression_to_mean
    # uses base_ppg and positional_mean_ppg from context, age_curve uses birth_date).
    # These features legitimately return a value even with empty history.
    CONTEXT_ONLY_FEATURES = {
        "age_curve",
        "team_context",
        "regression_to_mean",
        "regression_to_mean_tiered",
    }

    @pytest.mark.parametrize("feature_name", list(FEATURE_REGISTRY.keys()))
    def test_empty_history_minimal_context(self, feature_name):
        """Feature returns None with empty history and minimal context."""
        if feature_name in self.CONTEXT_ONLY_FEATURES:
            pytest.skip(f"{feature_name} can compute from context alone")
        feature = FEATURE_REGISTRY[feature_name]()
        # Use minimal context (no base_ppg, no positional_mean_ppg)
        result = feature.compute(
            "p1", "WR", pd.DataFrame(), pd.DataFrame(), {"target_season": 2025},
        )
        assert result is None


# ---------------------------------------------------------------------------
# Contract: Deterministic
# ---------------------------------------------------------------------------

class TestDeterministic:
    """Same inputs must produce same output (call twice, assert equal)."""

    @pytest.mark.parametrize("feature_name", list(FEATURE_REGISTRY.keys()))
    def test_deterministic(self, feature_name):
        """Two calls with identical inputs produce identical output."""
        feature = FEATURE_REGISTRY[feature_name]()

        result1 = feature.compute(
            "p1", "WR", STANDARD_HISTORY, STANDARD_NFL_STATS, dict(STANDARD_CONTEXT),
        )
        result2 = feature.compute(
            "p1", "WR", STANDARD_HISTORY, STANDARD_NFL_STATS, dict(STANDARD_CONTEXT),
        )

        assert result1 == result2


# ---------------------------------------------------------------------------
# Contract: Type correctness
# ---------------------------------------------------------------------------

class TestTypeCorrectness:
    """Return value is either None or float."""

    @pytest.mark.parametrize("feature_name", list(FEATURE_REGISTRY.keys()))
    def test_return_type(self, feature_name):
        """Feature returns None or float."""
        feature = FEATURE_REGISTRY[feature_name]()
        result = feature.compute(
            "p1", "WR", STANDARD_HISTORY, STANDARD_NFL_STATS, dict(STANDARD_CONTEXT),
        )

        assert result is None or isinstance(result, (int, float))


# ---------------------------------------------------------------------------
# Contract: Range bounds for adjustment features
# ---------------------------------------------------------------------------

class TestRangeBounds:
    """Adjustment features should return values in reasonable ranges."""

    @pytest.mark.parametrize(
        "feature_name,expected_range",
        [(k, v) for k, v in ADJUSTMENT_FEATURE_RANGES.items() if k in FEATURE_REGISTRY],
    )
    def test_adjustment_range(self, feature_name, expected_range):
        """Adjustment feature value falls within expected range."""
        feature = FEATURE_REGISTRY[feature_name]()
        low, high = expected_range

        result = feature.compute(
            "p1", "WR", STANDARD_HISTORY, STANDARD_NFL_STATS, dict(STANDARD_CONTEXT),
        )

        if result is not None:
            assert low <= result <= high, (
                f"Feature '{feature_name}' returned {result}, "
                f"expected range [{low}, {high}]"
            )


# ---------------------------------------------------------------------------
# Contract: Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    """Features handle edge cases without crashing."""

    @pytest.mark.parametrize("feature_name", list(FEATURE_REGISTRY.keys()))
    def test_single_game(self, feature_name):
        """Feature handles 1-game history without crashing."""
        feature = FEATURE_REGISTRY[feature_name]()
        history = make_history_df([
            {"season": 2024, "ppg": 5.0, "games_played": 1},
        ])

        # Should not raise — may return None
        result = feature.compute(
            "p1", "WR", history, pd.DataFrame(), dict(STANDARD_CONTEXT),
        )
        assert result is None or isinstance(result, (int, float))

    @pytest.mark.parametrize("feature_name", list(FEATURE_REGISTRY.keys()))
    def test_zero_ppg(self, feature_name):
        """Feature handles zero PPG history without crashing."""
        feature = FEATURE_REGISTRY[feature_name]()
        history = make_history_df([
            {"season": 2023, "ppg": 0.0, "games_played": 17},
            {"season": 2024, "ppg": 0.0, "games_played": 17},
        ])
        ctx = dict(STANDARD_CONTEXT)
        ctx["base_ppg"] = 0.0

        result = feature.compute("p1", "WR", history, pd.DataFrame(), ctx)
        assert result is None or isinstance(result, (int, float))

    @pytest.mark.parametrize("feature_name", list(FEATURE_REGISTRY.keys()))
    def test_high_ppg(self, feature_name):
        """Feature handles very high PPG (30+) without crashing."""
        feature = FEATURE_REGISTRY[feature_name]()
        history = make_history_df([
            {"season": 2023, "ppg": 35.0, "games_played": 17},
            {"season": 2024, "ppg": 30.0, "games_played": 17},
        ])
        ctx = dict(STANDARD_CONTEXT)
        ctx["base_ppg"] = 32.5

        result = feature.compute("p1", "QB", history, pd.DataFrame(), ctx)
        assert result is None or isinstance(result, (int, float))

    @pytest.mark.parametrize("feature_name", list(FEATURE_REGISTRY.keys()))
    def test_missing_nfl_stats(self, feature_name):
        """Feature handles empty nfl_stats without crashing."""
        feature = FEATURE_REGISTRY[feature_name]()
        result = feature.compute(
            "p1", "WR", STANDARD_HISTORY, pd.DataFrame(), dict(STANDARD_CONTEXT),
        )
        assert result is None or isinstance(result, (int, float))

    @pytest.mark.parametrize("feature_name", list(FEATURE_REGISTRY.keys()))
    def test_minimal_context(self, feature_name):
        """Feature handles minimal context (just target_season) without crashing."""
        feature = FEATURE_REGISTRY[feature_name]()
        minimal_ctx = {"target_season": 2025}

        result = feature.compute(
            "p1", "WR", STANDARD_HISTORY, pd.DataFrame(), minimal_ctx,
        )
        assert result is None or isinstance(result, (int, float))

"""Stat efficiency feature v2 — detect meaningful efficiency changes and return PPG deltas.

Instead of recomputing PPG from component stats (which just adds noise),
this version computes position-specific efficiency metrics (yards/attempt,
catch rate, TD rate) and compares recent values to career baseline or
league averages, returning a small clamped PPG adjustment.
"""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature

# League-average efficiency rates (used as baseline for single-season players)
LEAGUE_AVG = {
    "ypa": 7.0,
    "pass_td_rate": 0.045,
    "int_rate": 0.025,
    "ypc": 4.3,
    "rush_td_rate": 0.035,
    "catch_rate": 0.65,
    "yards_per_target": 8.0,
    "rec_td_rate": 0.07,
}

# Minimum attempts to consider a season valid for a given metric
MIN_ATTEMPTS = {
    "passing_attempts": 100,
    "rushing_attempts": 50,
    "targets": 30,
}

# How strongly deviations translate to PPG adjustment
METRIC_SCALING = 0.07

# Direction of deviation effect on PPG.
# Positive = higher rate is better; negative = regression signal (high rates regress).
METRIC_DIRECTION = {
    "ypa": 1.0,
    "pass_td_rate": -0.5,
    "int_rate": -1.0,
    "ypc": 1.0,
    "rush_td_rate": -0.5,
    "catch_rate": 1.0,
    "yards_per_target": 1.0,
    "rec_td_rate": -0.5,
}

# Recency weights for baseline computation (most recent older season first)
RECENCY_WEIGHTS = [0.6, 0.3, 0.1]

# Position → list of (metric_name, numerator_col, denominator_col)
POSITION_METRICS: dict[str, list[tuple[str, str, str]]] = {
    "QB": [
        ("ypa", "passing_yards", "passing_attempts"),
        ("pass_td_rate", "passing_tds", "passing_attempts"),
        ("int_rate", "interceptions", "passing_attempts"),
    ],
    "RB": [
        ("ypc", "rushing_yards", "rushing_attempts"),
        ("rush_td_rate", "rushing_tds", "rushing_attempts"),
    ],
    "WR": [
        ("catch_rate", "receptions", "targets"),
        ("yards_per_target", "receiving_yards", "targets"),
        ("rec_td_rate", "receiving_tds", "targets"),
    ],
    "TE": [
        ("catch_rate", "receptions", "targets"),
        ("yards_per_target", "receiving_yards", "targets"),
        ("rec_td_rate", "receiving_tds", "targets"),
    ],
}


def _safe_float(row: pd.Series, col: str) -> float:
    """Extract a float from a row, returning 0.0 for missing/NaN."""
    val = row.get(col)
    if pd.isna(val):
        return 0.0
    return float(val)


def _compute_rate(row: pd.Series, numerator_col: str, denominator_col: str) -> Optional[float]:
    """Compute a rate stat, returning None if denominator is below threshold."""
    denom = _safe_float(row, denominator_col)
    min_att = MIN_ATTEMPTS.get(denominator_col, 0)
    if denom < min_att:
        return None
    numer = _safe_float(row, numerator_col)
    return numer / denom


class StatEfficiencyFeature(ProjectionFeature):
    """Detects meaningful stat-level efficiency changes and returns a PPG delta.

    For each position-relevant metric:
    1. Filter seasons with sufficient attempts
    2. Compute per-season rate values
    3. Compare recent season to recency-weighted baseline (or league avg for 1-season players)
    4. Convert deviation to a small PPG delta, clamped to ±10% of base_ppg
    """

    @property
    def name(self) -> str:
        return "stat_efficiency"

    def compute(
        self,
        player_id: str,
        position: str,
        history_df: pd.DataFrame,
        nfl_stats_df: pd.DataFrame,
        context: dict[str, Any],
    ) -> Optional[float]:
        if position == "K":
            return None

        if nfl_stats_df.empty:
            return None

        base_ppg = context.get("base_ppg")
        if not base_ppg or base_ppg <= 0:
            return None

        metrics = POSITION_METRICS.get(position)
        if not metrics:
            return None

        sorted_df = nfl_stats_df.sort_values("season")

        deltas: list[float] = []

        for metric_name, numer_col, denom_col in metrics:
            # Compute rate for each valid season
            season_rates: list[tuple[int, float]] = []
            for _, row in sorted_df.iterrows():
                rate = _compute_rate(row, numer_col, denom_col)
                if rate is not None:
                    season_rates.append((int(row["season"]), rate))

            if not season_rates:
                continue

            recent_rate = season_rates[-1][1]

            if len(season_rates) >= 2:
                # Recency-weighted baseline from older seasons
                older = season_rates[:-1]
                # Most recent older season first
                older.reverse()
                weights = RECENCY_WEIGHTS[: len(older)]
                total_w = sum(weights)
                baseline = sum(r * w for (_, r), w in zip(older, weights)) / total_w
            else:
                # Single season: compare to league average
                baseline = LEAGUE_AVG[metric_name]

            if baseline == 0:
                continue

            deviation = (recent_rate - baseline) / baseline
            direction = METRIC_DIRECTION[metric_name]
            delta = deviation * direction * METRIC_SCALING * base_ppg
            deltas.append(delta)

        if not deltas:
            return None

        avg_delta = sum(deltas) / len(deltas)

        # Clamp to ±10% of base_ppg
        clamp = 0.10 * base_ppg
        return max(-clamp, min(clamp, avg_delta))

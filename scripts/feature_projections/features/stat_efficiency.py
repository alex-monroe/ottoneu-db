"""Stat efficiency feature — per-stat projection from nfl_stats → PPG."""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature

# Half PPR scoring weights matching config.json
SCORING_WEIGHTS = {
    "passing_yards": 0.04,
    "passing_tds": 4,
    "interceptions": -2,
    "rushing_yards": 0.1,
    "rushing_tds": 6,
    "receptions": 0.5,
    "receiving_yards": 0.1,
    "receiving_tds": 6,
}

# Recency weights for up to 3 seasons (most recent first)
RECENCY_WEIGHTS = [0.55, 0.30, 0.15]


class StatEfficiencyFeature(ProjectionFeature):
    """Projects individual stat categories from nfl_stats, applies scoring weights.

    For each stat category, computes a recency-weighted per-game average,
    then multiplies by Half PPR scoring weights to get projected PPG.

    Returns a PPG delta: stat_projected_ppg - weighted_ppg_baseline.
    This captures situations where per-stat projection diverges from aggregate PPG
    (e.g., a WR with increasing targets but flat PPG due to TD variance).
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
        # Kickers have no passing/rushing/receiving stats, so stat_projected_ppg
        # would be 0 while base_ppg is ~7, producing a -7 delta that breaks projections.
        if position == "K":
            return None

        if nfl_stats_df.empty:
            return None

        sorted_df = nfl_stats_df.sort_values("season")
        recent = sorted_df.tail(3)

        if recent.empty:
            return None

        # Filter rows with valid games_played
        recent = recent[recent["games_played"].fillna(0) > 0].copy()
        if recent.empty:
            return None

        n = len(recent)
        weights = RECENCY_WEIGHTS[:n]

        # Compute weighted per-game stats
        total_fantasy_points = 0.0
        total_weight = 0.0

        for i, (_, row) in enumerate(recent.iloc[::-1].iterrows()):
            games = float(row["games_played"])
            w = weights[i]

            season_points = 0.0
            for stat, scoring_weight in SCORING_WEIGHTS.items():
                val = row.get(stat)
                if pd.notna(val):
                    season_points += float(val) * scoring_weight

            ppg_from_stats = season_points / games
            total_fantasy_points += ppg_from_stats * w
            total_weight += w

        if total_weight == 0:
            return None

        stat_projected_ppg = total_fantasy_points / total_weight

        # Return as delta from weighted PPG baseline (if available)
        base_ppg = context.get("base_ppg")
        if base_ppg is not None and base_ppg > 0:
            return stat_projected_ppg - base_ppg
        return None

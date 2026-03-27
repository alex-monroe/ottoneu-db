"""QB starter usage feature — absolute passing volume trend for designated starters."""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature


class QBStarterUsageFeature(ProjectionFeature):
    """Adjusts QB projection based on passing volume trend.

    Only applies to QBs who are designated starters. Uses absolute
    attempts-per-game (not share) since starter attempt share is structurally
    ~0.95, while absolute volume (25-40 att/g) varies meaningfully.

    Returns a PPG delta based on whether the starter's passing volume is
    trending up or down.
    """

    TREND_SCALING = 0.3  # Conservative scaling for volume trend
    RECENCY_WEIGHTS = [0.60, 0.25, 0.15]

    @property
    def name(self) -> str:
        return "qb_starter_usage"

    def compute(
        self,
        player_id: str,
        position: str,
        history_df: pd.DataFrame,
        nfl_stats_df: pd.DataFrame,
        context: dict[str, Any],
    ) -> Optional[float]:
        # QB-only feature
        if position != "QB":
            return None

        # Must be a designated starter
        if not context.get("is_qb_starter"):
            return None

        base_ppg = context.get("base_ppg")
        if not base_ppg or base_ppg <= 0:
            return None

        if nfl_stats_df.empty or len(nfl_stats_df) < 2:
            return None

        sorted_df = nfl_stats_df.sort_values("season")
        recent = sorted_df.tail(3)

        # Compute attempts per game for each season
        att_per_game = []
        for _, row in recent.iterrows():
            attempts = float(row.get("passing_attempts", 0) or 0)
            games = float(row.get("games_played", 0) or 0)
            if games >= 4:  # Minimum games threshold to filter backup stints
                att_per_game.append(attempts / games)

        if len(att_per_game) < 2:
            return None

        # Recency-weighted average of earlier seasons vs most recent
        recent_apg = att_per_game[-1]

        if len(att_per_game) == 2:
            prev_apg = att_per_game[0]
        else:
            # Weighted average of the two earlier seasons
            w = self.RECENCY_WEIGHTS
            prev_apg = (att_per_game[-3] * w[2] + att_per_game[-2] * w[1]) / (w[1] + w[2])

        if prev_apg == 0:
            return None

        # Percentage change in volume
        pct_change = (recent_apg - prev_apg) / prev_apg

        # Clamp to ±15% to prevent extreme swings
        pct_change = max(-0.15, min(0.15, pct_change))

        return base_ppg * pct_change * self.TREND_SCALING

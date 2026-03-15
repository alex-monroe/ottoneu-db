"""Snap trend feature — snap count trajectory adjustment."""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature


class SnapTrendFeature(ProjectionFeature):
    """Adjusts projection based on snap count trajectory.

    Uses H1/H2 snap splits and year-over-year snap trends to identify
    players with increasing or decreasing roles.
    """

    TREND_SCALING = 0.3

    @property
    def name(self) -> str:
        return "snap_trend"

    def compute(
        self,
        player_id: str,
        position: str,
        history_df: pd.DataFrame,
        nfl_stats_df: pd.DataFrame,
        context: dict[str, Any],
    ) -> Optional[float]:
        if nfl_stats_df.empty:
            return None

        base_ppg = context.get("base_ppg")
        if not base_ppg or base_ppg <= 0:
            return None

        sorted_df = nfl_stats_df.sort_values("season")

        # Compute per-game snap rates by season
        snap_rates = []
        for _, row in sorted_df.iterrows():
            games = float(row.get("games_played", 0) or 0)
            snaps = float(row.get("offense_snaps", 0) or 0)
            if games > 0:
                snap_rates.append(snaps / games)

        if len(snap_rates) < 2:
            return None

        # Trend: most recent vs previous average
        recent_rate = snap_rates[-1]
        prev_avg = sum(snap_rates[:-1]) / len(snap_rates[:-1])

        if prev_avg == 0:
            return None

        pct_change = (recent_rate - prev_avg) / prev_avg
        # Clamp to ±30%
        pct_change = max(-0.30, min(0.30, pct_change))

        return base_ppg * pct_change * self.TREND_SCALING

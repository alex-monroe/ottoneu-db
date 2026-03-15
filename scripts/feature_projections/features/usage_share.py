"""Usage share feature — target/touch/attempt share projection."""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature

# Which stat represents "usage" for each position
USAGE_STAT_BY_POSITION = {
    "QB": "passing_yards",  # proxy for passing volume
    "RB": "rushing_attempts",
    "WR": "targets",
    "TE": "targets",
}

RECENCY_WEIGHTS = [0.60, 0.25, 0.15]


class UsageShareFeature(ProjectionFeature):
    """Adjusts projection based on player's share of team usage.

    Computes the player's share of team-level volume (targets for WR/TE,
    rushing attempts for RB, passing yards for QB), projects the trend,
    and returns a PPG delta based on whether share is increasing or decreasing.
    """

    TREND_SCALING = 0.5  # How much of the trend to apply

    @property
    def name(self) -> str:
        return "usage_share"

    def compute(
        self,
        player_id: str,
        position: str,
        history_df: pd.DataFrame,
        nfl_stats_df: pd.DataFrame,
        context: dict[str, Any],
    ) -> Optional[float]:
        if nfl_stats_df.empty or len(nfl_stats_df) < 2:
            return None

        base_ppg = context.get("base_ppg")
        if not base_ppg or base_ppg <= 0:
            return None

        usage_stat = USAGE_STAT_BY_POSITION.get(position)
        if not usage_stat:
            return None

        team_usage = context.get("team_usage")
        if not team_usage:
            return None

        sorted_df = nfl_stats_df.sort_values("season")
        recent = sorted_df.tail(3)

        shares = []
        for _, row in recent.iterrows():
            player_val = float(row.get(usage_stat, 0) or 0)
            games = float(row.get("games_played", 0) or 0)
            season = int(row["season"])

            team_val = team_usage.get(season, {}).get(usage_stat, 0)
            if team_val > 0 and games > 0:
                # Per-game share
                player_per_game = player_val / games
                team_per_game = team_val / 17.0  # normalize team to full season
                if team_per_game > 0:
                    shares.append(player_per_game / team_per_game)

        if len(shares) < 2:
            return None

        # Simple trend: most recent share vs previous average
        recent_share = shares[-1]
        prev_avg = sum(shares[:-1]) / len(shares[:-1])

        if prev_avg == 0:
            return None

        pct_change = (recent_share - prev_avg) / prev_avg

        # Scale the percentage change into a PPG delta
        return base_ppg * pct_change * self.TREND_SCALING

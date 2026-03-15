"""Team context feature — adjust projections based on team offensive quality."""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature


class TeamContextFeature(ProjectionFeature):
    """Adjusts projection based on team offensive environment quality.

    Computes a team's offensive PPG relative to league average from nfl_stats,
    then applies a scaled adjustment to the player's projection.

    Players on high-scoring offenses get a boost; players on low-scoring
    offenses get penalized.
    """

    # How much of the team-level deviation to apply to individual players
    SCALING_FACTOR = 0.10

    @property
    def name(self) -> str:
        return "team_context"

    def compute(
        self,
        player_id: str,
        position: str,
        history_df: pd.DataFrame,
        nfl_stats_df: pd.DataFrame,
        context: dict[str, Any],
    ) -> Optional[float]:
        team_offense_rating = context.get("team_offense_rating")
        if team_offense_rating is None:
            return None

        base_ppg = context.get("base_ppg")
        if not base_ppg or base_ppg <= 0:
            return None

        # team_offense_rating is deviation from league average (e.g., +2.5 or -1.3)
        return team_offense_rating * self.SCALING_FACTOR

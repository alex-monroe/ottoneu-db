"""Team context feature — adjust projections based on team offensive quality.

v2: Position-specific scaling, kicker exclusion, team-change handling.
Fixes from issue #279:
- Excludes kickers (team offense is irrelevant for K)
- Uses per-season team history when available (not just current team)
- Position-specific scaling (QB most affected, TE least)
- Reduced scaling from 0.10 to 0.02-0.05 range
- Dampens adjustment for players who changed teams (more uncertainty)
"""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature


class TeamContextFeature(ProjectionFeature):
    """Adjusts projection based on team offensive environment quality.

    Uses historical per-season team data when available to compute the
    offense rating for the team the player actually played on, not just
    their current team. Applies position-specific scaling and dampens
    the adjustment for players who recently changed teams.
    """

    # Position-specific scaling factors: how much team quality affects
    # individual production. QBs are most coupled to team offense,
    # TEs are least affected.
    POSITION_SCALING: dict[str, float] = {
        "QB": 0.05,
        "RB": 0.04,
        "WR": 0.03,
        "TE": 0.02,
    }

    # Dampen factor for players who changed teams — new team = more
    # uncertainty about how the player fits the offense
    TEAM_CHANGE_DAMPEN = 0.5

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
        # Kickers are not meaningfully affected by team offensive quality
        if position == "K":
            return None

        base_ppg = context.get("base_ppg")
        if not base_ppg or base_ppg <= 0:
            return None

        scaling = self.POSITION_SCALING.get(position)
        if scaling is None:
            return None

        target_season = context.get("target_season")
        team_history: dict[int, str] = context.get("team_history", {})
        all_team_ratings: dict[str, float] = context.get("all_team_ratings", {})
        current_team: str | None = context.get("nfl_team")

        # Determine the effective team and whether the player changed teams
        team_changed = False
        effective_team = current_team

        if team_history and target_season:
            # Find the most recent historical team
            historical_seasons = sorted(
                [s for s in team_history if s < target_season], reverse=True
            )
            if historical_seasons:
                most_recent_team = team_history[historical_seasons[0]]
                effective_team = most_recent_team

                # Detect team change: current team differs from most recent historical team
                if current_team and current_team != most_recent_team:
                    team_changed = True

                # Check if player was on this team for the historical period used
                # If they were on different teams across history, use the most recent
                # season's team rating (most predictive of next season)

        # Get the offense rating for the effective team
        if not effective_team or effective_team not in all_team_ratings:
            # Fall back to context-level rating (current team)
            offense_rating = context.get("team_offense_rating")
            if offense_rating is None:
                return None
        else:
            offense_rating = all_team_ratings[effective_team]

        # Apply position-specific scaling
        adjustment = offense_rating * scaling

        # Dampen for team changers — new team context is less predictive
        if team_changed:
            adjustment *= self.TEAM_CHANGE_DAMPEN

        return adjustment
